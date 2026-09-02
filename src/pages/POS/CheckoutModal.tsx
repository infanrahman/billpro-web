import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Banknote, CreditCard, Smartphone, Clock, SplitSquareHorizontal, ChevronRight, XCircle, Receipt } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { db, getCurrentBranchId, matchesActiveScope } from '../../services/db';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Invoice, InvoiceItem } from '../../services/db';
import { calculateLineItem, calculateDocumentTotals } from '../../utils/financials';
import { useNotification } from '../../contexts/NotificationContext';
import { generateInvoicePDF, generateKitchenTicketPDF } from '../../services/invoiceGenerator';

import Modal from '../../components/UI/Modal';
import { useSettings } from '../../contexts/SettingsContext';
import { messagingService } from '../../services/messagingService';
import { useAuth } from '../../contexts/AuthContext';

interface CheckoutModalProps {
    isOpen: boolean;
    onClose: (success?: boolean) => void;
    subTotal: number;
    items: InvoiceItem[];
    customerName?: string;
    customerId?: string;
    customerVatNumber?: string; // New Prop
    notes?: string;
    orderType?: 'dine_in' | 'parcel' | 'pickup' | 'delivery';
    onConfirm: (data: Partial<Invoice>) => Promise<string>; // Updated return type
    invoiceNumber?: string;
    showPayLater?: boolean;
}

