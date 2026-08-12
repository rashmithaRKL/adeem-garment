import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { ColumnMapping, ScanResult } from '@/types/domain';
import { friendlyError } from '@/lib/errors';
import { parseWorkbook, validateRows, type ParsedWorkbook } from './parseWorkbook';
import { hashFile } from './hash';
import { missingRequired } from './columnDetection';
import { importWorkbook, validateFile, type ImportResult, type DuplicateResult } from './importService';

export type FlowStep = 'select' | 'scanning' | 'duplicate' | 'mapping' | 'preview' | 'importing' | 'done';

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
  parsed: ParsedWorkbook | null;
  scan: ScanResult | null;
  mappings: ColumnMapping[];
  stageIndex: number;
  importPercent: number;
  result: ImportResult | null;
  duplicate: DuplicateResult['previousUpload'] | null;
  error: string;
}

const INITIAL: FlowState = {
  step: 'select', file: null, parsed: null, scan: null, mappings: [],
  stageIndex: 0, importPercent: 0, result: null, duplicate: null, error: ''
};

export function useUploadFlow() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<FlowState>(INITIAL);

  const reset = useCallback(() => setState(INITIAL), []);

  /** Parse and validate entirely in the browser; nothing is written yet. */
  const selectFile = useCallback(async (file: File) => {
    setState({ ...INITIAL, step: 'scanning', file });
    try {
      validateFile(file);
      setState((s) => ({ ...s, stageIndex: 1 }));

      const fileHash = await hashFile(file);
      setState((s) => ({ ...s, stageIndex: 2 }));

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

  return { state, selectFile, setMapping, confirmMapping, runImport, reset };
}
