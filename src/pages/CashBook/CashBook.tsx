import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Users, Package, ShieldOff, Sparkles, TrendingUp, ChevronRight } from 'lucide-react';
import PartyDetails from './PartyDetails';
import PartyList from './PartyList';
import { useAuth } from '../../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';

const CashBook: React.FC = () => {
    const { t } = useTranslation();
    const { canView } = useAuth();

    if (!canView('cashbook')) {
        return (
            <div className="flex flex-col items-center justify-center h-[80vh] text-center p-8 bg-white/40 dark:bg-slate-800/20 backdrop-blur-2xl rounded-[3rem] border border-white/50 dark:border-slate-700/30 shadow-2xl">
                <div className="p-6 bg-rose-500/10 text-rose-500 rounded-full mb-6">
                    <ShieldOff size={48} strokeWidth={1.5} />
                </div>
                <h2 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">{t('common.access_denied')}</h2>
                <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mt-2 max-w-md">{t('cashbook.access_denied_msg')}</p>
            </div>
        );
    }

    const [activeTab, setActiveTab] = useState<'supplier' | 'customer'>('supplier');
    const [selectedPartyId, setSelectedPartyId] = useState<string | null>(null);

    if (selectedPartyId) {
        return <PartyDetails partyId={selectedPartyId} onBack={() => setSelectedPartyId(null)} />;
    }

    return (
        <div className="space-y-10 pb-24 animate-in fade-in duration-500">
            {/* Header / Tabs */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div className="relative">
                    <div className="absolute -left-12 -top-12 w-32 h-32 bg-blue-600/10 blur-[60px] rounded-full pointer-events-none" />
                    <h1 className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter uppercase relative z-10 flex items-center gap-4">
                        {t('cashbook.title')}
                        <Sparkles size={24} className="text-amber-500" />
                    </h1>
                    <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.4em] mt-3 ml-1">
                        {t('cashbook.subtitle')}
                    </p>
                </div>

                {/* PREMIUM TABS SWITCHER */}
                <div className="bg-white/40 dark:bg-slate-800/20 backdrop-blur-3xl p-1.5 rounded-[2rem] border border-white/50 dark:border-slate-700/30 flex items-center shadow-2xl shadow-blue-500/5">
                    <button
                        onClick={() => setActiveTab('supplier')}
                        className={clsx(
                            "flex items-center gap-3 px-8 py-3 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-500 relative overflow-hidden group",
                            activeTab === 'supplier'
                                ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-2xl shadow-blue-500/20'
                                : 'text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-800/50'
                        )}
                    >
                        <Package size={16} strokeWidth={activeTab === 'supplier' ? 2.5 : 2} />
                        {t('cashbook.tab_suppliers')}
                        {activeTab === 'supplier' && (
                            <motion.div layoutId="cashbook-tab" className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('customer')}
                        className={clsx(
                            "flex items-center gap-3 px-8 py-3 rounded-[1.5rem] text-[10px] font-black uppercase tracking-[0.2em] transition-all duration-500 relative overflow-hidden group",
                            activeTab === 'customer'
                                ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-2xl shadow-blue-500/20'
                                : 'text-slate-500 dark:text-slate-400 hover:bg-white/50 dark:hover:bg-slate-800/50'
                        )}
                    >
                        <Users size={16} strokeWidth={activeTab === 'customer' ? 2.5 : 2} />
                        {t('cashbook.tab_customers')}
                        {activeTab === 'customer' && (
                            <motion.div layoutId="cashbook-tab" className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent" />
                        )}
                    </button>
                </div>
            </div>

            {/* Content Container */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                >
                    <PartyList
                        filterType={activeTab}
                        onSelect={setSelectedPartyId}
                    />
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

export default CashBook;
