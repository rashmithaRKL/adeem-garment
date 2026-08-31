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
 */
import { GUIDE_SHEET } from './guideSheet';

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

export interface TemplateSheet {
  name: string;
  rows: unknown[][];
  /** Column widths, so the file is readable the moment it opens. */
  widths?: number[];
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
  /** The data sheets. The guide sheet is appended by the download itself. */
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

const monthName = (offset: number): string => month(offset).split(' ')[0]!;

const thisYear = (): number => new Date().getFullYear();

/** Pads a banded header row out to a fixed width so the grid stays rectangular. */
const bandRow = (width: number, cells: Record<number, unknown>): unknown[] =>
  Array.from({ length: width }, (_, i) => cells[i] ?? '');

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
      ['Date', 'Line', 'Order No', 'Buyer', 'Style No', 'Product', 'Colour', 'Size',
        'Order Qty', 'Target Qty', 'Produced Qty', 'Efficiency %', 'Delivery Date', 'Remarks'],
      [day(-2), 1, 'PO-10233', 'St Anthony College', 'AU-4471', 'Shirt', 'White', '28-40',
        6400, 900, 872, 82.4, day(21), ''],
      [day(-2), 2, 'PO-10241', 'Royal Institute', 'AU-4482', 'Trouser', 'Navy', '26-38',
        3800, 700, 654, 78.1, day(26), 'One machine down until noon'],
      [day(-1), 1, 'PO-10233', 'St Anthony College', 'AU-4471', 'Shirt', 'White', '28-40',
        6400, 900, 918, 86.9, day(21), ''],
      [day(-1), 2, 'PO-10241', 'Royal Institute', 'AU-4482', 'Trouser', 'Navy', '26-38',
        3800, 700, 705, 83.5, day(26), '']
    ]
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
    'One sheet per line, named LINE 01, LINE 02, LINE 03 … Copy a sheet and rename it to add a line.',
    'A stage the line did not run that day is left blank. A zero is read as blank, so it never draws a 0% point on the charts.',
    'A sheet for a line that has not been inspected yet still registers the line, so it appears on the Quality screens.'
  ],
  build: () => {
    const width = 16;
    const banner = bandRow(width, { 1: 'IN LINE', 4: 'END LINE', 7: 'APPEARANCE', 10: 'FINAL', 13: 'AQL' });
    const sub = ['DATE', ...Array.from({ length: 5 }, () => ['CHECKED', 'PASS', 'FAIL']).flat()];
    const widths = [12, ...Array.from({ length: 15 }, () => 10)];
    return [
      {
        name: 'LINE 01',
        widths,
        rows: [banner, sub,
          [day(-2), 320, 314, 6, 320, 316, 4, 300, 293, 7, 280, 277, 3, 2, 2, 0],
          [day(-1), 340, 333, 7, 340, 337, 3, 320, 314, 6, 300, 298, 2, 2, 2, 0]]
      },
      {
        name: 'LINE 02',
        widths,
        rows: [banner, sub,
          [day(-2), 280, 271, 9, 280, 274, 6, 260, 252, 8, 240, 236, 4, 1, 1, 0],
          [day(-1), 290, 284, 6, 290, 285, 5, 270, 265, 5, 250, 247, 3, 1, 1, 0]]
      }
    ];
  }
};

