import React, { useState, useEffect } from 'react';
import { Plus, Users, Trash2, Wallet, ShieldOff, Search, Phone, Mail, Sparkles, Filter, ChevronDown, ArrowUpRight, TrendingUp, History } from 'lucide-react';
import { db, matchesActiveScope, type Customer, softDeleteMetadata } from '../../services/db';
import { useNotification } from '../../contexts/NotificationContext';
import CustomerForm from './CustomerForm';
import CustomerHistoryModal from './CustomerHistoryModal';
import CustomerPaymentModal from './CustomerPaymentModal';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../contexts/SettingsContext';
import ConfirmationModal from '../../components/UI/ConfirmationModal';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import Skeleton from '../../components/UI/Skeleton';

const CustomerList: React.FC = () => {
    const { t } = useTranslation();
    const { formatCurrency } = useSettings();
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<string>('name_asc');
    
    const [showForm, setShowForm] = useState(false);
    const [showHistory, setShowHistory] = useState<string | null>(null);
    const [showPayment, setShowPayment] = useState<Customer | null>(null);
    const [editingCustomer, setEditingCustomer] = useState<Customer | undefined>(undefined);
    const { addToast } = useNotification();
    const { canView, canCreate, canUpdate, canDelete, activeCompanyId, activeBranchId, activeBranch } = useAuth();

    const fetchCustomers = React.useCallback(async () => {
        try {
            const data = await db.customers
                .filter((c) => matchesActiveScope(c, activeCompanyId, activeBranchId, activeBranch?.isMaster) && !c.deletedAt)
                .toArray();
            setCustomers(data);
        } catch (error) {
            console.error(error);
            addToast(t('customers.load_error'), 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast, t, activeCompanyId, activeBranchId, activeBranch?.isMaster]);

    useEffect(() => {
        fetchCustomers();
    }, [fetchCustomers]);

    const filteredCustomers = React.useMemo(() => {
        let items = [...customers];
        
        if (searchQuery) {
            const lower = searchQuery.toLowerCase();
            items = items.filter(c => 
                c.name.toLowerCase().includes(lower) || 
                c.phone?.toLowerCase().includes(lower)
            );
        }

        items.sort((a, b) => {
            if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
            if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
            if (sortBy === 'spent_desc') return (b.totalSpent || 0) - (a.totalSpent || 0);
            if (sortBy === 'balance_desc') return (b.balance || 0) - (a.balance || 0);
            return 0;
        });

        return items;
    }, [customers, searchQuery, sortBy]);

    const stats = React.useMemo(() => {
        const totalCustomers = customers.length;
        const totalOutstanding = customers.reduce((sum, c) => sum + (c.balance || 0), 0);
        const topCustomer = [...customers].sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0))[0];
        
        return { totalCustomers, totalOutstanding, topCustomer };
    }, [customers]);

    const [customerToDelete, setCustomerToDelete] = useState<string | null>(null);

    const handleConfirmDelete = async () => {
        if (!canDelete('customers')) {
            addToast(t('common.access_denied'), 'error');
            return;
        }

        if (customerToDelete) {
            try {
                await db.customers.update(customerToDelete, softDeleteMetadata());
                addToast(t('customers.delete_success'), 'success');
                fetchCustomers();
            } catch {
                addToast(t('customers.delete_error'), 'error');
            } finally {
                setCustomerToDelete(null);
            }
        }
    };

    const handleFormClose = () => {
        setShowForm(false);
        setEditingCustomer(undefined);
        fetchCustomers();
    };

    if (!canView('customers')) {
        return (
            <div className="flex flex-col items-center justify-center h-screen text-center p-8">
                <ShieldOff size={48} className="text-slate-300 mb-4" />
                <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">{t('customers.access_denied')}</h2>
                <p className="text-slate-500">{t('customers.access_denied_msg')}</p>
            </div>
        );
    }

    return (
        <div className="p-8 space-y-8 pb-20">
            {/* Header Section */}
            <div className="bg-white/40 dark:bg-slate-800/20 backdrop-blur-2xl p-8 rounded-[3rem] shadow-2xl border border-white/50 dark:border-slate-700/30 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/5 blur-[100px] -mr-48 -mt-48 pointer-events-none" />
                
                <div className="flex flex-col md:flex-row justify-between md:items-center gap-8 relative z-10">
                    <div>
                        <h1 className="text-4xl font-black dark:text-white tracking-tighter uppercase flex items-center gap-4">
                            <Users size={40} className="text-indigo-600 dark:text-indigo-400" />
                            {t('customers.title')}
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 font-bold mt-2 text-[10px] uppercase tracking-[0.3em]">
                            {t('customers.manage_customers') || 'Manage your regular customers and their accounts'}
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        {canCreate('customers') && (
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setShowForm(true)}
                                className="flex items-center gap-3 bg-slate-900 dark:bg-indigo-600 text-white px-8 py-4 rounded-2xl shadow-2xl shadow-indigo-500/20 font-black text-xs uppercase tracking-widest"
                            >
                                <Plus size={18} />
                                {t('common.add')}
                            </motion.button>
                        )}
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[
                    { label: t('customers.total_customers') || 'Total Customers', value: stats.totalCustomers, icon: Users, color: 'blue' },
                    { label: t('customers.outstanding_balance') || 'Total Outstanding', value: formatCurrency(stats.totalOutstanding), icon: Wallet, color: 'rose' },
                    { label: t('customers.top_customer') || 'Top Customer', value: stats.topCustomer?.name || '---', icon: Sparkles, color: 'indigo' }
                ].map((stat, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="bg-white/40 dark:bg-slate-800/20 backdrop-blur-xl p-6 rounded-[2.5rem] shadow-xl border border-white/50 dark:border-slate-700/30 flex items-center gap-6"
                    >
                        <div className={clsx(
                            "p-4 rounded-2xl shadow-lg",
                            stat.color === 'blue' ? "bg-blue-500 text-white" :
                            stat.color === 'rose' ? "bg-rose-500 text-white" : "bg-indigo-500 text-white"
                        )}>
                            <stat.icon size={24} />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{stat.label}</p>
                            <p className="text-2xl font-black text-slate-900 dark:text-white tracking-tighter">{stat.value}</p>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-white/40 dark:bg-slate-800/20 backdrop-blur-2xl p-4 rounded-[2rem] shadow-2xl border border-white/50 dark:border-slate-700/30 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="relative flex-1 w-full group">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-500 transition-colors" size={20} />
                    <input
                        type="text"
                        placeholder={t('customers.search_parties') || "Search by name or phone..."}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-16 pr-6 py-4 bg-white/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all dark:text-white"
                    />
                </div>
                
                <div className="relative w-full md:w-auto">
                    <select 
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="w-full md:w-64 appearance-none pl-12 pr-12 py-4 bg-white/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800 rounded-2xl font-bold text-sm outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all dark:text-white cursor-pointer"
                    >
                        <option value="name_asc">{t('common.name')} (A-Z)</option>
                        <option value="name_desc">{t('common.name')} (Z-A)</option>
                        <option value="spent_desc">{t('customers.total_spent')}</option>
                        <option value="balance_desc">{t('customers.credit_balance')}</option>
                    </select>
                    <Filter size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <AnimatePresence mode="popLayout">
                    {loading ? (
                        Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="min-h-[340px] h-full bg-slate-100/50 dark:bg-slate-800/40 rounded-[3rem] animate-pulse" />
                        ))
                    ) : (
                        filteredCustomers.map((customer, index) => (
                            <motion.div
                                key={customer.id}
                                initial={{ opacity: 0, y: 30 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                transition={{ duration: 0.4, delay: index * 0.05 }}
                                className="bg-white/40 dark:bg-slate-800/20 backdrop-blur-2xl p-8 rounded-[3rem] shadow-2xl border border-white/50 dark:border-slate-700/30 text-left flex flex-col justify-between min-h-[340px] h-full group relative overflow-hidden cursor-pointer hover:shadow-indigo-500/10 hover:border-indigo-500/30 transition-all"
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 blur-3xl -mr-16 -mt-16 group-hover:bg-indigo-500/10 transition-all" />
                                
                                <div>
                                    <div className="flex justify-between items-start mb-6">
                                        <div className="w-14 h-14 bg-indigo-500 text-white rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                                            <Users size={28} />
                                        </div>
                                        {(customer.balance || 0) > 0 && (
                                            <div className="bg-rose-500/10 text-rose-500 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest border border-rose-500/20">
                                                {t('customers.credit_balance')}
                                            </div>
                                        )}
                                    </div>
                                    
                                    <h3 className="text-2xl font-black dark:text-white mb-2 line-clamp-1 uppercase tracking-tight">{customer.name}</h3>
                                    
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                            <Phone size={14} className="text-indigo-500" />
                                            <span className="text-xs font-bold font-mono">{customer.phone || '---'}</span>
                                        </div>
                                        {customer.email && (
                                            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
                                                <Mail size={14} className="text-indigo-500" />
                                                <span className="text-xs font-bold truncate">{customer.email}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-slate-50/50 dark:bg-slate-900/40 p-4 rounded-[1.5rem] border border-slate-100 dark:border-slate-800">
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('customers.total_spent')}</p>
                                            <p className="text-sm font-black dark:text-white tracking-tighter">{formatCurrency(customer.totalSpent || 0)}</p>
                                        </div>
                                        <div className={clsx(
                                            "p-4 rounded-[1.5rem] border",
                                            (customer.balance || 0) > 0 
                                                ? "bg-rose-500/5 border-rose-500/10" 
                                                : "bg-slate-50/50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800"
                                        )}>
                                            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{t('customers.credit_balance')}</p>
                                            <p className={clsx(
                                                "text-sm font-black tracking-tighter",
                                                (customer.balance || 0) > 0 ? "text-rose-500" : "dark:text-white"
                                            )}>{formatCurrency(customer.balance || 0)}</p>
                                        </div>
                                    </div>

                                    <div className="flex gap-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setShowHistory(customer.id!); }}
                                            className="flex-1 flex items-center justify-center gap-2 py-3 bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-[9px] font-black uppercase tracking-widest text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                                        >
                                            <History size={14} />
                                            {t('customers.history')}
                                        </button>
                                        {(customer.balance || 0) > 0 && canUpdate('customers') && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setShowPayment(customer); }}
                                                className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-500 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:scale-105 transition-all"
                                            >
                                                <Wallet size={14} />
                                                {t('customers.pay')}
                                            </button>
                                        )}
                                        {canDelete('customers') && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setCustomerToDelete(customer.id!); }}
                                                className="p-3 bg-rose-500/10 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </motion.div>
                        ))
                    )}
                </AnimatePresence>
            </div>

            {/* Empty State */}
            {!loading && filteredCustomers.length === 0 && (
                <div className="py-40 text-center bg-white/40 dark:bg-slate-800/20 backdrop-blur-xl rounded-[4rem] border-4 border-dashed border-slate-200 dark:border-slate-800 max-w-4xl mx-auto">
                    <Users size={80} strokeWidth={1} className="mx-auto mb-6 text-slate-300" />
                    <h3 className="text-2xl font-black dark:text-white uppercase tracking-tighter mb-2">{t('customers.no_customers')}</h3>
                    <p className="text-slate-500 font-medium mb-8">{t('customers.no_customers_desc')}</p>
                    {canCreate('customers') && (
                        <button
                            onClick={() => setShowForm(true)}
                            className="bg-indigo-600 text-white px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-2xl shadow-indigo-500/20"
                        >
                            {t('common.add_your_first') || 'Add Your First Customer'}
                        </button>
                    )}
                </div>
            )}

            {/* Modals */}
            {showHistory && (
                <CustomerHistoryModal
                    customerId={showHistory}
                    onClose={() => setShowHistory(null)}
                />
            )}

            {showPayment && (
                <CustomerPaymentModal
                    customer={showPayment}
                    onClose={() => setShowPayment(null)}
                    onPaymentComplete={fetchCustomers}
                />
            )}

            {showForm && (
                <CustomerForm
                    key={editingCustomer?.id || 'new'}
                    customer={editingCustomer}
                    onClose={handleFormClose}
                    onSave={fetchCustomers}
                />
            )}

            <ConfirmationModal
                isOpen={!!customerToDelete}
                onClose={() => setCustomerToDelete(null)}
                onConfirm={handleConfirmDelete}
                title={t('customers.delete_title')}
                message={t('customers.delete_confirm')}
                confirmText={t('common.delete')}
                variant="danger"
            />
        </div>
    );
};

export default CustomerList;
