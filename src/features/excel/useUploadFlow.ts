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
import { tryParseHrFile, type HrParseResult } from '@/features/hr/parseHr';
import { importHrRows, type SheetImportResult } from '@/features/hr/importHr';
import { tryParsePlanFile, type PlanParseResult } from '@/features/loading/parsePlan';
import { importPlanRows } from '@/features/loading/importPlan';

export type FlowStep =
  | 'select' | 'scanning' | 'duplicate' | 'mapping' | 'preview' | 'importing' | 'done'
  // the quality reports take their own preview screen: they have no columns to map
  | 'quality' | 'qualityDuplicate' | 'qualityDone'
  // and so do the two sheets that are upserted rather than versioned
  | 'sheet' | 'sheetDone';

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
  /** An HR attendance sheet or a loading plan, whichever was recognised. */
  sheet: HrParseResult | PlanParseResult | null;
  sheetResult: SheetImportResult | null;
  error: string;
}

const INITIAL: FlowState = {
  step: 'select', file: null, fileHash: '', parsed: null, scan: null, mappings: [],
  stageIndex: 0, importPercent: 0, result: null, duplicate: null,
  quality: null, qualityResult: null, qualityDuplicate: null,
  sheet: null, sheetResult: null, error: ''
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

      // Order matters, and it runs from the most specific test to the least.
      //
      // Attendance needs a date beside a carder or attendance column; a loading
      // plan needs a style beside PP, PCD, PSD or PED. Nothing else in the
      // factory's paperwork looks like either. The quality check comes after
      // them because it recognises a report by its sheet names — and a loading
      // plan with one tab per line ("LINE 01", "LINE 02") answers to that test
      // as readily as a KPI report does.
      const hr = await tryParseHrFile(file);
      if (hr) {
        setState((s) => ({ ...s, stageIndex: SCAN_STAGES.length, sheet: hr, step: 'sheet' }));
        return;
      }

      const plan = await tryParsePlanFile(file);
      if (plan) {
        setState((s) => ({ ...s, stageIndex: SCAN_STAGES.length, sheet: plan, step: 'sheet' }));
        return;
      }

      // The quality reports carry no order number, target or produced quantity,
      // so they can never satisfy the production importer either.
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

  /**
   * HR and loading-plan sheets are upserted on their own natural key, so there is
   * no duplicate screen and no version chain here: uploading a revised sheet is
   * the supported way to correct one.
   */
  const runSheetImport = useCallback(async () => {
    const { sheet } = state;
    if (!sheet) return;

    setState((s) => ({ ...s, step: 'importing', importPercent: 25, error: '' }));
    const tick = setInterval(
      () => setState((s) => ({ ...s, importPercent: Math.min(s.importPercent + 9, 92) })),
      240
    );

    try {
      const profileId = profile?.id ?? null;
      const response = sheet.kind === 'hr'
        ? await importHrRows(sheet.rows, profileId)
        : await importPlanRows(sheet.rows, profileId);

      await queryClient.invalidateQueries({ queryKey: [sheet.kind === 'hr' ? 'hr' : 'loadingPlan'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['lines'] });
      setState((s) => ({ ...s, step: 'sheetDone', importPercent: 100, sheetResult: response }));
    } catch (err) {
      setState((s) => ({ ...s, step: 'sheet', error: friendlyError(err) }));
    } finally {
      clearInterval(tick);
    }
  }, [state, profile, queryClient]);

  return {
    state, selectFile, setMapping, confirmMapping,
    runImport, runQualityImport, runSheetImport, reset
  };
}
