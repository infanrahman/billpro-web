import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { db, createRecordMetadata, matchesActiveScope } from '../services/db';
import type { Invoice, InvoiceItem, Item } from '../services/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { calculateLineItem, calculateDocumentTotals } from '../utils/financials';
import { Plus, Search, Trash2, FileText, ShoppingCart, RotateCcw, DollarSign, Save, Printer, ShieldCheck, ShieldAlert, Clock, Upload, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNotification } from '../contexts/NotificationContext';
import { useSettings } from '../contexts/SettingsContext';
import Modal from '../components/UI/Modal';
import SalesHistory from './Transactions/SalesHistory';
import { useAuth } from '../contexts/AuthContext';

// import { useGridNavigation } from '../hooks/useGridNavigation';
import { generateInvoicePDF } from '../services/invoiceGenerator';
import Skeleton from '../components/UI/Skeleton';
import EmptyState from '../components/UI/EmptyState';
import { Receipt, CreditCard } from 'lucide-react';

const Sales = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { addToast } = useNotification();
    const { formatCurrency, formatDate, settings } = useSettings();
    const { canCreate, canUpdate, activeCompanyId, activeBranchId, activeBranch } = useAuth();
    const [activeTab, setActiveTab] = useState<'order' | 'invoice' | 'return' | 'payment'>('invoice');

    // Check if ZATCA is enabled
    const [isZatcaEnabled, setIsZatcaEnabled] = useState(false);
    useEffect(() => {
        const checkZatca = async () => {
            if (window.electron && window.electron.zatca) {
                const cfg = await window.electron.zatca.getConfig();
                if (cfg && (cfg.status === 'LIVE' || cfg.status === 'COMPLIANCE_OBTAINED')) {
                    setIsZatcaEnabled(true);
                    return;
                }
            }
            // Fallback
            const cfg = localStorage.getItem('zatca_config');
            if (cfg) {
                const { status } = JSON.parse(cfg);
                setIsZatcaEnabled(status === 'LIVE' || status === 'COMPLIANCE_OBTAINED');
            }
        };
        checkZatca();
    }, []);

    // Stats — use indexed 'type' field for fast counts (no full table scans)
    const stats = {
        orders: useLiveQuery(() => db.invoices.where('type').equals('order').and(inv => matchesActiveScope(inv, activeCompanyId, activeBranchId, activeBranch?.isMaster) && !inv.deletedAt).count(), [activeCompanyId, activeBranchId, activeBranch?.isMaster]) || 0,
        invoices: useLiveQuery(() => db.invoices.where('type').equals('invoice').and(inv => matchesActiveScope(inv, activeCompanyId, activeBranchId, activeBranch?.isMaster) && !inv.deletedAt).count(), [activeCompanyId, activeBranchId, activeBranch?.isMaster]) || 0,
        returns: useLiveQuery(() => db.invoices.where('type').equals('return').and(inv => matchesActiveScope(inv, activeCompanyId, activeBranchId, activeBranch?.isMaster) && !inv.deletedAt).count(), [activeCompanyId, activeBranchId, activeBranch?.isMaster]) || 0,
        payments: useLiveQuery(() => db.customerPayments.filter(payment => matchesActiveScope(payment, activeCompanyId, activeBranchId, activeBranch?.isMaster) && !payment.deletedAt).count(), [activeCompanyId, activeBranchId, activeBranch?.isMaster]) || 0,
    };

    // Modal & Form State
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
        return () => clearTimeout(handler);
    }, [searchTerm]);
    // const [editingId, setEditingId] = useState<string | null>(null); // For future use
    const [customerName, setCustomerName] = useState('');
    const [customerId, setCustomerId] = useState<string | undefined>(undefined);
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
    // const [dueDate, setDueDate] = useState(''); // For future use
    const [items, setItems] = useState<InvoiceItem[]>([]);
    const [notes, setNotes] = useState('');

    // Payment State
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentCustomerId, setPaymentCustomerId] = useState<string | undefined>(undefined);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'upi' | 'bank_transfer'>('cash');
    const [paymentReference, setPaymentReference] = useState('');

    // Inline Item Creation State
    const [isAddItemOpen, setIsAddItemOpen] = useState(false);
    const [newItemName, setNewItemName] = useState('');
    const [newItemCost, setNewItemCost] = useState('');
    const [newItemPrice, setNewItemPrice] = useState('');
    const [newItemStock, setNewItemStock] = useState('');
    const [newItemImage, setNewItemImage] = useState('');

    const handleNewItemImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 700 * 1024) {
            addToast('Image size must be less than 700KB', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            setNewItemImage(reader.result as string);
        };
        reader.readAsDataURL(file);
    };

    // Fetch Lists — globally scoped with soft-delete filter, lazy-loaded when modal is open
    const customers = useLiveQuery(async () => {
        if (!isModalOpen) return [];
        return db.customers.filter((c: any) => matchesActiveScope(c, activeCompanyId, activeBranchId, activeBranch?.isMaster) && !c.deletedAt).toArray();
    }, [isModalOpen, activeCompanyId, activeBranchId, activeBranch?.isMaster]);
    const inventory = useLiveQuery(async () => {
        if (!isModalOpen) return [];
        return db.items.filter((i: any) => matchesActiveScope(i, activeCompanyId, activeBranchId, activeBranch?.isMaster) && !i.deletedAt).toArray();
    }, [isModalOpen, activeCompanyId, activeBranchId, activeBranch?.isMaster]);

    // Derived Lists — use indexed 'type' field, globally scoped, with deletedAt filter
    const currentList = useLiveQuery(async () => {
        return db.invoices
            .where('type')
            .equals(activeTab)
            .filter((inv: any) => matchesActiveScope(inv, activeCompanyId, activeBranchId, activeBranch?.isMaster) && !inv.deletedAt)
            .reverse()
            .sortBy('createdAt');
    }, [activeTab, activeCompanyId, activeBranchId, activeBranch?.isMaster]);

    // Grid Nav
    /* const { getGridCellProps } = useGridNavigation({
        rows: currentList?.length || 0,
        cols: 6
    }); */

    const paymentList = useLiveQuery(async () => {
        const rows = await db.customerPayments
            .filter(payment => matchesActiveScope(payment, activeCompanyId, activeBranchId, activeBranch?.isMaster) && !payment.deletedAt)
            .toArray();
        return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [activeCompanyId, activeBranchId, activeBranch?.isMaster]);

    // Filtered Lists
    const filteredInventory = inventory?.filter((i: any) =>
        (i.name || '').toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        (i.barcode || '').includes(debouncedSearchTerm)
    );

    // Infinite Scroll Logic
    const [visibleItemsCount, setVisibleItemsCount] = useState(50);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Derived & Pagination
    // Reset pagination when filter changes
    useEffect(() => {
        setVisibleItemsCount(50);
        if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
    }, [debouncedSearchTerm]);

    const visibleItems = filteredInventory?.slice(0, visibleItemsCount);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollTop + clientHeight >= scrollHeight - 200) {
            setVisibleItemsCount(prev => Math.min(prev + 50, filteredInventory?.length || 0));
        }
    };

    // Helpers
    const printInvoice = (invoice: Invoice) => {
        try {
            const saved = localStorage.getItem('businessDetails');
            const businessDetails = saved ? JSON.parse(saved) : { name: 'My Shop', address: '', phone: '' };

            // Unified Print Function (Handles Thermal & A4)
            generateInvoicePDF(invoice, businessDetails).catch(console.error);
        } catch (error) {
            console.error(error);
        }
    };

    const addToOrder = (item: Item) => {
        const existing = items.find(i => i.itemId === item.id);
        if (existing) {
            setItems(items.map((i: any) =>
                i.itemId === item.id ? { ...i, quantity: i.quantity + 1, total: (i.quantity + 1) * i.price } : i
            ));
        } else {
            setItems([...items, {
                itemId: item.id!,
                name: item.name,
                quantity: 1,
                price: item.salePrice,
                purchasePrice: item.purchasePrice, // Capture cost
                total: item.salePrice,
                taxType: item.taxType,
                taxRate: item.taxRate
            }]);
        }
    };

    const updateItem = (itemId: string, field: keyof InvoiceItem, value: any) => {
        setItems(items.map((i: any) => {
            if (i.itemId === itemId) {
                const updated = { ...i, [field]: value };
                if (field === 'quantity' || field === 'price') {
                    updated.total = updated.quantity * updated.price;
                }
                return updated;
            }
            return i;
        }));
    };

    const removeItem = (itemId: string) => {
        setItems(items.filter((i: any) => i.itemId !== itemId));
    };

    const totalAmount = items.reduce((sum: any, i: any) => sum + i.total, 0);

    const handleSave = async () => {
        if (!canCreate('sales')) {
            addToast(t('common.access_denied'), 'error');
            return;
        }

        if (!customerName || items.length === 0) {
            addToast(t('sales.required_error'), 'error');
            return;
        }

        const lineResults = items.map(item => calculateLineItem({
            price: item.price,
            quantity: item.quantity,
            taxRate: item.taxRate || 0,
            taxType: item.taxType || 'exclusive',
            discount: 0,
            discountType: 'fixed'
        }, settings.applyTax));

        const totals = calculateDocumentTotals(lineResults, 0, 'fixed', settings.applyTax);
        const finalItems = items.map((item, idx) => ({
            ...item,
            taxAmount: lineResults[idx].taxAmount,
            netAmount: lineResults[idx].taxableAmount,
            total: lineResults[idx].total
        }));

        const totalTax = totals.taxAmount;
        const totalGrand = totals.grandTotal;

        // Generate proper sequential invoice number (same logic as POS)
        const scopedInvoices = await db.invoices
            .filter(inv => matchesActiveScope(inv, activeCompanyId, activeBranchId, activeBranch?.isMaster) && !inv.deletedAt)
            .toArray();
        const lastInvoice = scopedInvoices.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        let nextNumber = 1;
        if (lastInvoice && lastInvoice.invoiceNumber) {
            const lastNumStr = lastInvoice.invoiceNumber.replace(/\D/g, '');
            const lastNum = parseInt(lastNumStr, 10);
            if (!isNaN(lastNum)) nextNumber = lastNum + 1;
        }
        const prefix = activeTab === 'order' ? 'SO-' : 'RET-';
        const seqInvoiceNumber = `${prefix}${nextNumber.toString().padStart(3, '0')}`;

        const invoiceData: Invoice = {
            ...createRecordMetadata(),
            invoiceNumber: seqInvoiceNumber,
            customerName,
            customerId,
            items: finalItems,
            subTotal: totals.subTotal, 
            taxAmount: totalTax,
            discountAmount: 0,
            grandTotal: totalGrand,
            paidAmount: 0,
            remainingAmount: totalGrand,
            paymentMode: 'split', // Default
            paymentStatus: activeTab === 'order' ? 'pending' : 'paid',
            createdAt: new Date(orderDate),
            type: activeTab as 'order' | 'return',
            status: activeTab === 'order' ? 'pending' : 'paid',
            notes
        };

        try {
            await db.transaction('rw', [db.invoices, db.items, db.customers], async () => {
                await db.invoices.add(invoiceData);

                if (activeTab === 'return') {
                    // 1. Increase Stock
                    for (const item of items) {
                        const dbItem = await db.items.get(item.itemId);
                        if (dbItem) {
                            await db.items.update(item.itemId, {
                                stock: dbItem.stock + item.quantity
                            });
                        }
                    }

                    // 2. Decrease Customer Balance (Credit Note)
                    // If customer exists, we reduce their 'balance' (Debt)
                    if (customerId) {
                        const customer = await db.customers.get(customerId);
                        if (customer) {
                            // Logic: Balance = What they owe us.
                            // Return means we owe them, or they owe us less.
                            // So Balance = Balance - ReturnAmount
                            await db.customers.update(customerId, {
                                balance: customer.balance - totalGrand
                            });
                        }
                    }
                }
            });

            addToast(activeTab === 'order' ? t('sales.order_created') : t('sales.return_created'), 'success');
            
            // --- ZATCA REPORTING (Background) ---
            if (activeTab === 'return') {
                 (async () => {
                    try {
                        const zatcaConfig = (window.electron && window.electron.zatca)
                            ? await window.electron.zatca.getConfig()
                            : JSON.parse(localStorage.getItem('zatca_config') || 'null');

                        if (zatcaConfig) {
                            const isLive = zatcaConfig.status === 'LIVE';
                            const canReport = isLive || zatcaConfig.status === 'COMPLIANCE_OBTAINED';
                            const activeCsid = isLive ? zatcaConfig.productionCsid : zatcaConfig.complianceCsid;
                            const activeSecret = isLive ? zatcaConfig.productionSecret : zatcaConfig.complianceSecret;
                            const env = zatcaConfig.environment || 'PRODUCTION';
                            const activeBranchId = localStorage.getItem('currentBranchId') || 'default';

                            if (canReport && zatcaConfig.privateKey && activeCsid) {
                                const { generateZatcaXML } = await import('../services/zatcaXml');
                                const { reportInvoice } = await import('../services/zatcaApi');

                                // Get chaining state
                                const branch = await db.branches.get(activeBranchId);
                                if (!branch) return;

                                const currentICV = (branch.invoiceCounter || 0) + 1;
                                const currentPIH = branch.lastInvoiceHash || 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWIyNGEyOTVRMzYxYzI4Y2I1MjM=';

                                // Note: safeBusinessDetails is not defined in Sales.tsx, need to fetch it
                                const bizSaved = localStorage.getItem('businessDetails');
                                const biz = bizSaved ? JSON.parse(bizSaved) : {};

                                const { xml, hash, uuid } = await generateZatcaXML(
                                    invoiceData,
                                    { ...biz, gstin: (biz.gstin || biz.vatNo || '').trim() },
                                    zatcaConfig.privateKey,
                                    activeCsid,
                                    currentPIH
                                );

                                const reportResult = await reportInvoice(xml, hash, uuid, activeCsid, activeSecret, env);

                                await db.branches.update(activeBranchId, {
                                    lastInvoiceHash: hash,
                                    invoiceCounter: currentICV
                                });

                                if (reportResult.status === 'REPORTED') {
                                    await db.invoices.update(seqInvoiceNumber, { zatcaStatus: 'REPORTED', zatcaHash: hash }); // Using seqInvoiceNumber or the ID if we have it
                                }
                            }
                        }
                    } catch (e) {
                        console.error("ZATCA Return Report Failed:", e);
                    }
                 })();
            }

            setIsModalOpen(false);
            setItems([]);
            setCustomerName('');
            setCustomerId(undefined);
            setNotes('');
        } catch (e) {
            console.error(e);
            addToast(t('sales.error_saving'), 'error');
        }
    };

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-8 p-4 md:p-6"
        >
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white/50 dark:bg-slate-800/30 backdrop-blur-xl p-8 rounded-[2.5rem] border border-slate-200/50 dark:border-slate-700/50">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600 dark:text-blue-400">Transactions</span>
                        <div className="h-[2px] w-8 bg-blue-600/20" />
                    </div>
                    <h1 className="text-3xl md:text-4xl font-black dark:text-white tracking-tighter flex items-center gap-3 uppercase">
                        {t('sales.title')}
                        <div className="p-2 bg-blue-600/10 text-blue-600 rounded-2xl">
                            <ShoppingCart size={24} strokeWidth={2.5} />
                        </div>
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-2 font-medium">{t('sales.description')}</p>
                </div>
                
                <div className="flex flex-wrap gap-3">
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                            setActiveTab('order');
                            setIsModalOpen(true);
                        }}
                        className="px-6 py-3 bg-blue-600 text-white rounded-[1.5rem] flex items-center gap-2 font-black uppercase tracking-widest text-[10px] shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-colors"
                    >
                        <Plus size={18} strokeWidth={3} /> {t('sales.new_order')}
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                            setActiveTab('return');
                            setIsModalOpen(true);
                        }}
                        className="px-6 py-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-white rounded-[1.5rem] flex items-center gap-2 font-black uppercase tracking-widest text-[10px] border border-slate-200 dark:border-slate-700 shadow-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                        <RotateCcw size={18} strokeWidth={3} className="text-amber-500" /> {t('sales.create_return')}
                    </motion.button>
                </div>
            </div>

            {/* Tabs Navigation */}
            <div className="flex gap-2 p-2 bg-slate-100/50 dark:bg-slate-900/50 backdrop-blur-md rounded-3xl border border-slate-200/50 dark:border-slate-700/50 overflow-x-auto no-scrollbar">
                {[
                    { id: 'order', icon: ShoppingCart, label: t('sales.orders'), count: stats.orders },
                    { id: 'invoice', icon: FileText, label: t('sales.invoices'), count: stats.invoices },
                    { id: 'return', icon: RotateCcw, label: t('sales.returns'), count: stats.returns },
                    { id: 'payment', icon: DollarSign, label: t('sales.payments_in'), count: stats.payments }
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`relative px-6 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all duration-300 whitespace-nowrap
                            ${activeTab === tab.id ? 'text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                    >
                        {activeTab === tab.id && (
                            <motion.div
                                layoutId="activeTab"
                                className="absolute inset-0 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20"
                                transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }}
                            />
                        )}
                        <span className="relative z-10 flex items-center gap-2">
                            <tab.icon size={16} strokeWidth={activeTab === tab.id ? 3 : 2} />
                            {tab.label}
                            <span className={`px-2 py-0.5 rounded-lg text-[9px] ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-800 text-slate-500'}`}>
                                {tab.count}
                            </span>
                        </span>
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <motion.div 
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white/70 dark:bg-slate-800/50 backdrop-blur-xl rounded-[2.5rem] shadow-2xl shadow-black/5 border border-slate-200/50 dark:border-slate-700/50 min-h-[500px] overflow-hidden"
            >
                {activeTab === 'invoice' && <SalesHistory onReturn={(inv) => {
                    setActiveTab('return');
                    setCustomerId(inv.customerId);
                    setCustomerName(inv.customerName);
                    setItems(inv.items.map((i: any) => ({ ...i }))); // Clone items
                    setNotes(t('sales.return_for_invoice', { number: inv.invoiceNumber }));
                    setIsModalOpen(true);
                }} />}

                {(activeTab === 'order' || activeTab === 'return') && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-700/50">
                                    <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t('sales.date')}</th>
                                    <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{activeTab === 'order' ? t('sales.order_no') : t('sales.return_no')}</th>
                                    <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t('sales.customer')}</th>
                                    <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t('sales.amount')}</th>
                                    <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t('sales.status')}</th>
                                    {activeTab === 'return' && isZatcaEnabled && <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Compliance</th>}
                                    <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">{t('common.actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-700/30">
                                {!currentList ? (
                                    Array.from({ length: 5 }).map((_: any, i: any) => (
                                        <tr key={i} className="animate-pulse">
                                            <td className="p-6"><Skeleton width={100} height={20} className="rounded-lg" /></td>
                                            <td className="p-6"><Skeleton width={120} height={20} className="rounded-lg" /></td>
                                            <td className="p-6"><Skeleton width={150} height={20} className="rounded-lg" /></td>
                                            <td className="p-6"><Skeleton width={80} height={20} className="rounded-lg" /></td>
                                            <td className="p-6"><Skeleton width={80} height={20} className="rounded-lg" /></td>
                                            <td className="p-6"><Skeleton width={100} height={20} className="rounded-lg" /></td>
                                        </tr>
                                    ))
                                ) : currentList.length === 0 ? (
                                    <tr>
                                        <td colSpan={7}>
                                            <EmptyState
                                                title={t('sales.no_records')}
                                                description={activeTab === 'order' ? t('sales.no_orders_desc') || "No orders found." : t('sales.no_invoices_desc') || "No invoices found."}
                                                icon={Receipt}
                                                actionLabel={activeTab === 'order' ? t('sales.new_order') : undefined}
                                                onAction={() => {
                                                    setActiveTab('order');
                                                    setIsModalOpen(true);
                                                }}
                                            />
                                        </td>
                                    </tr>
                                ) : (
                                    currentList.map((invoice: any, _rowIndex: any) => (
                                        <tr key={invoice.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-all group">
                                            <td className="p-6 text-slate-500 dark:text-slate-400 font-black text-[10px] uppercase tracking-widest">
                                                {formatDate(invoice.createdAt)}
                                            </td>
                                            <td className="p-6">
                                                <span className="font-mono text-[10px] font-black bg-slate-100 dark:bg-slate-900 px-3 py-1 rounded-lg text-slate-400 group-hover:text-blue-500 transition-colors tracking-widest">#{invoice.invoiceNumber || '-'}</span>
                                            </td>
                                            <td className="p-6 text-slate-800 dark:text-white font-black text-sm uppercase tracking-tight">{invoice.customerName || 'Unknown'}</td>
                                            <td className="p-6 font-black text-blue-600 dark:text-blue-400 text-lg tracking-tighter">{formatCurrency(invoice.grandTotal)}</td>
                                            <td className="p-6">
                                                <span className={`px-4 py-1.5 rounded-2xl text-[9px] font-black uppercase tracking-widest border
                                                    ${invoice.status === 'paid' || invoice.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                                                        invoice.status === 'pending' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' :
                                                            'bg-slate-500/10 text-slate-600 border-slate-500/20'}`}>
                                                    {invoice.status}
                                                </span>
                                            </td>
                                            {activeTab === 'return' && isZatcaEnabled && (
                                                <td className="p-6">
                                                    {invoice.zatcaStatus === 'REPORTED' ? (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                                                            <ShieldCheck size={12} /> Reported
                                                        </span>
                                                    ) : invoice.zatcaStatus === 'ERROR' ? (
                                                        <span 
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-rose-500/10 text-rose-600 border border-rose-500/20 cursor-help"
                                                            title={invoice.zatcaError || 'Validation Error'}
                                                        >
                                                            <ShieldAlert size={12} /> Error
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-[9px] font-black uppercase tracking-widest bg-slate-500/10 text-slate-600 border border-slate-500/20">
                                                            <Clock size={12} /> Pending
                                                        </span>
                                                    )}
                                                </td>
                                            )}
                                            <td className="p-6 text-right flex justify-end gap-2">
                                                <motion.button
                                                    whileHover={{ scale: 1.1 }}
                                                    whileTap={{ scale: 0.9 }}
                                                    onClick={() => printInvoice(invoice)}
                                                    className="p-3 bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-blue-500 rounded-xl transition-colors"
                                                    title={t('common.print')}
                                                >
                                                    <Printer size={18} strokeWidth={2.5} />
                                                </motion.button>
                                                {invoice.status === 'pending' && activeTab === 'order' && (
                                                    <motion.button
                                                        whileHover={{ scale: 1.1 }}
                                                        whileTap={{ scale: 0.9 }}
                                                        onClick={() => navigate('/pos', { state: { editInvoice: invoice, hidePayLater: true } })}
                                                        className="p-3 bg-blue-600/10 text-blue-600 hover:bg-blue-600 hover:text-white rounded-xl transition-all"
                                                        title="Proceed to Payment"
                                                    >
                                                        <CreditCard size={18} strokeWidth={2.5} />
                                                    </motion.button>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'payment' && (
                    <div className="p-6">
                        <div className="flex justify-end mb-8">
                            <motion.button
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => setIsPaymentModalOpen(true)}
                                className="px-6 py-3 bg-emerald-600 text-white rounded-[1.5rem] flex items-center gap-2 font-black uppercase tracking-widest text-[10px] shadow-xl shadow-emerald-500/20"
                            >
                                <Plus size={20} strokeWidth={3} /> {t('sales.record_payment')}
                            </motion.button>
                        </div>
                        <div className="overflow-x-auto rounded-[2rem] border border-slate-100 dark:border-slate-700/50">
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="bg-slate-50/50 dark:bg-slate-900/50">
                                        <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t('sales.date')}</th>
                                        <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t('sales.customer')}</th>
                                        <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t('sales.amount')}</th>
                                        <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t('sales.method')}</th>
                                        <th className="p-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{t('sales.reference')}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-slate-700/30">
                                    {!paymentList ? (
                                        Array.from({ length: 5 }).map((_: any, i: any) => (
                                            <tr key={i} className="animate-pulse">
                                                <td className="p-6"><Skeleton width={80} height={20} /></td>
                                                <td className="p-6"><Skeleton width={150} height={20} /></td>
                                                <td className="p-6"><Skeleton width={80} height={20} /></td>
                                                <td className="p-6"><Skeleton width={80} height={20} /></td>
                                                <td className="p-6"><Skeleton width={100} height={20} /></td>
                                            </tr>
                                        ))
                                    ) : paymentList.length === 0 ? (
                                        <tr>
                                            <td colSpan={5}>
                                                <EmptyState
                                                    title={t('sales.no_payments')}
                                                    description={t('sales.no_payments_desc') || "No payments recorded yet."}
                                                    icon={CreditCard}
                                                    actionLabel={t('sales.record_payment')}
                                                    onAction={() => setIsPaymentModalOpen(true)}
                                                />
                                            </td>
                                        </tr>
                                    ) : (
                                        paymentList.map((payment: any) => {
                                            const customer = customers?.find(c => c.id === payment.customerId);
                                            return (
                                                <tr key={payment.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-all">
                                                    <td className="p-6 text-slate-500 dark:text-slate-400 font-black text-[10px] uppercase tracking-widest">{formatDate(payment.date)}</td>
                                                    <td className="p-6 font-black text-sm dark:text-white uppercase tracking-tight">{customer?.name || 'Unknown'}</td>
                                                    <td className="p-6 font-black text-emerald-600 text-lg tracking-tighter">+{formatCurrency(payment.amount)}</td>
                                                    <td className="p-6 capitalize">
                                                        <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-lg text-[9px] font-black uppercase tracking-widest">{payment.paymentMode}</span>
                                                    </td>
                                                    <td className="p-6 text-slate-500 text-[10px] font-mono tracking-widest">{payment.reference || '-'}</td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </motion.div>




            {/* Payment Modal */}
            <Modal
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                title={t('sales.record_payment')}
                maxWidth="md"
            >
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('sales.customer')}</label>
                        <select
                            className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent dark:text-white"
                            value={paymentCustomerId || ''}
                            onChange={e => setPaymentCustomerId(e.target.value)}
                        >
                            <option value="">{t('sales.select_customer')}</option>
                            {customers?.map((c: any) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('sales.amount')}</label>
                        <div className="relative">
                            <span className="absolute left-3 top-2 text-slate-400">{settings.currency}</span>
                            <input
                                type="number"
                                className="w-full pl-8 p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent dark:text-white"
                                value={paymentAmount}
                                onChange={e => setPaymentAmount(e.target.value)}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('sales.payment_method')}</label>
                        <select
                            className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent dark:text-white"
                            value={paymentMethod}
                            onChange={e => setPaymentMethod(e.target.value as any)}
                        >
                            <option value="cash">{t('payment.cash') || "Cash"}</option>
                            <option value="card">{t('payment.card') || "Card"}</option>
                            <option value="upi">{t('payment.upi') || "UPI"}</option>
                            <option value="bank_transfer">{t('payment.bank_transfer') || "Bank Transfer"}</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('sales.reference')} (Optional)</label>
                        <input
                            type="text"
                            className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent dark:text-white"
                            placeholder={t('sales.reference_placeholder')}
                            value={paymentReference}
                            onChange={e => setPaymentReference(e.target.value)}
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <button
                            onClick={() => setIsPaymentModalOpen(false)}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 rounded-lg"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            onClick={async () => {
                                if (!canUpdate('customers')) {
                                    addToast(t('common.access_denied'), 'error');
                                    return;
                                }
                                if (!paymentCustomerId || !paymentAmount) {
                                    addToast(t('sales.select_cust_amount_error'), 'error');
                                    return;
                                }
                                try {
                                    const amount = parseFloat(paymentAmount);
                                    await db.transaction('rw', [db.customerPayments, db.customers], async () => {
                                        // 1. Save Payment
                                        await db.customerPayments.add({
                                            ...createRecordMetadata(),
                                            customerId: paymentCustomerId,
                                            amount: amount,
                                            date: new Date(),
                                            paymentMode: paymentMethod,
                                            reference: paymentReference
                                        });

                                        // 2. Update Customer Balance (Reduction in Debt)
                                        const customer = await db.customers.get(paymentCustomerId);
                                        if (customer) {
                                            await db.customers.update(paymentCustomerId, {
                                                balance: (customer.balance || 0) - amount
                                            });
                                        }
                                    });

                                    addToast(t('sales.payment_recorded'), 'success');
                                    setIsPaymentModalOpen(false);
                                    setPaymentAmount('');
                                    setPaymentCustomerId(undefined);
                                    setPaymentReference('');
                                } catch (e) {
                                    console.error(e);
                                    addToast(t('sales.error_payment'), 'error');
                                }
                            }}
                            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                        >
                            {t('sales.save_payment')}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Create/Edit Modal (Order/Return) */}
            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={activeTab === 'order' ? t('sales.new_order') : t('sales.new_return')}
                maxWidth="7xl"
                className="h-[90vh]"
            >
                <div className="flex-1 overflow-hidden flex flex-col md:flex-row h-full">
                    {/* Left: Item Selector */}
                    <div className="w-full md:w-[360px] border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-700 p-4 flex flex-col gap-4 bg-slate-50 dark:bg-slate-800/50 shrink-0 h-1/2 md:h-full overflow-hidden">
                        <h3 className="font-semibold text-slate-700 dark:text-slate-200">{t('sales.select_items')}</h3>
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    placeholder={t('common.search')}
                                    className="w-full pl-9 p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <button
                                onClick={() => setIsAddItemOpen(true)}
                                className="px-3 py-2 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg hover:bg-blue-200 transition-colors flex items-center gap-1 shrink-0 text-sm font-medium"
                                title={t('sales.add_new_item_tooltip') || "Add New Item to Inventory"}
                            >
                                <Plus size={16} /> {t('sales.new_item')}
                            </button>
                        </div>
                        <div
                            ref={scrollContainerRef}
                            onScroll={handleScroll}
                            className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar"
                        >
                            {visibleItems?.map((item: any) => (
                                <button
                                    key={item.id}
                                    onClick={() => addToOrder(item)}
                                    className="w-full text-left p-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-500 transition-colors"
                                >
                                    <div className="flex justify-between items-start gap-2">
                                        <span className="font-medium dark:text-white text-sm line-clamp-2 leading-tight flex-1">{item.name}</span>
                                        <span className="text-xs bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded text-slate-600 dark:text-slate-300 shrink-0">
                                            {t('sales.stock')}: {item.stock}
                                        </span>
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">{t('sales.price')}: {formatCurrency(item.salePrice)}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Right: Form & Details */}
                    <div className="w-full md:flex-1 flex flex-col h-1/2 md:h-full">
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {/* Customer & Date */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">{t('sales.customer_name')}</label>
                                    <select
                                        className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent dark:text-white"
                                        value={customerId || ''}
                                        onChange={e => {
                                            const id = e.target.value;
                                            const c = customers?.find(cus => cus.id === id);
                                            setCustomerId(id);
                                            setCustomerName(c ? c.name : '');
                                        }}
                                    >
                                        <option value="">{t('sales.select_existing_customer')}</option>
                                        {customers?.map((c: any) => (
                                            <option key={c.id} value={c.id}>{c.name}</option>
                                        ))}
                                    </select>
                                    <input
                                        type="text"
                                        className="w-full p-2 mt-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent dark:text-white text-sm"
                                        value={customerName}
                                        onChange={e => {
                                            setCustomerName(e.target.value);
                                            setCustomerId(undefined);
                                        }}
                                        placeholder={t('sales.custom_name_placeholder')}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-slate-500 mb-1">{t('sales.date')}</label>
                                    <input
                                        type="date"
                                        className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent dark:text-white"
                                        value={orderDate}
                                        onChange={e => setOrderDate(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Items List */}
                            <div className="space-y-3">
                                <h3 className="font-semibold text-sm text-slate-500 uppercase tracking-wider">{t('sales.items_count')} ({items.length})</h3>
                                <div className="border rounded-lg divide-y dark:border-slate-700 dark:divide-slate-700">
                                    {items.map((item: any) => (
                                        <div key={item.itemId} className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800">
                                            <div className="flex-1">
                                                <p className="font-medium dark:text-white text-sm">{item.name}</p>
                                            </div>
                                            <div className="w-20">
                                                <input
                                                    type="number"
                                                    className="w-full p-1 text-sm bg-slate-50 dark:bg-slate-900 border rounded text-center dark:text-white"
                                                    value={item.quantity}
                                                    onChange={e => updateItem(item.itemId, 'quantity', parseFloat(e.target.value))}
                                                    placeholder={t('sales.qty')}
                                                />
                                            </div>
                                            <div className="w-24">
                                                <input
                                                    type="number"
                                                    className="w-full p-1 text-sm bg-slate-50 dark:bg-slate-900 border rounded text-right dark:text-white"
                                                    value={item.price}
                                                    onChange={e => updateItem(item.itemId, 'price', parseFloat(e.target.value))}
                                                    placeholder={t('sales.price')}
                                                />
                                            </div>
                                            <div className="w-24 text-right font-medium dark:text-white text-sm">
                                                {formatCurrency(item.total)}
                                            </div>
                                            <button
                                                onClick={() => removeItem(item.itemId)}
                                                className="text-red-500 hover:bg-red-50 p-1 rounded"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    ))}
                                    {items.length === 0 && (
                                        <div className="p-8 text-center text-slate-400 text-sm">
                                            {t('sales.no_items_selected_msg')}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Summary */}
                            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg space-y-2">
                                <div className="flex justify-between text-lg font-bold dark:text-white">
                                    <span>{t('sales.total_amount')}</span>
                                    <span>{formatCurrency(totalAmount)}</span>
                                </div>
                            </div>

                            {/* Notes */}
                            <div>
                                <label className="block text-xs font-medium text-slate-500 mb-1">{t('sales.notes')}</label>
                                <textarea
                                    className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-transparent dark:text-white h-20"
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    placeholder={t('sales.notes_placeholder')}
                                />
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 rounded-lg"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
                            >
                                <Save size={18} />
                                {activeTab === 'order' ? t('sales.save_order') : t('sales.save_return')}
                            </button>
                        </div>
                    </div>
                </div>
            </Modal>
            {/* Quick Add Item Modal */}
            <Modal
                isOpen={isAddItemOpen}
                onClose={() => setIsAddItemOpen(false)}
                title={t('sales.add_item_title')}
                maxWidth="md"
            >
                <div className="p-4 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('sales.item_name')}</label>
                        <input
                            type="text"
                            className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white"
                            value={newItemName}
                            onChange={e => setNewItemName(e.target.value)}
                            placeholder={t('sales.item_name_placeholder')}
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">{t('inventory.product_image') || 'Product Image'}</label>
                        <div className="flex gap-4 items-center">
                            {newItemImage ? (
                                <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0">
                                    <img src={newItemImage} className="w-full h-full object-cover" alt="Preview" />
                                    <button
                                        type="button"
                                        onClick={() => setNewItemImage('')}
                                        className="absolute -top-1 -right-1 p-1 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-transform hover:scale-105"
                                    >
                                        <X size={10} />
                                    </button>
                                </div>
                            ) : (
                                <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-4 cursor-pointer hover:border-blue-500 transition-all bg-slate-50/50 dark:bg-slate-900/30 group">
                                    <div className="flex items-center gap-2">
                                        <Upload size={16} className="text-slate-400 group-hover:text-blue-500 transition-all" />
                                        <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                                            Upload Image (Max 700KB)
                                        </span>
                                    </div>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleNewItemImageChange}
                                        className="hidden"
                                    />
                                </label>
                            )}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('sales.purchase_cost')}</label>
                            <input
                                type="number"
                                className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white"
                                value={newItemCost}
                                onChange={e => setNewItemCost(e.target.value)}
                                placeholder={t('common.placeholder_amount')}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('sales.selling_price')}</label>
                            <input
                                type="number"
                                className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white"
                                value={newItemPrice}
                                onChange={e => setNewItemPrice(e.target.value)}
                                placeholder={t('common.placeholder_amount')}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('sales.initial_stock')}</label>
                        <input
                            type="number"
                            className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 dark:text-white"
                            value={newItemStock}
                            onChange={e => setNewItemStock(e.target.value)}
                            placeholder={t('common.placeholder_qty')}
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button
                            onClick={() => {
                                setIsAddItemOpen(false);
                                setNewItemImage('');
                            }}
                            className="px-4 py-2 text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 rounded-lg"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            onClick={async () => {
                                if (!canCreate('inventory')) {
                                    addToast(t('common.access_denied'), 'error');
                                    return;
                                }
                                if (!newItemName.trim() || !newItemPrice) {
                                    addToast(t('sales.name_price_required'), 'error');
                                    return;
                                }
                                try {
                                    const price = parseFloat(newItemPrice);
                                    const cost = parseFloat(newItemCost) || 0;
                                    const stock = parseInt(newItemStock) || 0;

                                    const meta = createRecordMetadata();
                                    const id = await db.items.add({
                                        ...meta,
                                        name: newItemName,
                                        purchasePrice: cost,
                                        salePrice: price,
                                        stock: stock,
                                        minStock: 5,
                                        taxType: 'exclusive',
                                        taxRate: 0,
                                        barcode: '',
                                        image: newItemImage
                                    });

                                    // Add to current order list directly
                                    addToOrder({
                                        ...meta,
                                        id: id as string,
                                        name: newItemName,
                                        purchasePrice: cost,
                                        stock: stock,
                                        salePrice: price,
                                        minStock: 5,
                                        taxType: 'exclusive',
                                        taxRate: 0,
                                        barcode: '',
                                        image: newItemImage
                                    });

                                    setIsAddItemOpen(false);
                                    // Reset Form
                                    setNewItemName('');
                                    setNewItemCost('');
                                    setNewItemPrice('');
                                    setNewItemStock('');
                                    setNewItemImage('');

                                    addToast(t('sales.item_created'), 'success');
                                } catch (error) {
                                    console.error(error);
                                    addToast(t('sales.item_add_failed'), 'error');
                                }
                            }}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            {t('sales.create_add')}
                        </button>
                    </div>
                </div>
            </Modal>
        </motion.div>
    );
};

export default Sales;
