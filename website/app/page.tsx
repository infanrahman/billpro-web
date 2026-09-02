"use client";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Boxes,
  Building2,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Cloud,
  Database,
  Factory,
  FileClock,
  Landmark,
  LockKeyhole,
  Upload,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Store,
  UsersRound,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type OverviewRecord = {
  id: string;
  title: string;
  amount: number;
  branchId?: string;
  updatedAt: string;
};

type EntityCard = {
  entity: string;
  count: number;
  latest: OverviewRecord[];
};

type CompanyRecord = {
  id: string;
  name: string;
  legalName?: string;
  vatNumber?: string;
  status?: string;
};

type BranchRecord = {
  id: string;
  name: string;
  location?: string;
  isMaster?: boolean;
  status?: string;
};

type AuditEntry = {
  id: string;
  actorName: string;
  entity: string;
  action: string;
  timestamp: string;
  recordId?: string;
};

type Overview = {
  principal: {
    id: string;
    name: string;
    role: string;
    permissions: string[];
  };
  scope: {
    companyId: string;
    branchId?: string;
  };
  companies: CompanyRecord[];
  branches: BranchRecord[];
  users: UserRecord[];
  masterData: {
    inventory: InventoryRecord[];
    customers: CustomerRecord[];
    suppliers: SupplierRecord[];
  };
  transactions: {
    sales: TransactionRecord[];
    purchases: TransactionRecord[];
    expenses: TransactionRecord[];
    cashbook: TransactionRecord[];
    customerPayments: TransactionRecord[];
    purchasePayments: TransactionRecord[];
  };
  permissionCatalog: {
    roles: Record<string, string[]>;
    permissions: string[];
  };
  totals: {
    sales: number;
    paid: number;
    outstanding: number;
    purchases: number;
    expenses: number;
    lowStock: number;
  };
  branchHealth: BranchHealthRecord[];
  entities: EntityCard[];
  audit: AuditEntry[];
  generatedAt: string;
};

type CompanyForm = {
  id?: string;
  name: string;
  legalName: string;
  vatNumber: string;
  status: "active" | "inactive";
};

type BranchForm = {
  id?: string;
  name: string;
  location: string;
  status: "active" | "inactive";
  isMaster: boolean;
};

type UserRecord = {
  id: string;
  username: string;
  name: string;
  role: string;
  companyIds: string[];
  branchIds: string[];
  permissions: string[];
  status: "active" | "inactive";
  companyId: string;
  branchId?: string;
};

type UserForm = {
  id?: string;
  username: string;
  name: string;
  role: string;
  companyIds: string[];
  branchIds: string[];
  permissions: string[];
  status: "active" | "inactive";
  password: string;
};

type AuthToken = {
  id: string;
  name: string;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
  lastUsedAt?: string;
};

type InventoryRecord = {
  id: string;
  companyId: string;
  branchId?: string;
  name: string;
  barcode?: string;
  stock: number;
  minStock?: number;
  salePrice: number;
  purchasePrice: number;
};

type CustomerRecord = {
  id: string;
  companyId: string;
  branchId?: string;
  name: string;
  phone?: string;
  balance?: number;
  totalSpent?: number;
};

type SupplierRecord = {
  id: string;
  companyId: string;
  branchId?: string;
  name: string;
  phone?: string;
  balance?: number;
};

type InventoryForm = {
  id?: string;
  name: string;
  barcode: string;
  stock: string;
  minStock: string;
  salePrice: string;
  purchasePrice: string;
};

type PartyForm = {
  id?: string;
  name: string;
  phone: string;
  balance: string;
  totalSpent?: string;
};

type TransactionEntity = "sales" | "purchases" | "expenses" | "cashbook" | "customerPayments" | "purchasePayments";

type TransactionRecord = {
  id: string;
  companyId: string;
  branchId?: string;
  invoiceNumber?: string;
  orderNumber?: string;
  customerName?: string;
  supplierName?: string;
  grandTotal?: number;
  totalAmount?: number;
  paidAmount?: number;
  remainingAmount?: number;
  paymentStatus?: string;
  status?: string;
  type?: string;
  category?: string;
  description?: string;
  amount?: number;
  date?: string;
  createdAt?: string;
  paymentMode?: string;
  reference?: string;
  note?: string;
  updatedAt: string;
};

type TransactionForm = {
  id?: string;
  primary: string;
  party: string;
  amount: string;
  paidAmount: string;
  remainingAmount: string;
  status: string;
  type: string;
  date: string;
  category: string;
  description: string;
};

type BranchHealthRecord = {
  branchId: string;
  branchName: string;
  revenue: number;
  paid: number;
  outstanding: number;
  purchases: number;
  expenses: number;
  estimatedCashProfit: number;
  lowStock: number;
  transactionCount: number;
};

const defaultCompanyId = "11111111-1111-1111-1111-111111111111";

const entityIcons: Record<string, LucideIcon> = {
  sales: ShoppingCart,
  inventory: Boxes,
  categories: ClipboardList,
  customers: UsersRound,
  suppliers: Factory,
  purchases: Landmark,
  expenses: CircleDollarSign,
  cashbook: WalletCards,
  cashParties: UsersRound,
  customerPayments: CircleDollarSign,
  purchasePayments: Landmark,
  notifications: AlertTriangle,
  scales: Settings2,
  scaleLogs: FileClock,
  spreadsheets: Database,
  shifts: Activity,
};

const entityLabels: Record<string, string> = {
  sales: "Sales",
  inventory: "Inventory",
  categories: "Categories",
  customers: "Customers",
  suppliers: "Suppliers",
  purchases: "Purchases",
  expenses: "Expenses",
  cashbook: "Cash Book",
  cashParties: "Cash Parties",
  customerPayments: "Customer Payments",
  purchasePayments: "Purchase Payments",
  notifications: "Notifications",
  scales: "Scales",
  scaleLogs: "Scale Logs",
  spreadsheets: "Spreadsheets",
  shifts: "Shifts",
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 0,
  }).format(value || 0);

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

const emptyCompanyForm: CompanyForm = {
  name: "",
  legalName: "",
  vatNumber: "",
  status: "active",
};

const emptyBranchForm: BranchForm = {
  name: "",
  location: "",
  status: "active",
  isMaster: false,
};

const emptyUserForm: UserForm = {
  username: "",
  name: "",
  role: "cashier",
  companyIds: [defaultCompanyId],
  branchIds: [],
  permissions: [],
  status: "active",
  password: "",
};

const emptyInventoryForm: InventoryForm = {
  name: "",
  barcode: "",
  stock: "0",
  minStock: "0",
  salePrice: "0",
  purchasePrice: "0",
};

const emptyPartyForm: PartyForm = {
  name: "",
  phone: "",
  balance: "0",
  totalSpent: "0",
};