/** The four columns every stage block carries on the daily and monthly reports. */
const STAGE_BLOCK = ['CHECK QTY', 'DEFECT QTY', 'DEFECT %', 'PASS %'];

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
      meaning: 'The report date, typed in the title block above the table. Every row is filed under it.' },
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
        [1, 'AU-4471', 320, 6, 1.88, 98.13, 320, 4, 1.25, 98.75, 300, 7, 2.33, 97.67,
          280, 3, 1.07, 98.93, 2, 2, 0, 100],
        [2, 'AU-4482', 280, 9, 3.21, 96.79, 280, 6, 2.14, 97.86, 260, 8, 3.08, 96.92,
          240, 4, 1.67, 98.33, 1, 1, 0, 100],
        ['FACTORY', '', 600, 15, 2.5, 97.5, 600, 10, 1.67, 98.33, 560, 15, 2.68, 97.32,
          520, 7, 1.35, 98.65, 3, 3, 0, 100],
        [],
        ['Appearance Defect Summary'],
        ['Line', 'Check Qty', 'Uncut Threads', 'Oil Marks', 'Shade Variation', 'Measurement', 'Stain'],
        [1, 300, 3, 1, 0, 2, 1],
        [2, 260, 4, 1, 1, 1, 1],
        ['FACTORY', 560, 7, 2, 1, 3, 2]
      ]
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
    'One sheet per month. Copy the sheet, change the "Month :-" line and fill in the figures.',
    'The appearance defect block below the table is read the same way as on the daily report.',
    'Rows are totals for the month, not for a day, and are never mixed with daily figures on screen.'
  ],
  build: () => {
    const width = 23;
    const banner = bandRow(width, { 1: 'IN LINE', 5: 'END LINE', 9: 'APPEARANCE', 13: 'FINAL', 17: 'AQL' });
    const sub = ['TEAM NO',
      ...STAGE_BLOCK, ...STAGE_BLOCK, ...STAGE_BLOCK, ...STAGE_BLOCK,
      'TOTAL NO OF AUDITS', '% OF AUDIT PASS', '% OF AUDIT FAIL', 'AQL PASS %', 'AQL FAIL %'];
    return [{
      name: month(0),
      widths: [10, ...Array.from({ length: 22 }, () => 11)],
      rows: [
        ['MONTHLY QUALITY PERFORMANCE REPORT'],
        [`Month :- ${month(0).toUpperCase()}`],
        banner, sub,
        [1, 7200, 138, 1.92, 98.08, 7200, 96, 1.33, 98.67, 6800, 151, 2.22, 97.78,
          6400, 71, 1.11, 98.89, 42, 40, 2, 95.24, 4.76],
        [2, 6300, 168, 2.67, 97.33, 6300, 121, 1.92, 98.08, 5900, 174, 2.95, 97.05,
          5600, 83, 1.48, 98.52, 38, 35, 3, 92.11, 7.89],
        ['FACTORY', 13500, 306, 2.27, 97.73, 13500, 217, 1.61, 98.39, 12700, 325, 2.56, 97.44,
          12000, 154, 1.28, 98.72, 80, 75, 5, 93.75, 6.25],
        [],
        ['Appearance Defect Summary'],
        ['Line', 'Check Qty', 'Uncut Threads', 'Oil Marks', 'Shade Variation', 'Measurement', 'Stain'],
        [1, 6800, 64, 21, 9, 44, 13],
        [2, 5900, 78, 26, 14, 41, 15],
        ['FACTORY', 12700, 142, 47, 23, 85, 28]
      ]
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
      meaning: 'The month the row covers. The year comes from the file name when the sheet does not carry one.' },
    { header: 'Sample Inspected', requirement: 'required', format: 'Whole number',
      meaning: 'Pieces sampled at final inspection that month.' },
    { header: 'Deffects', requirement: 'recommended', format: 'Whole number',
      meaning: 'Defective pieces found in the sample. Spelled as the sheet spells it; "Defects" is read too.',
      alsoAccepted: ['Defects'] },
    { header: 'Qty Shipped', requirement: 'optional', format: 'Whole number',
      meaning: 'Pieces shipped that month.' },
    { header: '1st time Pass Rate', requirement: 'recommended', format: 'Number or percentage',
      meaning: 'Share of inspections that passed at the first attempt. Kept as typed, never derived from the piece counts.' },
    { header: 'Defect categories', requirement: 'optional', format: 'One column each, whole numbers',
      meaning: 'Every column after the pass rate is read as a defect category: Fabric, Sewing, Washing, Packing, and any other you add.' }
  ],
  notes: [
    'Column order matters here: Month, Sample Inspected, Deffects, Qty Shipped, 1st time Pass Rate, and then the defect categories.',
    'Those categories are tagged as final-inspection defects on import, so they are never mixed with sewing-floor defects on the charts.',
    'A month that is still all zeroes is skipped rather than charted as a collapse to 0%.',
    'A row whose Month cell reads "Total" ends the sheet.'
  ],
  build: () => [{
    name: 'Summary',
    widths: [12, 16, 10, 12, 17, 10, 10, 10, 10, 13],
    rows: [
      ['Month', 'Sample Inspected', 'Deffects', 'Qty Shipped', '1st time Pass Rate',
        'Fabric', 'Sewing', 'Washing', 'Packing', 'Measurement'],
      [monthName(-2), 1250, 18, 42000, 93.75, 4, 7, 2, 3, 2],
      [monthName(-1), 1180, 12, 39600, 95.83, 2, 5, 1, 2, 2],
      [monthName(0), 960, 9, 31400, 96.15, 1, 4, 1, 2, 1]
    ]
  }]
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
      meaning: 'The month the counts belong to. A sheet named for a year dates the rows the month names cannot.' },
    { header: 'Defect categories', requirement: 'required', format: 'One column each, whole numbers',
      meaning: 'Every column after Month is a category, read by its heading. Add or rename them freely — a Total column is ignored.' }
  ],
  notes: [
    'A zero or an empty cell records nothing at all, so a half-filled year is safe to upload.',
    'Name the sheet for its year ("Seconds 2026") when the month names alone do not say which year they are.',
    'One sheet per year; extra sheets in the same file are read as well.'
  ],
  build: () => [{
    name: `Seconds ${thisYear()}`,
    widths: [12, 12, 12, 16, 12, 14, 12, 10],
    rows: [
      [`MONTHLY SECOND SUMMARY ${thisYear()}`],
      ['Month', 'Fabric', 'Sewing', 'Shade Variation', 'Oil Marks', 'Measurement', 'Washing', 'Total'],
      [monthName(-2), 12, 34, 8, 6, 11, 3, 74],
      [monthName(-1), 9, 28, 5, 4, 9, 2, 57],
      [monthName(0), 7, 21, 6, 3, 8, 1, 46]
    ]
  }]
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
    widths: [12, 8, 12, 12, 12],
    rows: [
      ['DATE', 'LINE', 'STYLE NO', 'ORDER QTY', 'REJECT QTY'],
      [day(-2), 1, 'AU-4471', 900, 6],
      [day(-2), 2, 'AU-4482', 700, 11],
      [day(-1), 1, 'AU-4471', 900, 4],
      [day(-1), 2, 'AU-4482', 700, 8]
    ]
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
    widths: [12, 14, 14, 15, 10, 10, 10, 24],
    rows: [
      ['Date', 'Department', 'Direct Carder', 'Indirect Carder', 'Present', 'Absent', 'On Leave', 'Remarks'],
      [day(-2), 'Sewing', 180, 24, 192, 9, 3, ''],
      [day(-2), 'Cutting', 42, 8, 47, 2, 1, ''],
      [day(-1), 'Sewing', 180, 24, 188, 12, 4, 'Two machines down'],
      [day(-1), 'Cutting', 42, 8, 46, 3, 1, '']
    ]
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
      meaning: 'Where the style has got to. Words like "running", "done" or "postponed" are understood.',
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
    widths: [7, 10, 12, 12, 20, 11, 12, 12, 12, 12, 13, 22],
    rows: [
      ['Line', 'Sequence', 'Style No', 'Order No', 'School Name', 'Order Qty',
        'PP Date', 'PCD', 'PSD', 'PED', 'Status', 'Remarks'],
      [1, 1, 'AU-4471', 'PO-10233', 'St Anthony College', 6400,
        day(3), day(6), day(9), day(24), 'Upcoming', ''],
      [1, 2, 'AU-4482', 'PO-10241', 'Royal Institute', 3800,
        day(12), day(15), day(18), day(31), 'Upcoming', ''],
      [2, 1, 'AU-4390', 'PO-10199', 'Holy Family Convent', 5200,
        day(-6), day(-2), day(1), day(17), 'In progress', '']
    ]
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

/**
 * The sheet that explains the workbook to whoever has to fill it in, built from
 * the same column list the Upload screen renders. Appended to every template, and
 * skipped by every importer — see guideSheet.ts.
 */
export function guideSheetFor(template: UploadTemplate): TemplateSheet {
  const rows: unknown[][] = [
    [template.title],
    [template.purpose],
    [],
    ['Where it lands', template.landsIn],
    ['How often', template.cadence],
    ['Recognised by', template.recognisedBy],
    [],
    ['Column', 'Required?', 'Format', 'What it means', 'Other headings accepted']
  ];
  for (const column of template.columns) {
    rows.push([
      column.header,
      REQUIREMENT_LABEL[column.requirement],
      column.format,
      column.meaning,
      column.alsoAccepted?.join(', ') ?? ''
    ]);
  }
  rows.push([], ['Good to know']);
  for (const note of template.notes) rows.push([note]);
  rows.push([], ['This sheet is documentation and is never imported. Fill in the other sheet.']);

  return { name: GUIDE_SHEET, rows, widths: [26, 14, 30, 62, 40] };
}
