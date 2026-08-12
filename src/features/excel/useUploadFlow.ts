import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnMapping, ScanResult } from '@/types/domain';
import { friendlyError } from '@/lib/errors';
import { parseWorkbook, validateRows, type ParsedWorkbook } from './parseWorkbook';
import { hashFile } from './hash';
import { missingRequired } from './columnDetection';
import { importWorkbook, validateFile, type ImportResult, type DuplicateResult } from './importService';
import { useAuth } from '@/features/auth/AuthProvider';
import { tryParseQualityFile } from '@/features/quality/parseQuality';
import { importQuality, type QualityImportResult } from '@/features/quality/importQuality';
import type { QualityParseResult } from '@/features/quality/types';

export type FlowStep =
  | 'select' | 'scanning' | 'duplicate' | 'mapping' | 'preview' | 'importing' | 'done'
  // the quality reports take their own preview screen: they have no columns to map
  | 'quality' | 'qualityDuplicate' | 'qualityDone';

export interface ScanStage { label: string; detail: string; }

/** The visible scan sequence, so the user can see what the system is doing. */
export const SCAN_STAGES: ScanStage[] = [
  { label: 'File received and type validated', detail: 'extension and MIME' },
  { label: 'SHA-256 hash calculated', detail: 'for duplicate detection' },
  { label: 'Workbook opened', detail: 'sheets enumerated' },
  { label: 'Header row detected', detail: 'columns mapped' },
  { label: 'Production data identified', detail: 'rows counted' },
  { label: 'Records analysed and validated', detail: 'valid, warnings, errors' }
];

interface FlowState {
  step: FlowStep;
  file: File | null;
  fileHash: string;
  parsed: ParsedWorkbook | null;
  scan: ScanResult | null;
  mappings: ColumnMapping[];
  stageIndex: number;
  importPercent: number;
  result: ImportResult | null;
  duplicate: DuplicateResult['previousUpload'] | null;
  quality: QualityParseResult | null;
  qualityResult: QualityImportResult | null;
  qualityDuplicate: { id: string; original_filename: string; created_at: string } | null;
  error: string;
}

const INITIAL: FlowState = {
  step: 'select', file: null, fileHash: '', parsed: null, scan: null, mappings: [],
  stageIndex: 0, importPercent: 0, result: null, duplicate: null,
  quality: null, qualityResult: null, qualityDuplicate: null, error: ''
};

export function useUploadFlow() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [state, setState] = useState<FlowState>(INITIAL);

  const reset = useCallback(() => setState(INITIAL), []);

  /** Parse and validate entirely in the browser; nothing is written yet. */
  const selectFile = useCallback(async (file: File) => {
    setState({ ...INITIAL, step: 'scanning', file });
    try {
      validateFile(file);
      setState((s) => ({ ...s, stageIndex: 1 }));

      const fileHash = await hashFile(file);
      setState((s) => ({ ...s, stageIndex: 2, fileHash }));

      // The quality reports carry no order number, target or produced quantity,
      // so they can never satisfy the production importer. Recognise them first
      // and send them down their own path rather than failing every row.
      const quality = await tryParseQualityFile(file);
      if (quality) {
        setState((s) => ({ ...s, stageIndex: SCAN_STAGES.length, quality, step: 'quality' }));
        return;
      }

      const parsed = await parseWorkbook(file);
      setState((s) => ({ ...s, stageIndex: 4, parsed, mappings: parsed.mappings }));

      const { rows, warnings, errors } = validateRows(parsed, parsed.mappings);
      const scan: ScanResult = {
        fileName: file.name, fileSize: file.size, fileHash,
        sheetCount: parsed.sheetCount, rowCount: parsed.rowCount, columnCount: parsed.columnCount,
        mappings: parsed.mappings, rows, warnings, errors
      };

      const needsMapping =
        missingRequired(parsed.mappings).length > 0 ||
        parsed.mappings.some((m) => m.confidence === 'low');

      setState((s) => ({
        ...s, stageIndex: SCAN_STAGES.length, scan,
        step: needsMapping ? 'mapping' : 'preview'
      }));
    } catch (err) {
      setState((s) => ({ ...s, step: 'select', error: friendlyError(err) }));
    }
  }, []);

  const setMapping = useCallback((excelHeader: string, field: ColumnMapping['field']) => {
    setState((s) => ({
      ...s,
      mappings: s.mappings.map((m) =>
        m.excelHeader === excelHeader ? { ...m, field, confidence: field ? 'high' : 'unmapped' } : m)
    }));
  }, []);

  const confirmMapping = useCallback(() => {
    setState((s) => {
      if (!s.parsed) return s;
      const { rows, warnings, errors } = validateRows(s.parsed, s.mappings);
      return {
        ...s, step: 'preview',
        scan: s.scan ? { ...s.scan, rows, warnings, errors, mappings: s.mappings } : null
      };
    });
  }, []);

  const runImport = useCallback(async (asNewVersionOf?: string) => {
    const { file, scan } = state;
    if (!file || !scan) return;

    setState((s) => ({ ...s, step: 'importing', importPercent: 15, error: '' }));
    const tick = setInterval(
      () => setState((s) => ({ ...s, importPercent: Math.min(s.importPercent + 7, 92) })),
      280
    );

    try {
      const response = await importWorkbook(file, {
        sheetCount: scan.sheetCount,
        rowCount: scan.rowCount,
        columnCount: scan.columnCount,
        rows: scan.rows,
        warnings: scan.warnings,
        errors: scan.errors,
        ...(asNewVersionOf ? { parentUploadId: asNewVersionOf } : {})
      });

      if ('duplicate' in response) {
        setState((s) => ({ ...s, step: 'duplicate', duplicate: response.previousUpload }));
        return;
      }

      // Realtime also fires, but invalidating here means the redirect is instant.
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['uploads'] });
      setState((s) => ({ ...s, step: 'done', importPercent: 100, result: response }));
    } catch (err) {
      setState((s) => ({ ...s, step: 'preview', error: friendlyError(err) }));
    } finally {
      clearInterval(tick);
    }
  }, [state, queryClient]);

  const runQualityImport = useCallback(async (allowDuplicate = false) => {
    const { file, fileHash, quality } = state;
    if (!file || !quality) return;
    if (!profile) {
      setState((s) => ({ ...s, error: 'Your profile could not be resolved, so the import has no owner.' }));
      return;
    }

    setState((s) => ({ ...s, step: 'importing', importPercent: 20, error: '' }));
    const tick = setInterval(
      () => setState((s) => ({ ...s, importPercent: Math.min(s.importPercent + 9, 92) })),
      260
    );

    try {
      const response = await importQuality(quality, file, fileHash, profile.id, { allowDuplicate });
      if ('duplicate' in response) {
        setState((s) => ({ ...s, step: 'qualityDuplicate', qualityDuplicate: response.previous }));
        return;
      }
      await queryClient.invalidateQueries({ queryKey: ['quality'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setState((s) => ({ ...s, step: 'qualityDone', importPercent: 100, qualityResult: response }));
    } catch (err) {
      setState((s) => ({ ...s, step: 'quality', error: friendlyError(err) }));
    } finally {
      clearInterval(tick);
    }
  }, [state, profile, queryClient]);

  return { state, selectFile, setMapping, confirmMapping, runImport, runQualityImport, reset };
}
