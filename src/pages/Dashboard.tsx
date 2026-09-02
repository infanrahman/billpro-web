import React from 'react';
import { useTranslation } from 'react-i18next';
import { db, matchesActiveScope } from '../services/db';
import { useLiveQuery } from 'dexie-react-hooks';
import Dexie from 'dexie';
import {
    DollarSign,
    TrendingUp,
    TrendingDown,
    AlertCircle,
    ShoppingBag,
    Users,
    ArrowUpRight,
    ArrowDownRight,
    Layers,
    Activity
} from 'lucide-react';
import {
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { useNotification } from '../contexts/NotificationContext';
import Skeleton from '../components/UI/Skeleton';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';

interface StatCardProps {
    title: string;
    value: string | number;
    icon: React.ElementType;
    color: string;
    subValue?: string;
    trend?: 'up' | 'down';
    index: number;
}

const StatCard = ({ title, value, icon: Icon, color, subValue, trend, index }: StatCardProps) => (
    <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.1, duration: 0.5, ease: "easeOut" }}
        className="relative group overflow-hidden bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-200"
    >
        {/* Background Glow */}
        <div className={`absolute -right-8 -top-8 w-24 h-24 blur-[60px] opacity-10 rounded-full ${color.replace('bg-', 'bg-opacity-40 ')}`} />
        
        <div className="relative flex justify-between items-start z-10">
            <div className="flex-1">
                <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold mb-2">{title}</p>
                <h3 className="text-2xl font-bold dark:text-white">{value}</h3>
                
                {subValue && (
                    <div className="flex items-center gap-2 mt-2">
                        <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${trend === 'down' ? 'bg-rose-500/10 text-rose-500' : 'bg-emerald-500/10 text-emerald-500'}`}>
                            {trend === 'up' ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                            {subValue}
                        </span>
                    </div>
                )}
            </div>
            <div className={`p-3 rounded-lg ${color} text-white`}>
                <Icon size={20} strokeWidth={2.5} />
            </div>
        </div>
    </motion.div>
);

const Dashboard: React.FC = () => {
    const today = new Date();
    const { t } = useTranslation();
    const { checkReminders } = useNotification();
    const { formatCurrency, formatDate } = useSettings();
    const { canView, activeCompanyId, activeBranchId, activeBranch, user } = useAuth();

    React.useEffect(() => {
        checkReminders();
    }, [checkReminders]);

    const invoices = useLiveQuery(() => db.invoices.filter(invoice => matchesActiveScope(invoice, activeCompanyId, activeBranchId, activeBranch?.isMaster)).toArray(), [activeCompanyId, activeBranchId, activeBranch?.isMaster]);
    const expenses = useLiveQuery(() => db.expenses.filter(expense => matchesActiveScope(expense, activeCompanyId, activeBranchId, activeBranch?.isMaster)).toArray(), [activeCompanyId, activeBranchId, activeBranch?.isMaster]);
    const lowStockItems = useLiveQuery(() =>
        db.items.filter(item => matchesActiveScope(item, activeCompanyId, activeBranchId, activeBranch?.isMaster) && item.stock <= item.minStock).toArray(), [activeCompanyId, activeBranchId, activeBranch?.isMaster]
    );
    const purchases = useLiveQuery(() => db.purchases.filter(purchase => matchesActiveScope(purchase, activeCompanyId, activeBranchId, activeBranch?.isMaster)).toArray(), [activeCompanyId, activeBranchId, activeBranch?.isMaster]);
    const suppliers = useLiveQuery(() => db.suppliers.filter(supplier => matchesActiveScope(supplier, activeCompanyId, activeBranchId, activeBranch?.isMaster)).toArray(), [activeCompanyId, activeBranchId, activeBranch?.isMaster]);
    const inventoryItems = useLiveQuery(() => db.items.filter(item => matchesActiveScope(item, activeCompanyId, activeBranchId, activeBranch?.isMaster)).toArray(), [activeCompanyId, activeBranchId, activeBranch?.isMaster]);

    const isLoading = !invoices || !expenses || !lowStockItems || !purchases || !suppliers;

    // Metrics Calculation
    const { totalSales, totalTax, totalCOGS } = (invoices || []).reduce((acc, inv) => {
        acc.totalSales += inv.grandTotal;
        acc.totalTax += inv.taxAmount || 0;
        const invCOGS = (inv.items || []).reduce((pSum, item) => {
            const cost = item.purchasePrice ?? (inventoryItems?.find(oi => oi.id === item.itemId)?.purchasePrice || 0);
            return pSum + (cost * item.quantity);
        }, 0);
        acc.totalCOGS += invCOGS;
        return acc;
    }, { totalSales: 0, totalTax: 0, totalCOGS: 0 });

    const netRevenue = totalSales - totalTax;
    const totalExpenses = expenses?.reduce((sum: any, exp: any) => sum + exp.amount, 0) || 0;
    const netProfit = netRevenue - totalCOGS - totalExpenses;

    const todaySales = invoices
        ?.filter((inv: any) => new Date(inv.createdAt).toDateString() === today.toDateString())
        .reduce((sum: any, inv: any) => sum + inv.grandTotal, 0) || 0;

    const pendingOrders = purchases?.filter((p: any) => p.type === 'order' && p.status === 'pending') || [];
    const totalPurchasesMonth = purchases
        ?.filter((p: any) => p.type === 'bill' && new Date(p.date).getMonth() === today.getMonth())
        .reduce((sum: any, p: any) => sum + p.totalAmount, 0) || 0;
    const totalSupplierBalance = suppliers?.reduce((sum: any, s: any) => sum + (s.balance || 0), 0) || 0;

    const chartData = Array.from({ length: 7 }).map((_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const sales = invoices
            ?.filter((inv: any) => new Date(inv.createdAt).toDateString() === d.toDateString())
            .reduce((sum: any, inv: any) => sum + inv.grandTotal, 0) || 0;
        return { name: formatDate(d), sales };
    });

    if (isLoading) {
        return (
            <div className="space-y-8 animate-pulse p-8">
                <div className="flex justify-between items-end">
                    <div className="space-y-2">
                        <Skeleton width={200} height={40} className="rounded-xl" />
                        <Skeleton width={300} height={20} className="rounded-lg" />
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                    {[1, 2, 3, 4].map(i => <Skeleton key={i} height={160} className="rounded-[2.5rem]" />)}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <Skeleton height={450} className="lg:col-span-2 rounded-[2.5rem]" />
                    <Skeleton height={450} className="rounded-[2.5rem]" />
                </div>
            </div>
        );
    }

    const greeting = () => {
        const hour = today.getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 17) return 'Good afternoon';
        return 'Good evening';
    };

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4 min-h-screen pb-8"
        >
            <div className="relative">
                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div>
                        <motion.div 
                            initial={{ x: -20 }}
                            animate={{ x: 0 }}
                            className="flex items-center gap-2 mb-1"
                        >
                            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{greeting()}</span>
                        </motion.div>
                        <h1 className="text-2xl md:text-3xl font-bold dark:text-white flex items-center gap-3">
                            {user?.name || 'Admin'}
                            <span className="text-xs bg-blue-600 text-white px-2 py-1 rounded-full font-semibold">v3.0</span>
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm font-medium">{t('dashboard.description')}</p>
                    </div>
                    
                    <div className="flex gap-3">
                        <div className="px-3 py-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-3 shadow-sm">
                            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600">
                                <Activity size={17} />
                            </div>
                            <div>
                                <p className="text-xs font-medium text-slate-500">System Status</p>
                                <p className="text-sm font-semibold dark:text-white flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                                    Operational
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {canView('reports') && (
                    <>
                        <StatCard
                            index={0}
                            title={t('dashboard.total_revenue')}
                            value={formatCurrency(netRevenue)}
                            icon={DollarSign}
                            color="bg-gradient-to-br from-blue-500 to-indigo-600"
                            subValue={`${formatCurrency(todaySales)} today`}
                            trend="up"
                        />
                        <StatCard
                            index={1}
                            title={t('dashboard.net_profit')}
                            value={formatCurrency(netProfit)}
                            icon={TrendingUp}
                            color="bg-gradient-to-br from-emerald-500 to-teal-600"
                            subValue="Stable"
                            trend="up"
                        />
                        <StatCard
                            index={2}
                            title={t('dashboard.total_expenses')}
                            value={formatCurrency(totalExpenses)}
                            icon={TrendingDown}
                            color="bg-gradient-to-br from-rose-500 to-orange-600"
                            subValue="Controlled"
                            trend="down"
                        />
                    </>
                )}
                {canView('inventory') && (
                    <StatCard
                        index={3}
                        title={t('dashboard.low_stock_items')}
                        value={lowStockItems?.length || 0}
                        icon={AlertCircle}
                        color="bg-gradient-to-br from-amber-500 to-orange-600"
                        subValue={t('dashboard.action_needed')}
                        trend="down"
                    />
                )}
            </div>

            {/* Secondary Metrics */}
            {canView('purchases') && (
                <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                    className="grid grid-cols-1 md:grid-cols-3 gap-3"
                >
                    {[
                        { title: t('dashboard.pending_orders'), value: pendingOrders.length, icon: ShoppingBag, color: 'text-indigo-500', bg: 'bg-indigo-500/10' },
                        { title: t('dashboard.purchases_month'), value: formatCurrency(totalPurchasesMonth), icon: Layers, color: 'text-blue-500', bg: 'bg-blue-500/10' },
                        { title: t('dashboard.supplier_balance'), value: formatCurrency(totalSupplierBalance), icon: Users, color: 'text-rose-500', bg: 'bg-rose-500/10' }
                    ].map((item, i) => (
                        <div key={i} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center gap-4 shadow-sm group">
                            <div className={`p-3 rounded-lg ${item.bg} ${item.color}`}>
                                <item.icon size={20} strokeWidth={2.5} />
                            </div>
                            <div>
                                <p className="text-slate-500 dark:text-slate-400 text-sm font-semibold">{item.title}</p>
                                <h3 className="text-xl font-bold dark:text-white mt-0.5">{item.value}</h3>
                            </div>
                        </div>
                    ))}
                </motion.div>
            )}

            {/* Charts & Tables */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                {/* Main Chart */}
                {canView('reports') && (
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: 0.5 }}
                        className="lg:col-span-2 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm"
                    >
                        <div className="flex justify-between items-center mb-4">
                            <div>
                                <h3 className="text-lg font-semibold dark:text-white">{t('dashboard.sales_overview')}</h3>
                                <p className="text-slate-500 text-xs font-medium mt-0.5">Last 7 days activity</p>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                                <span className="text-xs font-medium text-slate-500">Revenue</span>
                            </div>
                        </div>
                        <div className="h-[260px] min-h-[260px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="8 8" vertical={false} stroke="#64748b" opacity={0.1} />
                                    <XAxis 
                                        dataKey="name" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                                        dy={10}
                                    />
                                    <YAxis 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                                        dx={-10}
                                    />
                                    <Tooltip 
                                        cursor={{ stroke: '#3b82f6', strokeWidth: 2, strokeDasharray: '4 4' }}
                                        contentStyle={{ 
                                            backgroundColor: 'rgba(15, 23, 42, 0.9)', 
                                            borderRadius: '12px', 
                                            border: '1px solid rgba(255, 255, 255, 0.1)',
                                            backdropFilter: 'blur(12px)',
                                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                                            padding: '10px'
                                        }}
                                        itemStyle={{ color: '#fff', fontSize: '13px', fontWeight: '700' }}
                                        labelStyle={{ color: '#64748b', marginBottom: '6px', fontSize: '12px', fontWeight: '600' }}
                                    />
                                    <Area 
                                        type="monotone" 
                                        dataKey="sales" 
                                        stroke="#3b82f6" 
                                        strokeWidth={3} 
                                        fillOpacity={1} 
                                        fill="url(#colorSales)"
                                        animationDuration={2000}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>
                )}

                {/* Low Stock List */}
                {canView('inventory') && (
                    <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.6 }}
                        className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm"
                    >
                        <h3 className="text-lg font-semibold mb-4 dark:text-white flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                                <AlertCircle size={18} className="text-amber-500" />
                            </div>
                            {t('dashboard.low_stock_items')}
                        </h3>
                        <div className="space-y-2">
                            {lowStockItems?.slice(0, 6).map((item: any, i: number) => (
                                <motion.div 
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.7 + (i * 0.1) }}
                                    key={item.id} 
                                    className="flex items-center justify-between p-3 bg-slate-100/70 dark:bg-slate-950 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all group"
                                >
                                    <div className="min-w-0">
                                        <p className="font-semibold text-sm dark:text-white line-clamp-1 group-hover:text-blue-500 transition-colors">{item.name}</p>
                                        <p className="text-xs text-slate-500 font-medium mt-0.5">Ref: {item.barcode || 'N/A'}</p>
                                    </div>
                                    <span className="px-2 py-1 bg-rose-500/10 text-rose-500 rounded-lg text-xs font-semibold border border-rose-500/20">
                                        {item.stock} LEFT
                                    </span>
                                </motion.div>
                            ))}
                            {lowStockItems?.length === 0 && (
                                <div className="flex flex-col items-center justify-center py-8 space-y-3">
                                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                        <Activity size={24} />
                                    </div>
                                    <p className="text-slate-500 text-sm font-medium text-center">{t('dashboard.all_stocked')}</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </div>

            {/* Recent Transactions */}
            <motion.div 
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
                className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm"
            >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3 mb-4">
                    <div>
                        <h3 className="text-lg font-semibold dark:text-white">{t('dashboard.recent_transactions')}</h3>
                        <p className="text-slate-500 text-xs font-medium mt-0.5">Live feed</p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead className="text-slate-500 text-xs font-semibold">
                            <tr>
                                <th className="pb-3 px-3">Timestamp</th>
                                <th className="pb-3 px-3">Invoice #</th>
                                <th className="pb-3 px-3">Customer</th>
                                <th className="pb-3 px-3">Total</th>
                                <th className="pb-3 px-3">Method</th>
                                <th className="pb-3 px-3 text-center">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                            {[...(invoices || [])].sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 8).map((inv: any, i: number) => (
                                <motion.tr 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 1 + (i * 0.05) }}
                                    key={inv.id} 
                                    className="hover:bg-slate-100/50 dark:hover:bg-slate-700/30 transition-all group"
                                >
                                    <td className="py-3 px-3 font-medium text-slate-500 dark:text-slate-400 text-sm">
                                        {formatDate(inv.createdAt)}
                                    </td>
                                    <td className="py-3 px-3">
                                        <span className="font-mono text-xs font-semibold bg-slate-100 dark:bg-slate-950 px-2 py-1 rounded-md text-slate-500 group-hover:text-blue-500 transition-colors">#{inv.invoiceNumber}</span>
                                    </td>
                                    <td className="py-3 px-3 text-slate-800 dark:text-white font-semibold text-sm">{inv.customerName || 'Walk-in Customer'}</td>
                                    <td className="py-3 px-3 font-bold text-blue-600 dark:text-blue-400 text-sm">{formatCurrency(inv.grandTotal)}</td>
                                    <td className="py-3 px-3">
                                        <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-md text-xs font-semibold border border-slate-200/50 dark:border-slate-700/50">
                                            {inv.paymentMode}
                                        </span>
                                    </td>
                                    <td className="py-3 px-3 text-center">
                                        <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold border shadow-sm
                                            ${inv.paymentStatus === 'paid' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' :
                                                inv.paymentStatus === 'pending' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' :
                                                    'bg-blue-500/10 text-blue-600 border-blue-500/20'}`}>
                                            {inv.paymentStatus}
                                        </span>
                                    </td>
                                </motion.tr>
                            ))}
                            {invoices?.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="text-center py-10">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-300">
                                                <Layers size={26} />
                                            </div>
                                            <p className="text-slate-500 text-sm font-medium">{t('dashboard.no_transactions')}</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default Dashboard;
