export type CrudAction = "view" | "create" | "update" | "delete" | "export" | "sync" | "restore" | "submit";

export type TrackingEntity =
  | "companies"
  | "branches"
  | "users"
  | "sales"
  | "inventory"
  | "categories"
  | "customers"
  | "suppliers"
  | "purchases"
  | "expenses"
  | "cashbook"
  | "cashParties"
  | "customerPayments"
  | "purchasePayments"
  | "notifications"
  | "scales"
  | "scaleLogs"
  | "spreadsheets"
  | "shifts"
  | "reports"
  | "audit"
  | "backup"
  | "zatca";

export type Permission = `${TrackingEntity}.${CrudAction}`;

export type Role = "owner" | "admin" | "manager" | "cashier" | "accountant" | "inventory";

export interface TrackingPrincipal {
  id: string;
  name: string;
  role: Role;
  companyIds: string[];
  branchIds: string[];
  permissions: Permission[];
}

export interface UserRecord extends BaseRecord {
  username: string;
  name: string;
  role: Role;
  companyIds: string[];
  branchIds: string[];
  permissions: Permission[];
  status: "active" | "inactive";
  passwordHash?: string;
  passwordSalt?: string;
  passwordUpdatedAt?: string;
}

export interface AuthTokenRecord {
  id: string;
  userId: string;
  name: string;
  tokenHash: string;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
  lastUsedAt?: string;
}

export interface Scope {
  companyId: string;
  branchId?: string;
}

export interface BaseRecord {
  id: string;
  companyId: string;
  branchId?: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface CompanyRecord extends BaseRecord {
  name: string;
  legalName?: string;
  vatNumber?: string;
  status: "active" | "inactive";
}

export interface BranchRecord extends BaseRecord {
  name: string;
  location?: string;
  isMaster?: boolean;
  status: "active" | "inactive";
}

export interface MoneyRecord extends BaseRecord {
  amount: number;
  date: string;
}

export interface SaleRecord extends BaseRecord {
  invoiceNumber: string;
  customerId?: string;
  customerName: string;
  grandTotal: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: "paid" | "pending" | "partial" | "overdue";
  status?: string;
  createdAt: string;
}

export interface InventoryRecord extends BaseRecord {
  name: string;
  barcode?: string;
  stock: number;
  minStock?: number;
  salePrice: number;
  purchasePrice: number;
}

export interface CustomerRecord extends BaseRecord {
  name: string;
  phone?: string;
  balance?: number;
  totalSpent?: number;
}

export interface SupplierRecord extends BaseRecord {
  name: string;
  phone?: string;
  balance?: number;
}

export interface PurchaseRecord extends BaseRecord {
  orderNumber: string;
  supplierId?: string;
  supplierName: string;
  totalAmount: number;
  paidAmount?: number;
  status: string;
  type: "bill" | "order" | "return";
  date: string;
}

export interface ExpenseRecord extends MoneyRecord {
  category: string;
  description: string;
}

export interface CashbookRecord extends MoneyRecord {
  type: "in" | "out";
  category: string;
  partyId?: string;
  description?: string;
}

export interface AuditEntry {
  id: string;
  actorId: string;
  actorName: string;
  companyId: string;
  branchId?: string;
  entity: TrackingEntity;
  recordId?: string;
  action: CrudAction;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface SyncPushPayload {
  deviceId: string;
  batchId: string;
  scope: Scope;
  changes: Partial<Record<TrackingEntity, BaseRecord[]>>;
}

export interface SyncPushResult {
  batchId: string;
  accepted: number;
  rejected: number;
  auditIds: string[];
  serverTime: string;
  replayed?: boolean;
}
