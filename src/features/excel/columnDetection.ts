import type { ColumnMapping, MappableField } from '@/types/domain';

/**
 * Supervisors do not type headers consistently. Rather than force a template,
 * match on a normalised form and keep a synonym list per field.
 * Add new spellings here - this is the one place header variation is handled.
 */
const SYNONYMS: Record<MappableField, string[]> = {
  lineNumber:     ['line', 'lineno', 'linenumber', 'productionline', 'prodline', 'sewingline',
                   'module', 'moduleno', 'team', 'teamno'],
  orderNumber:    ['order', 'orderno', 'ordernumber', 'po', 'ponumber', 'pono', 'jobno',
                   'workorder', 'workorderno'],
  buyer:          ['buyer', 'buyername', 'customer', 'client', 'school', 'schoolname'],
  styleNumber:    ['style', 'styleno', 'stylenumber', 'stylecode', 'styleref'],
  productName:    ['product', 'productname', 'item', 'itemname', 'garment', 'description'],
  color:          ['color', 'colour', 'shade'],
  size:           ['size', 'sizes', 'sizerange'],
  orderQuantity:  ['orderqty', 'orderquantity', 'totalqty', 'qtyordered', 'totalpcs'],
  targetQuantity: ['target', 'targetqty', 'targetquantity', 'plan', 'planqty', 'plannedqty',
                   'dailytarget', 'targetpcs'],
  actualQuantity: ['prodqty', 'producedqty', 'productionqty', 'actual', 'actualqty',
                   'output', 'qtyproduced', 'sewingoutput', 'qty', 'quantity', 'achieved',
                   'achievedqty', 'actualpcs', 'outputpcs'],
  efficiency:     ['eff', 'eff%', 'efficiency', 'efficiency%', 'effpercent'],
  productionDate: ['date', 'proddate', 'productiondate', 'day', 'shiftdate'],
  deliveryDate:   ['deliverydate', 'delivery', 'shipdate', 'exfactory', 'exfactorydate'],
  remarks:        ['remarks', 'remark', 'note', 'notes', 'comment', 'comments']
};

/** Fields the importer cannot proceed without. */
export const REQUIRED_FIELDS: MappableField[] = [
  'lineNumber', 'orderNumber', 'targetQuantity', 'actualQuantity'
];

const normalise = (header: string): string =>
  header.toLowerCase().replace(/[\s_\-./\\]/g, '').trim();

/**
 * Headers that are really data: "Line 01" from a merged band heading, a bare
 * number, a date. Left unguarded, "Line 01" contains "line" and is offered as
 * the production line column, which is how a sheet whose header row was misread
 * still looked half-mapped instead of obviously wrong.
 */
const VALUE_LIKE: RegExp[] = [
  /^(?:line|l|module|team)\s*[-_#]?\s*\d{1,3}$/i,
  /^\d+(?:[.,]\d+)?$/,
  /^\d{1,4}[/\-.]\d{1,2}(?:[/\-.]\d{1,4})?$/
];

export const looksLikeValue = (header: string): boolean => {
  const text = header.trim();
  return text.length > 0 && VALUE_LIKE.some((re) => re.test(text));
};

export function detectColumns(headers: string[]): ColumnMapping[] {
  const taken = new Set<MappableField>();

  return headers.map((header) => {
    const key = normalise(header);
    if (!key || looksLikeValue(header)) {
      return { excelHeader: header, field: null, confidence: 'unmapped' as const };
    }

    // Exact synonym match wins and is high confidence.
    for (const [field, list] of Object.entries(SYNONYMS) as [MappableField, string[]][]) {
      if (taken.has(field)) continue;
      if (list.includes(key)) {
        taken.add(field);
        return { excelHeader: header, field, confidence: 'high' as const };
      }
    }

    // Containment runs one way only: a header may carry extra words around a
    // synonym ("Sewing Output Qty" -> output), but a synonym may never swallow a
    // shorter header. The reverse direction matched "Ord" against "order" and,
    // worse, any three-letter header against something.
    for (const [field, list] of Object.entries(SYNONYMS) as [MappableField, string[]][]) {
      if (taken.has(field)) continue;
      if (list.some((s) => s.length >= 3 && key.length >= 3 && key.includes(s))) {
        taken.add(field);
        return { excelHeader: header, field, confidence: 'low' as const };
      }
    }

    return { excelHeader: header, field: null, confidence: 'unmapped' as const };
  });
}

export function mappedFields(mappings: ColumnMapping[]): Set<MappableField> {
  return new Set(mappings.map((m) => m.field).filter(Boolean) as MappableField[]);
}

export function missingRequired(mappings: ColumnMapping[]): MappableField[] {
  const mapped = mappedFields(mappings);
  return REQUIRED_FIELDS.filter((field) => !mapped.has(field));
}

/** How many of the required fields a candidate header row accounts for. */
export function requiredHits(headers: string[]): number {
  const mapped = mappedFields(detectColumns(headers));
  return REQUIRED_FIELDS.filter((field) => mapped.has(field)).length;
}

/**
 * How much a row looks like the header row of a production sheet. Required
 * fields count for more, and an exact synonym hit counts for more than a
 * containment guess, so a title block never outscores the real headers.
 */
export function scoreHeaders(headers: string[]): number {
  const seen = new Set<MappableField>();
  let score = 0;
  for (const mapping of detectColumns(headers)) {
    if (!mapping.field || seen.has(mapping.field)) continue;
    seen.add(mapping.field);
    const weight = REQUIRED_FIELDS.includes(mapping.field) ? 3 : 1;
    score += mapping.confidence === 'high' ? weight * 2 : weight;
  }
  return score;
}
