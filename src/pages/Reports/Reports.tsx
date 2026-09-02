import React, { useState } from 'react';
import { useReportData, type DateRange } from './useReportData';
import StatsCard from '../../components/Reports/StatsCard';
import SalesChart from '../../components/Reports/SalesChart';
import VatReport from './VatReport';
import BillProfitReport from './BillProfitReport';
import InventoryReport from './InventoryReport';
import DayBook from './DayBook';
import { DollarSign, PieChart, Calendar, TrendingDown, FileText, LayoutDashboard, ShieldOff, TrendingUp, Package, FileSpreadsheet, Download, Sparkles, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

const Reports: React.FC = () => {
    const { t } = useTranslation();
    const { settings, formatCurrency } = useSettings();
    const [activeTab, setActiveTab] = useState<'overview' | 'vat' | 'profit' | 'inventory' | 'daybook'>('overview');
    const [range, setRange] = useState<DateRange>('week');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const { canView } = useAuth();

    const {
        totalSales,
        totalExpenses,
        netProfit,
        grossProfit,
        salesByDate,
        currentStockValue
    } = useReportData(range, startDate, endDate);

    const getPeriodLabel = () => {
        if (startDate && endDate) {
            return `${format(new Date(startDate), 'dd MMM yyyy')} to ${format(new Date(endDate), 'dd MMM yyyy')}`;
        }
        return range.toUpperCase();
    };

    const handleExportExcel = () => {
        const periodLabel = getPeriodLabel();
        const summaryData = [{
            "Period": periodLabel,
            "Total Revenue": totalSales,
            "Gross Profit": grossProfit,
            "Net Profit": netProfit,
            "Expenses": totalExpenses,
            "Stock Value": currentStockValue
        }];

        const salesTrendData = salesByDate.map((d: any) => ({
            "Date": d.date,
            "Daily Sales": d.amount
        }));

        const wb = XLSX.utils.book_new();
        const wsSummary = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, wsSummary, "Overview Summary");

        if (salesTrendData.length > 0) {
            const wsTrend = XLSX.utils.json_to_sheet(salesTrendData);
            XLSX.utils.book_append_sheet(wb, wsTrend, "Sales Trend");
        }

        XLSX.writeFile(wb, `Business_Overview_${periodLabel.replace(/ /g, '_')}.xlsx`);
    };

    const handleExportPDF = () => {
        const doc = new jsPDF();
        const periodLabel = getPeriodLabel();
        const businessDetails = JSON.parse(localStorage.getItem('businessDetails') || '{}');

        const safeCurrency = (amount: number) => {
            return Number(amount).toLocaleString('en-US', {
                minimumFractionDigits: settings.decimals,
                maximumFractionDigits: settings.decimals
            });
        };

        doc.setFontSize(22);
        doc.text(businessDetails.businessName || 'Business Overview Report', 14, 20);
        doc.setFontSize(11);
        doc.text(`Period: ${periodLabel}`, 14, 28);
        doc.text(`Generated: ${format(new Date(), 'dd MMM yyyy HH:mm')}`, 14, 34);

        autoTable(doc, {
            head: [['Metric', 'Amount']],
            body: [
                ['Total Revenue', safeCurrency(totalSales)],
                ['Gross Profit', safeCurrency(grossProfit)],
                ['Net Profit', safeCurrency(netProfit)],
                ['Total Expenses', safeCurrency(totalExpenses)],
                ['Current Stock Value', safeCurrency(currentStockValue)],
            ],
            startY: 45,
            theme: 'striped',
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            styles: { fontSize: 11, cellPadding: 5 }
        });

        if (salesByDate.length > 0) {
            const currentY = (doc as any).lastAutoTable.finalY + 15;
            doc.setFontSize(14);
            doc.text('Daily Sales Trend', 14, currentY);

            autoTable(doc, {
                head: [['Date', 'Sales Amount']],
                body: salesByDate.map((d: any) => [d.date, safeCurrency(d.amount)]),
                startY: currentY + 5,
                theme: 'grid',
                headStyles: { fillColor: [100, 116, 139], textColor: 255 },
                styles: { fontSize: 10 }
            });
        }

        doc.save(`Business_Overview_${periodLabel.replace(/ /g, '_')}.pdf`);
    };

    if (!canView('reports')) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] text-center p-8 bg-slate-50 dark:bg-slate-900 rounded-[2.5rem] border border-dashed border-slate-200 dark:border-slate-800">
                <ShieldOff size={48} className="text-slate-300 mb-4" />
                <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">{t('common.access_denied')}</h2>
                <p className="text-slate-500">{t('reports.access_denied_msg')}</p>
            </div>
        );
    }

    const tabs = [
        { id: 'overview', icon: LayoutDashboard, label: t('reports.overview') },
        { id: 'daybook', icon: Calendar, label: t('reports.day_book') },
        { id: 'profit', icon: TrendingUp, label: t('reports.bill_wise_profit') },
        { id: 'inventory', icon: Package, label: t('reports.inventory_report') },
        { id: 'vat', icon: FileText, label: t('reports.vat_report') },
    ];

    return (
        <div className="space-y-8 pb-10">
            {/* Premium Header Bar */}
            <div className="bg-white/40 dark:bg-slate-800/20 backdrop-blur-2xl p-8 rounded-[3rem] shadow-2xl border border-white/50 dark:border-slate-700/30 relative overflow-hidden group">
                {/* Decorative background glow */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 blur-[100px] -mr-48 -mt-48 transition-opacity duration-1000 group-hover:opacity-100 opacity-50" />
                
                <div className="flex flex-col gap-8 relative z-10">
                    <div className="flex flex-col md:flex-row justify-between md:items-center gap-6">
                        <div>
                            <h1 className="text-4xl font-black dark:text-white flex items-center gap-4 tracking-tighter uppercase">
                                <div className="p-4 bg-slate-900 dark:bg-blue-600 text-white rounded-[2rem] shadow-2xl shadow-blue-500/20">
                                    <LayoutDashboard size={32} strokeWidth={2.5} />
                                </div>
                                <span>{t('reports.title')}</span>
                            </h1>
                            <p className="text-slate-500 dark:text-slate-400 font-bold mt-2 ml-2 text-xs uppercase tracking-[0.3em] flex items-center gap-2">
                                <Sparkles size={14} className="text-amber-500" />
                                {t('reports.insights_and_analytics')}
                            </p>
                        </div>
                        
                        {activeTab === 'overview' && (
                            <div className="flex items-center gap-3">
                                <motion.button
                                    whileHover={{ scale: 1.05, y: -2 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={handleExportExcel}
                                    className="flex items-center gap-3 px-6 py-4 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-2xl transition-all font-black text-xs uppercase tracking-widest border border-emerald-500/20 shadow-xl shadow-emerald-500/5 group"
                                >
                                    <FileSpreadsheet size={18} strokeWidth={2.5} className="group-hover:rotate-12 transition-transform" /> Excel
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.05, y: -2 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={handleExportPDF}
                                    className="flex items-center gap-3 px-6 py-4 bg-rose-500/10 text-rose-600 dark:text-rose-400 rounded-2xl transition-all font-black text-xs uppercase tracking-widest border border-rose-500/20 shadow-xl shadow-rose-500/5 group"
                                >
                                    <FileText size={18} strokeWidth={2.5} className="group-hover:rotate-12 transition-transform" /> PDF
                                </motion.button>
                            </div>
                        )}
                    </div>

                    <div className="h-px bg-gradient-to-r from-slate-200 dark:from-slate-700/50 via-transparent to-transparent w-full" />

                    <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-8">
                        {/* Custom Tab Navigation */}
                        <div className="flex flex-wrap items-center gap-3 bg-slate-100/50 dark:bg-slate-900/40 p-2 rounded-[2.5rem] border border-slate-200/50 dark:border-slate-800/50 shadow-inner">
                            {tabs.map(({ id, icon: Icon, label }) => (
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
                                        <motion.div layoutId="tab-active" className="absolute inset-0 bg-blue-600/5 dark:bg-white/10" />
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Premium Date Filters */}
                        {activeTab === 'overview' && (
                            <div className="flex flex-wrap items-center gap-4">
                                <div className="flex bg-slate-100/50 dark:bg-slate-900/50 p-1.5 rounded-2xl border border-slate-200/50 dark:border-slate-800 shadow-inner">
                                    {(['today', 'week', 'month', 'year'] as DateRange[]).map((r: any) => (
                                        <button
                                            key={r}
                                            onClick={() => { setRange(r); setStartDate(''); setEndDate(''); }}
                                            className={clsx(
                                                "px-5 py-2.5 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all",
                                                range === r && !startDate
                                                    ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-md'
                                                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                                            )}
                                        >
                                            {t(`reports.range_${r}`)}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex items-center gap-4 bg-white/50 dark:bg-slate-900/50 rounded-2xl p-2 px-5 border border-slate-200/50 dark:border-slate-800 shadow-xl">
                                    <Calendar size={18} className="text-blue-500 shrink-0" />
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="datetime-local"
                                            value={startDate}
                                            onChange={(e) => { setStartDate(e.target.value); setRange('custom'); }}
                                            className="bg-transparent border-0 p-0 text-xs font-black uppercase tracking-tighter w-[150px] focus:ring-0 text-slate-700 dark:text-slate-300 dark:[color-scheme:dark]"
                                        />
                                        <ArrowRight size={14} className="text-slate-300" />
                                        <input
                                            type="datetime-local"
                                            value={endDate}
                                            onChange={(e) => { setEndDate(e.target.value); setRange('custom'); }}
                                            className="bg-transparent border-0 p-0 text-xs font-black uppercase tracking-tighter w-[150px] focus:ring-0 text-slate-700 dark:text-slate-300 dark:[color-scheme:dark]"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                >
                    {activeTab === 'overview' && (
                        <div className="space-y-8">
                            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-6">
                                <StatsCard
                                    title={t('reports.total_revenue')}
                                    value={formatCurrency(totalSales)}
                                    icon={DollarSign}
                                    color="blue"
                                    trendType="neutral"
                                />
                                <StatsCard
                                    title={t('reports.gross_profit')}
                                    value={formatCurrency(grossProfit)}
                                    icon={TrendingUp}
                                    color="purple"
                                    trendType="neutral"
                                />
                                <StatsCard
                                    title={t('reports.net_profit')}
                                    value={formatCurrency(netProfit)}
                                    icon={PieChart}
                                    color="green"
                                    trendType="neutral"
                                />
                                <StatsCard
                                    title={t('reports.expenses')}
                                    value={formatCurrency(totalExpenses)}
                                    icon={TrendingDown}
                                    color="red"
                                    trendType="neutral"
                                />
                                <StatsCard
                                    title={t('reports.stock_value')}
                                    value={formatCurrency(currentStockValue)}
                                    icon={Package}
                                    color="blue"
                                    trendType="neutral"
                                />
                            </div>

                            {/* Main Chart Section */}
                            <div className="bg-white/40 dark:bg-slate-800/20 backdrop-blur-2xl p-10 rounded-[3rem] border border-white/50 dark:border-slate-700/30 shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600/5 blur-[120px] rounded-full -mr-64 -mt-64 transition-opacity group-hover:opacity-100 opacity-50 pointer-events-none" />
                                
                                <div className="flex items-center justify-between mb-10 relative z-10">
                                    <div className="flex items-center gap-4">
                                        <div className="p-4 bg-blue-600/10 text-blue-600 dark:text-blue-400 rounded-[1.5rem] shadow-lg shadow-blue-500/5 border border-blue-500/20">
                                            <Calendar size={28} strokeWidth={2.5} />
                                        </div>
                                        <div>
                                            <h3 className="font-black text-2xl dark:text-white tracking-tighter uppercase">{t('reports.sales_trend')}</h3>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">{t('reports.historical_sales_performance')}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 px-5 py-2.5 bg-slate-100/50 dark:bg-slate-900/50 rounded-2xl border border-slate-200/50 dark:border-slate-800 font-black text-[10px] uppercase tracking-widest text-slate-500">
                                        <Download size={14} /> {t('common.export')}
                                    </div>
                                </div>
                                
                                <div className="relative z-10 h-[450px]">
                                    <SalesChart data={salesByDate} />
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'vat' && <VatReport />}

                    {activeTab === 'profit' && (
                        settings.enableBillWiseProfit ? <BillProfitReport /> :
                            <div className="p-16 text-center text-slate-400 bg-white/40 dark:bg-slate-800/20 backdrop-blur-xl rounded-[2.5rem] border border-dashed border-slate-200 dark:border-slate-700/50 font-black uppercase tracking-widest text-xs">
                                <ShieldOff size={40} className="mx-auto mb-4 opacity-20" />
                                {t('reports.feature_disabled')}
                            </div>
                    )}

                    {activeTab === 'inventory' && (
                        settings.enableStockReport ? <InventoryReport /> :
                            <div className="p-16 text-center text-slate-400 bg-white/40 dark:bg-slate-800/20 backdrop-blur-xl rounded-[2.5rem] border border-dashed border-slate-200 dark:border-slate-700/50 font-black uppercase tracking-widest text-xs">
                                <ShieldOff size={40} className="mx-auto mb-4 opacity-20" />
                                {t('reports.feature_disabled')}
                            </div>
                    )}

                    {activeTab === 'daybook' && <DayBook />}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

export default Reports;
