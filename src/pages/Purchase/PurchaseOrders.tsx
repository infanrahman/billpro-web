import { useState, useEffect } from 'react';
import clsx from 'clsx';
import { motion, AnimatePresence } from 'framer-motion';
import { db, matchesActiveScope, type Item, type Purchase, type PurchaseItem, createRecordMetadata, updateRecordMetadata } from '../../services/db';
import { calculateLineItem, calculateDocumentTotals } from '../../utils/financials';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Search, Trash2, Save, FileText, ShoppingCart, RotateCcw, Edit, CheckCircle, Printer, Download, ShieldOff, CreditCard, Eye, Building, Sparkles, Upload, X } from 'lucide-react';
import { useNotification } from '../../contexts/NotificationContext';
import Modal from '../../components/UI/Modal';
import ConfirmationModal from '../../components/UI/ConfirmationModal';
import { useSettings } from '../../contexts/SettingsContext';
import { getPurchaseHTML, printPurchase } from '../../services/invoiceGenerator';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import ShareModal from '../../components/UI/ShareModal';
import { Send, Wand2 } from 'lucide-react';
// import { useGridNavigation } from '../../hooks/useGridNavigation';
import BarcodeModal from '../Inventory/BarcodeModal';

import PurchaseDetailsModal from '../../components/UI/PurchaseDetailsModal';