const emptyTransactionForm: TransactionForm = {
  primary: "",
  party: "",
  amount: "0",
  paidAmount: "0",
  remainingAmount: "0",
  status: "pending",
  type: "bill",
  date: new Date().toISOString().slice(0, 10),
  category: "General",
  description: "",
};

const csvValue = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const downloadCsv = (filename: string, rows: Array<Record<string, unknown>>) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((header) => csvValue(row[header])).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export default function TrackingDashboard() {
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [authToken, setAuthToken] = useState("");
  const [loginForm, setLoginForm] = useState({ username: "owner", password: "owner123" });
  const [authLoading, setAuthLoading] = useState(false);
  const [tokens, setTokens] = useState<AuthToken[]>([]);
  const [newTokenName, setNewTokenName] = useState("Desktop sync token");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [companyId, setCompanyId] = useState(defaultCompanyId);
  const [branchId, setBranchId] = useState("");
  const [query, setQuery] = useState("");
  const [activeEntity, setActiveEntity] = useState("all");
  const [activeMasterData, setActiveMasterData] = useState<"inventory" | "customers" | "suppliers">("inventory");
  const [activeTransaction, setActiveTransaction] = useState<TransactionEntity>("sales");
  const [auditEntityFilter, setAuditEntityFilter] = useState("all");
  const [auditActionFilter, setAuditActionFilter] = useState("all");
  const [auditUserFilter, setAuditUserFilter] = useState("");
  const [auditDateFilter, setAuditDateFilter] = useState("");
  const [companyForm, setCompanyForm] = useState<CompanyForm>(emptyCompanyForm);
  const [branchForm, setBranchForm] = useState<BranchForm>(emptyBranchForm);
  const [userForm, setUserForm] = useState<UserForm>(emptyUserForm);
  const [inventoryForm, setInventoryForm] = useState<InventoryForm>(emptyInventoryForm);
  const [customerForm, setCustomerForm] = useState<PartyForm>(emptyPartyForm);
  const [supplierForm, setSupplierForm] = useState<PartyForm>(emptyPartyForm);
  const [transactionForm, setTransactionForm] = useState<TransactionForm>(emptyTransactionForm);
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingBranch, setSavingBranch] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [savingMasterData, setSavingMasterData] = useState(false);
  const [savingTransaction, setSavingTransaction] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const hasPermission = (permission: string) =>
    overview?.principal.role === "owner" || Boolean(overview?.principal.permissions.includes(permission));

  const loadOverview = async () => {
    if (!authToken) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ companyId });
      if (branchId) params.set("branchId", branchId);
      const response = await fetch(`/api/tracking/overview?${params.toString()}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!response.ok) throw new Error(await response.text());
      setOverview(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load tracking dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const savedToken = localStorage.getItem("billingTrackingToken") || "";
    setAuthToken(savedToken);
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [authToken, companyId, branchId]);

  useEffect(() => {
    void loadTokens();
  }, [authToken]);

  const apiRequest = async (url: string, init: RequestInit = {}) => {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${authToken}`,
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  };

  const loginToDashboard = async () => {
    try {
      setAuthLoading(true);
      setError("");
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(loginForm),
      });
      if (!response.ok) throw new Error("Invalid username or password");
      const result = await response.json();
      localStorage.setItem("billingTrackingToken", result.token);
      setAuthToken(result.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = async () => {
    if (authToken) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      }).catch(() => null);
    }
    localStorage.removeItem("billingTrackingToken");
    setAuthToken("");
    setOverview(null);
  };

  const loadTokens = async () => {
    if (!authToken) return;
    const result = await apiRequest("/api/tracking/tokens");
    setTokens(result.tokens || []);
  };

  const createToken = async () => {
    const result = await apiRequest("/api/tracking/tokens", {
      method: "POST",
      body: JSON.stringify({ name: newTokenName, daysValid: 90 }),
    });
    setNewTokenName(result.token);
    await loadTokens();
  };

  const revokeToken = async (tokenId: string) => {
    await apiRequest(`/api/tracking/tokens?id=${encodeURIComponent(tokenId)}`, { method: "DELETE" });
    await loadTokens();
  };

  const exportWebBackup = async () => {
    try {
      setBackupLoading(true);
      setError("");
      const response = await fetch("/api/tracking/backup", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `billing-pro-web-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to export web backup");
    } finally {
      setBackupLoading(false);
    }
  };

  const restoreWebBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      setBackupLoading(true);
      setError("");
      const backup = JSON.parse(await file.text());
      await apiRequest("/api/tracking/backup", {
        method: "POST",
        body: JSON.stringify(backup),
      });
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to restore web backup");
    } finally {
      setBackupLoading(false);
      if (restoreInputRef.current) restoreInputRef.current.value = "";
    }
  };

  const saveCompany = async () => {
    try {
      setSavingCompany(true);
      setError("");
      await apiRequest("/api/tracking/companies", {
        method: companyForm.id ? "PUT" : "POST",
        body: JSON.stringify(companyForm),
      });
      setCompanyForm(emptyCompanyForm);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save company");
    } finally {
      setSavingCompany(false);
    }
  };

  const saveBranch = async () => {
    try {
      setSavingBranch(true);
      setError("");
      await apiRequest("/api/tracking/branches", {
        method: branchForm.id ? "PUT" : "POST",
        body: JSON.stringify({ ...branchForm, companyId }),
      });
      setBranchForm(emptyBranchForm);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save branch");
    } finally {
      setSavingBranch(false);
    }
  };

  const toggleUserCompany = (id: string) => {
    setUserForm((current) => {
      const companyIds = current.companyIds.includes(id)
        ? current.companyIds.filter((item) => item !== id)
        : [...current.companyIds, id];
      return { ...current, companyIds };
    });
  };

  const toggleUserBranch = (id: string) => {
    setUserForm((current) => {
      const branchIds = current.branchIds.includes(id)
        ? current.branchIds.filter((item) => item !== id)
        : [...current.branchIds, id];
      return { ...current, branchIds };
    });
  };

  const toggleUserPermission = (permission: string) => {
    setUserForm((current) => {
      const permissions = current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : [...current.permissions, permission];
      return { ...current, permissions };
    });
  };

  const applyRolePreset = (role: string) => {
    setUserForm((current) => ({
      ...current,
      role,
      permissions: overview?.permissionCatalog.roles[role] || [],
    }));
  };

  const saveUser = async () => {
    try {
      setSavingUser(true);
      setError("");
      await apiRequest("/api/tracking/users", {
        method: userForm.id ? "PUT" : "POST",
        body: JSON.stringify(userForm),
      });
      setUserForm({ ...emptyUserForm, companyIds: [companyId], branchIds: branchId ? [branchId] : [] });
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save user");
    } finally {
      setSavingUser(false);
    }
  };

  const scopedPayload = <T extends Record<string, unknown>>(payload: T) => ({
    ...payload,
    companyId,
    branchId: branchId || undefined,
  });

  const saveInventory = async () => {
    try {
      setSavingMasterData(true);
      setError("");
      await apiRequest("/api/tracking/inventory", {
        method: inventoryForm.id ? "PUT" : "POST",
        body: JSON.stringify(scopedPayload({
          ...inventoryForm,
          stock: Number(inventoryForm.stock),
          minStock: Number(inventoryForm.minStock),
          salePrice: Number(inventoryForm.salePrice),
          purchasePrice: Number(inventoryForm.purchasePrice),
        })),
      });
      setInventoryForm(emptyInventoryForm);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save inventory item");
    } finally {
      setSavingMasterData(false);
    }
  };

  const saveCustomer = async () => {
    try {
      setSavingMasterData(true);
      setError("");
      await apiRequest("/api/tracking/customers", {
        method: customerForm.id ? "PUT" : "POST",
        body: JSON.stringify(scopedPayload({
          ...customerForm,
          balance: Number(customerForm.balance),
          totalSpent: Number(customerForm.totalSpent || 0),
        })),
      });
      setCustomerForm(emptyPartyForm);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save customer");
    } finally {
      setSavingMasterData(false);
    }
  };

  const saveSupplier = async () => {
    try {
      setSavingMasterData(true);
      setError("");
      await apiRequest("/api/tracking/suppliers", {
        method: supplierForm.id ? "PUT" : "POST",
        body: JSON.stringify(scopedPayload({
          ...supplierForm,
          balance: Number(supplierForm.balance),
        })),
      });
      setSupplierForm(emptyPartyForm);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save supplier");
    } finally {
      setSavingMasterData(false);
    }
  };

  const deleteCompany = async (company: CompanyRecord) => {
    try {
      setError("");
      await apiRequest(`/api/tracking/companies?id=${encodeURIComponent(company.id)}`, { method: "DELETE" });
      setCompanyId(defaultCompanyId);
      setCompanyForm(emptyCompanyForm);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete company");
    }
  };

  const deleteBranch = async (branch: BranchRecord) => {
    try {
      setError("");
      await apiRequest(
        `/api/tracking/branches?id=${encodeURIComponent(branch.id)}&companyId=${encodeURIComponent(companyId)}`,
        { method: "DELETE" },
      );
      if (branchId === branch.id) setBranchId("");
      setBranchForm(emptyBranchForm);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete branch");
    }
  };

  const deleteUser = async (user: UserRecord) => {
    try {
      setError("");
      await apiRequest(
        `/api/tracking/users?id=${encodeURIComponent(user.id)}&companyId=${encodeURIComponent(user.companyId)}&branchId=${encodeURIComponent(user.branchId || "")}`,
        { method: "DELETE" },
      );
      setUserForm(emptyUserForm);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete user");
    }
  };

  const deleteMasterRecord = async (route: string, record: { id: string; companyId: string; branchId?: string }) => {
    try {
      setError("");
      await apiRequest(
        `/api/tracking/${route}?id=${encodeURIComponent(record.id)}&companyId=${encodeURIComponent(record.companyId)}&branchId=${encodeURIComponent(record.branchId || "")}`,
        { method: "DELETE" },
      );
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Unable to delete ${route}`);
    }
  };

  const saveTransaction = async () => {
    try {
      setSavingTransaction(true);
      setError("");
      const amount = Number(transactionForm.amount);
      await apiRequest("/api/tracking/transactions", {
        method: transactionForm.id ? "PUT" : "POST",
        body: JSON.stringify(scopedPayload({
          entity: activeTransaction,
          id: transactionForm.id,
          invoiceNumber: activeTransaction === "sales" ? transactionForm.primary : undefined,
          orderNumber: activeTransaction === "purchases" ? transactionForm.primary : undefined,
          customerName: activeTransaction === "sales" ? transactionForm.party : undefined,
          supplierName: activeTransaction === "purchases" ? transactionForm.party : undefined,
          grandTotal: activeTransaction === "sales" ? amount : undefined,
          totalAmount: activeTransaction === "purchases" ? amount : undefined,
          amount,
          paidAmount: Number(transactionForm.paidAmount),
          remainingAmount: Number(transactionForm.remainingAmount),
          paymentStatus: transactionForm.status,
          status: transactionForm.status,
          type: transactionForm.type,
          date: transactionForm.date,
          createdAt: transactionForm.date,
          category: transactionForm.category,
          description: transactionForm.description || transactionForm.primary,
          reference: transactionForm.primary,
          note: transactionForm.description,
          paymentMode: transactionForm.type === "card" ? "card" : "cash",
        })),
      });
      setTransactionForm(emptyTransactionForm);
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save transaction");
    } finally {
      setSavingTransaction(false);
    }
  };

  const deleteTransaction = async (entity: TransactionEntity, record: TransactionRecord) => {
    try {
      setError("");
      await apiRequest(
        `/api/tracking/transactions?entity=${encodeURIComponent(entity)}&id=${encodeURIComponent(record.id)}&companyId=${encodeURIComponent(record.companyId)}&branchId=${encodeURIComponent(record.branchId || "")}`,
        { method: "DELETE" },
      );
      await loadOverview();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete transaction");
    }
  };

  const filteredEntities = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (overview?.entities || []).filter((item) => {
      const label = entityLabels[item.entity] || item.entity;
      const matchesEntity = activeEntity === "all" || item.entity === activeEntity;
      const matchesQuery =
        !normalizedQuery ||
        label.toLowerCase().includes(normalizedQuery) ||
        item.latest.some((record) => record.title.toLowerCase().includes(normalizedQuery));
      return matchesEntity && matchesQuery;
    });
  }, [activeEntity, overview?.entities, query]);

  const filteredAudit = useMemo(() => {
    return (overview?.audit || []).filter((entry) => {
      const matchesEntity = auditEntityFilter === "all" || entry.entity === auditEntityFilter;
      const matchesAction = auditActionFilter === "all" || entry.action === auditActionFilter;
      const matchesUser = !auditUserFilter.trim() || entry.actorName.toLowerCase().includes(auditUserFilter.trim().toLowerCase());
      const matchesDate = !auditDateFilter || entry.timestamp.slice(0, 10) === auditDateFilter;
      return matchesEntity && matchesAction && matchesUser && matchesDate;
    });
  }, [auditActionFilter, auditDateFilter, auditEntityFilter, auditUserFilter, overview?.audit]);

  const reportRows = useMemo(() => {
    const transactions = overview?.transactions;
    if (!transactions) return [];
    return [
      { module: "Sales", records: transactions.sales.length, amount: overview?.totals.sales || 0 },
      { module: "Purchases", records: transactions.purchases.length, amount: overview?.totals.purchases || 0 },
      { module: "Expenses", records: transactions.expenses.length, amount: overview?.totals.expenses || 0 },
      { module: "Cash Book", records: transactions.cashbook.length, amount: transactions.cashbook.reduce((sum, item) => sum + (item.amount || 0), 0) },
      { module: "Customer Payments", records: transactions.customerPayments.length, amount: transactions.customerPayments.reduce((sum, item) => sum + (item.amount || 0), 0) },
      { module: "Purchase Payments", records: transactions.purchasePayments.length, amount: transactions.purchasePayments.reduce((sum, item) => sum + (item.amount || 0), 0) },
      { module: "Inventory", records: overview?.masterData.inventory.length || 0, amount: overview?.masterData.inventory.reduce((sum, item) => sum + ((item.stock || 0) * (item.salePrice || 0)), 0) || 0 },
    ];
  }, [overview]);

  const totalRecords = overview?.entities.reduce((sum, entity) => sum + entity.count, 0) || 0;
  const connectedModules = overview?.entities.filter((entity) => entity.count > 0).length || 0;

  if (!authToken) {
    return (
      <main className="login-shell">
        <section className="login-panel">
          <div className="logo-tile"><LockKeyhole size={24} /></div>
          <div>
            <p className="eyebrow"><ShieldCheck size={15} /> Secure dashboard</p>
            <h1>Sign in to Billing Pro Tracking</h1>
            <p className="subtitle">Use your web tracking account. Bootstrap owner access is available for setup.</p>
          </div>
          {error && <div className="error-banner"><AlertTriangle size={18} /> {error}</div>}
          <label>
            Username
            <input value={loginForm.username} onChange={(event) => setLoginForm({ ...loginForm, username: event.target.value })} />
          </label>
          <label>
            Password
            <input type="password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} />
          </label>
          <button className="refresh-button" onClick={() => void loginToDashboard()} disabled={authLoading}>
            <LockKeyhole size={17} />
            {authLoading ? "Signing in..." : "Sign In"}
          </button>
          <small className="muted">Bootstrap: owner / owner123</small>
        </section>
      </main>
    );
  }

  return (
    <main className="tracking-shell">
      <aside className="sidebar">
        <div className="brand-mark">
          <div className="logo-tile"><Store size={22} /></div>
          <div>
            <strong>Billing Pro</strong>
            <span>Company tracking</span>
          </div>
        </div>

        <nav className="nav-stack" aria-label="Dashboard sections">
          {["Overview", "Companies", "Branches", "Users", "Master Data", "Transactions", "Entities", "Reports", "Audit", "Sync"].map((item, index) => {
            const Icon = [BarChart3, Building2, Store, UsersRound, Boxes, WalletCards, Database, BarChart3, FileClock, Cloud][index];
            return (
              <a href={`#${item.toLowerCase().replace(" ", "-")}`} key={item}>
                <Icon size={17} />
                {item}
              </a>
            );
          })}
        </nav>

        <div className="sync-card">
          <Cloud size={20} />
          <strong>Desktop sync endpoint</strong>
          <code>http://127.0.0.1:3000</code>
          <span>Create a managed token below and use it in the POS Backup tab.</span>
        </div>
        <div className="sync-card" id="sync">
          <LockKeyhole size={20} />
          <strong>Access tokens</strong>
          <input value={newTokenName} onChange={(event) => setNewTokenName(event.target.value)} placeholder="Token name" />
          <button onClick={() => void createToken()} disabled={!hasPermission("users.update") && overview?.principal.role !== "owner"}>Create Token</button>
          <button onClick={() => void loadTokens()}>Refresh Tokens</button>
          <button onClick={() => void logout()}>Sign Out</button>
          {tokens.slice(0, 3).map((item) => (
            <span className="token-row" key={item.id}>
              {item.revokedAt ? "Revoked" : "Active"} · {item.name}
              {!item.revokedAt && <button onClick={() => void revokeToken(item.id)}>Revoke</button>}
            </span>
          ))}
          {newTokenName.startsWith("bt_") && <code>{newTokenName}</code>}
        </div>
        <div className="sync-card">
          <Database size={20} />
          <strong>Web database backup</strong>
          <span>Export or restore the SQLite tracker data as a portable JSON backup.</span>
          <button onClick={() => void exportWebBackup()} disabled={backupLoading || !hasPermission("backup.create")}>
            <Cloud size={15} />
            Export Backup
          </button>
          <button onClick={() => restoreInputRef.current?.click()} disabled={backupLoading || !hasPermission("backup.restore")}>
            <Upload size={15} />
            Restore Backup
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden-file"
            onChange={(event) => void restoreWebBackup(event.target.files?.[0])}
          />
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar" id="overview">
          <div>
            <p className="eyebrow"><ShieldCheck size={15} /> Permission aware</p>
            <h1>Company and branch operations tracker</h1>
            <p className="subtitle">
              Monitor synced POS activity across companies, branches, modules, and users from one compact control surface.
            </p>
          </div>
          <button className="refresh-button" onClick={loadOverview} disabled={loading}>
            <RefreshCw size={17} className={loading ? "spin" : ""} />
            Refresh
          </button>
        </header>

        <section className="control-band">
          <label>
            Company
            <select value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
              {(overview?.companies.length ? overview.companies : [{ id: defaultCompanyId, name: "Default Company" }]).map((company) => (
                <option value={company.id} key={company.id}>{company.name}</option>
              ))}
            </select>
          </label>
          <label>
            Branch
            <select value={branchId} onChange={(event) => setBranchId(event.target.value)}>
              <option value="">All branches</option>
              {(overview?.branches || []).map((branch) => (
                <option value={branch.id} key={branch.id}>{branch.name}</option>
              ))}
            </select>
          </label>
          <label className="search-field">
            Search
            <span>
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Module or record" />
            </span>
          </label>
        </section>

        {error && <div className="error-banner"><AlertTriangle size={18} /> {error}</div>}

        <section className="metric-grid">
          <Metric icon={CircleDollarSign} label="Sales" value={formatMoney(overview?.totals.sales || 0)} />
          <Metric icon={CheckCircle2} label="Paid" value={formatMoney(overview?.totals.paid || 0)} />
          <Metric icon={WalletCards} label="Outstanding" value={formatMoney(overview?.totals.outstanding || 0)} />
          <Metric icon={Landmark} label="Purchases" value={formatMoney(overview?.totals.purchases || 0)} />
          <Metric icon={Activity} label="Expenses" value={formatMoney(overview?.totals.expenses || 0)} />
          <Metric icon={Boxes} label="Low stock" value={`${overview?.totals.lowStock || 0}`} />
        </section>

        <section className="split-layout">
          <div className="panel" id="companies">
            <div className="panel-heading">
              <div>
                <span>Companies</span>
                <h2>{overview?.companies.length || 1} company profiles</h2>
              </div>
              <Building2 size={20} />
            </div>
            <div className="list-stack">
              {(overview?.companies.length ? overview.companies : [{ id: defaultCompanyId, name: "Default Company", status: "active" }]).map((company) => (
                <div className="list-row" key={company.id}>
                  <span>
                    <strong>{company.name}</strong>
                    <small>{company.legalName || company.id}</small>
                  </span>
                  <div className="row-actions">
                    <em>{company.status || "active"}</em>
                    <button onClick={() => setCompanyId(company.id)}>Open</button>
                    <button
                      disabled={!hasPermission("companies.update")}
                      onClick={() => setCompanyForm({
                        id: company.id,
                        name: company.name,
                        legalName: company.legalName || "",
                        vatNumber: "vatNumber" in company && typeof company.vatNumber === "string" ? company.vatNumber : "",
                        status: company.status === "inactive" ? "inactive" : "active",
                      })}
                    >
                      Edit
                    </button>
                    <button className="danger-link" disabled={!hasPermission("companies.delete")} onClick={() => void deleteCompany(company)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="crud-form">
              <h3>{companyForm.id ? "Edit company" : "New company"}</h3>
              <input value={companyForm.name} onChange={(event) => setCompanyForm({ ...companyForm, name: event.target.value })} placeholder="Company name" />
              <input value={companyForm.legalName} onChange={(event) => setCompanyForm({ ...companyForm, legalName: event.target.value })} placeholder="Legal name" />
              <input value={companyForm.vatNumber} onChange={(event) => setCompanyForm({ ...companyForm, vatNumber: event.target.value })} placeholder="VAT number" />
              <select value={companyForm.status} onChange={(event) => setCompanyForm({ ...companyForm, status: event.target.value as CompanyForm["status"] })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <div className="form-actions">
                <button onClick={() => setCompanyForm(emptyCompanyForm)}>Clear</button>
                <button className="primary-action" onClick={() => void saveCompany()} disabled={savingCompany || !companyForm.name.trim() || !hasPermission(companyForm.id ? "companies.update" : "companies.create")}>
                  {savingCompany ? "Saving..." : companyForm.id ? "Update Company" : "Create Company"}
                </button>
              </div>
            </div>
          </div>

          <div className="panel" id="branches">
            <div className="panel-heading">
              <div>
                <span>Branches</span>
                <h2>{overview?.branches.length || 0} tracked branches</h2>
              </div>
              <Store size={20} />
            </div>
            <div className="list-stack">
              {(overview?.branches || []).length > 0 ? overview?.branches.map((branch) => (
                <div className="list-row" key={branch.id}>
                  <span>
                    <strong>{branch.name}</strong>
                    <small>{branch.location || (branch.isMaster ? "Master branch" : branch.id)}</small>
                  </span>
                  <div className="row-actions">
                    <em>{branch.status || "active"}</em>
                    <button onClick={() => setBranchId(branch.id)}>Open</button>
                    <button
                      disabled={!hasPermission("branches.update")}
                      onClick={() => setBranchForm({
                        id: branch.id,
                        name: branch.name,
                        location: branch.location || "",
                        status: branch.status === "inactive" ? "inactive" : "active",
                        isMaster: Boolean(branch.isMaster),
                      })}
                    >
                      Edit
                    </button>
                    <button className="danger-link" disabled={!hasPermission("branches.delete")} onClick={() => void deleteBranch(branch)}>Delete</button>
                  </div>
                </div>
              )) : <EmptyState text="No branch data has been pushed yet." />}
            </div>
            <div className="crud-form">
              <h3>{branchForm.id ? "Edit branch" : "New branch"}</h3>
              <input value={branchForm.name} onChange={(event) => setBranchForm({ ...branchForm, name: event.target.value })} placeholder="Branch name" />
              <input value={branchForm.location} onChange={(event) => setBranchForm({ ...branchForm, location: event.target.value })} placeholder="Location" />
              <select value={branchForm.status} onChange={(event) => setBranchForm({ ...branchForm, status: event.target.value as BranchForm["status"] })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              <label className="inline-check">
                <input type="checkbox" checked={branchForm.isMaster} onChange={(event) => setBranchForm({ ...branchForm, isMaster: event.target.checked })} />
                Master branch
              </label>
              <div className="form-actions">
                <button onClick={() => setBranchForm(emptyBranchForm)}>Clear</button>
                <button className="primary-action" onClick={() => void saveBranch()} disabled={savingBranch || !branchForm.name.trim() || !hasPermission(branchForm.id ? "branches.update" : "branches.create")}>
                  {savingBranch ? "Saving..." : branchForm.id ? "Update Branch" : "Create Branch"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="panel users-panel" id="users">
          <div className="panel-heading wide">
            <div>
              <span>Users & permissions</span>
              <h2>{overview?.users.length || 0} web tracking users in this scope</h2>
            </div>
            <UsersRound size={20} />
          </div>

          <div className="users-layout">
            <div className="list-stack">
              {(overview?.users || []).length > 0 ? overview?.users.map((user) => (
                <div className="list-row" key={user.id}>
                  <span>
                    <strong>{user.name}</strong>
                    <small>{user.username} · {user.role} · {user.permissions.length} permissions</small>
                  </span>
                  <div className="row-actions">
                    <em>{user.status}</em>
                    <button
                      disabled={!hasPermission("users.update")}
                      onClick={() => setUserForm({
                        id: user.id,
                        username: user.username,
                        name: user.name,
                        role: user.role,
                        companyIds: user.companyIds,
                        branchIds: user.branchIds,
                        permissions: user.permissions,
                        status: user.status,
                        password: "",
                      })}
                    >
                      Edit
                    </button>
                    <button className="danger-link" disabled={!hasPermission("users.delete")} onClick={() => void deleteUser(user)}>Delete</button>
                  </div>
                </div>
              )) : <EmptyState text="Create web users here or push desktop users from the POS app." />}
            </div>

            <div className="user-form">
              <h3>{userForm.id ? "Edit user" : "New user"}</h3>
              <div className="crud-form compact">
                <input value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} placeholder="Full name" />
                <input value={userForm.username} onChange={(event) => setUserForm({ ...userForm, username: event.target.value })} placeholder="Username" />
                <select value={userForm.role} onChange={(event) => applyRolePreset(event.target.value)}>
                  {Object.keys(overview?.permissionCatalog.roles || { cashier: [] }).map((role) => (
                    <option value={role} key={role}>{role}</option>
                  ))}
                </select>
                <select value={userForm.status} onChange={(event) => setUserForm({ ...userForm, status: event.target.value as UserForm["status"] })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
                <input type="password" value={userForm.password} onChange={(event) => setUserForm({ ...userForm, password: event.target.value })} placeholder={userForm.id ? "New password optional" : "Password"} />
              </div>

              <div className="permission-block">
                <strong>Company access</strong>
                <div className="chip-grid">
                  {(overview?.companies || []).map((company) => (
                    <label className="permission-chip" key={company.id}>
                      <input type="checkbox" checked={userForm.companyIds.includes(company.id)} onChange={() => toggleUserCompany(company.id)} />
                      {company.name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="permission-block">
                <strong>Branch access</strong>
                <div className="chip-grid">
                  {(overview?.branches || []).map((branch) => (
                    <label className="permission-chip" key={branch.id}>
                      <input type="checkbox" checked={userForm.branchIds.includes(branch.id)} onChange={() => toggleUserBranch(branch.id)} />
                      {branch.name}
                    </label>
                  ))}
                </div>
              </div>

              <div className="permission-block">
                <strong>Section permissions</strong>
                <div className="permission-grid">
                  {(overview?.permissionCatalog.permissions || []).map((permission) => (
                    <label className="permission-chip" key={permission}>
                      <input type="checkbox" checked={userForm.permissions.includes(permission)} onChange={() => toggleUserPermission(permission)} />
                      {permission}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-actions">
                <button onClick={() => setUserForm({ ...emptyUserForm, companyIds: [companyId], branchIds: branchId ? [branchId] : [] })}>Clear</button>
                <button className="primary-action" onClick={() => void saveUser()} disabled={savingUser || !userForm.name.trim() || !userForm.username.trim() || (!userForm.id && !userForm.password.trim()) || !hasPermission(userForm.id ? "users.update" : "users.create")}>
                  {savingUser ? "Saving..." : userForm.id ? "Update User" : "Create User"}
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="panel master-panel" id="master-data">
          <div className="panel-heading wide">
            <div>
              <span>Master data</span>
              <h2>Inventory, customers, and suppliers for the selected scope</h2>
            </div>
            <div className="tab-switcher">
              {(["inventory", "customers", "suppliers"] as const).map((tab) => (
                <button className={activeMasterData === tab ? "active" : ""} onClick={() => setActiveMasterData(tab)} key={tab}>
                  {entityLabels[tab]}
                </button>
              ))}
            </div>
          </div>

          {activeMasterData === "inventory" && (
            <div className="master-layout">
              <div className="data-table">
                {(overview?.masterData.inventory || []).length > 0 ? overview?.masterData.inventory.map((item) => (
                  <div className="table-row" key={item.id}>
                    <span>
                      <strong>{item.name}</strong>
                      <small>{item.barcode || item.id.slice(0, 8)}</small>
                    </span>
                    <span>{item.stock} stock</span>
                    <span>{formatMoney(item.salePrice)}</span>
                    <div className="row-actions">
                      <button disabled={!hasPermission("inventory.update")} onClick={() => setInventoryForm({
                        id: item.id,
                        name: item.name,
                        barcode: item.barcode || "",
                        stock: String(item.stock || 0),
                        minStock: String(item.minStock || 0),
                        salePrice: String(item.salePrice || 0),
                        purchasePrice: String(item.purchasePrice || 0),
                      })}>Edit</button>
                      <button className="danger-link" disabled={!hasPermission("inventory.delete")} onClick={() => void deleteMasterRecord("inventory", item)}>Delete</button>
                    </div>
                  </div>
                )) : <EmptyState text="No inventory records in this scope yet." />}
              </div>
              <div className="crud-form master-form">
                <h3>{inventoryForm.id ? "Edit item" : "New item"}</h3>
                <input value={inventoryForm.name} onChange={(event) => setInventoryForm({ ...inventoryForm, name: event.target.value })} placeholder="Item name" />
                <input value={inventoryForm.barcode} onChange={(event) => setInventoryForm({ ...inventoryForm, barcode: event.target.value })} placeholder="Barcode" />
                <input type="number" value={inventoryForm.stock} onChange={(event) => setInventoryForm({ ...inventoryForm, stock: event.target.value })} placeholder="Stock" />
                <input type="number" value={inventoryForm.minStock} onChange={(event) => setInventoryForm({ ...inventoryForm, minStock: event.target.value })} placeholder="Min stock" />
                <input type="number" value={inventoryForm.salePrice} onChange={(event) => setInventoryForm({ ...inventoryForm, salePrice: event.target.value })} placeholder="Sale price" />
                <input type="number" value={inventoryForm.purchasePrice} onChange={(event) => setInventoryForm({ ...inventoryForm, purchasePrice: event.target.value })} placeholder="Purchase price" />
                <div className="form-actions">
                  <button onClick={() => setInventoryForm(emptyInventoryForm)}>Clear</button>
                  <button className="primary-action" onClick={() => void saveInventory()} disabled={savingMasterData || !inventoryForm.name.trim() || !hasPermission(inventoryForm.id ? "inventory.update" : "inventory.create")}>
                    {savingMasterData ? "Saving..." : inventoryForm.id ? "Update Item" : "Create Item"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeMasterData === "customers" && (
            <PartyManager
              records={overview?.masterData.customers || []}
              form={customerForm}
              title={customerForm.id ? "Edit customer" : "New customer"}
              emptyText="No customer records in this scope yet."
              totalLabel="Total spent"
              saving={savingMasterData}
              onChange={setCustomerForm}
              onSave={saveCustomer}
              onClear={() => setCustomerForm(emptyPartyForm)}
              canCreate={hasPermission("customers.create")}
              canUpdate={hasPermission("customers.update")}
              canDelete={hasPermission("customers.delete")}
              onDelete={(record) => deleteMasterRecord("customers", record)}
            />
          )}

          {activeMasterData === "suppliers" && (
            <PartyManager
              records={overview?.masterData.suppliers || []}
              form={supplierForm}
              title={supplierForm.id ? "Edit supplier" : "New supplier"}
              emptyText="No supplier records in this scope yet."
              saving={savingMasterData}
              onChange={setSupplierForm}
              onSave={saveSupplier}
              onClear={() => setSupplierForm(emptyPartyForm)}
              canCreate={hasPermission("suppliers.create")}
              canUpdate={hasPermission("suppliers.update")}
              canDelete={hasPermission("suppliers.delete")}
              onDelete={(record) => deleteMasterRecord("suppliers", record)}
            />
          )}
        </section>

        <section className="panel master-panel" id="transactions">
          <div className="panel-heading wide">
            <div>
              <span>Transactions</span>
              <h2>Review and correct synced business activity</h2>
            </div>
            <div className="tab-switcher">
              {(["sales", "purchases", "expenses", "cashbook", "customerPayments", "purchasePayments"] as TransactionEntity[]).map((tab) => (
                <button className={activeTransaction === tab ? "active" : ""} onClick={() => {
                  setActiveTransaction(tab);
                  setTransactionForm(emptyTransactionForm);
                }} key={tab}>
                  {entityLabels[tab]}
                </button>
              ))}
            </div>
          </div>

          <TransactionManager
            entity={activeTransaction}
            records={overview?.transactions[activeTransaction] || []}
            form={transactionForm}
            saving={savingTransaction}
            onChange={setTransactionForm}
            onSave={saveTransaction}
            onClear={() => setTransactionForm(emptyTransactionForm)}
            canCreate={hasPermission(`${activeTransaction === "customerPayments" ? "customers" : activeTransaction === "purchasePayments" ? "purchases" : activeTransaction}.create`)}
            canUpdate={hasPermission(`${activeTransaction === "customerPayments" ? "customers" : activeTransaction === "purchasePayments" ? "purchases" : activeTransaction}.update`)}
            canDelete={hasPermission(`${activeTransaction === "customerPayments" ? "customers" : activeTransaction === "purchasePayments" ? "purchases" : activeTransaction}.delete`)}
            onDelete={(record) => deleteTransaction(activeTransaction, record)}
          />
        </section>

        <section className="panel" id="entities">
          <div className="panel-heading wide">
            <div>
              <span>Entity tracking</span>
              <h2>{totalRecords} synced records across {connectedModules} active modules</h2>
            </div>
            <select value={activeEntity} onChange={(event) => setActiveEntity(event.target.value)} aria-label="Entity filter">
              <option value="all">All modules</option>
              {(overview?.entities || []).map((entity) => (
                <option value={entity.entity} key={entity.entity}>{entityLabels[entity.entity] || entity.entity}</option>
              ))}
            </select>
          </div>
          <div className="entity-grid">
            {filteredEntities.map((entity) => {
              const Icon = entityIcons[entity.entity] || Database;
              return (
                <article className="entity-card" key={entity.entity}>
                  <div className="entity-title">
                    <Icon size={19} />
                    <span>
                      <strong>{entityLabels[entity.entity] || entity.entity}</strong>
                      <small>{entity.count} records</small>
                    </span>
                  </div>
                  <div className="mini-list">
                    {entity.latest.length > 0 ? entity.latest.map((record) => (
                      <div className="mini-row" key={record.id}>
                        <span>{record.title}</span>
                        <small>{record.amount ? formatMoney(record.amount) : formatDate(record.updatedAt)}</small>
                      </div>
                    )) : <small className="muted">Waiting for first sync</small>}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="panel reports-panel" id="reports">
          <div className="panel-heading wide">
            <div>
              <span>Reports</span>
              <h2>Branch health and export-ready summaries</h2>
            </div>
            <div className="row-actions">
              <button onClick={() => downloadCsv("billing-pro-summary.csv", reportRows)}>Export Summary CSV</button>
              <button onClick={() => downloadCsv("billing-pro-branch-health.csv", overview?.branchHealth || [])}>Export Branch CSV</button>
            </div>
          </div>

          <div className="report-grid">
            {reportRows.map((row) => (
              <article className="report-card" key={row.module}>
                <span>{row.module}</span>
                <strong>{formatMoney(Number(row.amount))}</strong>
                <small>{row.records} records</small>
              </article>
            ))}
          </div>

          <div className="health-table">
            {(overview?.branchHealth || []).length > 0 ? overview?.branchHealth.map((branch) => (
              <div className="health-row" key={branch.branchId}>
                <span>
                  <strong>{branch.branchName}</strong>
                  <small>{branch.transactionCount} transactions · {branch.lowStock} low stock</small>
                </span>
                <span>{formatMoney(branch.revenue)} revenue</span>
                <span>{formatMoney(branch.paid)} paid</span>
                <span>{formatMoney(branch.outstanding)} due</span>
                <strong className={branch.estimatedCashProfit >= 0 ? "positive" : "negative"}>
                  {formatMoney(branch.estimatedCashProfit)}
                </strong>
              </div>
            )) : <EmptyState text="Branch health will appear after branch data is synced or created." />}
          </div>
        </section>

        <section className="panel audit-panel" id="audit">
          <div className="panel-heading wide">
            <div>
              <span>Audit activity</span>
              <h2>Latest sync and permission events</h2>
            </div>
            <div className="row-actions">
              <button onClick={() => downloadCsv("billing-pro-audit.csv", filteredAudit)}>Export Audit CSV</button>
              <LockKeyhole size={20} />
            </div>
          </div>
          <div className="audit-filters">
            <select value={auditEntityFilter} onChange={(event) => setAuditEntityFilter(event.target.value)} aria-label="Audit entity">
              <option value="all">All entities</option>
              {Object.keys(entityLabels).map((entity) => (
                <option value={entity} key={entity}>{entityLabels[entity]}</option>
              ))}
            </select>
            <select value={auditActionFilter} onChange={(event) => setAuditActionFilter(event.target.value)} aria-label="Audit action">
              <option value="all">All actions</option>
              {["create", "update", "delete", "sync"].map((action) => (
                <option value={action} key={action}>{action}</option>
              ))}
            </select>
            <input value={auditUserFilter} onChange={(event) => setAuditUserFilter(event.target.value)} placeholder="Filter by user" />
            <input type="date" value={auditDateFilter} onChange={(event) => setAuditDateFilter(event.target.value)} />
          </div>
          <div className="audit-list">
            {filteredAudit.length > 0 ? filteredAudit.map((entry) => (
              <div className="audit-row" key={entry.id}>
                <Activity size={16} />
                <span>
                  <strong>{entry.actorName}</strong> {entry.action} {entityLabels[entry.entity] || entry.entity}
                  <small>{formatDate(entry.timestamp)} · {entry.recordId?.slice(0, 8) || "system"}</small>
                </span>
              </div>
            )) : <EmptyState text="No audit events match the current filters." />}
          </div>
        </section>
      </section>
    </main>
  );
}

function PartyManager({
  records,
  form,
  title,
  emptyText,
  totalLabel,
  saving,
  onChange,
  onSave,
  onClear,
  onDelete,
  canCreate,
  canUpdate,
  canDelete,
}: {
  records: Array<CustomerRecord | SupplierRecord>;
  form: PartyForm;
  title: string;
  emptyText: string;
  totalLabel?: string;
  saving: boolean;
  onChange: (form: PartyForm) => void;
  onSave: () => void;
  onClear: () => void;
  onDelete: (record: CustomerRecord | SupplierRecord) => void;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  return (
    <div className="master-layout">
      <div className="data-table">
        {records.length > 0 ? records.map((record) => (
          <div className="table-row" key={record.id}>
            <span>
              <strong>{record.name}</strong>
              <small>{record.phone || record.id.slice(0, 8)}</small>
            </span>
            <span>{formatMoney(record.balance || 0)}</span>
            <span>{"totalSpent" in record ? formatMoney(record.totalSpent || 0) : "Supplier"}</span>
            <div className="row-actions">
              <button disabled={!canUpdate} onClick={() => onChange({
                id: record.id,
                name: record.name,
                phone: record.phone || "",
                balance: String(record.balance || 0),
                totalSpent: "totalSpent" in record ? String(record.totalSpent || 0) : "0",
              })}>Edit</button>
              <button className="danger-link" disabled={!canDelete} onClick={() => onDelete(record)}>Delete</button>
            </div>
          </div>
        )) : <EmptyState text={emptyText} />}
      </div>
      <div className="crud-form master-form">
        <h3>{title}</h3>
        <input value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} placeholder="Name" />
        <input value={form.phone} onChange={(event) => onChange({ ...form, phone: event.target.value })} placeholder="Phone" />
        <input type="number" value={form.balance} onChange={(event) => onChange({ ...form, balance: event.target.value })} placeholder="Balance" />
        {totalLabel && (
          <input type="number" value={form.totalSpent || "0"} onChange={(event) => onChange({ ...form, totalSpent: event.target.value })} placeholder={totalLabel} />
        )}
        <div className="form-actions">
          <button onClick={onClear}>Clear</button>
          <button className="primary-action" onClick={onSave} disabled={saving || !form.name.trim() || !(form.id ? canUpdate : canCreate)}>
            {saving ? "Saving..." : form.id ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TransactionManager({
  entity,
  records,
  form,
  saving,
  onChange,
  onSave,
  onClear,
  onDelete,
  canCreate,
  canUpdate,
  canDelete,
}: {
  entity: TransactionEntity;
  records: TransactionRecord[];
  form: TransactionForm;
  saving: boolean;
  onChange: (form: TransactionForm) => void;
  onSave: () => void;
  onClear: () => void;
  onDelete: (record: TransactionRecord) => void;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const isSale = entity === "sales";
  const isPurchase = entity === "purchases";
  const isMoneyOnly = entity === "expenses" || entity === "cashbook";
  const primaryLabel = isSale ? "Invoice number" : isPurchase ? "Order number" : "Reference";
  const partyLabel = isSale ? "Customer" : isPurchase ? "Supplier" : "Party";

  const loadRecord = (record: TransactionRecord) => {
    onChange({
      id: record.id,
      primary: record.invoiceNumber || record.orderNumber || record.reference || record.id.slice(0, 8),
      party: record.customerName || record.supplierName || "",
      amount: String(record.grandTotal || record.totalAmount || record.amount || 0),
      paidAmount: String(record.paidAmount || 0),
      remainingAmount: String(record.remainingAmount || 0),
      status: record.paymentStatus || record.status || "pending",
      type: record.type || (entity === "cashbook" ? "in" : "bill"),
      date: (record.createdAt || record.date || new Date().toISOString()).slice(0, 10),
      category: record.category || "General",
      description: record.description || record.note || "",
    });
  };

  const titleFor = (record: TransactionRecord) =>
    record.invoiceNumber || record.orderNumber || record.description || record.reference || record.id.slice(0, 8);

  return (
    <div className="master-layout">
      <div className="data-table">
        {records.length > 0 ? records.map((record) => (
          <div className="table-row" key={record.id}>
            <span>
              <strong>{titleFor(record)}</strong>
              <small>{record.customerName || record.supplierName || record.category || record.paymentMode || record.id.slice(0, 8)}</small>
            </span>
            <span>{formatMoney(record.grandTotal || record.totalAmount || record.amount || 0)}</span>
            <span>{record.paymentStatus || record.status || record.type || formatDate(record.updatedAt)}</span>
            <div className="row-actions">
              <button disabled={!canUpdate} onClick={() => loadRecord(record)}>Edit</button>
              <button className="danger-link" disabled={!canDelete} onClick={() => onDelete(record)}>Delete</button>
            </div>
          </div>
        )) : <EmptyState text={`No ${entityLabels[entity].toLowerCase()} records in this scope yet.`} />}
      </div>

      <div className="crud-form master-form">
        <h3>{form.id ? `Edit ${entityLabels[entity]}` : `New ${entityLabels[entity]}`}</h3>
        {!isMoneyOnly && <input value={form.primary} onChange={(event) => onChange({ ...form, primary: event.target.value })} placeholder={primaryLabel} />}
        {!isMoneyOnly && <input value={form.party} onChange={(event) => onChange({ ...form, party: event.target.value })} placeholder={partyLabel} />}
        {isMoneyOnly && <input value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} placeholder="Description" />}
        {isMoneyOnly && <input value={form.category} onChange={(event) => onChange({ ...form, category: event.target.value })} placeholder="Category" />}
        <input type="number" value={form.amount} onChange={(event) => onChange({ ...form, amount: event.target.value })} placeholder="Amount" />
        {(isSale || isPurchase) && <input type="number" value={form.paidAmount} onChange={(event) => onChange({ ...form, paidAmount: event.target.value })} placeholder="Paid amount" />}
        {isSale && <input type="number" value={form.remainingAmount} onChange={(event) => onChange({ ...form, remainingAmount: event.target.value })} placeholder="Remaining amount" />}
        <select value={form.status} onChange={(event) => onChange({ ...form, status: event.target.value })}>
          <option value="pending">Pending</option>
          <option value="partial">Partial</option>
          <option value="paid">Paid</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        {(isPurchase || entity === "cashbook") && (
          <select value={form.type} onChange={(event) => onChange({ ...form, type: event.target.value })}>
            {entity === "cashbook" ? (
              <>
                <option value="in">Cash in</option>
                <option value="out">Cash out</option>
              </>
            ) : (
              <>
                <option value="bill">Bill</option>
                <option value="order">Order</option>
                <option value="return">Return</option>
              </>
            )}
          </select>
        )}
        <input type="date" value={form.date} onChange={(event) => onChange({ ...form, date: event.target.value })} />
        {!isMoneyOnly && <input value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} placeholder="Notes" />}
        <div className="form-actions">
          <button onClick={onClear}>Clear</button>
          <button className="primary-action" onClick={onSave} disabled={saving || (!form.primary.trim() && !form.description.trim()) || !(form.id ? canUpdate : canCreate)}>
            {saving ? "Saving..." : form.id ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <article className="metric-card">
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}
