/**
 * The catalogue of workbooks this system accepts.
 *
 * One entry per report, not one workbook for everything: quality, production,
 * rejection, attendance and the loading plan are kept by different people, on
 * different days, in different shapes, and a single combined template would be
 * wrong for all five of them. Each entry says what the report is for, which
 * screens it feeds, the columns it is read from, and how to build a blank copy.
 *
 * This file is the one description of that. The parsers still match headers by
 * synonym — a factory's own sheet imports as it stands, and nobody is forced
 * onto a template — so what is written here is the shape known to work, and the
 * column tables the Upload screen shows are generated from the same entries the
 * downloads are built from. They cannot drift apart.
 *
 * Each sheet also carries a `style`: which rows are the title, which are the
 * headings, which rows are examples and where the empty rows waiting to be typed
 * into begin. The rows themselves stay exactly as the importers expect them —
 * templates.ts only paints what is described here, and never moves a row.
 */

export type TemplateId =
  | 'production'
  | 'quality-line-kpi'
  | 'quality-daily'
  | 'quality-monthly'
  | 'quality-final-inspection'
  | 'quality-seconds'
  | 'rejection'
  | 'hr-attendance'
  | 'loading-plan';

export type TemplateModule =
  | 'Production' | 'Quality management' | 'Rejection' | 'HR and manpower' | 'Planning';

/** How much the importer needs a column, in the words the guide sheet uses. */
export type Requirement = 'required' | 'recommended' | 'optional';

export interface TemplateColumn {
  /** The heading written into the template. */
  header: string;
  requirement: Requirement;
  /** What belongs in the cell: a date, a whole number, text. */
  format: string;
  meaning: string;
  /** Other spellings the importer already answers to. */
  alsoAccepted?: string[];
}

/**
 * Where the parts of a sheet are, so it can be painted without anything having to
 * guess. Every index is 0-based and refers to `rows` as written below.
 */
export interface SheetStyle {
  /** Rows merged across the table and painted as the report's title block. */
  title?: number[];
  /** Stage banner rows on the quality sheets, merged over the block they head. */
  banner?: number[];
  /** Column heading rows. Everything freezes below the last of them. */
  headers?: number[];
  /** First and last row of the fillable table. */
  data?: [number, number];
  /** Rows carrying example figures, tinted so they read as samples to replace. */
  examples?: number[];
  /** Columns holding dates, percentages and whole numbers. */
  dates?: number[];
  percents?: number[];
  integers?: number[];
  /** Columns the importer cannot do without: their headings are marked. */
  required?: number[];
  /** Dropdown lists, by column. */
  choices?: Record<number, string[]>;
  /** How many columns wide the painted table is. */
  width: number;
  /** A second table further down — the appearance defect block. */
  extra?: SheetStyle;
  /**
   * Turns the heading row into a filter row. Flat tables only: a banded sheet
   * has no single heading row for Excel to hang one off. The columns are widened
   * to leave room for the button, which otherwise sits on top of the heading.
   */
  filter?: boolean;
}

export interface TemplateSheet {
  name: string;
  rows: unknown[][];
  /** Column widths, so the file is readable the moment it opens. */
  widths?: number[];
  style: SheetStyle;
}

export interface UploadTemplate {
  id: TemplateId;
  module: TemplateModule;
  title: string;
  /** One sentence: what this workbook records. */
  purpose: string;
  /** Where the figures land once imported. */
  landsIn: string;
  /** How often it is normally uploaded. */
  cadence: string;
  /** What makes the importer recognise the file as this report and no other. */
  recognisedBy: string;
  /** File name without the date stamp the download adds. */
  fileStem: string;
  columns: TemplateColumn[];
  notes: string[];
  /** The data sheets. The guide sheet is added by the writer itself. */
  build: () => TemplateSheet[];
}

// ---------------------------------------------------------------------------
// Sample values
// ---------------------------------------------------------------------------

