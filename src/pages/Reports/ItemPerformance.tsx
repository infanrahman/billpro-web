import React from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import type { InventoryRow } from './useInventoryReport';
import { TrendingUp, TrendingDown, DollarSign, ArrowDownLeft, ArrowUpRight, Sparkles } from 'lucide-react';
import { motion } from 'framer-motion';
import clsx from 'clsx';

interface Props {
    data: InventoryRow[];
    loading: boolean;
    totals: any;
}

const ItemPerformance: React.FC<Props> = ({ data, loading, totals }) => {
    const { t } = useTranslation();
    const { formatCurrency } = useSettings();

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { title: t('reports.total_in'), value: totals.totalIn.toString(), icon: ArrowDownLeft, color: 'blue' },
                    { title: t('reports.total_out'), value: totals.totalOut.toString(), icon: ArrowUpRight, color: 'purple' },
                    { title: t('reports.total_revenue'), value: formatCurrency(totals.totalRevenue), icon: DollarSign, color: 'emerald' },
                    { title: t('reports.total_profit'), value: formatCurrency(totals.totalProfit), icon: TrendingUp, color: totals.totalProfit >= 0 ? 'emerald' : 'rose' }
                ].map((stat, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-white/40 dark:bg-slate-800/20 backdrop-blur-xl p-6 rounded-[2.5rem] shadow-xl border border-white/50 dark:border-slate-700/30 flex items-center gap-6 group"
                    >
                        <div className={clsx(
                            "p-4 rounded-2xl shadow-lg text-white transition-transform group-hover:scale-110",
                            stat.color === 'blue' ? "bg-blue-600 shadow-blue-500/20" :
                            stat.color === 'purple' ? "bg-purple-600 shadow-purple-500/20" :
                            stat.color === 'emerald' ? "bg-emerald-500 shadow-emerald-500/20" : "bg-rose-500 shadow-rose-500/20"
                        )}>
                            <stat.icon size={24} strokeWidth={2.5} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.title}</p>
                            <p className="text-xl font-black text-slate-900 dark:text-white tracking-tighter">{stat.value}</p>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Table Container */}
            <div className="bg-white/40 dark:bg-slate-800/20 backdrop-blur-2xl rounded-[3rem] shadow-2xl border border-white/50 dark:border-slate-700/30 overflow-hidden">
                <div className="p-8 border-b border-slate-100 dark:border-slate-700/50 flex justify-between items-center bg-slate-50/30 dark:bg-slate-900/10">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-500/10 text-blue-500 rounded-2xl">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black dark:text-white uppercase tracking-tighter">{t('reports.item_performance')}</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('reports.performance_subtitle') || "Deep dive into product movement and profitability"}</p>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left whitespace-nowrap">
                        <thead>
                            <tr className="bg-slate-50/50 dark:bg-slate-900/30">
                                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400">{t('inventory.item_name')}</th>
                                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">{t('reports.opening')}</th>
                                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">{t('reports.in_qty')}</th>
                                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">{t('reports.out_qty')}</th>
                                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-center">{t('reports.closing')}</th>
                                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">{t('reports.revenue')}</th>
                                <th className="p-6 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right">{t('reports.profit')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                            {loading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={7} className="p-6"><div className="h-6 bg-slate-100 dark:bg-slate-800 rounded-lg w-full" /></td>
                                    </tr>
                                ))
                            ) : data.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-20 text-center">
                                        <TrendingUp size={48} className="mx-auto mb-4 text-slate-300 opacity-50" />
                                        <p className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">{t('reports.no_records')}</p>
                                    </td>
                                </tr>
                            ) : (
                                data.map((row: any, idx) => (
                                    <motion.tr 
                                        key={row.id}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: idx * 0.02 }}
                                        className="hover:bg-slate-50/50 dark:hover:bg-slate-700/30 transition-all group"
                                    >
                                        <td className="p-6 font-black text-slate-800 dark:text-white uppercase tracking-tight">{row.name}</td>
                                        <td className="p-6 text-center text-slate-500 font-bold text-xs">{row.openingStock}</td>
                                        <td className="p-6 text-center">
                                            <span className="px-3 py-1 bg-emerald-500/10 text-emerald-600 rounded-lg text-[11px] font-black border border-emerald-500/20">
                                                +{row.qtyIn}
                                            </span>
                                        </td>
                                        <td className="p-6 text-center">
                                            <span className="px-3 py-1 bg-rose-500/10 text-rose-600 rounded-lg text-[11px] font-black border border-rose-500/20">
                                                -{row.qtyOut}
                                            </span>
                                        </td>
                                        <td className="p-6 text-center">
                                            <span className="px-3 py-1 bg-slate-100 dark:bg-slate-900 rounded-lg text-[11px] font-black text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800">
                                                {row.closingStock}
                                            </span>
                                        </td>
                                        <td className="p-6 text-right font-black text-slate-900 dark:text-white tracking-tighter text-sm">{formatCurrency(row.revenue || 0)}</td>
                                        <td className="p-6 text-right">
                                            <p className={clsx(
                                                "text-sm font-black tracking-tighter",
                                                (row.profit || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'
                                            )}>
                                                {formatCurrency(row.profit || 0)}
                                            </p>
                                        </td>
                                    </motion.tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ItemPerformance;