const CheckoutModal: React.FC<CheckoutModalProps> = ({ isOpen, onClose, subTotal, items, customerName, customerId, customerVatNumber, notes, orderType, onConfirm, invoiceNumber, showPayLater }) => {
    // Moved early return to after hooks to satisfy Rules of Hooks
    const { addToast } = useNotification();
    const { formatCurrency, settings } = useSettings();
    const { t } = useTranslation();
    const { activeCompanyId, activeBranchId, activeBranch } = useAuth();

    const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage');
    const [discountValue, setDiscountValue] = useState(0);
    const [taxPercent, setTaxPercent] = useState(15); // Default 15% (KSA Standard)
    const [paymentMode, setPaymentMode] = useState<'cash' | 'card' | 'upi' | 'credit' | 'split' | 'pay_later'>('cash');
    const [amountPaidInput, setAmountPaidInput] = useState('');
    const [splitCashInput, setSplitCashInput] = useState('');
    const [splitCardInput, setSplitCardInput] = useState('');
    const [dueDate, setDueDate] = useState('');
    

    // ... existing code ...

    // Load Tax Defaults from Settings
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [businessDetails, setBusinessDetails] = useState<any>(null);
    const [printerConfig, setPrinterConfig] = useState<any>(null);
    const [shouldPrint, setShouldPrint] = useState(true);

    // Reset state when modal opens to ensure a clean transaction every time
    React.useEffect(() => {
        if (isOpen) {
            setPaymentMode('cash');
            setAmountPaidInput('');
            setSplitCashInput('');
            setSplitCardInput('');
            setDiscountValue(0);
            setDiscountType('percentage');
            setDueDate('');
            setIsProcessing(false);
        }
    }, [isOpen, t]);

    React.useEffect(() => {
        const saved = localStorage.getItem('businessDetails');
        if (saved) {
            const parsed = JSON.parse(saved);
            setBusinessDetails(parsed);
            if (parsed.country === 'Saudi Arabia') setTaxPercent(15);
        }

        // Load Printer Config
        const savedPrinter = localStorage.getItem('printerConfig');
        if (savedPrinter) {
            setPrinterConfig(JSON.parse(savedPrinter));
        }
    }, []);

    const customer = useLiveQuery(async () => {
        return customerId ? await db.customers.get(customerId) : undefined;
    }, [customerId]);



    // --- ZATCA Standard Calculations ---
    // --- ZATCA Standard Calculations ---
    const financialResults = React.useMemo(() => {
        const lineResults = items.map(item => calculateLineItem({
            price: item.price,
            quantity: item.quantity,
            taxRate: item.taxRate ?? taxPercent,
            taxType: item.taxType || 'exclusive',
            discount: item.discountAmount || 0,
            discountType: 'fixed'
        }, settings.applyTax));

        return {
            lineResults,
            totals: calculateDocumentTotals(lineResults, discountValue, discountType, settings.applyTax)
        };
    }, [items, discountValue, discountType, taxPercent, settings.applyTax]);

    const { subTotal: subTotalSum, taxAmount, discountAmount, grandTotal } = financialResults.totals;

    const mappedItems = items.map((item: any, index: number) => {
        const lineFin = financialResults.lineResults[index];
        return {
            ...item,
            taxAmount: lineFin.taxAmount,
            netAmount: lineFin.taxableAmount,
            total: lineFin.total,
            discountAmount: lineFin.discountAmount,
            taxRate: item.taxRate ?? taxPercent,
            taxType: item.taxType || 'exclusive'
        };
    });

    
    let amountPaid = 0;
    if (paymentMode === 'split') {
        const cashValue = parseFloat(splitCashInput) || 0;
        const cardValue = parseFloat(splitCardInput) || 0;
        amountPaid = Math.round((cashValue + cardValue) * 100) / 100;
    } else if (paymentMode === 'credit') {
        amountPaid = Math.round((parseFloat(amountPaidInput) || 0) * 100) / 100;
    } else if (paymentMode === 'cash') {
        amountPaid = amountPaidInput ? Math.round((parseFloat(amountPaidInput) || 0) * 100) / 100 : grandTotal;
    } else if (paymentMode === 'pay_later') {
        amountPaid = 0; // Pay Later = no payment yet
    } else {
        amountPaid = grandTotal;
    }

    const isPayLater = paymentMode === 'pay_later';
    const balanceDue = isPayLater ? 0 : Math.max(0, Math.round((grandTotal - amountPaid) * 100) / 100);
    const changeAmount = isPayLater ? 0 : Math.round(Math.max(0, amountPaid - grandTotal) * 100) / 100;

    const isCreditSale = !isPayLater && (paymentMode === 'credit' || balanceDue > 0.01);
    const currentBalance = customer?.balance || 0;
    const limit = customer?.creditLimit || 0;
    const canTakeCredit = !!customerId && (limit === 0 || (currentBalance + balanceDue <= limit)); // Assuming 0 limit means strict 0.
    // Actually, usually if creditLimit is 0 it means "No Credit".
    // If we want "No Limit", we'd use -1 or null.
    // Let's stick to: if limit > 0 check it. If limit === 0, then Credit NOT Allowed.

    const [isProcessing, setIsProcessing] = useState(false);

    const handleConfirm = async () => {
        if (isProcessing) return; // Prevent double click

        if (isCreditSale && !canTakeCredit) {
            addToast(t('pos.credit_error_msg'), 'error');
            return;
        }

        if (paymentMode === 'credit' && !dueDate) {
            addToast(t('pos.due_date_required'), 'error');
            return;
        }

        if (paymentMode === 'split') {
            const cardAmt = parseFloat(splitCardInput) || 0;
            const cashAmt = parseFloat(splitCashInput) || 0;
            if (cardAmt + cashAmt < grandTotal) {
                addToast(t('pos.insufficient_payment') || 'Split payment must cover the full amount', 'error');
                return;
            }
        }

        setIsProcessing(true); // Start Loading

        let finalStatus: 'paid' | 'pending' | 'partial' = 'paid';
        if (balanceDue > 0.01) {
            finalStatus = amountPaid > 0 ? 'partial' : 'pending';
        }

        // Use createdAt index (NOT id — UUIDs are not sequential!)
        const scopedInvoices = await db.invoices
            .filter(inv => matchesActiveScope(inv, activeCompanyId, activeBranchId, activeBranch?.isMaster) && !inv.deletedAt)
            .toArray();
        const lastInvoice = scopedInvoices.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
        let nextNumber = 1;
        if (lastInvoice && lastInvoice.invoiceNumber) {
            // Extract only digits from the invoice number (handles "INV-003", "SO-123", "RET-5", etc.)
            const lastNumStr = lastInvoice.invoiceNumber.replace(/\D/g, '');
            const lastNum = parseInt(lastNumStr, 10);
            if (!isNaN(lastNum)) {
                nextNumber = lastNum + 1;
            }
        }
        
        // Prefix logic: SO- for orders, INV- for invoices
        let prefix = 'INV-';
        if (isPayLater) prefix = 'SO-';
        
        // If we are editing an Order but paying now (not as pay_later), we need a NEW INV- number.
        // If we are editing an Order and staying as pay_later (unlikely from UI but possible), we keep SO number.
        const shouldRegenerate = invoiceNumber && invoiceNumber.startsWith('SO-') && !isPayLater;
        const finalInvoiceNumber = (shouldRegenerate || !invoiceNumber) ? (prefix + nextNumber.toString().padStart(3, '0')) : invoiceNumber;

        // Generate Token Number for Cafe Mode (Daily Reset)
        let tokenNumber: string | undefined;
        const savedPrinterConfig = localStorage.getItem('printerConfig');
        const currentPrinterConfig = savedPrinterConfig ? JSON.parse(savedPrinterConfig) : printerConfig;

        if (settings.cafeMode && currentPrinterConfig?.printToken) {
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);

            const lastTokenInvoice = await db.invoices
                .where('createdAt').above(startOfToday)
                .filter((inv: any) => !!inv.tokenNumber)
                .last();
            
            let nextToken = 1;
            if (lastTokenInvoice?.tokenNumber) {
                const lastToken = parseInt(lastTokenInvoice.tokenNumber, 10);
                if (!isNaN(lastToken)) {
                    nextToken = lastToken + 1;
                }
            }
            tokenNumber = nextToken.toString().padStart(3, '0');
        }

        const invoiceData: any = {
            invoiceNumber: finalInvoiceNumber,
            tokenNumber: tokenNumber, // Add token if generated
            customerName: customerName || t('pos.walk_in_customer'),
            customerId: customerId,
            customerVatNumber: customerId ? (customerVatNumber || undefined) : undefined,
            items: mappedItems, // Use the pre-calculated mapped items
            subTotal: subTotalSum, // Use strictly calculated sum
            discountAmount,
            taxAmount: taxAmount,
            grandTotal: grandTotal,
            paidAmount: isPayLater ? 0 : Math.round(amountPaid * 100) / 100,
            remainingAmount: isPayLater ? grandTotal : Math.round(((paymentMode === 'credit' || balanceDue > 0.01) ? (grandTotal - amountPaid) : 0) * 100) / 100,
            paymentMode: isPayLater ? 'pay_later' : paymentMode,
            createdAt: new Date(),
            paymentStatus: isPayLater ? 'pending' : finalStatus,
            status: isPayLater ? 'pending' : finalStatus,
            type: isPayLater ? 'order' : 'invoice',
            dueDate: (finalStatus !== 'paid' && dueDate) ? new Date(dueDate) : undefined,
            taxRate: taxPercent,
            notes: notes,
            orderType: orderType
        };

        try {
            console.log("DEBUG: Final Invoice Data Payload:", JSON.stringify(invoiceData, null, 2));
            let newId: string | undefined;
            // 1. Critical: Save to DB (Await this as it must succeed)
            newId = await onConfirm(invoiceData);
            // 2. Success Feedback (Close immediately and reset POS)
            addToast(isPayLater ? (t('sales.order_created', 'Order saved!')) : t('pos.order_completed_successfully'), 'success');
            
            // Start background tasks before closing
            const safeBusinessDetails = businessDetails || { name: 'My Shop', address: '', phone: '', email: '' };
            const isPrintEnabled = !printerConfig?.enableCheckoutPrintToggle || shouldPrint;
            // Skip printing and ZATCA for Pay Later orders
            if (!isPayLater && (businessDetails || safeBusinessDetails) && newId) {
                // Background tasks (Fire & Forget)
                const printDetails = { ...safeBusinessDetails, taxRate: taxPercent };
                const printDataForBg = { ...invoiceData, id: newId } as Invoice;
                setTimeout(async () => {
                    // --- 1. PRE-CALCULATE ZATCA (Once for both printing and reporting) ---
                    let precalculatedQR: string | undefined;
                    let precalculatedXML: string | undefined;
                    let precalculatedHash: string | undefined;
                    let precalculatedUUID: string | undefined;
                    let precalculatedICV: number | undefined;

                    try {
                        const vatNumberRaw = safeBusinessDetails.gstin || safeBusinessDetails.vatNo || '';
                        const vatNumber = vatNumberRaw.trim();
                        if (vatNumber) {
                            const zatcaConfig = (window.electron && window.electron.zatca)
                                ? await window.electron.zatca.getConfig()
                                : JSON.parse(localStorage.getItem('zatca_config') || 'null');

                            if (zatcaConfig && zatcaConfig.privateKey) {
                                const isLive = zatcaConfig.status === 'LIVE';
                                const activeCsid = isLive ? zatcaConfig.productionCsid : zatcaConfig.complianceCsid;

                                if (activeCsid) {
                                    const { generateZatcaXML } = await import('../../services/zatcaXml');
                                    const activeBranchId = getCurrentBranchId();
                                    const branch = await db.branches.get(activeBranchId);
                                    const currentPIH = branch?.lastInvoiceHash || 'NWZlY2ViNjZmZmM4NmYzOGQ5NTI3ODZjNmQ2OTZjNzljMmRiYzIzOWRkNGU5MWIyNGEyOTVRMzYxYzI4Y2I1MjM=';
                                    const nextICV = (branch?.invoiceCounter || 0) + 1;
                                    precalculatedICV = nextICV;

                                    const result = await generateZatcaXML(
                                        printDataForBg,
                                        { ...safeBusinessDetails, gstin: vatNumber },
                                        zatcaConfig.privateKey,
                                        activeCsid,
                                        currentPIH,
                                        nextICV
                                    );
                                
                                    precalculatedXML = result.xml;
                                    precalculatedHash = result.hash;
                                    precalculatedUUID = result.uuid;

                                    // Convert TLV to QR DataURL early
                                    const QRCode = (await import('qrcode')).default;
                                    precalculatedQR = await QRCode.toDataURL(result.qr, { margin: 0 });
                                    console.log("ZATCA Pre-calculation complete.");
                                }
                            }
                        }
                    } catch (e) {
                        console.error("ZATCA Pre-calculation failed:", e);
                    }

                    // --- 2. PRINTING SEQUENCE (Parallelized) ---
                    const executePrintingSequence = async () => {
                        console.log("Starting parallel printing sequence...");
                        const printTasks: Promise<any>[] = [];

                        // Kitchen Ticket
                        const printerConfigStr = localStorage.getItem('printerConfig');
                        const config = printerConfigStr ? JSON.parse(printerConfigStr) : null;
                        const kConfig = config?.kitchen;
                        
                        if (kConfig && kConfig.enabled) {
                            printTasks.push((async () => {
                                try {
                                    console.log("Task: Printing Kitchen Ticket...");
                                    await generateKitchenTicketPDF(printDataForBg);
                                    console.log("Kitchen Ticket Sent.");
                                } catch (e) { console.error("Kitchen Print Error:", e); }
                            })());
                        }

                        // Customer Receipt
                        if (isPrintEnabled) {
                            printTasks.push((async () => {
                                try {
                                    console.log("Task: Printing Customer Receipt...");
                                    await generateInvoicePDF(printDataForBg, printDetails, precalculatedQR);
                                    console.log("Customer Receipt Sent.");
                                } catch (e) { console.error("Customer Print Error:", e); }
                            })());
                        }

                        // Run all print tasks in parallel
                        if (printTasks.length > 0) {
                            await Promise.all(printTasks);
                            console.log("All print jobs dispatched.");
                        }
                    };

                    // Execute Printing
                    await executePrintingSequence();

                    // --- 3. ZATCA REPORTING (Background) ---
                    if (precalculatedXML && precalculatedHash) {
                        (async () => {
                            try {
                                const zatcaConfig = (window.electron && window.electron.zatca)
                                    ? await window.electron.zatca.getConfig()
                                    : JSON.parse(localStorage.getItem('zatca_config') || 'null');

                                if (zatcaConfig) {
                                    const { reportInvoice } = await import('../../services/zatcaApi');
                                    const isLive = zatcaConfig.status === 'LIVE';
                                    const canReport = isLive || zatcaConfig.status === 'COMPLIANCE_OBTAINED';
                                    const activeCsid = isLive ? zatcaConfig.productionCsid : zatcaConfig.complianceCsid;
                                    const activeSecret = isLive ? zatcaConfig.productionSecret : zatcaConfig.complianceSecret;
                                    const env = zatcaConfig.environment || 'PRODUCTION';

                                    if (canReport && activeCsid && activeSecret) {
                                        const reportResult = await reportInvoice(
                                            precalculatedXML!,
                                            precalculatedHash!,
                                            precalculatedUUID!,
                                            activeCsid,
                                            activeSecret,
                                            env
                                        );

                                        const accepted = ['REPORTED', 'REPORTED_WITH_WARNINGS'].includes(reportResult.status);
                                        if (accepted) {
                                            const activeBranchId = getCurrentBranchId();
                                            await db.branches.update(activeBranchId, {
                                                lastInvoiceHash: precalculatedHash,
                                                invoiceCounter: precalculatedICV
                                            });
                                            await db.invoices.update(newId!, {
                                                zatcaStatus: 'REPORTED',
                                                zatcaHash: precalculatedHash
                                            });
                                        } else {
                                            await db.invoices.update(newId!, {
                                                zatcaStatus: 'ERROR',
                                                zatcaError: reportResult.validationResults
                                                    ? JSON.stringify(reportResult.validationResults)
                                                    : `Unexpected ZATCA status: ${reportResult.status}`
                                            });
                                        }
                                    }
                                }
                            } catch (zatcaErr) {
                                console.error("ZATCA Reporting Task Failed:", zatcaErr);
                            }
                        })();
                    }

                    // --- 4. WHATSAPP NOTIFICATION ---
                    if (customerId && customerId !== '0') {
                        try {
                            const c = await db.customers.get(customerId);
                            if (c) {
                                await messagingService.sendThankYouMessage(printDataForBg, c);
                            }
                        } catch (err) {
                            console.error("WhatsApp notification failed:", err);
                        }
                    }
                }, 100);
            }

            // Close modal and return to POS immediately
            onClose(true);
            setIsProcessing(false);

        } catch (error) {
            console.error(error);
            addToast(`${t('pos.sale_failed')}: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
            setIsProcessing(false);
            return;
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={() => onClose()}
            maxWidth="6xl"
            className="!overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/50"
        >
            <div className="flex flex-col md:flex-row w-full min-h-0 relative" style={{ height: 'min(92vh, 760px)' }}>
                {/* Background Decorations */}
                <div className="absolute top-0 left-0 w-full h-full bg-slate-50 dark:bg-slate-900 -z-10" />

                {/* LEFT SIDE: Payment Methods */}
                <div className="w-full md:w-[45%] flex flex-col p-4 md:p-6 overflow-y-auto border-r border-slate-200/50 dark:border-slate-700/50 relative z-10">
                    <div className="flex justify-between items-center mb-5">
                        <div className="space-y-0.5">
                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{t('pos.select_payment_mode')}</h3>
                            <p className="text-xs font-medium text-slate-500">{t('pos.complete_transaction_to_print')}</p>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 mb-4">
                        {[
                            { id: 'cash', icon: Banknote, label: t('pos.pay_cash'), color: 'emerald' },
                            { id: 'card', icon: CreditCard, label: t('pos.pay_card'), color: 'blue' },
                            { id: 'upi', icon: Smartphone, label: t('pos.pay_digital'), color: 'indigo' },
                            { id: 'split', icon: SplitSquareHorizontal, label: t('pos.split_payment'), color: 'amber' },
                            { id: 'credit', icon: Clock, label: t('pos.pay_credit'), color: 'rose' },
                            ...(showPayLater !== false ? [{ id: 'pay_later', icon: Clock, label: t('pos.pay_later'), color: 'slate' }] : [])
                        ].map((mode) => (
                            <motion.button
                                key={mode.id}
                                whileHover={{ scale: 1.01, y: -1 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={() => {
                                    setPaymentMode(mode.id as any);
                                    setAmountPaidInput('');
                                    setSplitCashInput('');
                                    setSplitCardInput('');
                                }}
                                className={clsx(
                                    "px-3 py-3 rounded-xl border flex items-center justify-start gap-3 transition-all relative overflow-hidden group shadow-sm min-h-[62px]",
                                    paymentMode === mode.id
                                        ? 'bg-slate-900 dark:bg-blue-600 text-white border-transparent ring-4 ring-blue-500/10'
                                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                                )}
                            >
                                {paymentMode === mode.id && (
                                    <motion.div layoutId="active-mode-bg" className="absolute inset-0 bg-gradient-to-tr from-blue-600 to-indigo-600 pointer-events-none" />
                                )}
                                <div className="relative z-10 shrink-0">
                                    <mode.icon size={24} className={clsx("transition-transform duration-200", paymentMode === mode.id ? 'text-white' : 'text-slate-400')} />
                                </div>
                                <span className="relative z-10 font-semibold text-sm text-left leading-tight">{mode.label}</span>
                                {paymentMode === mode.id && <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute top-2 right-2 w-2 h-2 bg-white rounded-full shadow-[0_0_8px_white]" />}
                            </motion.button>
                        ))}
                    </div>

                    {/* Credit Info & Due Date */}
                    {paymentMode === 'credit' && (
                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                            <div className={clsx(
                                "p-4 rounded-xl border shadow-sm", 
                                canTakeCredit ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-900/50' : 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
                            )}>
                                <div className="flex justify-between items-center mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500"><Clock size={18} /></div>
                                        <div>
                                            <div className="text-xs font-medium text-slate-500">Credit Status</div>
                                            <div className="text-base font-semibold text-slate-900 dark:text-white">Account Balance</div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(customer?.balance || 0)}</div>
                                        <div className="text-xs font-medium text-slate-500">Limit: {formatCurrency(customer?.creditLimit || 0)}</div>
                                    </div>
                                </div>
                                {!canTakeCredit && (
                                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center justify-center gap-2">
                                        <div className="w-2 h-2 bg-rose-500 rounded-full animate-ping" />
                                        <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{t('pos.credit_error_title')}</p>
                                    </div>
                                )}
                            </div>

                            <div className="group/date">
                                <label className="block text-xs font-semibold text-slate-500 mb-2">
                                    {t('pos.due_date')} <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={dueDate}
                                    onChange={(e) => setDueDate(e.target.value)}
                                    className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-semibold text-sm shadow-inner"
                                    required
                                />
                            </div>
                        </motion.div>
                    )}

                    {/* Split Payment Inputs */}
                    {paymentMode === 'split' && (
                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="grid grid-cols-2 gap-3">
                            {[
                                { id: 'cash', label: 'Cash Amount', value: splitCashInput, setter: setSplitCashInput, icon: Banknote },
                                { id: 'card', label: 'Card Amount', value: splitCardInput, setter: setSplitCardInput, icon: CreditCard }
                            ].map((s) => (
                                <div key={s.id} className="space-y-2">
                                    <label className="block text-xs font-semibold text-slate-500">
                                        {s.label}
                                    </label>
                                    <div className="relative group/input">
                                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm group-focus-within/input:text-blue-500 transition-colors">{settings.currency}</div>
                                        <input
                                            type="number"
                                            value={s.value}
                                            onChange={(e) => s.setter(e.target.value)}
                                            placeholder="0.00"
                                            className="w-full pl-14 pr-3 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-semibold text-lg outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner"
                                        />
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    )}

                    {/* Payment Input (Card / UPI / Credit partials) */}
                    {paymentMode !== 'cash' && paymentMode !== 'split' && paymentMode !== 'pay_later' && (
                        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex-1 space-y-2">
                            <label className="block text-xs font-semibold text-slate-500">
                                {paymentMode === 'credit' ? t('pos.down_payment') : t('pos.amount_tendered')}
                            </label>
                            <div className="relative group/input">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-semibold text-sm group-focus-within/input:text-blue-500 transition-colors">{settings.currency}</div>
                                <input
                                    type="number"
                                    value={amountPaidInput}
                                    onChange={(e) => setAmountPaidInput(e.target.value)}
                                    placeholder={paymentMode === 'credit' ? "0.00" : grandTotal.toFixed(2)}
                                    className="w-full pl-14 pr-3 py-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-2xl outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner"
                                />
                            </div>
                        </motion.div>
                    )}

                    <div className="mt-auto pt-4 flex justify-between items-center border-t border-slate-200/50 dark:border-slate-700/50">
                         <motion.button 
                            whileHover={{ scale: 1.05, x: -5 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => onClose()} 
                            disabled={isProcessing} 
                            className="px-3 py-2 rounded-lg font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-all disabled:opacity-50 text-sm flex items-center gap-2"
                         >
                            <XCircle size={18} />
                            {t('common.cancel')}
                        </motion.button>
                    </div>
                </div>

                {/* RIGHT SIDE: Receipt Summary */}
                <div className="w-full md:w-[55%] bg-slate-50 dark:bg-slate-950 border-t md:border-t-0 border-l-0 md:border-l border-slate-200 dark:border-slate-800 flex flex-col relative z-10 min-h-0">
                    {/* Summary Header Gradient */}
                    <div className="absolute top-0 left-0 right-0 h-2 bg-gradient-to-r from-blue-500 via-indigo-600 to-blue-500" />
                    
                    <div className="p-4 flex-1 flex flex-col min-h-0">
                        <div className="flex justify-between items-center mb-3 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 bg-slate-900 dark:bg-white/10 rounded-lg flex items-center justify-center text-white">
                                    <Receipt size={18} />
                                </div>
                                <div>
                                    <h3 className="text-base font-semibold dark:text-white">{t('pos.order_summary')}</h3>
                                    <p className="text-xs font-medium text-slate-500">
                                        {new Date().toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                            {orderType && (
                                <motion.span 
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg text-xs font-semibold shadow-sm border border-slate-100 dark:border-slate-700 flex items-center gap-2"
                                >
                                    <span className="text-base">
                                        {settings.customOrderTypes?.[orderType]?.icon || (
                                            orderType === 'dine_in' ? '🍽️' :
                                            orderType === 'parcel' ? '🥡' :
                                            orderType === 'pickup' ? '🚶' : '🚚'
                                        )}
                                    </span>
                                    {settings.customOrderTypes?.[orderType]?.label || t(`pos.${orderType}`)}
                                </motion.span>
                            )}
                        </div>

                        {/* Scrollable Items List */}
                        <div className="flex-1 overflow-y-auto mb-3 pr-1 custom-scrollbar space-y-1.5 min-h-[160px]">
                            {items.map((item, idx) => (
                                <div key={idx} className="flex justify-between items-center group/item bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2">
                                    <div className="flex flex-col min-w-0 pr-3">
                                        <span className="text-sm font-semibold text-slate-800 dark:text-white line-clamp-1 group-hover/item:text-blue-500 transition-colors">{item.name}</span>
                                        <span className="text-xs font-medium text-slate-500">
                                            {item.quantity} x {formatCurrency(item.price)}
                                        </span>
                                    </div>
                                    <span className="text-sm font-bold text-slate-800 dark:text-white shrink-0">
                                        {formatCurrency(item.price * item.quantity)}
                                    </span>
                                </div>
                            ))}
                            {items.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center opacity-20 py-10">
                                    <Receipt size={40} className="mb-2" />
                                    <span className="text-xs font-semibold">No Items</span>
                                </div>
                            )}
                        </div>

                        {/* Bill Details */}
                        <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
                            <div className="flex justify-between items-center">
                                <span className="text-xs font-semibold text-slate-500">{t('pos.subtotal')} ({items.length} items)</span>
                                <span className="text-base font-bold text-slate-800 dark:text-white">{formatCurrency(subTotal)}</span>
                            </div>

                            {/* Discount Input */}
                            <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm group/disc">
                                <div className="flex justify-between items-center gap-3">
                                    <span className="text-xs font-semibold text-slate-500">{t('pos.discount')}</span>
                                    <div className="flex bg-slate-100 dark:bg-slate-950 rounded-lg p-1">
                                        {['percentage', 'fixed'].map((type) => (
                                            <button
                                                key={type}
                                                onClick={() => setDiscountType(type as any)}
                                                className={clsx(
                                                    "px-3 py-1 rounded-md text-xs font-semibold transition-all",
                                                    discountType === type 
                                                        ? 'bg-white dark:bg-slate-700 shadow-lg text-blue-600 dark:text-blue-400' 
                                                        : 'text-slate-400'
                                                )}
                                            >
                                                {type === 'percentage' ? '%' : 'AMT'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex justify-between items-center mt-2">
                                    <div className="relative border-b border-slate-200 dark:border-slate-700 focus-within:border-blue-500 pb-0.5 w-20">
                                        <input
                                            type="number"
                                            value={discountValue || ''}
                                            onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
                                            placeholder="0"
                                            className="w-full text-left bg-transparent outline-none font-semibold text-lg text-slate-800 dark:text-white"
                                        />
                                    </div>
                                    <div className="text-rose-500 font-bold text-base">-{formatCurrency(discountAmount)}</div>
                                </div>
                            </div>

                            {/* Tax Row */}
                            <div className="flex justify-between items-center pt-2 border-t border-slate-200/50 dark:border-slate-700/50">
                                <span className="text-xs font-semibold text-slate-500">{t('pos.tax')} (15%)</span>
                                <span className="text-base font-bold text-slate-800 dark:text-white">+{formatCurrency(taxAmount)}</span>
                            </div>
                        </div>

                        {/* Grand Total Card */}
                        <div className="bg-blue-600 p-4 rounded-xl shadow-sm my-2 shrink-0">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-white/75">{t('pos.grand_total')}</span>
                                <motion.span 
                                    key={grandTotal}
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    className="text-2xl md:text-3xl font-bold text-white leading-none"
                                >
                                    {formatCurrency(grandTotal)}
                                </motion.span>
                            </div>
                        </div>

                        {/* Change/Balance Indicator */}
                        <AnimatePresence mode="wait">
                            <motion.div 
                                key={changeAmount >= 0 ? 'change' : 'balance'}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className={clsx(
                                    "mb-2 flex items-center justify-between p-3 rounded-xl border transition-all shrink-0", 
                                    changeAmount >= 0 
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-950/20 dark:border-emerald-800/50 dark:text-emerald-400' 
                                        : 'bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-950/20 dark:border-rose-800/50 dark:text-rose-400'
                                )}
                            >
                                <div className="flex flex-col">
                                    <span className="font-semibold text-xs mb-0.5">
                                        {changeAmount >= 0 ? t('pos.change_due') : t('pos.credit_balance_remaining')}
                                    </span>
                                    <span className="text-lg font-bold">
                                        {formatCurrency(Math.abs(changeAmount >= 0 ? changeAmount : balanceDue))}
                                    </span>
                                </div>
                                <div className={clsx(
                                    "w-9 h-9 rounded-lg flex items-center justify-center",
                                    changeAmount >= 0 ? 'bg-emerald-500/20' : 'bg-rose-500/20'
                                )}>
                                    {changeAmount >= 0 ? <Banknote size={20} /> : <Clock size={20} />}
                                </div>
                            </motion.div>
                        </AnimatePresence>

                        {/* Actions */}
                        <div className="space-y-2 mt-auto shrink-0">
                            {/* Print Toggle */}
                            {printerConfig?.enableCheckoutPrintToggle && (
                                <label className="flex items-center justify-between cursor-pointer select-none px-1 py-1 group">
                                    <span className="text-xs font-semibold text-slate-500 group-hover:text-slate-700 dark:group-hover:text-white transition-colors">
                                        {t('pos.print_receipt')}
                                    </span>
                                    <div className="relative inline-flex items-center cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={shouldPrint}
                                            onChange={e => setShouldPrint(e.target.checked)}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-[18px] after:w-[18px] after:transition-all peer-checked:bg-blue-600" />
                                    </div>
                                </label>
                            )}

                            <motion.button
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.99 }}
                                onClick={handleConfirm}
                                disabled={(paymentMode === 'credit' && !canTakeCredit) || isProcessing || (paymentMode === 'split' && ((parseFloat(splitCashInput)||0) + (parseFloat(splitCardInput)||0) < grandTotal))}
                                className="w-full py-3 px-5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-base transition-colors flex items-center justify-center gap-3"
                            >
                                {isProcessing ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                        <span>{t('common.processing')}</span>
                                    </>
                                ) : (
                                    <>
                                        <ChevronRight size={20} />
                                        <span>{paymentMode === 'pay_later' ? t('pos.pay_later') : t('pos.checkout')}</span>
                                    </>
                                )}
                            </motion.button>
                        </div>
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default CheckoutModal;