const PurchaseOrders = () => {
    const { addToast, addNotification } = useNotification();
    const { formatCurrency, formatDate, settings } = useSettings();
    const { canView, canCreate, canUpdate, canDelete, activeCompanyId, activeBranchId, activeBranch } = useAuth();
    const { t, i18n } = useTranslation();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [shareModalOpen, setShareModalOpen] = useState(false);
    const [selectedOrderForShare, setSelectedOrderForShare] = useState<Purchase | null>(null);
    const [viewOrder, setViewOrder] = useState<Purchase | null>(null);

    // Barcode Printing State
    const [isLabelModalOpen, setIsLabelModalOpen] = useState(false);
    const [selectedItemsForLabel, setSelectedItemsForLabel] = useState<Item[] | null>(null);

    if (!canView('purchases')) {
        return (
            <div className="flex flex-col items-center justify-center h-screen text-center p-8">
                <ShieldOff size={48} className="text-slate-300 mb-4" />
                <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">{t('common.access_denied')}</h2>
                <p className="text-slate-500">{t('purchases.access_denied_msg')}</p>
            </div>
        );
    }

    // Tabs
    const [activeTab, setActiveTab] = useState<'bill' | 'order' | 'return'>('bill');

    // Form State
    // Form State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [originalPurchase, setOriginalPurchase] = useState<Purchase | null>(null); // For stock reversal
    const [editSupplierId, setEditSupplierId] = useState<string | undefined>(undefined); // Linked Supplier ID
    const [supplier, setSupplier] = useState(''); // Name for display
    const [orderNumber, setOrderNumber] = useState('');
    const [orderDate, setOrderDate] = useState(new Date().toISOString().split('T')[0]);
    const [dueDate, setDueDate] = useState('');
    const [orderItems, setOrderItems] = useState<PurchaseItem[]>([]);

    // Financials & Payment
    const [paidAmount, setPaidAmount] = useState<string>(''); // Advance Amt
    const [paymentType, setPaymentType] = useState('cash');
    const [notes, setNotes] = useState('');
    const [relatedOrderId, setRelatedOrderId] = useState<string | null>(null); // For linking

    // Inline Creation State
    const [isAddSupplierOpen, setIsAddSupplierOpen] = useState(false);
    const [newSupplierName, setNewSupplierName] = useState('');
    const [newSupplierPhone, setNewSupplierPhone] = useState('');

    const [isAddItemOpen, setIsAddItemOpen] = useState(false);
    const [newItemName, setNewItemName] = useState('');
    const [newItemBarcode, setNewItemBarcode] = useState('');
    const [newItemCost, setNewItemCost] = useState(''); // Purchase Price
    const [newItemPrice, setNewItemPrice] = useState(''); // Selling Price
    const [newItemStock, setNewItemStock] = useState('');
    const [newItemTaxType, setNewItemTaxType] = useState('exclusive');
    const [newItemUnit, setNewItemUnit] = useState('');
    const [newItemTaxRate, setNewItemTaxRate] = useState(0); // Added for logic
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

    // Helper to get business details
    const getBusinessDetails = () => {
        const saved = localStorage.getItem('businessDetails');
        return saved ? JSON.parse(saved) : null;
    };

    // Global Tax State
    // const [globalTax, setGlobalTax] = useState<{ name: string, rate: number } | null>(null);

    /* useEffect(() => {
        const details = getBusinessDetails();
        if (details?.taxRate && parseFloat(details.taxRate) > 0) {
            setGlobalTax({
                name: details.taxName || 'Tax',
                rate: parseFloat(details.taxRate)
            });
        }
    }, [isModalOpen]); */

    const handlePrint = async (po: Purchase) => {
        try {
            await printPurchase(po, getBusinessDetails(), t, i18n.language);
            addToast(t('purchases.print_success'), 'success');
        } catch (error) {
            console.error(error);
            addToast(t('purchases.print_error'), 'error');
        }
    };

    /* const handleDownload = async (po: Purchase) => { ... } */

    /* const handlePrintLabels = async (po: Purchase) => { ... } */


    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearchTerm(searchTerm), 300);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Fetch all purchases
    const purchases = useLiveQuery(async () => {
        const rows = await db.purchases
            .filter(purchase => matchesActiveScope(purchase, activeCompanyId, activeBranchId, activeBranch?.isMaster))
            .toArray();
        return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [activeCompanyId, activeBranchId, activeBranch?.isMaster]);
    const suppliers = useLiveQuery(async () => {
        if (!isModalOpen) return [];
        return db.suppliers
            .filter(supplier => matchesActiveScope(supplier, activeCompanyId, activeBranchId, activeBranch?.isMaster) && !supplier.deletedAt)
            .toArray();
    }, [activeCompanyId, activeBranchId, activeBranch?.isMaster, isModalOpen]);

    // Filter by Tab & Date (Moved up for hook usage)
    const filteredPurchases = purchases?.filter((po: any) => {
        // Filter by Type
        const poType = po.type || 'bill'; // Default to bill for migration
        if (poType !== activeTab) return false;

        // Date Filter
        if (startDate) {
            const poDate = new Date(po.date);
            const start = new Date(startDate);
            if (poDate < start) return false;
        }
        if (endDate) {
            const poDate = new Date(po.date);
            const end = new Date(endDate);
            if (poDate > end) return false;
        }
        return true;
    });

    const inventoryItems = useLiveQuery(async () => {
        if (!isModalOpen) return [];
        return db.items
            .filter(item => matchesActiveScope(item, activeCompanyId, activeBranchId, activeBranch?.isMaster) && !item.deletedAt)
            .toArray();
    }, [activeCompanyId, activeBranchId, activeBranch?.isMaster, isModalOpen]);

    const filteredInventory = inventoryItems?.filter((i: any) =>
        i.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
    );

    const addToOrder = (item: Item) => {
        const existing = orderItems.find(i => i.itemId === item.id);
        if (existing) {
            setOrderItems(orderItems.map((i: any) =>
                i.itemId === item.id ? { ...i, quantity: i.quantity + 1 } : i
            ));
        } else {
            // Default tax to 15% if 0, as requested by user
            const defaultTaxRate = (item.taxRate && item.taxRate > 0) ? item.taxRate : 15;

            setOrderItems([...orderItems, {
                itemId: item.id!,
                name: item.name,
                quantity: 1,
                cost: item.purchasePrice,
                unit: item.unit,
                taxRate: defaultTaxRate,
                taxType: item.taxType || 'exclusive'
            }]);
        }
    };

    const updateOrderItem = (itemId: string, field: string, value: string | number) => {
        setOrderItems(orderItems.map((i: any) =>
            i.itemId === itemId ? { ...i, [field]: value } : i
        ));
    };

    const removeOrderItem = (itemId: string) => {
        setOrderItems(orderItems.filter((i: any) => i.itemId !== itemId));
    };

    // Calculate Totals
    const calculateTotals = (items: PurchaseItem[]) => {
        const lineResults = items.map(item => calculateLineItem({
            price: item.cost,
            quantity: item.quantity,
            taxRate: item.taxRate || 0,
            taxType: item.taxType || 'exclusive',
            discount: 0,
            discountType: 'fixed'
        }, settings.applyTax));

        return calculateDocumentTotals(lineResults, 0, 'fixed', settings.applyTax);
    };

    const totals = calculateTotals(orderItems);
    const subTotal = totals.subTotal;
    const taxAmount = totals.taxAmount;
    const totalAmount = totals.grandTotal;
    const advance = parseFloat(paidAmount) || 0;
    const balanceDue = Math.max(0, totalAmount - advance);

    const resetForm = () => {
        setEditingId(null);
        setOriginalPurchase(null);
        setRelatedOrderId(null);
        setEditSupplierId(undefined);
        setSupplier('');
        setOrderNumber('');
        setOrderDate(new Date().toISOString().split('T')[0]);
        setDueDate('');
        setOrderItems([]);
        setPaidAmount('');
        setPaymentType('cash');
        setNotes('');
    };

    // Stock Helpers
    const applyStockEffect = async (items: PurchaseItem[], type: 'bill' | 'order' | 'return', currentSupplierId?: string) => {
        if (type === 'order') return; // Orders don't affect stock

        for (const orderItem of items) {
            const item = await db.items.get(orderItem.itemId);
            if (item) {
                let newStock = item.stock;
                if (type === 'bill') {
                    newStock += orderItem.quantity;
                    // Update Cost Price and Supplier only on new Bills
                    await db.items.update(item.id!, { 
                        ...updateRecordMetadata(),
                        stock: newStock, 
                        purchasePrice: orderItem.cost,
                        ...(currentSupplierId ? { supplierId: currentSupplierId } : {})
                    });
                } else if (type === 'return') {
                    newStock -= orderItem.quantity;
                    await db.items.update(item.id!, { 
                        ...updateRecordMetadata(),
                        stock: newStock 
                    });
                }
            }
        }
    };

    const revertStockEffect = async (purchase: Purchase) => {
        if (purchase.type === 'order') return;

        for (const orderItem of purchase.items) {
            const item = await db.items.get(orderItem.itemId);
            if (item) {
                let newStock = item.stock;
                // Reverse operation
                if (purchase.type === 'bill') {
                    newStock -= orderItem.quantity; // Remove added stock
                } else if (purchase.type === 'return') {
                    newStock += orderItem.quantity; // Add back returned stock
                }
                await db.items.update(item.id!, { stock: newStock });
            }
        }
    };


    // Payment Modal State
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [paymentMode, setPaymentMode] = useState('cash');
    const [paymentNote, setPaymentNote] = useState('');
    const [selectedBillForPayment, setSelectedBillForPayment] = useState<Purchase | null>(null);

    const handleOpenPayment = (po: Purchase) => {
        if (!canUpdate('purchases') || !canUpdate('suppliers')) {
            addToast(t('common.access_denied'), 'error');
            return;
        }
        const balance = po.totalAmount - (po.paidAmount || 0);
        setSelectedBillForPayment(po);
        setPaymentAmount(balance.toString());
        setPaymentDate(new Date().toISOString().split('T')[0]);
        setPaymentMode('cash');
        setPaymentNote('');
        setIsPaymentModalOpen(true);
    };

    const handleSavePayment = async () => {
        if (!canUpdate('purchases') || !canUpdate('suppliers')) {
            addToast(t('common.access_denied'), 'error');
            return;
        }

        if (!selectedBillForPayment || !paymentAmount) return;

        const amount = parseFloat(paymentAmount);
        if (isNaN(amount) || amount <= 0) {
            addToast(t('pos.invalid_amount'), 'error');
            return;
        }

        try {
            await db.transaction('rw', [db.purchases, db.purchasePayments, db.suppliers], async () => {
                // 1. Record Payment
                await db.purchasePayments.add({
                    ...createRecordMetadata(),
                    companyId: selectedBillForPayment.companyId,
                    branchId: selectedBillForPayment.branchId,
                    purchaseId: selectedBillForPayment.id,
                    supplierId: selectedBillForPayment.supplierId!,
                    amount,
                    date: new Date(paymentDate),
                    paymentMode: paymentMode as any,
                    note: paymentNote
                });

                // 2. Update Purchase (Paid Amount & Status)
                const newPaidAmount = (selectedBillForPayment.paidAmount || 0) + amount;
                const newStatus = newPaidAmount >= selectedBillForPayment.totalAmount ? 'completed' : 'pending';

                await db.purchases.update(selectedBillForPayment.id!, {
                    ...updateRecordMetadata(),
                    paidAmount: newPaidAmount,
                    status: newStatus
                });

                // 3. Decrease Supplier Balance (We owe less)
                const supplier = await db.suppliers.get(selectedBillForPayment.supplierId!);
                if (supplier) {
                    await db.suppliers.update(supplier.id!, {
                        ...updateRecordMetadata(),
                        balance: supplier.balance - amount
                    });
                }
            });

            addToast(t('purchases.payment_recorded'), 'success');
            setIsPaymentModalOpen(false);
        } catch (error) {
            console.error(error);
            addToast(t('common.error'), 'error');
        }
    };

    const handleSavePurchase = async (closeModal: boolean = true) => {
        if (editingId ? !canUpdate('purchases') : !canCreate('purchases')) {
            addToast(t('common.access_denied'), 'error');
            return;
        }

        if (!supplier || orderItems.length === 0) {
            addToast(t('purchases.fill_supplier'), 'error');
            return;
        }

        const lineResults = orderItems.map(item => calculateLineItem({
            price: item.cost,
            quantity: item.quantity,
            taxRate: item.taxRate || 0,
            taxType: item.taxType || 'exclusive',
            discount: 0,
            discountType: 'fixed'
        }, settings.applyTax));

        const processedItems = orderItems.map((item: any, idx) => ({
            ...item,
            taxAmount: lineResults[idx].taxAmount,
            netAmount: lineResults[idx].taxableAmount, // Base cost
            total: lineResults[idx].total
        }));

        const totals = calculateDocumentTotals(lineResults, 0, 'fixed', settings.applyTax);
        const { subTotal, taxAmount: taxTotal, grandTotal: totalAmount } = totals;

        const purchaseData: any = {
            orderNumber: orderNumber,
            supplierName: suppliers?.find(s => s.id === editSupplierId)?.name || '',
            items: processedItems,
            subTotal,
            taxAmount: taxTotal,
            totalAmount,
            date: new Date(orderDate),
            dueDate: dueDate ? new Date(dueDate) : undefined,
            paymentType: paymentType as 'cash' | 'card' | 'upi' | 'credit',
            paidAmount: advance,
            notes: notes,
            type: activeTab,
            status: activeTab === 'order' ? 'pending' : 'completed',
            relatedOrderId: relatedOrderId || undefined,
            supplierId: editSupplierId
        };

        try {
            await db.transaction('rw', [db.purchases, db.items, db.suppliers], async () => {
                if (editingId && originalPurchase) {
                    // EDIT MODE
                    await revertStockEffect(originalPurchase); // Revert old stock

                    // Revert Supplier Balance Effect of old purchase
                    if (originalPurchase.supplierId) {
                        const sup = await db.suppliers.get(originalPurchase.supplierId);
                        if (sup) {
                            // Calculate original net debt impact (Total - Paid)
                            const oldPaid = originalPurchase.paidAmount || 0;
                            const oldNet = originalPurchase.totalAmount - oldPaid;

                            // If Bill: We owed (Total-Paid). Revert = Subtract.
                            // If Return: We owed LESS (Total-Paid). Revert = Add (Subtract negative).
                            const oldEffect = originalPurchase.type === 'return' ? -oldNet : oldNet;

                            await db.suppliers.update(sup.id!, {
                                ...updateRecordMetadata(),
                                balance: sup.balance - oldEffect
                            });
                        }
                    }

                    await db.purchases.update(editingId, { ...purchaseData, ...updateRecordMetadata() } as any);
                    await applyStockEffect(orderItems, activeTab, editSupplierId); // Apply new stock

                    // Apply New Supplier Balance Effect
                    if (editSupplierId) {
                        const sup = await db.suppliers.get(editSupplierId);
                        if (sup) {
                            const newPaid = advance || 0;
                            const newNet = totalAmount - newPaid;
                            const newEffect = activeTab === 'return' ? -newNet : newNet;

                            await db.suppliers.update(sup.id!, {
                                ...updateRecordMetadata(),
                                balance: sup.balance + newEffect
                            });
                        }
                    }

                    addToast(t('purchases.updated'), 'success');
                } else {
                    // CREATE MODE
                    const id = await db.purchases.add({ ...purchaseData, ...createRecordMetadata() } as Purchase);
                    await applyStockEffect(orderItems, activeTab, editSupplierId);

                    // Update Supplier Balance
                    if (editSupplierId) {
                        const sup = await db.suppliers.get(editSupplierId);
                        if (sup) {
                            // Bill: We owe more (+). Return: We owe less (-).
                            // Order: No effect until received.
                            if (activeTab === 'bill') {
                                // If advanced paid, balance increases only by remaining? 
                                // Ideally: Balance + TotalAmount. Payment reduces it separately. 
                                // If we record 'paidAmount' here, we should treat it as immediate payment?
                                // Yes, let's treat 'advance' as payment.

                                await db.suppliers.update(sup.id!, {
                                    ...updateRecordMetadata(),
                                    balance: sup.balance + totalAmount - advance
                                });
                            } else if (activeTab === 'return') {
                                await db.suppliers.update(sup.id!, {
                                    ...updateRecordMetadata(),
                                    balance: sup.balance - totalAmount
                                });
                            }
                        }
                    }

                    // If this was a "Receive Order" action, update the original order status
                    if (relatedOrderId && activeTab === 'bill') {
                        await db.purchases.update(relatedOrderId, { 
                            ...updateRecordMetadata(),
                            status: 'completed' 
                        });
                    }

                    addToast(t('purchases.created'), 'success');
                    addNotification(t('purchases.created', { type: `${activeTab} #${purchaseData.orderNumber}` }), 'success', id);
                }
            });

            resetForm();
            if (closeModal) setIsModalOpen(false);
        } catch (e) {
            console.error(e);
            addToast(t('common.error'), 'error');
        }
    };

    const [orderToDelete, setOrderToDelete] = useState<Purchase | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDeleteClick = (po: Purchase) => {
        if (!canDelete('purchases')) {
            addToast(t('common.access_denied'), 'error');
            return;
        }
        setOrderToDelete(po);
    };

    const handleConfirmDelete = async () => {
        if (!canDelete('purchases')) {
            addToast(t('common.access_denied'), 'error');
            return;
        }

        if (orderToDelete && orderToDelete.id) {
            setIsDeleting(true);
            try {
                await revertStockEffect(orderToDelete); // Revert stock
                await db.purchases.delete(orderToDelete.id);
                addToast(t('purchases.record_deleted'), 'success');
            } catch (error) {
                console.error(error);
                addToast(t('common.error'), 'error');
            } finally {
                setIsDeleting(false);
                setOrderToDelete(null);
            }
        }
    };

    const handleEditPurchase = (po: Purchase) => {
        setEditingId(po.id!);
        setOriginalPurchase(po);
        setRelatedOrderId(po.relatedOrderId || null);
        setActiveTab(po.type || 'bill');

        setSupplier(po.supplierName);
        setEditSupplierId(po.supplierId);
        setOrderNumber(po.orderNumber);
        setOrderDate(new Date(po.date).toISOString().split('T')[0]);
        setDueDate(po.dueDate ? new Date(po.dueDate).toISOString().split('T')[0] : '');
        setOrderItems(po.items);
        setPaidAmount(po.paidAmount?.toString() || '');
        setPaymentType(po.paymentType || 'cash');
        setNotes(po.notes || '');

        setIsModalOpen(true);
    };

    const convertOrderToBill = (po: Purchase) => {
        resetForm();
        setRelatedOrderId(po.id!);
        setActiveTab('bill');

        setSupplier(po.supplierName);
        setOrderDate(new Date().toISOString().split('T')[0]); // New Date for Bill
        setOrderItems(po.items); // Copy items
        // Don't copy Order Number, let it generate a BILL number
        setIsModalOpen(true);
    };

    /* const createReturnFromBill = (po: Purchase) => {
        resetForm();
        setRelatedOrderId(po.id!);
        setActiveTab('return');

        setSupplier(po.supplierName);
        setOrderDate(new Date().toISOString().split('T')[0]);
        setOrderItems(po.items); // Start with all items, user triggers removals
        setNotes(`${t('purchases.return_for_bill')} ${po.orderNumber}`);
        setIsModalOpen(true);
    }; */


    return (
        <div className="space-y-8 pb-10">
            {/* Premium Header Bar */}
            <div className="bg-white/40 dark:bg-slate-800/20 backdrop-blur-2xl p-8 rounded-[3rem] shadow-2xl border border-white/50 dark:border-slate-700/30 relative overflow-hidden group">
                {/* Decorative background glow */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 blur-[100px] -mr-48 -mt-48 transition-opacity duration-1000 group-hover:opacity-100 opacity-50 pointer-events-none" />
                
                <div className="flex flex-col gap-8 relative z-10">
                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-6">
                        <div>
                            <h1 className="text-4xl font-black dark:text-white flex items-center gap-4 tracking-tighter uppercase">
                                <div className="p-4 bg-slate-900 dark:bg-blue-600 text-white rounded-[2rem] shadow-2xl shadow-blue-500/20">
                                    <ShoppingCart size={32} strokeWidth={2.5} />
                                </div>
                                <span>{t('purchases.title')}</span>
                            </h1>
                            <p className="text-slate-500 dark:text-slate-400 font-bold mt-2 ml-2 text-xs uppercase tracking-[0.3em] flex items-center gap-2">
                                <Sparkles size={14} className="text-amber-500" />
                                {t('purchases.stock_and_vendor_management')}
                            </p>
                        </div>

                        <div className="flex items-center gap-4">
                            {canCreate('purchases') && (
                                <motion.button
                                    whileHover={{ scale: 1.05, y: -2 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => { resetForm(); setIsModalOpen(true); }}
                                    className={clsx(
                                        "flex items-center gap-3 px-8 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-2xl transition-all group",
                                        activeTab === 'return' 
                                            ? 'bg-amber-600 text-white shadow-amber-500/20' 
                                            : 'bg-slate-900 dark:bg-blue-600 text-white shadow-blue-500/20'
                                    )}
                                >
                                    <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                                    <span>
                                        {activeTab === 'bill' ? t('purchases.new_bill') : activeTab === 'return' ? t('purchases.new_return') : t('purchases.new_order')}
                                    </span>
                                </motion.button>
                            )}
                        </div>
                    </div>

                    <div className="h-px bg-gradient-to-r from-slate-200 dark:from-slate-700/50 via-transparent to-transparent w-full" />

                    <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-8">
                        {/* Custom Tab Navigation */}
                        <div className="flex flex-wrap items-center gap-3 bg-slate-100/50 dark:bg-slate-900/40 p-2 rounded-[2.5rem] border border-slate-200/50 dark:border-slate-800/50 shadow-inner">
                            {[
                                { id: 'bill', icon: FileText, label: t('purchases.bill') },
                                { id: 'order', icon: ShoppingCart, label: t('purchases.order') },
                                { id: 'return', icon: RotateCcw, label: t('purchases.return') },
                            ].map(({ id, icon: Icon, label }) => (
                                <button
                                    key={id}
                                    onClick={() => setActiveTab(id as typeof activeTab)}
                                    className={clsx(
                                        "flex items-center gap-3 px-6 py-3.5 rounded-[2rem] text-xs font-black uppercase tracking-widest transition-all relative overflow-hidden",
                                        activeTab === id
                                            ? 'bg-white dark:bg-blue-600 text-slate-900 dark:text-white shadow-xl'
                                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                    )}
                                >
                                    <Icon size={18} strokeWidth={2.5} />
                                    {label}
                                    {activeTab === id && (
                                        <motion.div layoutId="purchase-tab-active" className="absolute inset-0 bg-blue-600/5 dark:bg-white/10" />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Premium Date Filters */}
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-4 bg-white/50 dark:bg-slate-900/50 rounded-2xl p-2 px-5 border border-slate-200/50 dark:border-slate-800 shadow-xl">
                                <div className="flex items-center gap-3">
                                    <div className="flex flex-col">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">{t('purchases.from')}</label>
                                        <input
                                            type="datetime-local"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="bg-transparent border-0 p-0 text-[11px] font-black uppercase tracking-tighter w-[140px] focus:ring-0 text-slate-700 dark:text-slate-300 dark:[color-scheme:dark]"
                                        />
                                    </div>
                                    <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 mx-2" />
                                    <div className="flex flex-col">
                                        <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1">{t('purchases.to')}</label>
                                        <input
                                            type="datetime-local"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="bg-transparent border-0 p-0 text-[11px] font-black uppercase tracking-tighter w-[140px] focus:ring-0 text-slate-700 dark:text-slate-300 dark:[color-scheme:dark]"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* List Section */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.4 }}
                    className="bg-white/40 dark:bg-slate-800/20 backdrop-blur-2xl rounded-[3rem] shadow-2xl border border-white/50 dark:border-slate-700/30 overflow-hidden"
                >
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-900/[0.02] dark:bg-white/[0.02] border-b border-slate-200/50 dark:border-slate-700/50">
                                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t('purchases.date')}</th>
                                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t('purchases.ref_no')}</th>
                                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t('purchases.supplier')}</th>
                                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t('purchases.items')}</th>
                                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{t('purchases.total')}</th>
                                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{activeTab === 'order' ? t('purchases.status') : t('purchases.balance')}</th>
                                    <th className="p-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-right">{t('purchases.actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200/30 dark:divide-slate-700/30">
                                {filteredPurchases?.map((po: any, _rowIndex: any) => {
                                    const paid = po.paidAmount || 0;
                                    const balance = po.totalAmount - paid;
                                    return (
                                        <motion.tr
                                            key={po.id || po.orderNumber}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            className="group hover:bg-blue-600/[0.02] dark:hover:bg-blue-400/[0.02] transition-all relative"
                                        >
                                            <td className="p-6 font-bold text-slate-600 dark:text-slate-400 text-xs">
                                                {formatDate(po.date)}
                                            </td>
                                            <td className="p-6">
                                                <span className="font-mono text-[10px] font-black text-blue-600 dark:text-blue-400 bg-blue-500/5 px-3 py-1.5 rounded-full border border-blue-500/10">
                                                    {po.orderNumber}
                                                </span>
                                            </td>
                                            <td className="p-6 font-black text-slate-800 dark:text-white uppercase text-xs tracking-tight">
                                                {po.supplierName}
                                            </td>
                                            <td className="p-6 text-xs font-bold text-slate-500">
                                                {t('purchases.item_count', { count: po.items.length })}
                                            </td>
                                            <td className="p-6">
                                                <span className={clsx(
                                                    "font-black text-sm tracking-tight",
                                                    activeTab === 'return' ? 'text-amber-500' : 'text-slate-900 dark:text-white'
                                                )}>
                                                    {formatCurrency(po.totalAmount)}
                                                </span>
                                            </td>
                                            <td className="p-6">
                                                {activeTab === 'order' ? (
                                                    <span className={clsx(
                                                        "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border",
                                                        po.status === 'completed' 
                                                            ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' 
                                                            : 'bg-blue-500/10 text-blue-600 border-blue-500/20'
                                                    )}>
                                                        {po.status === 'completed' ? t('purchases.status_completed') : t('purchases.status_pending')}
                                                    </span>
                                                ) : (
                                                    balance > 0.01 ?
                                                        <span className="text-rose-500 font-black text-xs tracking-tight">{formatCurrency(balance)}</span> :
                                                        <span className="text-emerald-500 font-black text-[10px] uppercase tracking-widest bg-emerald-500/5 px-3 py-1.5 rounded-lg border border-emerald-500/10">{t('purchases.settled')}</span>
                                                )}
                                            </td>
                                            <td className="p-6">
                                                <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-4 group-hover:translate-x-0">
                                                    <button onClick={() => setViewOrder(po)} className="p-2.5 text-slate-400 hover:text-blue-500 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700 shadow-sm" title={t('purchases.view_details')}>
                                                        <Eye size={18} strokeWidth={2.5} />
                                                    </button>

                                                    {activeTab === 'order' && po.status !== 'completed' && (
                                                        <button onClick={() => convertOrderToBill(po)} className="p-2.5 text-slate-400 hover:text-emerald-500 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700 shadow-sm" title={t('purchases.tooltip_receive')}>
                                                            <CheckCircle size={18} strokeWidth={2.5} />
                                                        </button>
                                                    )}

                                                    {activeTab === 'bill' && balance > 0.01 && (
                                                        <button onClick={() => handleOpenPayment(po)} className="p-2.5 text-slate-400 hover:text-emerald-500 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700 shadow-sm" title={t('purchases.tooltip_pay')}>
                                                            <CreditCard size={18} strokeWidth={2.5} />
                                                        </button>
                                                    )}

                                                    <button onClick={() => handlePrint(po)} className="p-2.5 text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700 shadow-sm" title={t('common.print')}>
                                                        <Printer size={18} strokeWidth={2.5} />
                                                    </button>

                                                    <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />

                                                    {canUpdate('purchases') && (
                                                        <button onClick={() => handleEditPurchase(po)} className="p-2.5 text-slate-400 hover:text-blue-500 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700 shadow-sm" title={t('common.edit')}>
                                                            <Edit size={18} strokeWidth={2.5} />
                                                        </button>
                                                    )}

                                                    {canDelete('purchases') && (
                                                        <button onClick={() => handleDeleteClick(po)} className="p-2.5 text-slate-400 hover:text-rose-500 hover:bg-white dark:hover:bg-slate-800 rounded-xl transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700 shadow-sm" title={t('common.delete')}>
                                                            <Trash2 size={18} strokeWidth={2.5} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </motion.tr>
                                    )
                                })}
                                {filteredPurchases?.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="p-20 text-center">
                                            <div className="flex flex-col items-center gap-4 opacity-30">
                                                <ShoppingCart size={64} strokeWidth={1} />
                                                <p className="font-black text-xs uppercase tracking-[0.3em]">{t('purchases.no_records')}</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </motion.div>
            </AnimatePresence>

            {/* Payment Modal */}
            <Modal
                isOpen={isPaymentModalOpen}
                onClose={() => setIsPaymentModalOpen(false)}
                title={t('purchases.record_payment')}
                maxWidth="sm"
            >
                <div className="p-8 space-y-6">
                    <div className="bg-slate-900 dark:bg-blue-600 p-6 rounded-[2rem] text-white shadow-2xl shadow-blue-500/20 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 blur-[40px] -mr-16 -mt-16" />
                        <div className="relative z-10">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60 mb-1">{t('purchases.balance_due')}</p>
                            <p className="text-3xl font-black tracking-tighter">
                                {formatCurrency((selectedBillForPayment?.totalAmount || 0) - (selectedBillForPayment?.paidAmount || 0))}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('purchases.payment_amount')}</label>
                            <input
                                type="number"
                                className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                                value={paymentAmount}
                                onChange={e => setPaymentAmount(e.target.value)}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('purchases.payment_date')}</label>
                                <input
                                    type="date"
                                    className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                                    value={paymentDate}
                                    onChange={e => setPaymentDate(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('purchases.payment_mode')}</label>
                                <select
                                    className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                                    value={paymentMode}
                                    onChange={e => setPaymentMode(e.target.value)}
                                >
                                    <option value="cash">{t('pos.pay_cash')}</option>
                                    <option value="card">{t('pos.pay_card')}</option>
                                    <option value="upi">{t('pos.pay_digital')}</option>
                                    <option value="bank_transfer">{t('sales.bank_transfer')}</option>
                                </select>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('purchases.notes')}</label>
                            <textarea
                                className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                                value={paymentNote}
                                onChange={e => setPaymentNote(e.target.value)}
                                rows={2}
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-4 pt-4">
                        <button
                            onClick={() => setIsPaymentModalOpen(false)}
                            className="px-8 py-4 text-slate-400 hover:text-slate-900 dark:hover:text-white font-black text-xs uppercase tracking-widest transition-all"
                        >
                            {t('common.cancel')}
                        </button>
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleSavePayment}
                            className="px-10 py-4 bg-emerald-500 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-2xl shadow-emerald-500/20"
                        >
                            {t('purchases.save_payment')}
                        </motion.button>
                    </div>
                </div>
            </Modal>

            <PurchaseDetailsModal
                isOpen={!!viewOrder}
                onClose={() => setViewOrder(null)}
                purchase={viewOrder}
            />

            <BarcodeModal
                isOpen={isLabelModalOpen}
                onClose={() => setIsLabelModalOpen(false)}
                items={selectedItemsForLabel}
            />

        {/* Create Modal */}
        <Modal
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            title={activeTab === 'bill' ? t('purchases.new_bill') : activeTab === 'return' ? t('purchases.new_return') : t('purchases.new_order')}
            maxWidth="7xl"
            className="h-[95vh] rounded-[3rem] overflow-hidden"
        >
            <div className="flex-1 overflow-hidden flex flex-col md:flex-row h-full bg-slate-50 dark:bg-slate-900/50">
                {/* Left: Item Selector */}
                <div className="w-full md:w-[360px] border-b md:border-b-0 md:border-r border-slate-200 dark:border-slate-800 p-4 md:p-6 flex flex-col gap-4 bg-white/40 dark:bg-slate-800/10 backdrop-blur-xl shrink-0 h-1/2 md:h-full overflow-hidden">
                    <div className="flex items-center gap-3 mb-1 shrink-0">
                            <div className="p-2.5 bg-blue-600/10 text-blue-600 rounded-xl">
                                <Plus size={18} strokeWidth={3} />
                            </div>
                            <h3 className="font-black text-base dark:text-white tracking-tight uppercase">{t('purchases.select_items')}</h3>
                        </div>

                        <div className="space-y-3">
                            <div className="relative group">
                                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={16} />
                                <input
                                    type="text"
                                    placeholder={t('purchases.search_placeholder')}
                                    className="w-full pl-11 pr-5 py-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-bold text-xs outline-none focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white shadow-inner"
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                            <button
                                onClick={() => setIsAddItemOpen(true)}
                                className="w-full px-5 py-3 bg-blue-600/5 text-blue-600 dark:text-blue-400 rounded-xl hover:bg-blue-600 hover:text-white transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest border border-blue-500/20"
                            >
                                <Plus size={16} strokeWidth={2.5} /> {t('purchases.new_item')}
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto pr-1 space-y-2.5 custom-scrollbar">
                            {filteredInventory?.map((item: any) => (
                                <motion.button
                                    whileHover={{ x: 4 }}
                                    key={item.id}
                                    onClick={() => addToOrder(item)}
                                    className="w-full text-left p-4 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-blue-500 transition-all shadow-sm group"
                                >
                                    <div className="flex justify-between items-start gap-2">
                                        <span className="font-black text-slate-800 dark:text-white uppercase text-[11px] tracking-tight line-clamp-2 leading-tight flex-1">{item.name}</span>
                                        <span className="text-[9px] font-black bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded-md text-slate-500 dark:text-slate-400 shrink-0">
                                            {item.stock}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 mt-2">
                                        <span className="text-[9px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-widest">{formatCurrency(item.purchasePrice)}</span>
                                        <div className="w-1 h-1 rounded-full bg-slate-300" />
                                        <span className="text-[9px] font-bold text-slate-400 uppercase line-clamp-1">{item.barcode}</span>
                                    </div>
                                </motion.button>
                            ))}
                        </div>
                    </div>

                    {/* Right: Form & Details */}
                    <div className="w-full md:w-2/3 flex flex-col h-1/2 md:h-full bg-white dark:bg-slate-800/20 backdrop-blur-3xl">
                        <div className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8 md:space-y-10 custom-scrollbar">

                            {/* Top Row: Ref & Date */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('purchases.ref_no')}</label>
                                    <input
                                        type="text"
                                        className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-black tracking-tight text-slate-800 dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                                        value={orderNumber}
                                        onChange={e => setOrderNumber(e.target.value)}
                                        placeholder={t('purchases.auto_generated')}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('purchases.date')}</label>
                                    <input
                                        type="date"
                                        className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-black tracking-tight text-slate-800 dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner dark:[color-scheme:dark]"
                                        value={orderDate}
                                        onChange={e => setOrderDate(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Supplier Section */}
                            <div className="space-y-4">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('purchases.supplier_name')}</label>
                                <div className="flex gap-4">
                                    <div className="relative flex-1">
                                        <select
                                            className="w-full p-4 pl-6 pr-12 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-black tracking-tight text-slate-800 dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all appearance-none shadow-inner"
                                            value={editSupplierId || ''}
                                            onChange={e => {
                                                const id = e.target.value;
                                                const s = suppliers?.find(sup => sup.id === id);
                                                setEditSupplierId(id);
                                                setSupplier(s ? s.name : '');
                                            }}
                                        >
                                            <option value="">{t('purchases.select_supplier')}</option>
                                            {suppliers?.map((s: any) => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                        <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                            <Building size={18} />
                                        </div>
                                    </div>
                                    <motion.button
                                        whileHover={{ scale: 1.05 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => setIsAddSupplierOpen(true)}
                                        className="p-4 bg-slate-900 dark:bg-blue-600 text-white rounded-2xl shadow-xl shadow-blue-500/10"
                                    >
                                        <Plus size={24} strokeWidth={2.5} />
                                    </motion.button>
                                </div>
                                <input
                                    type="text"
                                    className="w-full p-4 rounded-2xl bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 font-bold text-xs dark:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all"
                                    value={supplier}
                                    onChange={e => {
                                        setSupplier(e.target.value);
                                        setEditSupplierId(undefined);
                                    }}
                                    placeholder={t('purchases.enter_supplier_name')}
                                />
                            </div>

                            {/* Items Table Container */}
                            <div className="space-y-6">
                                <div className="flex items-center justify-between px-2">
                                    <h3 className="font-black text-sm text-slate-500 uppercase tracking-[0.2em]">{t('purchases.items_header', { count: orderItems.length })}</h3>
                                </div>

                                <div className="rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 overflow-x-auto shadow-2xl shadow-slate-900/5 custom-scrollbar">
                                    <table className="w-full text-left whitespace-nowrap min-w-[700px]">
                                        <thead>
                                            <tr className="bg-slate-900/5 dark:bg-white/5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                <th className="p-5 text-center w-12">#</th>
                                                <th className="p-5">{t('inventory.item_name')}</th>
                                                <th className="p-5 text-center">{t('inventory.unit')}</th>
                                                <th className="p-5 text-center">{t('inventory.qty')}</th>
                                                <th className="p-5 text-right">{t('inventory.cost')}</th>
                                                <th className="p-5 text-center">Tax%</th>
                                                <th className="p-5 text-right">{t('inventory.total')}</th>
                                                <th className="p-5 text-center w-12"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                            {orderItems.map((item: any, index: any) => {
                                                const qty = item.quantity || 0;
                                                const cost = item.cost || 0;
                                                const taxRate = item.taxRate || 0;
                                                const taxType = item.taxType || 'exclusive';
                                                let lineTotal = 0;
                                                if (taxType === 'inclusive') {
                                                    lineTotal = cost * qty;
                                                } else {
                                                    lineTotal = (cost * qty) * (1 + taxRate / 100);
                                                }

                                                return (
                                                    <tr key={item.itemId} className="group hover:bg-blue-600/[0.02] transition-colors">
                                                        <td className="p-4 text-center font-mono text-[10px] text-slate-400">{index + 1}</td>
                                                        <td className="p-4">
                                                            <p className="font-black text-slate-800 dark:text-white uppercase text-xs tracking-tight truncate max-w-[150px]">{item.name}</p>
                                                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{item.taxType}</span>
                                                        </td>
                                                        <td className="p-4">
                                                            <input
                                                                type="text"
                                                                className="w-16 p-2 text-[11px] font-black text-center bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-blue-500 outline-none dark:text-white uppercase"
                                                                value={item.unit || ''}
                                                                onChange={e => updateOrderItem(item.itemId, 'unit', e.target.value)}
                                                            />
                                                        </td>
                                                        <td className="p-4">
                                                            <input
                                                                type="number"
                                                                className="w-16 p-2 text-[11px] font-black text-center bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-blue-500 outline-none dark:text-white"
                                                                value={item.quantity}
                                                                onChange={e => updateOrderItem(item.itemId, 'quantity', parseFloat(e.target.value))}
                                                            />
                                                        </td>
                                                        <td className="p-4">
                                                            <input
                                                                type="number"
                                                                className="w-20 p-2 text-[11px] font-black text-right bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-blue-500 outline-none dark:text-white"
                                                                value={item.cost}
                                                                onChange={e => updateOrderItem(item.itemId, 'cost', parseFloat(e.target.value))}
                                                            />
                                                        </td>
                                                        <td className="p-4">
                                                            <input
                                                                type="number"
                                                                className="w-14 p-2 text-[11px] font-black text-center bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-blue-500 outline-none dark:text-white"
                                                                value={item.taxRate || 0}
                                                                onChange={e => updateOrderItem(item.itemId, 'taxRate', parseFloat(e.target.value))}
                                                            />
                                                        </td>
                                                        <td className="p-4 text-right font-black text-xs text-slate-800 dark:text-white tracking-tight">
                                                            {formatCurrency(lineTotal)}
                                                        </td>
                                                        <td className="p-4 text-center">
                                                            <button onClick={() => removeOrderItem(item.itemId)} className="p-2 text-slate-400 hover:text-rose-500 transition-colors">
                                                                <Trash2 size={16} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Summary & Financials */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 pt-10">
                                <div className="space-y-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('purchases.payment_type')}</label>
                                        <select
                                            className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-black text-xs dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all appearance-none"
                                            value={paymentType}
                                            onChange={e => setPaymentType(e.target.value)}
                                        >
                                            <option value="cash">{t('pos.pay_cash')}</option>
                                            <option value="card">{t('pos.pay_card')}</option>
                                            <option value="upi">{t('pos.pay_digital')}</option>
                                            <option value="credit">{t('pos.pay_credit')}</option>
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('purchases.notes')}</label>
                                        <textarea
                                            className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-bold text-xs dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                                            rows={3}
                                            placeholder="..."
                                            value={notes}
                                            onChange={e => setNotes(e.target.value)}
                                        />
                                    </div>
                                </div>

                                <div className="bg-slate-900 dark:bg-blue-600/10 p-10 rounded-[3rem] border border-slate-800 dark:border-blue-500/20 shadow-2xl relative overflow-hidden group">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 blur-[100px] -mr-32 -mt-32" />
                                    
                                    <div className="space-y-8 relative z-10">
                                        <div className="flex justify-between items-center text-white/50 text-[10px] font-black uppercase tracking-widest">
                                            <span>{t('purchases.sub_total')}</span>
                                            <span>{formatCurrency(subTotal)}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-white/50 text-[10px] font-black uppercase tracking-widest">
                                            <span>{t('purchases.tax_amount')}</span>
                                            <span>{formatCurrency(taxAmount)}</span>
                                        </div>
                                        <div className="h-px bg-white/10" />
                                        <div className="flex justify-between items-end">
                                            <span className="text-white font-black text-xs uppercase tracking-[0.2em] mb-1">{t('purchases.total_amount')}</span>
                                            <span className="text-4xl font-black text-white tracking-tighter">{formatCurrency(totalAmount)}</span>
                                        </div>
                                        
                                        <div className="space-y-4 pt-4">
                                            <div className="flex flex-col gap-2">
                                                <label className="text-[9px] font-black text-white/40 uppercase tracking-widest ml-1">{activeTab === 'return' ? t('purchases.refund_received') : t('purchases.paid_amount')}</label>
                                                <input
                                                    type="number"
                                                    className="w-full p-4 bg-white/5 rounded-2xl border border-white/10 font-black text-xl text-white text-right outline-none focus:bg-white/10 transition-all shadow-inner"
                                                    value={paidAmount}
                                                    onChange={e => setPaidAmount(e.target.value)}
                                                />
                                            </div>
                                            <div className="flex justify-between items-center bg-white/5 p-5 rounded-[1.5rem] border border-white/5">
                                                <span className="text-[10px] font-black text-white/60 uppercase tracking-widest">{t('purchases.balance_due')}</span>
                                                <span className="text-xl font-black text-white tracking-tight">{formatCurrency(balanceDue)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer Actions */}
                        <div className="p-6 md:p-8 border-t border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex flex-col-reverse sm:flex-row justify-between items-center gap-4 md:gap-6 shrink-0">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-8 py-4 font-black text-xs text-slate-400 uppercase tracking-widest hover:text-slate-900 dark:hover:text-white transition-all"
                            >
                                {t('common.cancel')}
                            </button>
                            <div className="flex gap-4">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={() => handleSavePurchase(false)}
                                    className="px-8 py-4 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest transition-all"
                                >
                                    {t('purchases.save_new')}
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.05, y: -2 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => handleSavePurchase(true)}
                                    className={clsx(
                                        "px-12 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest text-white shadow-2xl flex items-center gap-3 transition-all",
                                        activeTab === 'return' ? 'bg-amber-600 shadow-amber-500/20' : 'bg-slate-900 dark:bg-blue-600 shadow-blue-500/20'
                                    )}
                                >
                                    <Save size={18} strokeWidth={2.5} /> <span>{t('common.save')}</span>
                                </motion.button>
                            </div>
                        </div>

                    </div>
                </div>
            </Modal>

            <ConfirmationModal
                isOpen={!!orderToDelete}
                onClose={() => setOrderToDelete(null)}
                onConfirm={handleConfirmDelete}
                title={t('purchases.delete_title')}
                message={t('purchases.delete_confirm')}
                confirmText={t('common.delete')}
                variant="danger"
                isLoading={isDeleting}
            />

            {/* Quick Add Supplier Modal */}
            <Modal
                isOpen={isAddSupplierOpen}
                onClose={() => setIsAddSupplierOpen(false)}
                title={t('purchases.add_supplier_title')}
                maxWidth="md"
            >
                <div className="p-10 space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('purchases.supplier_name')}</label>
                        <input
                            type="text"
                            className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                            value={newSupplierName}
                            onChange={e => setNewSupplierName(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('purchases.phone_number')}</label>
                        <input
                            type="text"
                            className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                            value={newSupplierPhone}
                            onChange={e => setNewSupplierPhone(e.target.value)}
                        />
                    </div>
                    <div className="flex justify-end gap-4 pt-6">
                        <button
                            onClick={() => setIsAddSupplierOpen(false)}
                            className="px-8 py-4 text-slate-400 hover:text-slate-900 dark:hover:text-white font-black text-xs uppercase tracking-widest transition-all"
                        >
                            {t('common.cancel')}
                        </button>
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={async () => {
                                if (!canCreate('suppliers')) {
                                    addToast(t('common.access_denied'), 'error');
                                    return;
                                }
                                if (!newSupplierName.trim()) {
                                    addToast(t('purchases.supplier_required'), 'error');
                                    return;
                                }
                                try {
                                    const id = await db.suppliers.add({
                                        ...createRecordMetadata(),
                                        name: newSupplierName,
                                        phone: newSupplierPhone || '',
                                        email: '',
                                        location: '',
                                        taxNumber: '',
                                        balance: 0
                                    });
                                    setIsAddSupplierOpen(false);
                                    setNewSupplierName('');
                                    setNewSupplierPhone('');
                                    setEditSupplierId(id as string);
                                    setSupplier(newSupplierName);
                                    addToast(t('purchases.supplier_added'), 'success');
                                } catch (error) {
                                    console.error(error);
                                    addToast(t('purchases.supplier_add_failed'), 'error');
                                }
                            }}
                            className="px-10 py-4 bg-blue-600 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-2xl shadow-blue-500/20"
                        >
                            {t('purchases.save_select')}
                        </motion.button>
                    </div>
                </div>
            </Modal>

            {/* Quick Add Item Modal */}
            <Modal
                isOpen={isAddItemOpen}
                onClose={() => setIsAddItemOpen(false)}
                title={t('purchases.add_item_title')}
                maxWidth="md"
            >
                <div className="p-10 space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('purchases.item_name_label')}</label>
                        <input
                            type="text"
                            className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                            value={newItemName}
                            onChange={e => setNewItemName(e.target.value)}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('inventory.product_image') || 'Product Image'}</label>
                        <div className="flex gap-4 items-center">
                            {newItemImage ? (
                                <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shrink-0">
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
                                <label className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-4 cursor-pointer hover:border-blue-500 transition-all bg-slate-50/50 dark:bg-slate-900/30 group">
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
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('inventory.barcode') || 'Barcode'}</label>
                        <div className="flex gap-4">
                            <input
                                type="text"
                                className="flex-1 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                                value={newItemBarcode}
                                onChange={e => setNewItemBarcode(e.target.value)}
                            />
                            <motion.button
                                whileTap={{ rotate: 180 }}
                                type="button"
                                onClick={() => setNewItemBarcode(Math.floor(10000000 + Math.random() * 90000000).toString())}
                                className="p-4 bg-purple-500/10 text-purple-600 rounded-2xl"
                            >
                                <Wand2 size={24} strokeWidth={2.5} />
                            </motion.button>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('purchases.cost_label')}</label>
                            <input
                                type="number"
                                className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner text-right"
                                value={newItemCost}
                                onChange={e => setNewItemCost(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('purchases.price_label')}</label>
                            <input
                                type="number"
                                className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner text-right"
                                value={newItemPrice}
                                onChange={e => setNewItemPrice(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('inventory.tax_type')}</label>
                            <select
                                className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                                value={newItemTaxType}
                                onChange={e => setNewItemTaxType(e.target.value)}
                            >
                                <option value="exclusive">{t('inventory.tax_exclusive')}</option>
                                <option value="inclusive">{t('inventory.tax_inclusive')}</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('inventory.unit')}</label>
                            <input
                                type="text"
                                className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                                value={newItemUnit}
                                onChange={e => setNewItemUnit(e.target.value)}
                                placeholder="pcs"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-4 pt-6">
                        <button
                            onClick={() => {
                                setIsAddItemOpen(false);
                                setNewItemImage('');
                            }}
                            className="px-8 py-4 text-slate-400 hover:text-slate-900 dark:hover:text-white font-black text-xs uppercase tracking-widest transition-all"
                        >
                            {t('common.cancel')}
                        </button>
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={async () => {
                                if (!canCreate('inventory')) {
                                    addToast(t('common.access_denied'), 'error');
                                    return;
                                }
                                if (!newItemName.trim() || !newItemCost) {
                                    addToast(t('purchases.name_cost_required'), 'error');
                                    return;
                                }
                                try {
                                    const cost = parseFloat(newItemCost);
                                    const stock = parseInt(newItemStock) || 0;
                                    const newId = await db.items.add({
                                        ...createRecordMetadata(),
                                        name: newItemName,
                                        purchasePrice: cost,
                                        salePrice: parseFloat(newItemPrice) || cost,
                                        stock: stock,
                                        minStock: 5,
                                        taxType: newItemTaxType as 'inclusive' | 'exclusive',
                                        taxRate: newItemTaxRate,
                                        unit: newItemUnit,
                                        barcode: newItemBarcode,
                                        supplierId: editSupplierId,
                                        image: newItemImage
                                    });
                                    addToOrder({
                                        ...createRecordMetadata(),
                                        id: newId as string,
                                        name: newItemName,
                                        purchasePrice: cost,
                                        stock: stock,
                                        salePrice: parseFloat(newItemPrice) || cost,
                                        minStock: 5,
                                        taxType: newItemTaxType as 'inclusive' | 'exclusive',
                                        taxRate: newItemTaxRate,
                                        unit: newItemUnit,
                                        barcode: newItemBarcode,
                                        image: newItemImage
                                    } as Item);
                                    setIsAddItemOpen(false);
                                    setNewItemName('');
                                    setNewItemBarcode('');
                                    setNewItemCost('');
                                    setNewItemPrice('');
                                    setNewItemStock('');
                                    setNewItemUnit('');
                                    setNewItemTaxType('exclusive');
                                    setNewItemTaxRate(0);
                                    setNewItemImage('');
                                    addToast(t('purchases.item_created_msg'), 'success');
                                } catch (error) {
                                    console.error(error);
                                    addToast(t('sales.item_add_failed'), 'error');
                                }
                            }}
                            className="px-10 py-4 bg-blue-600 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-2xl shadow-blue-500/20"
                        >
                            {t('purchases.create_add')}
                        </motion.button>
                    </div>
                </div>
            </Modal>
            {selectedOrderForShare && (
                <ShareModal
                    isOpen={shareModalOpen}
                    onClose={() => {
                        setShareModalOpen(false);
                        setSelectedOrderForShare(null);
                    }}
                    data={selectedOrderForShare}
                    type="purchase"
                />
            )}
        </div>
    );
};

export default PurchaseOrders;
