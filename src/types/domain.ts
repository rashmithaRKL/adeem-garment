/**
 * Ranked, most powerful first. A manager runs the factory — every management
 * screen and the writes behind them — while an admin additionally holds the
 * three things that are not delegated: accounts, roles and the audit trail.
 */
export type UserRole = 'admin' | 'manager' | 'employee';

/** Everyone who works on the management side, as opposed to the floor. */
export const MANAGEMENT_ROLES: UserRole[] = ['admin', 'manager'];

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Admin',
  manager: 'Manager',
  employee: 'Employee'
};
export type UserStatus = 'active' | 'disabled';
export type LineStatus = 'running' | 'behind' | 'changeover' | 'idle';
export type ProcessingState = 'pending' | 'scanning' | 'imported' | 'warnings' | 'failed';

export interface Profile {
  id: string;
  authUserId: string;
  fullName: string;
  employeeId: string;
  email: string;
  role: UserRole;
  status: UserStatus;
}

export interface LinePerformance {
  id: string;
  lineNumber: number;
  lineName: string;
  department: string | null;
  status: LineStatus;
  target: number;
  actual: number;
  balance: number;
  efficiency: number;
  progress: number;
  currentOrder: string | null;
  buyer: string | null;
  styleNumber: string | null;
  deliveryDate: string | null;
}

export interface DashboardKpis {
  todayTarget: number;
  todayActual: number;
  achievement: number;
  avgEfficiency: number;
  activeOrders: number;
  completedOrders: number;
  pendingOrders: number;
  orderedQuantity: number;
  producedQuantity: number;
  remainingQuantity: number;
  onTime: number;
  upcoming: number;
  delayed: number;
  completed: number;
}

/** One validated row on its way into production_records. */
export interface ImportRow {
  rowNumber: number;
  lineNumber: number;
  orderNumber: string;
  productionDate: string;
  targetQuantity: number;
  actualQuantity: number;
  efficiency: number | null;
  /**
   * Order attributes carried alongside the production figures. A sheet often
   * names an order the database has never seen; these let the importer create
   * it instead of dropping the row's link to it.
   */
  order: ImportOrderFields;
  raw: Record<string, unknown>;
}

export interface ImportOrderFields {
  buyer: string | null;
  styleNumber: string | null;
  productName: string | null;
  color: string | null;
  size: string | null;
  orderQuantity: number | null;
  deliveryDate: string | null;
}

export interface RowIssue {
  rowNumber: number;
  column: string;
  message: string;
}

export interface ScanResult {
  fileName: string;
  fileSize: number;
  fileHash: string;
  sheetCount: number;
  rowCount: number;
  columnCount: number;
  mappings: ColumnMapping[];
  rows: ImportRow[];
  warnings: RowIssue[];
  errors: (RowIssue & { type: string })[];
}

export interface ColumnMapping {
  excelHeader: string;
  field: MappableField | null;
  confidence: 'high' | 'low' | 'unmapped';
}

export type MappableField =
  | 'lineNumber' | 'orderNumber' | 'buyer' | 'styleNumber' | 'productName'
  | 'color' | 'size' | 'orderQuantity' | 'targetQuantity' | 'actualQuantity'
  | 'efficiency' | 'productionDate' | 'deliveryDate' | 'remarks';
