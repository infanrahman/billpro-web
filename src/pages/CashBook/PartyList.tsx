import React, { useState } from 'react';
import { Search, Plus, User, Phone, ArrowUpRight, ArrowDownLeft, ChevronRight, Sparkles } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, matchesActiveScope } from '../../services/db';
import { formatCurrency } from '../../utils/currency';
import AddPartyModal from './AddPartyModal';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../contexts/AuthContext';
import { motion } from 'framer-motion';
import clsx from 'clsx';

interface PartyListProps {
    onSelect?: (id: string) => void;
    filterType?: 'customer' | 'supplier' | 'other';
}

const PartyList: React.FC<PartyListProps> = ({ onSelect, filterType }) => {
    const { t } = useTranslation();
    const { canCreate, activeCompanyId, activeBranchId, activeBranch } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [isAddOpen, setIsAddOpen] = useState(false);

    const parties = useLiveQuery(() => {
        if (filterType) {
            return db.cashParties.filter((p) => matchesActiveScope(p, activeCompanyId, activeBranchId, activeBranch?.isMaster) && !p.deletedAt && p.type === filterType).toArray();
        }
        return db.cashParties.filter((p) => matchesActiveScope(p, activeCompanyId, activeBranchId, activeBranch?.isMaster) && !p.deletedAt).toArray();
    }, [filterType, activeCompanyId, activeBranchId, activeBranch?.isMaster]);

    const filteredParties = parties?.filter((p: any) =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.phone.includes(searchTerm)
    );

    const totalToCollect = parties?.filter((p: any) => p.openingBalance > 0).reduce((sum: any, p: any) => sum + p.openingBalance, 0) || 0;
    const totalToPay = parties?.filter((p: any) => p.openingBalance < 0).reduce((sum: any, p: any) => sum + Math.abs(p.openingBalance), 0) || 0;

    return (
        <div className="space-y-10">
            {/* Net Stats Ribbon */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <motion.div 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-white/40 dark:bg-slate-800/20 backdrop-blur-2xl p-8 rounded-[3rem] border border-white/50 dark:border-slate-700/30 shadow-2xl flex items-center gap-8 group"
                >
                    <div className="p-6 bg-emerald-500 text-white rounded-[1.5rem] shadow-2xl shadow-emerald-500/20 transition-transform group-hover:scale-110 duration-500">
                        <ArrowDownLeft size={32} strokeWidth={2.5} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{t('cashbook.you_will_get')}</p>
                        <p className="text-4xl font-black text-emerald-500 tracking-tighter">{formatCurrency(totalToCollect)}</p>
                    </div>
                </motion.div>

                <motion.div 
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-white/40 dark:bg-slate-800/20 backdrop-blur-2xl p-8 rounded-[3rem] border border-white/50 dark:border-slate-700/30 shadow-2xl flex items-center gap-8 group"
                >
                    <div className="p-6 bg-rose-500 text-white rounded-[1.5rem] shadow-2xl shadow-rose-500/20 transition-transform group-hover:scale-110 duration-500">
                        <ArrowUpRight size={32} strokeWidth={2.5} />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">{t('cashbook.you_will_give')}</p>
                        <p className="text-4xl font-black text-rose-500 tracking-tighter">{formatCurrency(totalToPay)}</p>
                    </div>
                </motion.div>
            </div>

            {/* Actions Bar */}
            <div className="flex flex-col md:flex-row gap-6">
                <div className="relative flex-1 group">
                    <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" size={20} />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder={t('cashbook.search_parties')}
                        className="w-full pl-16 pr-8 py-5 bg-white/40 dark:bg-slate-800/20 backdrop-blur-xl border border-white/50 dark:border-slate-700/30 rounded-[2rem] shadow-xl focus:ring-4 focus:ring-blue-500/10 outline-none dark:text-white font-black text-xs uppercase tracking-widest transition-all"
                    />
                </div>
                <motion.button
                    whileHover={{ scale: 1.02, y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                        if (canCreate('cashbook')) setIsAddOpen(true);
                    }}
                    className="flex items-center justify-center gap-3 bg-slate-900 dark:bg-blue-600 text-white px-10 py-5 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-2xl shadow-blue-500/20 transition-all shrink-0"
                >
                    <Plus size={20} strokeWidth={3} />
                    {t('common.add_party')}
                </motion.button>
            </div>

            {/* Premium List */}
            <div className="bg-white/40 dark:bg-slate-800/20 backdrop-blur-2xl rounded-[3rem] border border-white/50 dark:border-slate-700/30 overflow-hidden shadow-2xl">
                <div className="p-8 border-b border-slate-100/50 dark:border-slate-700/50 flex justify-between items-center bg-slate-50/30 dark:bg-slate-900/10">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-500/10 text-blue-500 rounded-2xl">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-black dark:text-white uppercase tracking-tighter">{t('cashbook.active_ledger')}</h3>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{t('cashbook.ledger_subtitle') || "Real-time balance monitoring"}</p>
                        </div>
                    </div>
                </div>

                <div className="divide-y divide-slate-100/50 dark:divide-slate-800/50">
                    {filteredParties?.map((party: any, idx: number) => (
                        <motion.div
                            key={party.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.02 }}
                            onClick={() => onSelect && party.id && onSelect(party.id as string)}
                            className="p-8 hover:bg-white/60 dark:hover:bg-slate-700/40 transition-all cursor-pointer flex justify-between items-center group"
                        >
                            <div className="flex items-center gap-6">
                                <div className="w-16 h-16 rounded-[1.5rem] bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center text-xl font-black shadow-xl shadow-blue-500/20 transform group-hover:rotate-6 transition-transform duration-500">
                                    {party.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{party.name}</h3>
                                    {party.phone && (
                                        <div className="flex items-center gap-2 mt-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                            <Phone size={12} className="text-blue-500" />
                                            {party.phone}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center gap-8">
                                <div className="text-right">
                                    <p className={clsx(
                                        "text-2xl font-black tracking-tighter",
                                        party.openingBalance >= 0 ? 'text-emerald-500' : 'text-rose-500'
                                    )}>
                                        {formatCurrency(Math.abs(party.openingBalance))}
                                    </p>
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                                        {party.openingBalance >= 0 ? t('cashbook.you_will_get') : t('cashbook.you_will_give')}
                                    </p>
                                </div>
                                <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-all transform group-hover:translate-x-1 duration-300">
                                    <ChevronRight size={20} strokeWidth={3} />
                                </div>
                            </div>
                        </motion.div>
                    ))}

                    {(!filteredParties || filteredParties.length === 0) && (
                        <div className="p-24 text-center">
                            <div className="p-8 bg-slate-100/50 dark:bg-slate-900/50 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-6">
                                <User size={48} className="text-slate-300" strokeWidth={1.5} />
                            </div>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">{t('cashbook.no_parties_found')}</h3>
                            <p className="text-xs font-bold text-slate-400 dark:text-slate-500 mt-2 uppercase tracking-widest">{t('cashbook.start_by_adding')}</p>
                        </div>
                    )}
                </div>
            </div>

            <AddPartyModal
                isOpen={isAddOpen}
                onClose={() => setIsAddOpen(false)}
                onSave={() => { }}
                defaultType={filterType}
            />
        </div>
    );
};

export default PartyList;
