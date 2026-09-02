import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { db, createRecordMetadata, matchesActiveScope, type Invoice } from '../../services/db';
import { calculateLineItem, calculateDocumentTotals } from '../../utils/financials';

import type { Item, Customer, InvoiceItem } from '../../services/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, ShoppingCart, User, CreditCard, ShieldOff, LayoutGrid, Archive, ArrowLeft, Clock, UserPlus, XCircle, Sparkles, Plus, Minus, Trash2, Weight, FileText } from 'lucide-react';
import CheckoutModal from './CheckoutModal';
import ShiftModal from './ShiftModal';
import ItemCard from '../../components/POS/ItemCard';
import CartItem from './components/CartItem';
import { useSettings } from '../../contexts/SettingsContext';
import { useKeyboard } from '../../contexts/KeyboardContext';
import { scaleService } from '../../services/scaleService';
import { shiftService } from '../../services/shiftService';
import { useNotification } from '../../contexts/NotificationContext';
import { useAuth } from '../../contexts/AuthContext';
import CustomerForm from '../Customers/CustomerForm';
import { recommendationService } from '../../services/recommendationService';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

// Persistent storage to survive React StrictMode remounts for the same navigation transition
let pendingTransitionState: { editInvoice?: Invoice; hidePayLater?: boolean } | null = null;
let lastCapturedTime: number = 0;

