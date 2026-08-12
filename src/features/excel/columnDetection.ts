import type { ColumnMapping, MappableField } from '@/types/domain';

/**
 * Supervisors do not type headers consistently. Rather than force a template,
 * match on a normalised form and keep a synonym list per field.
 * Add new spellings here - this is the one place header variation is handled.
 */
const SYNONYMS: Record<MappableField, string[]> = {
  lineNumber:     ['line', 'lineno', 'linenumber', 'productionline', 'prodline', 'sewingline'],
  orderNumber:    ['order', 'orderno', 'ordernumber', 'po', 'ponumber', 'jobno'],
  buyer:          ['buyer', 'buyername', 'customer', 'client'],
  styleNumber:    ['style', 'styleno', 'stylenumber', 'stylecode'],
  productName:    ['product', 'productname', 'item', 'garment', 'description'],
  color:          ['color', 'colour', 'shade'],
  size:           ['size', 'sizes', 'sizerange'],
  orderQuantity:  ['orderqty', 'orderquantity', 'totalqty', 'qtyordered'],
  targetQuantity: ['target', 'targetqty', 'targetquantity', 'plan', 'planqty', 'dailytarget'],
  actualQuantity: ['prodqty', 'producedqty', 'productionqty', 'actual', 'actualqty',
                   'output', 'qtyproduced', 'sewingoutput', 'qty', 'quantity'],
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
  header.toLowerCase().replace(/[\s_\-./\\]/g, '').replace(/qty\b/, 'qty').trim();

export function detectColumns(headers: string[]): ColumnMapping[] {
  const taken = new Set<MappableField>();

  return headers.map((header) => {
    const key = normalise(header);
    if (!key) return { excelHeader: header, field: null, confidence: 'unmapped' as const };

    // Exact synonym match wins and is high confidence.
    for (const [field, list] of Object.entries(SYNONYMS) as [MappableField, string[]][]) {
      if (taken.has(field)) continue;
      if (list.includes(key)) {
        taken.add(field);
        return { excelHeader: header, field, confidence: 'high' as const };
      }
    }

    // Substring match is offered, but flagged for the user to confirm.
    for (const [field, list] of Object.entries(SYNONYMS) as [MappableField, string[]][]) {
      if (taken.has(field)) continue;
      if (list.some((s) => key.includes(s) || s.includes(key))) {
        taken.add(field);
        return { excelHeader: header, field, confidence: 'low' as const };
      }
    }

    return { excelHeader: header, field: null, confidence: 'unmapped' as const };
  });
}

export function missingRequired(mappings: ColumnMapping[]): MappableField[] {
  const mapped = new Set(mappings.map((m) => m.field).filter(Boolean) as MappableField[]);
  return REQUIRED_FIELDS.filter((field) => !mapped.has(field));
}