const day = (offset: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

/** A month relative to today, as the sheets name it: "August 2026". */
const month = (offset: number): string => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

const thisYear = (): number => new Date().getFullYear();

/**
 * The months of the current year that carry example figures: this month and the
 * two before it, so the year-long sheets open on something recognisable and the
 * rest of the rows are already waiting, named and empty.
 */
const filledMonths = (): number[] => {
  const now = new Date().getMonth();
  return [now - 2, now - 1, now].filter((i) => i >= 0);
};

/** Pads a banded header row out to a fixed width so the grid stays rectangular. */
const bandRow = (width: number, cells: Record<number, unknown>): unknown[] =>
  Array.from({ length: width }, (_, i) => cells[i] ?? '');

/**
 * The empty rows below the examples. They are genuinely empty — the importers
 * drop a row with nothing in it — and exist so the sheet opens with a ruled,
 * obviously fillable table rather than four sample rows and a void.
 */
const blankRows = (count: number): unknown[][] => Array.from({ length: count }, () => []);

/**
 * The sewing lines the factory runs today. Every template lays all of them out —
 * a sheet per line on the KPI report, a row per line everywhere else — so the
 * person filling one in is never left to work out that the rows they need are
 * missing. A fifth line is a copied sheet or an inserted row, and nothing in the
 * importers depends on this number: the lines that exist are the lines the
 * uploaded workbooks name.
 */
const LINES = [1, 2, 3, 4];

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** What each line was running, so the examples read like a real day's paperwork. */
const LINE_SAMPLE: Record<number, { style: string; order: string; buyer: string }> = {
  1: { style: 'AU-4471', order: 'PO-10233', buyer: 'St Anthony College' },
  2: { style: 'AU-4482', order: 'PO-10241', buyer: 'Royal Institute' },
  3: { style: 'AU-4390', order: 'PO-10199', buyer: 'Holy Family Convent' },
  4: { style: 'AU-4415', order: 'PO-10256', buyer: 'St Joseph Vaz College' }
};

/** Pieces checked and defects found at each of the four gates, line by line. */
const GATE_SAMPLE: Record<number, { checked: number[]; defects: number[]; audits: number; auditFails: number }> = {
  1: { checked: [320, 320, 300, 280], defects: [6, 4, 7, 3], audits: 2, auditFails: 0 },
  2: { checked: [280, 280, 260, 240], defects: [9, 6, 8, 4], audits: 1, auditFails: 0 },
  3: { checked: [300, 300, 290, 260], defects: [7, 5, 9, 5], audits: 2, auditFails: 1 },
  4: { checked: [260, 260, 250, 230], defects: [5, 3, 6, 2], audits: 1, auditFails: 0 }
};

/** The appearance defects behind those figures, in the order the block lists them. */
const DEFECT_SAMPLE: Record<number, number[]> = {
  1: [3, 1, 0, 2, 1],
  2: [4, 1, 1, 1, 1],
  3: [5, 2, 1, 1, 0],
  4: [2, 1, 0, 2, 1]
};

const sum = (values: number[]): number => values.reduce((total, n) => total + n, 0);

/** CHECK QTY, DEFECT QTY, DEFECT %, PASS % — the four columns of one gate. */
const gateColumns = (checked: number, defects: number): number[] => [
  checked, defects, round2((defects / checked) * 100), round2(100 - (defects / checked) * 100)
];

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------

const production: UploadTemplate = {
  id: 'production',
  module: 'Production',
  title: 'Daily production report',
  purpose: 'What each sewing line was asked to make and what it actually made, day by day.',
  landsIn: 'Dashboard, Production lines, Orders and Analytics',
  cadence: 'Daily, or one file per week',
  recognisedBy: 'A line and an order number beside a target and a produced quantity.',
  fileStem: 'production-report-template',
  columns: [
    { header: 'Date', requirement: 'recommended', format: 'Date (YYYY-MM-DD)',
      meaning: 'The production day the figures belong to.',
      alsoAccepted: ['Production Date', 'Prod Date', 'Day', 'Shift Date'] },
    { header: 'Line', requirement: 'required', format: 'Whole number, or "Line 03"',
      meaning: 'The sewing line the row is for.',
      alsoAccepted: ['Line No', 'Production Line', 'Module', 'Team No'] },
    { header: 'Order No', requirement: 'required', format: 'Text',
      meaning: 'The order or PO the line was running. Rows are grouped by it.',
      alsoAccepted: ['PO', 'PO Number', 'Job No', 'Work Order'] },
    { header: 'Buyer', requirement: 'recommended', format: 'Text',
      meaning: 'The customer or school the order belongs to.',
      alsoAccepted: ['Customer', 'Client', 'School Name'] },
    { header: 'Style No', requirement: 'recommended', format: 'Text',
      meaning: 'The style being sewn.',
      alsoAccepted: ['Style', 'Style Code', 'Style Ref'] },
    { header: 'Product', requirement: 'optional', format: 'Text',
      meaning: 'What the garment is.', alsoAccepted: ['Item', 'Description'] },
    { header: 'Colour', requirement: 'optional', format: 'Text',
      meaning: 'Colour or shade.', alsoAccepted: ['Color', 'Shade'] },
    { header: 'Size', requirement: 'optional', format: 'Text',
      meaning: 'Size or size range.', alsoAccepted: ['Sizes', 'Size Range'] },
    { header: 'Order Qty', requirement: 'recommended', format: 'Whole number',
      meaning: 'Total pieces on the order, used to show how far it has come.',
      alsoAccepted: ['Order Quantity', 'Total Qty', 'Total Pcs'] },
    { header: 'Target Qty', requirement: 'required', format: 'Whole number',
      meaning: 'Pieces the line was planned to make that day.',
      alsoAccepted: ['Target', 'Plan Qty', 'Daily Target'] },
    { header: 'Produced Qty', requirement: 'required', format: 'Whole number',
      meaning: 'Pieces the line actually made. Every achievement figure is built from this.',
      alsoAccepted: ['Actual Qty', 'Output', 'Sewing Output', 'Achieved Qty'] },
    { header: 'Efficiency %', requirement: 'optional', format: 'Number or percentage',
      meaning: 'Line efficiency. Left blank it is derived from produced against target.',
      alsoAccepted: ['Eff', 'Eff %', 'Efficiency'] },
    { header: 'Delivery Date', requirement: 'optional', format: 'Date (YYYY-MM-DD)',
      meaning: 'When the order ships. Drives the delivery countdown on Orders.',
      alsoAccepted: ['Ex Factory', 'Ship Date'] },
    { header: 'Remarks', requirement: 'optional', format: 'Text',
      meaning: 'Anything that explains the day: machine down, power cut, style change.',
      alsoAccepted: ['Remark', 'Note', 'Comment'] }
  ],
  notes: [
    'One row per line per order per day. Two rows for the same line and day are both kept — they are two orders, not a correction.',
    'A reject, waste or cut-output column is never read as a produced quantity. Those figures belong in the rejection report, which has its own template.',
    'Side-by-side blocks headed "Line 01", "Line 02" are read too, so the factory’s own sheet can be uploaded unchanged.'
  ],
  build: () => [{
    name: 'Production',
    widths: [12, 7, 12, 20, 12, 14, 10, 10, 11, 11, 13, 12, 13, 22],
    rows: [
      ['DAILY PRODUCTION REPORT'],
      ['One row for each order a sewing line ran that day. The yellow rows are examples — type over them or delete them. Headings in the darker blue must be filled in.'],
      ['Date', 'Line', 'Order No', 'Buyer', 'Style No', 'Product', 'Colour', 'Size',
        'Order Qty', 'Target Qty', 'Produced Qty', 'Efficiency %', 'Delivery Date', 'Remarks'],
      // One row per line, so all four are laid out and the day is complete.
      ...LINES.map((line) => {
        const it = LINE_SAMPLE[line]!;
        const product = ['Shirt', 'Trouser', 'Skirt', 'Shirt'][line - 1]!;
        const colour = ['White', 'Navy', 'Navy', 'Blue'][line - 1]!;
        const orderQty = [6400, 3800, 5200, 4600][line - 1]!;
        const target = [900, 700, 800, 750][line - 1]!;
        // Under target, every one of them: a produced quantity above its target
        // is a legitimate day, but the importer flags it for checking, and a
        // template should not ship with a warning already in it.
        const produced = [872, 654, 762, 703][line - 1]!;
        return [day(-1), line, it.order, it.buyer, it.style, product, colour, '26-40',
          orderQty, target, produced, round2((produced / target) * 88), day(21 + line), ''];
      }),
      ...blankRows(24)
    ],
    style: {
      width: 14,
      title: [0, 1],
      headers: [2],
      data: [3, 30],
      examples: rangeOf(3, LINES.length),
      dates: [0, 12],
      integers: [1, 8, 9, 10],
      percents: [11],
      required: [1, 2, 9, 10],
      filter: true
    }
  }]
};

// ---------------------------------------------------------------------------
// Quality management — five reports, five layouts
// ---------------------------------------------------------------------------

const qualityLineKpi: UploadTemplate = {
  id: 'quality-line-kpi',
  module: 'Quality management',
  title: 'Line KPI report — one sheet per line',
  purpose: 'Every inspection gate a single line passed through, one row per date.',
  landsIn: 'Quality management: per-line pass rates and stage trends',
  cadence: 'Daily rows, uploaded weekly or monthly',
  recognisedBy: 'Sheets named LINE 01, LINE 02 and so on.',
  fileStem: 'quality-line-kpi-template',
  columns: [
    { header: 'DATE', requirement: 'required', format: 'Date (YYYY-MM-DD)',
      meaning: 'The inspection day, in the first column. A row with no date is skipped, so blank rows cost nothing.' },
    { header: 'CHECKED', requirement: 'required', format: 'Whole number',
      meaning: 'Pieces inspected at that gate. Repeated under each stage banner.' },
    { header: 'PASS', requirement: 'recommended', format: 'Whole number',
      meaning: 'Pieces that passed. Left blank it is derived from CHECKED minus FAIL.' },
    { header: 'FAIL', requirement: 'recommended', format: 'Whole number',
      meaning: 'Pieces that failed. Left blank it is derived from CHECKED minus PASS.' }
  ],
  notes: [
    'Row 1 names the stage over each block — In line, End line, Appearance, Final, AQL — and row 2 names its three columns. Data starts on row 3.',
    'One sheet per line — LINE 01 to LINE 04, one for each line the factory runs. To add a fifth, copy a sheet and rename it LINE 05.',
    'A stage the line did not run that day is left blank. A zero is read as blank, so it never draws a 0% point on the charts.',
    'A sheet for a line that has not been inspected yet still registers the line, so it appears on the Quality screens.',
    'These two rows are fixed: the importer reads the banner from row 1 and the headings from row 2, so nothing may be inserted above them.'
  ],
  build: () => {
    const width = 16;
    const banner = bandRow(width, { 1: 'IN LINE', 4: 'END LINE', 7: 'APPEARANCE', 10: 'FINAL', 13: 'AQL' });
    const sub = ['DATE', ...Array.from({ length: 5 }, () => ['CHECKED', 'PASS', 'FAIL']).flat()];
    const widths = [13, ...Array.from({ length: 15 }, () => 10)];
    const style: SheetStyle = {
      width,
      banner: [0],
      headers: [1],
      data: [2, 21],
      examples: [2, 3],
      dates: [0],
      integers: Array.from({ length: 15 }, (_, i) => i + 1),
      required: [0, 1, 4, 7, 10, 13]
    };

    /** CHECKED, PASS and FAIL for each gate, on one day of one line. */
    const dayRow = (date: string, line: number, lift: number): unknown[] => {
      const gates = GATE_SAMPLE[line]!;
      return [date, ...gates.checked.flatMap((checked, i) => {
        const fail = gates.defects[i]!;
        return [checked + lift, checked + lift - fail, fail];
      }), gates.audits, gates.audits - gates.auditFails, gates.auditFails];
    };

    return LINES.map((line) => ({
      name: `LINE ${String(line).padStart(2, '0')}`,
      widths,
      style,
      rows: [banner, sub, dayRow(day(-2), line, 0), dayRow(day(-1), line, 20), ...blankRows(18)]
    }));
  }
};

/** The four columns every stage block carries on the daily and monthly reports. */
const STAGE_BLOCK = ['CHECK QTY', 'DEFECT QTY', 'DEFECT %', 'PASS %'];

/** The defect block that sits under both reports, and the rows it occupies. */
const DEFECT_BLOCK: unknown[][] = [
  [],
  ['Appearance Defect Summary'],
  ['Line', 'Check Qty', 'Uncut Threads', 'Oil Marks', 'Shade Variation', 'Measurement', 'Stain']
];

/**
 * The daily and monthly reports carry the same figures at two grains, so the
 * sample rows are written once and scaled. A month is 22 working days here —
 * near enough that the example totals read as a month's worth rather than as a
 * day's figures with a zero added.
 */
type Grain = 'daily' | 'monthly';

const MONTH_DAYS = 22;

const scaleOf = (grain: Grain): number => (grain === 'daily' ? 1 : MONTH_DAYS);

const rangeOf = (start: number, count: number): number[] =>
  Array.from({ length: count }, (_, i) => start + i);

/** One line's row across the four gates and the AQL block beside them. */
function gateRow(line: number, grain: Grain): unknown[] {
  const scale = scaleOf(grain);
  const gates = GATE_SAMPLE[line]!;
  const stages = gates.checked.flatMap((checked, i) =>
    gateColumns(checked * scale, gates.defects[i]! * scale));
  const audits = gates.audits * scale;
  const fails = gates.auditFails * scale;
  const passPct = round2(((audits - fails) / audits) * 100);

  return grain === 'daily'
    ? [line, LINE_SAMPLE[line]!.style, ...stages, audits, audits - fails, fails, passPct]
    : [line, ...stages, audits, audits - fails, fails, passPct, round2(100 - passPct)];
}

/** The roll-up row that closes the stage table, and every figure in it adds up. */
function factoryGateRow(grain: Grain): unknown[] {
  const scale = scaleOf(grain);
  const stages = [0, 1, 2, 3].flatMap((gate) => gateColumns(
    sum(LINES.map((line) => GATE_SAMPLE[line]!.checked[gate]! * scale)),
    sum(LINES.map((line) => GATE_SAMPLE[line]!.defects[gate]! * scale))
  ));
  const audits = sum(LINES.map((line) => GATE_SAMPLE[line]!.audits * scale));
  const fails = sum(LINES.map((line) => GATE_SAMPLE[line]!.auditFails * scale));
  const passPct = round2(((audits - fails) / audits) * 100);

  return grain === 'daily'
    ? ['FACTORY', '', ...stages, audits, audits - fails, fails, passPct]
    : ['FACTORY', ...stages, audits, audits - fails, fails, passPct, round2(100 - passPct)];
}

/** A line's row in the appearance defect block below the stage table. */
function defectRow(line: number, grain: Grain): unknown[] {
  const scale = scaleOf(grain);
  return [line, GATE_SAMPLE[line]!.checked[2]! * scale,
    ...DEFECT_SAMPLE[line]!.map((qty) => qty * scale)];
}

function factoryDefectRow(grain: Grain): unknown[] {
  const scale = scaleOf(grain);
  return ['FACTORY', sum(LINES.map((line) => GATE_SAMPLE[line]!.checked[2]! * scale)),
    ...[0, 1, 2, 3, 4].map((i) => sum(LINES.map((line) => DEFECT_SAMPLE[line]![i]! * scale)))];
}

const qualityDaily: UploadTemplate = {
  id: 'quality-daily',
  module: 'Quality management',
  title: 'Daily quality performance report',
  purpose: 'One day of the factory: every line, every gate, with the appearance defects behind the figures.',
  landsIn: 'Quality management: the daily view, defect breakdown and AQL audits',
  cadence: 'One file per day',
  recognisedBy: 'The words "Daily Quality" in the title block above the table.',
  fileStem: 'daily-quality-report-template',
  columns: [
    { header: 'Date :- (title block)', requirement: 'required',
      format: 'Text, e.g. "Date :- 2026-08-30"',
      meaning: 'The report date, typed in the title block above the table. Every row is filed under it, so nothing else may be written on that line.' },
    { header: 'TEAM NO', requirement: 'required', format: 'Whole number, or FACTORY',
      meaning: 'The line. The FACTORY row is the roll-up and closes the stage table.',
      alsoAccepted: ['LINE'] },
    { header: 'STYLE NO', requirement: 'optional', format: 'Text',
      meaning: 'The style inspected.' },
    { header: 'CHECK QTY', requirement: 'required', format: 'Whole number',
      meaning: 'Pieces checked at that gate — one set of four columns under each of In line, End line, Appearance and Final.' },
    { header: 'DEFECT QTY', requirement: 'recommended', format: 'Whole number',
      meaning: 'Pieces rejected at that gate. The pass quantity is derived from it.' },
    { header: 'DEFECT %', requirement: 'optional', format: 'Number or percentage',
      meaning: 'Left blank it is calculated from defects against checked.' },
    { header: 'PASS %', requirement: 'optional', format: 'Number or percentage',
      meaning: 'Left blank it is calculated from checked minus defects.' },
    { header: 'NO OF AUDITS', requirement: 'optional', format: 'Whole number',
      meaning: 'The AQL block: how many audits were run, with PASS and FAIL counts on the row below and % OF PASS beside it.' },
    { header: 'Appearance Defect Summary', requirement: 'optional', format: 'A block below the table',
      meaning: 'A Line column followed by one column per defect category. Category names are read from the header, so they can be changed or added to.' }
  ],
  notes: [
    'Stage banners sit on one row, their four columns on the next, and the AQL PASS and FAIL on the row after that. Data starts below all three.',
    'The FACTORY row ends the stage table; the defect summary block below it is read separately.',
    'All four lines are laid out. To add another, insert a row above FACTORY — the roll-up has to stay at the foot of the table.',
    'A stage with nothing in it is skipped rather than imported as zero.'
  ],
  build: () => {
    const width = 22;
    const banner = bandRow(width, { 2: 'IN LINE', 6: 'END LINE', 10: 'APPEARANCE', 14: 'FINAL', 18: 'AQL' });
    const sub = ['TEAM NO', 'STYLE NO',
      ...STAGE_BLOCK, ...STAGE_BLOCK, ...STAGE_BLOCK, ...STAGE_BLOCK,
      'NO OF AUDITS', 'RESULTS OF AUDIT', '', '% OF PASS'];
    const sub2 = bandRow(width, { 19: 'PASS', 20: 'FAIL' });
    return [{
      name: 'Daily quality',
      widths: [10, 11, ...Array.from({ length: 20 }, () => 10)],
      rows: [
        ['DAILY QUALITY PERFORMANCE REPORT'],
        [`Date :- ${day(-1)}`],
        banner, sub, sub2,
        ...LINES.map((line) => gateRow(line, 'daily')),
        factoryGateRow('daily'),
        ...DEFECT_BLOCK,
        ...LINES.map((line) => defectRow(line, 'daily')),
        factoryDefectRow('daily')
      ],
      style: {
        width,
        title: [0, 1],
        banner: [2],
        headers: [3, 4],
        data: [5, 5 + LINES.length],
        examples: rangeOf(5, LINES.length + 1),
        percents: [4, 5, 8, 9, 12, 13, 16, 17, 21],
        required: [0, 2, 6, 10, 14],
        extra: {
          width: 7,
          title: [7 + LINES.length],
          headers: [8 + LINES.length],
          data: [9 + LINES.length, 9 + LINES.length * 2],
          examples: rangeOf(9 + LINES.length, LINES.length + 1),
          required: [0]
        }
      }
    }];
  }
};

const qualityMonthly: UploadTemplate = {
  id: 'quality-monthly',
  module: 'Quality management',
  title: 'Monthly quality performance report',
  purpose: 'The same gates as the daily report, totalled for a month, one sheet per month.',
  landsIn: 'Quality management: the monthly view and month-on-month trends',
  cadence: 'One sheet per month, uploaded at month end',
  recognisedBy: 'The words "Monthly Quality" in the title block above the table.',
  fileStem: 'monthly-quality-report-template',
  columns: [
    { header: 'Month :- (title block)', requirement: 'required',
      format: 'Text, e.g. "Month :- AUGUST 2026"',
      meaning: 'Each sheet names its own month. Without it the sheet cannot be filed and is skipped.' },
    { header: 'TEAM NO', requirement: 'required', format: 'Whole number, or FACTORY',
      meaning: 'The line, with FACTORY as the roll-up row that ends the table.',
      alsoAccepted: ['LINE'] },
    { header: 'CHECK QTY', requirement: 'required', format: 'Whole number',
      meaning: 'Pieces checked at that gate over the month, repeated under each stage banner.' },
    { header: 'DEFECT QTY', requirement: 'recommended', format: 'Whole number',
      meaning: 'Pieces rejected at that gate over the month.' },
    { header: 'DEFECT %', requirement: 'optional', format: 'Number or percentage',
      meaning: 'Derived from the two quantities when blank.' },
    { header: 'PASS %', requirement: 'optional', format: 'Number or percentage',
      meaning: 'Derived from the two quantities when blank.' },
    { header: 'TOTAL NO OF AUDITS', requirement: 'optional', format: 'Whole number',
      meaning: 'The AQL block: audits run in the month.' },
    { header: '% OF AUDIT PASS, % OF AUDIT FAIL', requirement: 'optional', format: 'Whole number',
      meaning: 'Audits passed and failed. The sheet heads these with a % sign, but they are counts.' },
    { header: 'AQL PASS %, AQL FAIL %', requirement: 'optional', format: 'Number or percentage',
      meaning: 'The audit pass and fail rates.' }
  ],
  notes: [
    'One sheet per month, with a row for each of the four lines. Copy the sheet, change the "Month :-" line and fill in the figures.',
    'The appearance defect block below the table is read the same way as on the daily report.',
    'Rows are totals for the month, not for a day, and are never mixed with daily figures on screen.'
  ],
  build: () => {
    const width = 22;
    const banner = bandRow(width, { 1: 'IN LINE', 5: 'END LINE', 9: 'APPEARANCE', 13: 'FINAL', 17: 'AQL' });
    const sub = ['TEAM NO',
      ...STAGE_BLOCK, ...STAGE_BLOCK, ...STAGE_BLOCK, ...STAGE_BLOCK,
      'TOTAL NO OF AUDITS', '% OF AUDIT PASS', '% OF AUDIT FAIL', 'AQL PASS %', 'AQL FAIL %'];
    return [{
      name: month(0),
      widths: [10, ...Array.from({ length: 21 }, () => 11)],
      rows: [
        ['MONTHLY QUALITY PERFORMANCE REPORT'],
        [`Month :- ${month(0).toUpperCase()}`],
        banner, sub,
        ...LINES.map((line) => gateRow(line, 'monthly')),
        factoryGateRow('monthly'),
        ...DEFECT_BLOCK,
        ...LINES.map((line) => defectRow(line, 'monthly')),
        factoryDefectRow('monthly')
      ],
      style: {
        width,
        title: [0, 1],
        banner: [2],
        headers: [3],
        data: [4, 4 + LINES.length],
        examples: rangeOf(4, LINES.length + 1),
        percents: [3, 4, 7, 8, 11, 12, 15, 16, 20, 21],
        required: [0, 1, 5, 9, 13],
        extra: {
          width: 7,
          title: [6 + LINES.length],
          headers: [7 + LINES.length],
          data: [8 + LINES.length, 8 + LINES.length * 2],
          examples: rangeOf(8 + LINES.length, LINES.length + 1),
          required: [0]
        }
      }
    }];
  }
};

const qualityFinalInspection: UploadTemplate = {
  id: 'quality-final-inspection',
  module: 'Quality management',
  title: 'Final inspection summary — month by metric',
  purpose: 'The pre-shipment inspection: how much was sampled each month, how much passed first time, and what the defects were.',
  landsIn: 'Quality management: the final inspection panel and its own defect breakdown',
  cadence: 'One row per month, updated as the year runs',
  recognisedBy: 'A sheet named Summary whose header row starts with Month, beside Sample Inspected and a pass rate.',
  fileStem: 'final-inspection-summary-template',
  columns: [
    { header: 'Month', requirement: 'required', format: 'Month name, e.g. "August"',
      meaning: 'The month the row covers. All twelve are already listed — fill in the row as each month closes.' },
    { header: 'Sample Inspected', requirement: 'required', format: 'Whole number',
      meaning: 'Pieces sampled at final inspection that month.' },
    { header: 'Deffects', requirement: 'recommended', format: 'Whole number',
      meaning: 'Defective pieces found in the sample. Spelled as the sheet spells it; "Defects" is read too.',
      alsoAccepted: ['Defects'] },
    { header: 'Defect %', requirement: 'optional', format: 'Number or percentage',
      meaning: 'Defective share of the sample. Kept as typed where it is filled in; left blank it is worked out from Deffects over Sample Inspected, so the column costs nothing to skip.',
      alsoAccepted: ['Defect Rate'] },
    { header: 'Qty Shipped', requirement: 'optional', format: 'Whole number',
      meaning: 'Pieces shipped that month.' },
    { header: '1st time Pass Rate', requirement: 'recommended', format: 'Number or percentage',
      meaning: 'Share of inspections that passed at the first attempt. Kept as typed, never derived from the piece counts.' },
    { header: 'Defect categories', requirement: 'optional', format: 'One column each, whole numbers',
      meaning: 'Every column after the pass rate is read as a defect category: Fabric, Sewing, Washing, Packing, and any other you add.' }
  ],
  notes: [
    'Column order matters here: Month, Sample Inspected, Deffects, Defect %, Qty Shipped, 1st time Pass Rate, and then the defect categories.',
    'Defect % is headed in the singular, so it is never mistaken for the "Deffects" count beside it. Write it as 1.44 or 1.44% — both are read the same way.',
    'Those categories are tagged as final-inspection defects on import, so they are never mixed with sewing-floor defects on the charts.',
    'A month left empty is skipped rather than charted as a collapse to 0%, so the sheet can be uploaded at any point in the year.',
    'Month tabs (JAN, FEB, … DEC) beside the Summary are read too: one style per row with Date, Style, Sample Size, Major Defects, Pass/Fail and Line #. Each row is one final inspection for the line it names — write "1 & 4" for a style two lines shared — and these are what the line-by-line final inspection is built from.',
    'Upload the same workbook again as each month is added. A month in the newer upload replaces that month from the older one, so nothing is counted twice.'
  ],
  build: () => {
    const examples = filledMonths();
    const figures: Record<number, unknown[]> = {};
    examples.forEach((m, i) => {
      // Defect % sits beside the count it comes from — 18 of 1250 is 1.44 — so the
      // example rows show the two agreeing rather than leaving the reader to guess
      // which way round the percentage runs.
      figures[m] = [[1250, 18, 1.44, 42000, 93.75, 4, 7, 2, 3, 2],
        [1180, 12, 1.02, 39600, 95.83, 2, 5, 1, 2, 2],
        [960, 9, 0.94, 31400, 96.15, 1, 4, 1, 2, 1]][i] ?? [];
    });
    return [{
      name: 'Summary',
      widths: [12, 16, 10, 11, 12, 17, 10, 10, 10, 10, 13],
      rows: [
        [`FINAL INSPECTION SUMMARY ${thisYear()}`],
        ['Month', 'Sample Inspected', 'Deffects', 'Defect %', 'Qty Shipped', '1st time Pass Rate',
          'Fabric', 'Sewing', 'Washing', 'Packing', 'Measurement'],
        ...MONTHS.map((name, i) => [name, ...(figures[i] ?? [])])
      ],
      style: {
        width: 11,
        title: [0],
        headers: [1],
        data: [2, 13],
        examples: examples.map((m) => m + 2),
        integers: [1, 2, 4, 6, 7, 8, 9, 10],
        percents: [3, 5],
        required: [0, 1],
        filter: true
      }
    }];
  }
};

const qualitySeconds: UploadTemplate = {
  id: 'quality-seconds',
  module: 'Quality management',
  title: 'Monthly second summary — defects by month',
  purpose: 'How many pieces were downgraded to seconds each month, split by what was wrong with them.',
  landsIn: 'Quality management: defect categories across the year',
  cadence: 'One row per month',
  recognisedBy: 'The words "Second Summary" in the title block, above a Month column.',
  fileStem: 'monthly-second-summary-template',
  columns: [
    { header: 'Month', requirement: 'required', format: 'Month name, e.g. "August"',
      meaning: 'The month the counts belong to. All twelve are already listed; the sheet name carries the year.' },
    { header: 'Defect categories', requirement: 'required', format: 'One column each, whole numbers',
      meaning: 'Every column after Month is a category, read by its heading. Add or rename them freely — a Total column is ignored.' }
  ],
  notes: [
    'A zero or an empty cell records nothing at all, so a half-filled year is safe to upload.',
    'The sheet is named for its year ("Seconds 2026"), which is what dates the rows.',
    'One sheet per year; extra sheets in the same file are read as well.'
  ],
  build: () => {
    const examples = filledMonths();
    const figures: Record<number, unknown[]> = {};
    examples.forEach((m, i) => {
      figures[m] = [[12, 34, 8, 6, 11, 3, 74], [9, 28, 5, 4, 9, 2, 57], [7, 21, 6, 3, 8, 1, 46]][i] ?? [];
    });
    return [{
      name: `Seconds ${thisYear()}`,
      widths: [12, 12, 12, 16, 12, 14, 12, 10],
      rows: [
        [`MONTHLY SECOND SUMMARY ${thisYear()}`],
        ['Month', 'Fabric', 'Sewing', 'Shade Variation', 'Oil Marks', 'Measurement', 'Washing', 'Total'],
        ...MONTHS.map((name, i) => [name, ...(figures[i] ?? [])])
      ],
      style: {
        width: 8,
        title: [0],
        headers: [1],
        data: [2, 13],
        examples: examples.map((m) => m + 2),
        integers: [1, 2, 3, 4, 5, 6, 7],
        required: [0],
        filter: true
      }
    }];
  }
};

// ---------------------------------------------------------------------------
// Rejection
// ---------------------------------------------------------------------------

const rejection: UploadTemplate = {
  id: 'rejection',
  module: 'Rejection',
  title: 'Rejection report',
  purpose: 'Pieces each line threw out, style by style and day by day.',
  landsIn: 'The rejection figures on the Quality and Production screens',
  cadence: 'Daily rows, uploaded weekly',
  recognisedBy: 'A REJECT QTY column. Nothing else in the factory’s paperwork carries one.',
  fileStem: 'rejection-report-template',
  columns: [
    { header: 'DATE', requirement: 'required', format: 'Date (YYYY-MM-DD)',
      meaning: 'The day the pieces were rejected. A row whose date cannot be read is reported, never guessed at.',
      alsoAccepted: ['Prod Date', 'Reject Date'] },
    { header: 'LINE', requirement: 'required', format: 'Whole number, or "Line 03"',
      meaning: 'The line that rejected them. On a banded sheet this comes from the block heading instead.',
      alsoAccepted: ['Line No', 'Sewing Line', 'Team No', 'Module'] },
    { header: 'STYLE NO', requirement: 'recommended', format: 'Text',
      meaning: 'The style being sewn when the pieces were rejected.',
      alsoAccepted: ['Style', 'Style Code', 'Item No'] },
    { header: 'ORDER QTY', requirement: 'recommended', format: 'Whole number',
      meaning: 'Pieces the line was working through. The rejection rate is calculated against it.',
      alsoAccepted: ['Quantity', 'Total Qty', 'Checked Qty'] },
    { header: 'REJECT QTY', requirement: 'required', format: 'Whole number',
      meaning: 'Pieces rejected. This column is what makes the file a rejection report.',
      alsoAccepted: ['Rejection Qty', 'Rejected', 'Rej Qty'] }
  ],
  notes: [
    'The percentage is always calculated from the quantities and never read from a % column: a percentage typed as a plain number cannot be told apart from a fraction once Excel has stored it.',
    'The factory’s banded layout is read as well — a five-column block per line, side by side, under merged "Line 01" headings.',
    'A TOTAL row at the foot of a block is a restatement and is skipped silently.'
  ],
  build: () => [{
    name: 'Rejection',
    widths: [13, 9, 14, 13, 13],
    rows: [
      ['REJECTION REPORT'],
      ['One row for each style a sewing line rejected pieces from, day by day. The yellow rows are examples — type over them or delete them.'],
      ['DATE', 'LINE', 'STYLE NO', 'ORDER QTY', 'REJECT QTY'],
      // Every line gets a row, including one that rejected nothing that day.
      ...LINES.map((line) => [
        day(-1), line, LINE_SAMPLE[line]!.style,
        [900, 700, 800, 750][line - 1]!, [6, 11, 4, 0][line - 1]!
      ]),
      ...blankRows(24)
    ],
    style: {
      width: 5,
      title: [0, 1],
      headers: [2],
      data: [3, 30],
      examples: rangeOf(3, LINES.length),
      dates: [0],
      integers: [1, 3, 4],
      required: [0, 1, 4],
      filter: true
    }
  }]
};

// ---------------------------------------------------------------------------
// HR and planning
// ---------------------------------------------------------------------------

const hrAttendance: UploadTemplate = {
  id: 'hr-attendance',
  module: 'HR and manpower',
  title: 'HR attendance sheet',
  purpose: 'Headcount and who turned up, one row per day per department.',
  landsIn: 'HR and manpower: absenteeism and the carder trend',
  cadence: 'Daily rows, uploaded weekly or monthly',
  recognisedBy: 'A date beside a carder, present or absent column.',
  fileStem: 'hr-attendance-template',
  columns: [
    { header: 'Date', requirement: 'required', format: 'Date (YYYY-MM-DD)',
      meaning: 'The working day.', alsoAccepted: ['Work Date', 'Attendance Date', 'Day'] },
    { header: 'Department', requirement: 'recommended', format: 'Text',
      meaning: 'Sewing, Cutting, Finishing, and so on. Left blank the row is filed as Factory.',
      alsoAccepted: ['Dept', 'Section', 'Division', 'Floor'] },
    { header: 'Direct Carder', requirement: 'recommended', format: 'Whole number',
      meaning: 'Operators on the payroll for that department.',
      alsoAccepted: ['Direct Cadre', 'Direct Manpower', 'Direct Labour'] },
    { header: 'Indirect Carder', requirement: 'recommended', format: 'Whole number',
      meaning: 'Support and staff headcount.',
      alsoAccepted: ['Indirect Cadre', 'Indirect Manpower', 'Indirect Staff'] },
    { header: 'Present', requirement: 'required', format: 'Whole number',
      meaning: 'How many came in. Absenteeism cannot be worked out without it.',
      alsoAccepted: ['Attended', 'Attendance', 'Actual Manpower'] },
    { header: 'Absent', requirement: 'required', format: 'Whole number',
      meaning: 'How many did not.', alsoAccepted: ['Absentees', 'No of Absent'] },
    { header: 'On Leave', requirement: 'recommended', format: 'Whole number',
      meaning: 'Approved leave, counted apart from absence.',
      alsoAccepted: ['Leave', 'Approved Leave'] },
    { header: 'Remarks', requirement: 'optional', format: 'Text',
      meaning: 'Anything that explains the day.', alsoAccepted: ['Note', 'Comment'] }
  ],
  notes: [
    'One row per day per department. A day and department that appear twice are treated as a correction: the last row in the file is kept.',
    'A Total row at the foot of the sheet is recognised and skipped.',
    'Uploading the same day again replaces that day rather than adding to it.'
  ],
  build: () => [{
    name: 'Attendance',
    widths: [13, 15, 14, 15, 10, 10, 11, 26],
    rows: [
      ['HR ATTENDANCE SHEET'],
      ['One row for each department, each working day. The yellow rows are examples — type over them or delete them. Present, absent and leave are what absenteeism is worked out from.'],
      ['Date', 'Department', 'Direct Carder', 'Indirect Carder', 'Present', 'Absent', 'On Leave', 'Remarks'],
      [day(-2), 'Sewing', 180, 24, 192, 9, 3, ''],
      [day(-2), 'Cutting', 42, 8, 47, 2, 1, ''],
      [day(-1), 'Sewing', 180, 24, 188, 12, 4, 'Two machines down'],
      [day(-1), 'Cutting', 42, 8, 46, 3, 1, ''],
      ...blankRows(24)
    ],
    style: {
      width: 8,
      title: [0, 1],
      headers: [2],
      data: [3, 30],
      examples: [3, 4, 5, 6],
      dates: [0],
      integers: [2, 3, 4, 5, 6],
      required: [0, 4, 5],
      choices: { 1: ['Sewing', 'Cutting', 'Finishing', 'Packing', 'Stores', 'Quality', 'Maintenance', 'Factory'] },
      filter: true
    }
  }]
};

const loadingPlan: UploadTemplate = {
  id: 'loading-plan',
  module: 'Planning',
  title: 'Loading plan',
  purpose: 'Which style each line takes next, and the four dates it has to hit on the way there.',
  landsIn: 'Loading plan: the line-wise schedule and its milestone tracking',
  cadence: 'Whenever the plan changes',
  recognisedBy: 'A style column beside at least one of PP date, PCD, PSD or PED.',
  fileStem: 'loading-plan-template',
  columns: [
    { header: 'Line', requirement: 'required', format: 'Whole number',
      meaning: 'The line the style is loaded on. A sheet named "LINE 03" supplies it when the column is absent.',
      alsoAccepted: ['Line No', 'Sewing Line', 'Team No', 'Module'] },
    { header: 'Sequence', requirement: 'recommended', format: 'Whole number',
      meaning: 'Running order on that line. Left blank, the order the rows are typed in is used.',
      alsoAccepted: ['Seq', 'Sl No', 'Priority'] },
    { header: 'Style No', requirement: 'required', format: 'Text',
      meaning: 'The style to be run. One row per style per line.',
      alsoAccepted: ['Style', 'Style Code', 'Style Ref'] },
    { header: 'Order No', requirement: 'recommended', format: 'Text',
      meaning: 'The order the style belongs to.', alsoAccepted: ['PO', 'PO Number', 'Job No'] },
    { header: 'School Name', requirement: 'recommended', format: 'Text',
      meaning: 'The customer.', alsoAccepted: ['Buyer', 'Customer', 'Client', 'Institute'] },
    { header: 'Order Qty', requirement: 'recommended', format: 'Whole number',
      meaning: 'Pieces to be made.', alsoAccepted: ['Quantity', 'Plan Qty', 'Total Qty'] },
    { header: 'PP Date', requirement: 'recommended', format: 'Date (YYYY-MM-DD)',
      meaning: 'Pre-production meeting date.', alsoAccepted: ['PP', 'PP Meeting Date'] },
    { header: 'PCD', requirement: 'recommended', format: 'Date (YYYY-MM-DD)',
      meaning: 'Planned cut date.', alsoAccepted: ['Plan Cut Date', 'Cutting Date'] },
    { header: 'PSD', requirement: 'recommended', format: 'Date (YYYY-MM-DD)',
      meaning: 'Planned sewing start date.', alsoAccepted: ['Sewing Start Date', 'Input Date'] },
    { header: 'PED', requirement: 'recommended', format: 'Date (YYYY-MM-DD)',
      meaning: 'Planned end date.', alsoAccepted: ['Plan End Date', 'Finish Date', 'Output Date'] },
    { header: 'Status', requirement: 'optional', format: 'Upcoming, In progress, Hold or Completed',
      meaning: 'Where the style has got to — pick from the dropdown. Words like "running", "done" or "postponed" are understood too.',
      alsoAccepted: ['State', 'Stage', 'Progress'] },
    { header: 'Remarks', requirement: 'optional', format: 'Text',
      meaning: 'Anything the planner needs to note.', alsoAccepted: ['Note', 'Comment'] }
  ],
  notes: [
    'At least one of PP Date, PCD, PSD and PED must be filled in — those four dates are what make the sheet a plan rather than a style list.',
    'One row per style per line. A style listed twice for the same line is a correction: the last row is kept.',
    'One sheet for every line, or one sheet per line named "LINE 01", "LINE 02" — both are read.'
  ],
  build: () => [{
    name: 'Loading plan',
    widths: [7, 10, 13, 13, 22, 11, 12, 12, 12, 12, 14, 24],
    rows: [
      ['LOADING PLAN'],
      ['One row for each style waiting on a line, in the order it will run. The yellow rows are examples — type over them or delete them. Status has a dropdown.'],
      ['Line', 'Sequence', 'Style No', 'Order No', 'School Name', 'Order Qty',
        'PP Date', 'PCD', 'PSD', 'PED', 'Status', 'Remarks'],
      // What each of the four lines runs next, and a second style queued behind
      // the first, which is what the Sequence column is for.
      ...LINES.map((line) => {
        const it = LINE_SAMPLE[line]!;
        const status = line === 1 ? 'In progress' : 'Upcoming';
        const offset = line * 3;
        return [line, 1, it.style, it.order, it.buyer, [6400, 3800, 5200, 4600][line - 1]!,
          day(offset - 6), day(offset - 2), day(offset + 1), day(offset + 17), status, ''];
      }),
      [1, 2, 'AU-4508', 'PO-10262', 'St Anthony College', 2900,
        day(12), day(15), day(18), day(31), 'Upcoming', 'Runs after AU-4471'],
      ...blankRows(24)
    ],
    style: {
      width: 12,
      title: [0, 1],
      headers: [2],
      data: [3, 31],
      examples: rangeOf(3, LINES.length + 1),
      dates: [6, 7, 8, 9],
      integers: [0, 1, 5],
      required: [0, 2],
      choices: { 10: ['Upcoming', 'In progress', 'Hold', 'Completed'] },
      filter: true
    }
  }]
};

// ---------------------------------------------------------------------------

export const TEMPLATES: UploadTemplate[] = [
  production,
  qualityLineKpi, qualityDaily, qualityMonthly, qualityFinalInspection, qualitySeconds,
  rejection,
  hrAttendance,
  loadingPlan
];

export const MODULE_ORDER: TemplateModule[] = [
  'Production', 'Quality management', 'Rejection', 'HR and manpower', 'Planning'
];

/** What each module's workbooks have in common, shown above its group. */
export const MODULE_NOTE: Record<TemplateModule, string> = {
  'Production': 'The daily output sheet every other production figure is built from.',
  'Quality management': 'Five separate reports, each with its own layout. Upload whichever ones the QA team keeps.',
  'Rejection': 'Kept apart from production on purpose: a reject count must never be read as an output.',
  'HR and manpower': 'Attendance, from which absenteeism and the manpower trends are derived.',
  'Planning': 'What each line runs next, and the milestone dates it is measured against.'
};

export const templateById = (id: TemplateId): UploadTemplate | undefined =>
  TEMPLATES.find((t) => t.id === id);

export const templatesOf = (module: TemplateModule): UploadTemplate[] =>
  TEMPLATES.filter((t) => t.module === module);

export const REQUIREMENT_LABEL: Record<Requirement, string> = {
  required: 'Required',
  recommended: 'Recommended',
  optional: 'Optional'
};