const PosTerminal: React.FC = () => {
    const { formatCurrency, settings } = useSettings();
    const { addToast } = useNotification();
    const { registerShortcut, unregisterShortcut } = useKeyboard();
    const { canView, canCreate, canUpdate, activeCompanyId, activeBranchId, activeBranch, user } = useAuth();
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();

    // --- State & Refs ---
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedSearch(search), 300);
        return () => clearTimeout(handler);
    }, [search]);

    const [showArabicName, setShowArabicName] = useState(false);
    const [showCustomerSearch, setShowCustomerSearch] = useState(false);
    const [customerSearchTerm, setCustomerSearchTerm] = useState('');
    const [debouncedCustomerSearchTerm, setDebouncedCustomerSearchTerm] = useState('');

    useEffect(() => {
        const handler = setTimeout(() => setDebouncedCustomerSearchTerm(customerSearchTerm), 300);
        return () => clearTimeout(handler);
    }, [customerSearchTerm]);
    const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
    const [kitchenNote, setKitchenNote] = useState('');
    const [orderType, setOrderType] = useState<'dine_in' | 'parcel' | 'pickup' | 'delivery'>('dine_in');
    const [isCustomerFormOpen, setIsCustomerFormOpen] = useState(false);
    const [activeShift, setActiveShift] = useState<any>(null);
    const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
    const [shiftMode, setShiftMode] = useState<'open' | 'close'>('open');
    const [visibleItemsCount, setVisibleItemsCount] = useState(50);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
    const [recommendations, setRecommendations] = useState<Item[]>([]);

    const itemsContainerRef = useRef<HTMLDivElement>(null);
    const barcodeBuffer = useRef<string>('');
    const lastKeyTime = useRef<number>(0);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const isScanningRef = useRef<boolean>(false);

    // --- Handwriting logic: StrictMode Resilient ---
    const initState = useMemo(() => {
        const currentState = location.state as { editInvoice?: Invoice; hidePayLater?: boolean } | null;
        if (currentState?.editInvoice) {
            pendingTransitionState = currentState;
            lastCapturedTime = Date.now();
            return currentState;
        }
        const now = Date.now();
        if (pendingTransitionState && (now - lastCapturedTime < 2000)) return pendingTransitionState;
        return null;
    }, [location]);

    const initInvoice = initState?.editInvoice || null;
    const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(initInvoice);

    // --- Cart & Customer State ---
    const [cart, setCart] = useState<InvoiceItem[]>([]);
    const [customer, setCustomer] = useState<Customer>({ 
        name: 'Walk-in Customer', phone: '', id: '0', totalSpent: 0, balance: 0, vatNumber: '', branchId: '', updatedAt: new Date() 
    });

    const GLOBAL_TAX_RATE = 15;

    // --- Queries ---
    const items = useLiveQuery(async () => {
        return db.items.filter((i) => {
            if (i.deletedAt) return false;
            if (!matchesActiveScope(i, activeCompanyId, activeBranchId, activeBranch?.isMaster)) return false;
            if (settings.cafeMode && selectedCategoryId !== null && i.categoryId !== selectedCategoryId) return false;
            if (debouncedSearch) {
                const lower = debouncedSearch.toLowerCase();
                return i.name.toLowerCase().includes(lower) || Boolean(i.barcode?.includes(lower));
            }
            return true;
        }).limit(300).toArray();
    }, [activeCompanyId, activeBranchId, activeBranch?.isMaster, debouncedSearch, settings.cafeMode, selectedCategoryId]);

    const customers = useLiveQuery(async () => {
        return db.customers.filter((c) => {
            if (c.deletedAt) return false;
            if (!matchesActiveScope(c, activeCompanyId, activeBranchId, activeBranch?.isMaster)) return false;
            if (debouncedCustomerSearchTerm) {
                const lower = debouncedCustomerSearchTerm.toLowerCase();
                return c.name.toLowerCase().includes(lower) || Boolean(c.phone?.includes(lower));
            }
            return true;
        }).limit(50).toArray();
    }, [activeCompanyId, activeBranchId, activeBranch?.isMaster, debouncedCustomerSearchTerm]);

    const categories = useLiveQuery(() => db.categories.filter(cat => !cat.deletedAt && matchesActiveScope(cat, activeCompanyId, activeBranchId, activeBranch?.isMaster)).toArray(), [activeCompanyId, activeBranchId, activeBranch?.isMaster]);

    // --- Handlers ---
    const addToCart = useCallback((item: Item, overrideQty?: number) => {
        const qtyToAdd = overrideQty || 1;
        setCart(prev => {
            const existing = prev.find(i => i.itemId === item.id);
            if (existing) {
                return prev.map((i: any) => {
                    if (i.itemId === item.id) {
                        const newQuantity = i.quantity + qtyToAdd;
                        return { ...i, quantity: newQuantity, total: newQuantity * i.price };
                    }
                    return i;
                });
            }
            return [...prev, {
                itemId: item.id!,
                name: item.name,
                quantity: qtyToAdd,
                price: item.salePrice,
                purchasePrice: item.purchasePrice,
                total: qtyToAdd * item.salePrice,
                unit: item.unit,
                taxType: item.taxType,
                taxRate: item.taxRate ?? GLOBAL_TAX_RATE
            }];
        });
    }, [GLOBAL_TAX_RATE]);

    const removeFromCart = useCallback((id: string) => setCart(prev => prev.filter((i: any) => i.itemId !== id)), []);

    const updateQuantity = useCallback((id: string, qty: number) => {
        if (qty < 0) return;
        setCart(prev => prev.map((i: any) => i.itemId === id ? { ...i, quantity: qty, total: qty * i.price } : i));
    }, []);

    const updatePrice = useCallback((id: string, price: number) => {
        if (price < 0) return;
        setCart(prev => prev.map((i: any) => i.itemId === id ? { ...i, price, total: i.quantity * price } : i));
    }, []);

    const selectCustomer = useCallback((c: Customer) => {
        setCustomer(c);
        setCustomerSearchTerm('');
        setShowCustomerSearch(false);
    }, []);

    const fetchScaleWeight = useCallback(async (itemId: string) => {
        try {
            const scales = await db.scales.where('status').equals('online').toArray();
            const scale = scales[0];
            if (!scale) {
                addToast(t('pos.no_scale_online', 'No online scale found. Check settings.'), 'error');
                return;
            }
            addToast(t('pos.reading_scale', 'Reading scale...'), 'info');
            const result = await scaleService.readWeight(scale);
            if (result.success && result.data !== undefined) {
                updateQuantity(itemId, result.data);
                addToast(t('pos.weight_fetched', 'Weight updated: {{weight}}kg', { weight: result.data }), 'success');
            } else {
                addToast(result.message || 'Failed to read weight', 'error');
            }
        } catch (error) {
            console.error('Scale fetch error:', error);
            addToast('Hardware communication error', 'error');
        }
    }, [addToast, t, updateQuantity]);

    const handleBarcodeLookup = useCallback(async (code: string) => {
        try {
            let isScaleBarcode = false;
            let scaleQty = 1;
            let lookupCode = code;
            let parsedPrice = 0;

            if (code.length === 13 && code.match(/^2[0-9]/)) {
                const itemCode = code.substring(2, 7);
                const dataStr = code.substring(7, 12);
                lookupCode = itemCode;
                parsedPrice = Number(dataStr) / 100;
                isScaleBarcode = true;
            }

            let item = await db.items
                .where('barcode')
                .equals(code)
                .and(candidate => matchesActiveScope(candidate, activeCompanyId, activeBranchId, activeBranch?.isMaster) && !candidate.deletedAt)
                .first();
            if (!item && isScaleBarcode) {
                item = await db.items
                    .where('itemCode')
                    .equals(lookupCode)
                    .and(candidate => matchesActiveScope(candidate, activeCompanyId, activeBranchId, activeBranch?.isMaster) && !candidate.deletedAt)
                    .first();
                if (!item) {
                    item = await db.items
                        .where('itemCode')
                        .equals(Number(lookupCode).toString())
                        .and(candidate => matchesActiveScope(candidate, activeCompanyId, activeBranchId, activeBranch?.isMaster) && !candidate.deletedAt)
                        .first();
                }
            }

            if (item) {
                if (isScaleBarcode) {
                    scaleQty = item.salePrice > 0 ? Number((parsedPrice / item.salePrice).toFixed(3)) : 1;
                }
                addToCart(item, isScaleBarcode ? scaleQty : 1);
                addToast(t('pos.added_item', { name: item.name }), 'success');
                if (searchInputRef.current) {
                    setSearch('');
                    searchInputRef.current.blur();
                }
            } else {
                addToast(t('pos.item_not_found'), 'error');
            }
        } catch (err) {
            console.error("Barcode lookup failed", err);
        }
    }, [activeCompanyId, activeBranchId, activeBranch?.isMaster, addToCart, addToast, t]);

    // --- Effects ---
    useEffect(() => {
        if (!initInvoice) return;
        setCart(initInvoice.items.map((item: any) => ({
            itemId: item.itemId,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            purchasePrice: item.purchasePrice,
            total: item.total || (item.price * item.quantity),
            unit: item.unit,
            taxType: item.taxType,
            taxRate: item.taxRate,
            taxAmount: item.taxAmount,
            discountAmount: item.discountAmount
        })));
        setKitchenNote(initInvoice.notes || '');
        setOrderType((initInvoice.orderType as any) || 'dine_in');
        
        if (initInvoice.customerId && initInvoice.customerId !== '0') {
            db.customers.get(initInvoice.customerId).then(c => {
                if (c) setCustomer(c);
            });
        }
        navigate(location.pathname, { replace: true, state: {} });
    }, [initInvoice, navigate, location.pathname]);

    useEffect(() => {
        if (settings.enableShiftManagement && user) {
            shiftService.getCurrentShift(user.id, activeBranchId).then(shift => {
                if (shift) {
                    if (shift.id !== activeShift?.id) setActiveShift(shift);
                } else {
                    setShiftMode('open');
                    setIsShiftModalOpen(true);
                }
            });
        }
    }, [settings.enableShiftManagement, user, activeBranchId, activeShift]);

    useEffect(() => {
        registerShortcut({ id: 'pos-search', keys: ['F2'], description: 'Focus Search', action: () => searchInputRef.current?.focus() });
        registerShortcut({ id: 'pos-checkout', keys: ['F9'], description: 'Checkout', action: () => setIsCheckoutOpen(true) });
        registerShortcut({ id: 'pos-clear', keys: ['Delete'], description: 'Clear Cart', action: () => setCart([]) });
        if (settings.cafeMode) {
            registerShortcut({ id: 'pos-type', keys: ['F8'], description: 'Change Order Type', action: () => {
                const types: ('dine_in' | 'parcel' | 'pickup' | 'delivery')[] = ['dine_in', 'parcel', 'pickup', 'delivery'];
                setOrderType(prev => types[(types.indexOf(prev) + 1) % types.length]);
            }});
        }
        return () => {
            unregisterShortcut('pos-search');
            unregisterShortcut('pos-checkout');
            unregisterShortcut('pos-clear');
            unregisterShortcut('pos-type');
        };
    }, [registerShortcut, unregisterShortcut]);

    useEffect(() => {
        const handleGlobalKeyDown = async (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const isInputField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
            const now = Date.now();
            const timeDelta = now - lastKeyTime.current;
            lastKeyTime.current = now;

            if (e.key === 'Enter') {
                if (barcodeBuffer.current.length >= 3) {
                    e.preventDefault();
                    e.stopPropagation();
                    const code = barcodeBuffer.current;
                    barcodeBuffer.current = '';
                    isScanningRef.current = false;
                    if (isInputField && target instanceof HTMLInputElement) {
                        const currentVal = target.value;
                        if (currentVal.endsWith(code)) {
                            target.value = currentVal.substring(0, currentVal.length - code.length);
                        } else if (target === searchInputRef.current) setSearch('');
                    }
                    await handleBarcodeLookup(code);
                }
                barcodeBuffer.current = '';
            } else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
                if (timeDelta > 100) {
                    barcodeBuffer.current = '';
                    isScanningRef.current = false;
                }
                barcodeBuffer.current += e.key;
                if (barcodeBuffer.current.length >= 2 && timeDelta < 60) isScanningRef.current = true;
                if (isScanningRef.current && barcodeBuffer.current.length > 2) e.preventDefault();
            }
        };
        window.addEventListener('keydown', handleGlobalKeyDown, true);
        return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
    }, [handleBarcodeLookup]);

    // --- Derived ---
    const filteredItems = useMemo(() => items || [], [items]);

    useEffect(() => {
        setVisibleItemsCount(50);
        if (itemsContainerRef.current) itemsContainerRef.current.scrollTop = 0;
    }, [debouncedSearch, selectedCategoryId]);

    const visibleItems = useMemo(() => filteredItems.slice(0, visibleItemsCount), [filteredItems, visibleItemsCount]);

    const filteredCustomers = useMemo(() => {
        if (!customers) return [];
        return customers.slice(0, 10);
    }, [customers]);

    // --- Recommendations Effect ---
    useEffect(() => {
        const fetchRecommendations = async () => {
            const itemIds = cart.map(i => i.itemId);
            if (itemIds.length > 0) {
                const recs = await recommendationService.getFrequentlyBoughtWith(itemIds);
                setRecommendations(recs);
            } else {
                // Show trending items if cart is empty
                const trending = await recommendationService.getTrendingItems();
                setRecommendations(trending);
            }
        };
        fetchRecommendations();
    }, [cart]);

    const cartCalculations = useMemo(() => {
        const lineResults = cart.map(item => calculateLineItem({
            price: item.price,
            quantity: item.quantity,
            taxRate: item.taxRate ?? GLOBAL_TAX_RATE,
            taxType: item.taxType || 'exclusive',
            discount: item.discountAmount || 0,
            discountType: 'fixed'
        }, settings.applyTax));
        return calculateDocumentTotals(lineResults, 0, 'fixed', settings.applyTax);
    }, [cart, settings.applyTax, GLOBAL_TAX_RATE]);

    const cartSubTotal = cartCalculations.subTotal;
    const cartTax = cartCalculations.taxAmount;
    const payableTotal = cartCalculations.grandTotal;

    const handleScroll = () => {
        if (itemsContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = itemsContainerRef.current;
            if (scrollTop + clientHeight >= scrollHeight - 200) {
                setVisibleItemsCount(prev => Math.min(prev + 50, filteredItems.length));
            }
        }
    };

    const handleCheckoutComplete = async (invoiceData: any): Promise<string> => {
        if (editingInvoice ? !canUpdate('sales') : !canCreate('sales')) {
            addToast(t('common.access_denied'), 'error');
            throw new Error(t('common.access_denied'));
        }

        try {
            return await db.transaction('rw', [db.invoices, db.customers, db.items], async () => {
                const metadata = createRecordMetadata();
                const finalData = editingInvoice 
                    ? { ...editingInvoice, ...invoiceData, shiftId: activeShift?.id || editingInvoice.shiftId, updatedAt: new Date() }
                    : { ...invoiceData, ...metadata, shiftId: activeShift?.id, type: invoiceData.type || 'invoice', status: invoiceData.status || (invoiceData.paymentStatus === 'paid' ? 'paid' : 'pending') };

                const id = await db.invoices.put(finalData);

                const wasInvoice = editingInvoice?.type === 'invoice';
                const isInvoice = finalData.type === 'invoice';
                const isBecomingInvoice = isInvoice && !wasInvoice;
                const isEditingInvoice = isInvoice && wasInvoice;

                if (invoiceData.customerId && (isBecomingInvoice || isEditingInvoice)) {
                    const c = await db.customers.get(invoiceData.customerId);
                    if (c) {
                        if (isBecomingInvoice) {
                            const newPoints = Math.floor(invoiceData.grandTotal);
                            await db.customers.update(invoiceData.customerId, { 
                                totalSpent: (c.totalSpent || 0) + invoiceData.grandTotal, 
                                balance: (c.balance || 0) + (invoiceData.remainingAmount || 0),
                                loyaltyPoints: (c.loyaltyPoints || 0) + newPoints
                            });
                        } else {
                            const currentGrandTotal = Number(invoiceData.grandTotal) || 0;
                            const previousGrandTotal = Number(editingInvoice?.grandTotal) || 0;
                            const totalDelta = currentGrandTotal - previousGrandTotal;
                            
                            const currentRemaining = Number(invoiceData.remainingAmount) || 0;
                            const previousRemaining = Number(editingInvoice?.remainingAmount) || 0;
                            const balanceDelta = currentRemaining - previousRemaining;
                            
                            const pointsDelta = Math.floor(currentGrandTotal) - Math.floor(previousGrandTotal);

                            await db.customers.update(invoiceData.customerId, { 
                                totalSpent: (c.totalSpent || 0) + totalDelta, 
                                balance: (c.balance || 0) + balanceDelta,
                                loyaltyPoints: (c.loyaltyPoints || 0) + pointsDelta
                            });
                        }
                    }
                }

                if (isBecomingInvoice || isEditingInvoice) {
                    if (isBecomingInvoice) {
                        for (const item of invoiceData.items) {
                            const dbItem = await db.items.get(item.itemId);
                            if (dbItem) await db.items.update(item.itemId, { stock: Math.max(0, dbItem.stock - item.quantity) });
                        }
                    } else {
                        const oldMap = new Map(editingInvoice?.items.map((i: any) => [i.itemId, i.quantity]) || []);
                        const newMap = new Map(invoiceData.items.map((i: any) => [i.itemId, i.quantity]));
                        const allIds = new Set([...oldMap.keys(), ...newMap.keys()]);
                        for (const itemId of allIds) {
                            const delta = (Number(newMap.get(itemId)) || 0) - (Number(oldMap.get(itemId)) || 0);
                            if (delta !== 0) {
                                const dbItem = await db.items.get(itemId);
                                if (dbItem) await db.items.update(itemId, { stock: Math.max(0, dbItem.stock - delta) });
                            }
                        }
                    }
                }
                return id as string;
            });
        } catch (error) {
            console.error("Save invoice failed:", error);
            throw error;
        }
    };

    // --- Access Control (After hooks) ---
    if (!canView('pos')) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] text-center p-8 bg-slate-50 dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
                <ShieldOff size={48} className="text-slate-300 mb-4" />
                <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">{t('common.access_denied')}</h2>
                <p className="text-slate-500">{t('pos.access_denied_msg')}</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col lg:flex-row h-full gap-2 overflow-hidden relative">

            <div className="flex-1 flex gap-2 min-w-0 min-h-0 relative z-10">
                {/* Modern Category Sidebar */}
                {settings.cafeMode && (
                    <motion.div 
                        initial={{ x: -20, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        className="hidden md:flex w-20 flex-col gap-2 overflow-y-auto pr-1 custom-scrollbar shrink-0 pb-4"
                    >
                        <motion.button
                            whileHover={{ scale: 1.05, x: 5 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setSelectedCategoryId(null)}
                            className={clsx(
                                "group p-2.5 rounded-xl border flex flex-col items-center justify-center text-center gap-1.5 transition-all aspect-square shadow-sm relative overflow-hidden",
                                selectedCategoryId === null 
                                    ? "bg-slate-900 dark:bg-blue-600 text-white border-transparent ring-4 ring-blue-500/20 shadow-blue-500/20" 
                                    : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                            )}
                        >
                            <LayoutGrid size={20} className={clsx("transition-transform duration-500", selectedCategoryId === null ? "rotate-0" : "group-hover:rotate-45")} />
                            <span className="text-xs font-semibold">{t('common.all')}</span>
                        </motion.button>
                        
                        {categories?.map((cat: any) => (
                            <motion.button
                                key={cat.id}
                                whileHover={{ scale: 1.05, x: 5 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setSelectedCategoryId(cat.id)}
                                className={clsx(
                                    "group p-2.5 rounded-xl border flex flex-col items-center justify-center text-center gap-1.5 transition-all aspect-square shadow-sm relative overflow-hidden",
                                    selectedCategoryId === cat.id 
                                        ? "bg-slate-900 dark:bg-blue-600 text-white border-transparent ring-4 ring-blue-500/20 shadow-blue-500/20" 
                                        : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                                )}
                            >
                                {cat.color && selectedCategoryId !== cat.id && (
                                    <div className="absolute inset-0 opacity-10 group-hover:opacity-20 transition-opacity" style={{ backgroundColor: cat.color }} />
                                )}
                                <span className="text-xs font-semibold leading-tight line-clamp-2 w-full relative z-10">{cat.name}</span>
                            </motion.button>
                        ))}
                    </motion.div>
                )}

                <div className="flex-1 flex flex-col gap-2 min-w-0 min-h-0">
                    {/* Premium Header / Search & Actions Bar */}
                    <motion.div 
                        initial={{ y: -20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        className="bg-white dark:bg-slate-900 p-2 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex items-center gap-2 relative overflow-hidden"
                    >

                        {settings.enableShiftManagement && (
                            <motion.button
                                whileHover={{ scale: 1.02, y: -2 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => { setShiftMode(activeShift ? 'close' : 'open'); setIsShiftModalOpen(true); }}
                                className={clsx(
                                    "flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all border shadow-sm relative overflow-hidden group",
                                    activeShift 
                                        ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900/50 shadow-sm" 
                                        : "bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200 dark:border-rose-900/50 shadow-sm"
                                )}
                            >
                                <div className={clsx(
                                    "w-2 h-2 rounded-full ring-4", 
                                    activeShift ? 'bg-emerald-500 ring-emerald-500/20 animate-pulse' : 'bg-rose-500 ring-rose-500/20'
                                )} />
                                {activeShift ? t('pos.shift_active') : t('pos.shift_required')}
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
                            </motion.button>
                        )}
                        
                        {editingInvoice && (
                            <motion.button 
                                whileHover={{ scale: 1.02, x: -5 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => navigate('/sales')} 
                                className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg font-semibold text-xs border border-slate-200 dark:border-slate-700 shadow-sm group"
                            >
                                <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform" /> 
                                <span>{t('common.back')}</span>
                            </motion.button>
                        )}

                        <div className="flex-1 relative group">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-all duration-200" size={17} />
                            <input
                                ref={searchInputRef}
                                type="text"
                                placeholder={t('pos.search_placeholder')}
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') { const code = search.trim(); if (code) { e.preventDefault(); handleBarcodeLookup(code); } } }}
                                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 dark:text-white outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white dark:focus:bg-slate-900 transition-all font-medium text-sm shadow-inner placeholder:text-slate-400/60"
                            />
                            {/* Command Hint */}
                            <div className="absolute right-5 top-1/2 -translate-y-1/2 flex items-center gap-2 opacity-0 group-focus-within:opacity-100 transition-opacity">
                                <span className="text-xs font-medium text-slate-400">{t('common.press_enter')}</span>
                            </div>
                        </div>

                        <motion.button 
                            whileHover={{ scale: 1.1, rotate: 5 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => setShowArabicName(!showArabicName)} 
                            className={clsx(
                                "w-11 h-11 rounded-lg border transition-all font-semibold text-xs flex items-center justify-center shadow-sm",
                                showArabicName 
                                    ? 'bg-blue-600 border-transparent text-white' 
                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                            )}
                        >
                            عربي
                        </motion.button>
                    </motion.div>

                    <div
                        ref={itemsContainerRef}
                        onScroll={handleScroll}
                        className="flex-1 overflow-y-auto content-start pr-1 grid gap-2 custom-scrollbar pb-4 min-h-[220px]"
                        style={{
                            gridTemplateColumns: settings.cafeMode
                                ? 'repeat(auto-fill, minmax(150px, 170px))'
                                : 'repeat(auto-fill, minmax(140px, 160px))'
                        }}
                    >
                        <AnimatePresence mode="popLayout">
                            {visibleItems?.map((item: any, idx) => (
                                <motion.div
                                    key={item.id}
                                    initial={{ opacity: 0, y: 30, scale: 0.9 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
                                    transition={{ 
                                        duration: 0.4, 
                                        delay: (idx % 10) * 0.03,
                                        ease: [0.22, 1, 0.36, 1]
                                    }}
                                >
                                    {(settings.cafeMode || item.image) ? (
                                        <ItemCard item={item} onClick={addToCart} showArabicName={showArabicName} />
                                    ) : (
                                        <motion.button 
                                            whileHover={{ y: -5, scale: 1.01 }}
                                            whileTap={{ scale: 0.99 }}
                                            onClick={() => addToCart(item)} 
                                            className="bg-white dark:bg-slate-800 p-3 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 text-left flex flex-col justify-between h-36 sm:h-40 group relative overflow-hidden transition-all duration-200"
                                        >
                                            <div className="absolute top-4 right-4 p-2 bg-slate-50 dark:bg-slate-900 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-300 group-hover:translate-x-0 translate-x-3 shadow-md border border-slate-100 dark:border-slate-700 z-20">
                                                <div className="text-blue-600 dark:text-blue-400"><Plus size={16} /></div>
                                            </div>

                                            <div className="relative z-10 w-full">
                                                <h3 className="font-semibold text-sm text-slate-800 dark:text-white line-clamp-2 leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors pr-6">
                                                    {item.name}
                                                </h3>
                                                {showArabicName && item.arabicName && (
                                                    <div className="text-[10px] sm:text-xs text-slate-400 mt-1.5 font-arabic font-bold line-clamp-1" dir="rtl">{item.arabicName}</div>
                                                )}
                                                {!settings.cafeMode && (
                                                    <div className="mt-2.5 flex items-center gap-2">
                                                        <div className={clsx(
                                                            "w-1.5 h-1.5 rounded-full shadow-[0_0_6px_rgba(0,0,0,0.1)]", 
                                                            item.stock > 10 ? 'bg-emerald-500 shadow-emerald-500/50' : 'bg-rose-500 animate-pulse shadow-rose-500/50'
                                                        )} />
                                                        <p className="text-xs font-medium text-slate-500">{item.stock} {item.unit || 'pc'}</p>
                                                    </div>
                                                )}
                                            </div>
                                            
                                            <div className="relative z-10 flex items-end justify-between w-full mt-auto">
                                                <div className="text-lg font-bold text-slate-900 dark:text-white flex flex-col">
                                                    <span className="text-xs text-slate-500 font-medium mb-0.5">{t('common.price')}</span>
                                                    {formatCurrency(item.salePrice)}
                                                </div>
                                                {item.unit && (
                                                    <div className="text-[8px] sm:text-[9px] font-black text-slate-400 uppercase px-2 py-0.5 bg-slate-100 dark:bg-slate-900 rounded-lg">
                                                        {item.unit}
                                                    </div>
                                                )}
                                            </div>
                                        </motion.button>
                                    )}
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>

                    {/* Premium Recommendations Section */}
                    <AnimatePresence>
                        {recommendations.length > 0 && (
                            <motion.div 
                                initial={{ opacity: 0, y: 50 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: 50 }}
                                className="bg-slate-50 dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-md relative overflow-hidden mb-4"
                            >
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mb-4 flex items-center gap-3">
                                    <div className="p-1.5 bg-amber-100 dark:bg-amber-950/40 rounded-lg">
                                        <Sparkles size={14} className="text-amber-500 animate-pulse" />
                                    </div>
                                    {cart.length > 0 ? t('pos.frequently_bought_together') : t('pos.trending_now')}
                                </h4>
                                
                                <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar -mx-4 px-4">
                                    {recommendations.map(item => (
                                        <motion.button
                                            key={item.id}
                                            whileHover={{ y: -4, scale: 1.02 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={() => addToCart(item)}
                                            className="flex-shrink-0 w-44 bg-white dark:bg-slate-800 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm text-left group relative transition-all duration-300"
                                        >
                                            <div className="text-xs font-black text-slate-800 dark:text-white line-clamp-1 mb-2 uppercase tracking-tight group-hover:text-amber-500 transition-colors">{item.name}</div>
                                            <div className="text-lg font-black text-blue-600 dark:text-blue-400 tracking-tighter">{formatCurrency(item.salePrice)}</div>
                                            <div className="absolute bottom-3.5 right-3.5 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0">
                                                <div className="bg-amber-500 text-white p-1.5 rounded-lg shadow-md">
                                                    <Plus size={14} />
                                                </div>
                                            </div>
                                        </motion.button>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Premium Cart Sidebar */}
            <motion.div 
                initial={{ x: 50, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="w-full lg:w-[340px] xl:w-[360px] h-[300px] sm:h-[320px] lg:h-full bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden relative z-20 group/cart"
            >
                <div className="p-3 bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 relative z-10">
                    <AnimatePresence mode="wait">
                        {editingInvoice && (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="mb-2 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-between shadow-sm"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(245,158,11,0.4)]"></div>
                                    <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">{t('pos.editing_mode')} #{editingInvoice.invoiceNumber}</span>
                                </div>
                                <motion.button 
                                    whileHover={{ scale: 1.1, rotate: 90 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => { setEditingInvoice(null); setCart([]); setCustomer({ name: 'Walk-in Customer', phone: '', id: '0', totalSpent: 0, balance: 0, vatNumber: '', branchId: '', updatedAt: new Date() }); }} 
                                    className="text-amber-600 hover:bg-amber-500/20 p-1.5 rounded-lg transition-all"
                                >
                                    <XCircle size={18} />
                                </motion.button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 font-semibold text-sm text-slate-600 dark:text-slate-300">
                            <div className="w-7 h-7 bg-blue-500/10 rounded-lg flex items-center justify-center text-blue-500">
                                <User size={14} /> 
                            </div>
                            {t('dashboard.customer')}
                        </div>
                        <motion.button 
                            whileHover={{ scale: 1.1, rotate: 90 }}
                            whileTap={{ scale: 0.9 }}
                            onClick={() => setIsCustomerFormOpen(true)} 
                            className="p-2 bg-blue-600 text-white rounded-lg shadow-sm"
                        >
                            <UserPlus size={16} />
                        </motion.button>
                    </div>

                    {customer.id !== '0' ? (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="flex items-center justify-between p-2.5 bg-blue-600 text-white rounded-lg shadow-sm group relative overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
                            <div className="relative z-10">
                                <div className="font-semibold text-sm truncate max-w-[200px]">{customer.name}</div>
                                <div className="text-xs opacity-80 font-medium mt-0.5">{customer.phone || 'No phone recorded'}</div>
                            </div>
                            <motion.button 
                                whileHover={{ scale: 1.1, rotate: 90 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => setCustomer({ name: 'Walk-in Customer', phone: '', id: '0', totalSpent: 0, balance: 0, vatNumber: '', branchId: '', updatedAt: new Date() })} 
                                className="bg-white/20 hover:bg-white/40 p-1.5 rounded-lg transition-all relative z-10"
                            >
                                <XCircle size={16} />
                            </motion.button>
                        </motion.div>
                    ) : (
                        <div className="relative group/custsearch">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within/custsearch:text-blue-500 transition-colors" size={16} />
                            <input
                                type="text"
                                value={customerSearchTerm}
                                onChange={(e) => { setCustomerSearchTerm(e.target.value); setShowCustomerSearch(true); }}
                                onFocus={() => setShowCustomerSearch(true)}
                                placeholder={t('pos.walk_in_customer')}
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm font-medium focus:ring-2 focus:ring-blue-500/20 outline-none transition-all dark:text-white shadow-inner"
                            />
                            <AnimatePresence>
                                {showCustomerSearch && customerSearchTerm && (
                                    <motion.div 
                                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                        className="absolute top-full left-0 w-full z-[100] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl mt-1.5 max-h-[300px] overflow-y-auto custom-scrollbar p-2"
                                    >
                                        {filteredCustomers?.length > 0 ? filteredCustomers.map((c: any) => (
                                            <motion.div 
                                                key={c.id} 
                                                whileHover={{ x: 5 }}
                                                onClick={() => selectCustomer(c)} 
                                                className="p-2.5 hover:bg-blue-600 hover:text-white cursor-pointer rounded-lg transition-all border-b last:border-0 border-slate-50 dark:border-slate-700/50 group flex justify-between items-center"
                                            >
                                                <div>
                                                    <div className="font-black text-xs uppercase tracking-tight">{c.name}</div>
                                                    <div className="text-[9px] opacity-60 font-bold uppercase tracking-[0.2em] mt-0.5">{c.phone || 'No phone'}</div>
                                                </div>
                                                {c.balance > 0 && (
                                                    <span className="text-rose-500 group-hover:text-white text-[9px] font-black bg-rose-500/10 group-hover:bg-white/20 px-2 py-1 rounded-full border border-rose-500/10 group-hover:border-transparent">
                                                        {formatCurrency(c.balance)}
                                                    </span>
                                                )}
                                            </motion.div>
                                        )) : (
                                            <div className="p-4 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">{t('common.no_results')}</div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar relative z-10">
                    <AnimatePresence initial={false} mode="popLayout">
                        {cart.map((item) => (
                            <motion.div
                                key={item.itemId}
                                initial={{ opacity: 0, x: -30, scale: 0.9 }}
                                animate={{ opacity: 1, x: 0, scale: 1 }}
                                exit={{ opacity: 0, x: 30, scale: 0.9 }}
                                layout
                                transition={{ duration: 0.3 }}
                            >
                                <CartItem item={{ ...item, unit: item.unit || 'unit' }} onRemove={removeFromCart} onUpdateQuantity={updateQuantity} onUpdatePrice={updatePrice} onFetchScaleWeight={fetchScaleWeight} />
                            </motion.div>
                        ))}
                    </AnimatePresence>
                    {cart.length === 0 && (
                        <div className="hidden lg:flex h-full flex-col items-center justify-center py-8">
                            <motion.div
                                animate={{ 
                                    y: [0, -10, 0],
                                    rotate: [0, 3, -3, 0]
                                }}
                                transition={{ repeat: Infinity, duration: 6, ease: "easeInOut" }}
                                className="w-20 h-20 bg-slate-100 dark:bg-slate-800/50 rounded-full flex items-center justify-center text-slate-300 dark:text-slate-700"
                            >
                                <ShoppingCart size={40} strokeWidth={1} />
                            </motion.div>
                            <p className="mt-3 text-sm font-medium text-slate-400 opacity-80">{t('pos.empty_cart')}</p>
                        </div>
                    )}
                </div>

                {/* Premium Cart Footer */}
                <div className="p-3 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 relative z-10 space-y-2">
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs font-semibold text-slate-500">
                            <span>{t('pos.subtotal')}</span>
                            <span className="text-slate-900 dark:text-white font-black">{formatCurrency(cartSubTotal)}</span>
                        </div>
                        {cartTax > 0 && (
                            <div className="flex justify-between text-xs font-semibold text-slate-500">
                                <span className="flex items-center gap-2">
                                    {t('pos.tax')} 
                                    <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md text-[7px] text-blue-500">15%</span>
                                </span>
                                <span className="text-slate-900 dark:text-white font-black">{formatCurrency(cartTax)}</span>
                            </div>
                        )}
                        <div className="h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-800 to-transparent my-2" />
                        <div className="flex justify-between items-baseline">
                            <div className="flex flex-col">
                                <span className="text-xs font-semibold text-slate-500 mb-0.5">{t('pos.total')}</span>
                                <span className="text-xs text-blue-500 font-medium">{cart.length} items in cart</span>
                            </div>
                            <motion.span 
                                key={payableTotal}
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="text-2xl font-bold text-blue-600 dark:text-blue-400"
                            >
                                {formatCurrency(payableTotal)}
                            </motion.span>
                        </div>
                    </div>

                    {settings.cafeMode && (
                        <div className="grid grid-cols-4 gap-2 bg-slate-100 dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                            {(['dine_in', 'parcel', 'pickup', 'delivery'] as const).map(typeId => {
                                const customData = settings.customOrderTypes?.[typeId] || {
                                    icon: typeId === 'dine_in' ? '🍽️' : typeId === 'parcel' ? '🥡' : typeId === 'pickup' ? '🚶' : '🚚',
                                    label: t('pos.' + typeId)
                                };
                                return (
                                    <motion.button 
                                        key={typeId} 
                                        whileHover={{ scale: 1.05, y: -1 }}
                                        whileTap={{ scale: 0.95 }}
                                        onClick={() => setOrderType(typeId as any)} 
                                        className={clsx(
                                            "flex flex-col items-center py-1.5 rounded-lg transition-all outline-none border",
                                            orderType === typeId 
                                                ? 'bg-white dark:bg-slate-700 shadow-md text-blue-600 border-transparent ring-4 ring-blue-500/5' 
                                                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 border-transparent'
                                        )}
                                    >
                                        <span className="text-lg mb-1">{customData.icon}</span>
                                        <span className="text-[8px] font-black uppercase tracking-tighter">{customData.label}</span>
                                    </motion.button>
                                );
                            })}
                        </div>
                    )}

                    <div className="relative group/note">
                        <textarea 
                            value={kitchenNote} 
                            onChange={(e) => setKitchenNote(e.target.value)} 
                            placeholder={t('pos.kitchen_notes')} 
                            className="w-full p-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none resize-none dark:text-white focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner placeholder:opacity-60" 
                            rows={1} 
                        />
                        <div className="absolute right-3 bottom-3 p-1 bg-slate-50 dark:bg-slate-900 rounded-md opacity-30 group-focus-within/note:opacity-100 transition-opacity">
                            <FileText size={12} className="text-slate-400" />
                        </div>
                    </div>

                    <div className="grid grid-cols-5 gap-2">
                        <motion.button 
                            whileHover={{ scale: 1.05, rotate: -5 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={async () => {
                                const saved = localStorage.getItem('printerConfig');
                                if (!saved) return addToast('No printer config found', 'error');
                                const config = JSON.parse(saved);
                                if (window.electron?.openCashDrawer && config.thermal?.printerName) {
                                    const ok = await window.electron.openCashDrawer(config.thermal.printerName);
                                    if (ok) addToast('Drawer opened', 'success');
                                    else addToast('Failed to open drawer', 'error');
                                }
                            }} 
                            className="bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white p-2.5 rounded-lg font-semibold flex justify-center items-center transition-all border border-slate-200/50 dark:border-slate-700/50 shadow-sm group"
                        >
                            <Archive size={20} className="group-hover:scale-110 transition-transform" />
                        </motion.button>
                        
                        <motion.button 
                            whileHover={{ scale: 1.02, y: -2 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setIsCheckoutOpen(true)} 
                            disabled={cart.length === 0 || (settings.enableShiftManagement && !activeShift)} 
                            className="bg-blue-600 disabled:opacity-40 disabled:grayscale text-white p-2 rounded-lg font-semibold shadow-sm hover:bg-blue-700 active:scale-[0.98] transition-all flex justify-center items-center gap-2 col-span-4 relative overflow-hidden group min-h-11"
                        >
                            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
                            <div className="p-1.5 bg-white/10 rounded-md">
                                <CreditCard size={18} /> 
                            </div>
                            <div className="flex flex-col sm:items-start">
                                <span className="hidden sm:block text-xs opacity-80 font-medium mb-0.5">{t('pos.ready_to_pay')}</span>
                                <span className="text-sm font-semibold leading-none">{t('pos.checkout')}</span>
                            </div>
                        </motion.button>
                    </div>
                </div>
            </motion.div>

            <CheckoutModal
                isOpen={isCheckoutOpen}
                onClose={(success) => {
                    setIsCheckoutOpen(false);
                    if (success) {
                        setCart([]); setCustomer({ name: 'Walk-in Customer', phone: '', id: '0', totalSpent: 0, balance: 0, vatNumber: '', branchId: '', updatedAt: new Date() });
                        setSearch(''); setKitchenNote(''); setOrderType('dine_in'); setEditingInvoice(null);
                    }
                    setTimeout(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); }, 50);
                }}
                subTotal={cartSubTotal}
                items={cart}
                customerName={customer.name}
                customerId={customer.id}
                customerVatNumber={customer.vatNumber}
                notes={kitchenNote}
                orderType={orderType}
                onConfirm={handleCheckoutComplete}
                invoiceNumber={editingInvoice?.invoiceNumber}
                showPayLater={!initState?.hidePayLater && !editingInvoice}
            />

            {isCustomerFormOpen && <CustomerForm onClose={() => setIsCustomerFormOpen(false)} onSave={() => setIsCustomerFormOpen(false)} />}
            
            <ShiftModal
                isOpen={isShiftModalOpen}
                mode={shiftMode}
                onClose={(success) => {
                    setIsShiftModalOpen(false);
                    if (success && user) shiftService.getCurrentShift(user.id, activeBranchId).then(setActiveShift);
                }}
            />
        </div>
    );
};

export default PosTerminal;
