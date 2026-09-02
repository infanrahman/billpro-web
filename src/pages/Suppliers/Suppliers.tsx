import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, Edit, Phone, Building, ShieldOff, Search, Sparkles, Mail, ArrowUpRight } from 'lucide-react';
import { db, matchesActiveScope, type Supplier, type SyncEntity, createRecordMetadata, updateRecordMetadata, softDeleteMetadata } from '../../services/db';
import { useNotification } from '../../contexts/NotificationContext';
import Modal from '../../components/UI/Modal';
import ConfirmationModal from '../../components/UI/ConfirmationModal';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import clsx from 'clsx';
import { useSettings } from '../../contexts/SettingsContext';

const Suppliers: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { formatCurrency } = useSettings();
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
    const { addToast } = useNotification();
    const { canView, canCreate, canUpdate, canDelete, activeCompanyId, activeBranchId, activeBranch } = useAuth();

    // Form State
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [email, setEmail] = useState('');
    const [location, setLocation] = useState('');
    const [taxNumber, setTaxNumber] = useState('');

    const fetchSuppliers = async () => {
        try {
            const data = await db.suppliers
                .filter((s) => matchesActiveScope(s, activeCompanyId, activeBranchId, activeBranch?.isMaster) && !s.deletedAt)
                .toArray();
            setSuppliers(data);
        } catch (error) {
            console.error(error);
            addToast(t('suppliers.load_error'), 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSuppliers();
    }, [activeCompanyId, activeBranchId, activeBranch?.isMaster]);

    const resetForm = () => {
        setName('');
        setPhone('');
        setEmail('');
        setLocation('');
        setTaxNumber('');
        setEditingSupplier(null);
    };

    const handleEdit = (supplier: Supplier) => {
        if (!canUpdate('suppliers')) {
            addToast(t('common.access_denied'), 'error');
            return;
        }
        setEditingSupplier(supplier);
        setName(supplier.name);
        setPhone(supplier.phone);
        setEmail(supplier.email || '');
        setLocation(supplier.location || '');
        setTaxNumber(supplier.taxNumber || '');
        setIsModalOpen(true);
    };

    const [supplierToDelete, setSupplierToDelete] = useState<string | null>(null);

    const handleDeleteClick = (id: string) => {
        if (!canDelete('suppliers')) {
            addToast(t('common.access_denied'), 'error');
            return;
        }
        setSupplierToDelete(id);
    };

    const handleConfirmDelete = async () => {
        if (!canDelete('suppliers')) {
            addToast(t('common.access_denied'), 'error');
            return;
        }

        if (supplierToDelete) {
            try {
                await db.suppliers.update(supplierToDelete, softDeleteMetadata());
                addToast(t('suppliers.delete_success'), 'success');
                fetchSuppliers();
            } catch {
                addToast(t('suppliers.delete_error'), 'error');
            } finally {
                setSupplierToDelete(null);
            }
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !phone) {
            addToast(t('suppliers.validation_error'), 'error');
            return;
        }

        const supplierData: Omit<Supplier, keyof SyncEntity> = {
            name,
            phone,
            email,
            location,
            taxNumber,
            balance: editingSupplier ? editingSupplier.balance : 0
        };

        try {
            if (editingSupplier && editingSupplier.id) {
                if (!canUpdate('suppliers')) {
                    addToast(t('common.access_denied'), 'error');
                    return;
                }
                await db.suppliers.update(editingSupplier.id, { ...supplierData, ...updateRecordMetadata() });
                addToast(t('suppliers.update_success'), 'success');
            } else {
                if (!canCreate('suppliers')) {
                    addToast(t('common.access_denied'), 'error');
                    return;
                }
                await db.suppliers.add({ ...supplierData, ...createRecordMetadata() });
                addToast(t('suppliers.add_success'), 'success');
            }
            setIsModalOpen(false);
            resetForm();
            fetchSuppliers();
        } catch (error) {
            addToast(t('suppliers.save_error'), 'error');
        }
    };

    if (!canView('suppliers')) {
        return (
            <div className="flex flex-col items-center justify-center h-[calc(100vh-10rem)] text-center p-8 bg-slate-50 dark:bg-slate-900 rounded-[2.5rem] border border-dashed border-slate-200 dark:border-slate-800">
                <ShieldOff size={48} className="text-slate-300 mb-4" />
                <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">{t('suppliers.access_denied')}</h2>
                <p className="text-slate-500">{t('suppliers.access_denied_msg')}</p>
            </div>
        );
    }

    if (loading) return (
        <div className="flex items-center justify-center h-96">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        </div>
    );

    const filteredSuppliers = suppliers.filter((supplier: any) =>
        !supplier.deletedAt && (
            supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            supplier.phone.includes(searchQuery) ||
            (supplier.taxNumber && supplier.taxNumber.toLowerCase().includes(searchQuery.toLowerCase()))
        )
    );

    return (
        <div className="space-y-8 pb-10">
            {/* Header Bar */}
            <div className="bg-white/40 dark:bg-slate-800/20 backdrop-blur-2xl p-8 rounded-[3rem] shadow-2xl border border-white/50 dark:border-slate-700/30 relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/5 blur-[100px] -mr-48 -mt-48 transition-opacity duration-1000 group-hover:opacity-100 opacity-50 pointer-events-none" />
                
                <div className="flex flex-col md:flex-row justify-between md:items-center gap-8 relative z-10">
                    <div>
                        <h1 className="text-4xl font-black dark:text-white flex items-center gap-4 tracking-tighter uppercase">
                            <div className="p-4 bg-slate-900 dark:bg-blue-600 text-white rounded-[2rem] shadow-2xl shadow-blue-500/20">
                                <Building size={32} strokeWidth={2.5} />
                            </div>
                            <span>{t('suppliers.title')}</span>
                        </h1>
                        <p className="text-slate-500 dark:text-slate-400 font-bold mt-2 ml-2 text-xs uppercase tracking-[0.3em] flex items-center gap-2">
                            <Sparkles size={14} className="text-amber-500" />
                            {t('suppliers.manage_vendors')}
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
                        <div className="relative w-full sm:w-80 group">
                            <Search className="w-5 h-5 absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                            <input
                                type="text"
                                placeholder={t('common.search') || 'Search suppliers...'}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-14 pr-6 py-4 bg-white/50 dark:bg-slate-900/50 border border-slate-200/50 dark:border-slate-800 rounded-[1.5rem] font-bold text-sm focus:ring-4 focus:ring-blue-500/10 outline-none transition-all dark:text-white"
                            />
                        </div>
                        {canCreate('suppliers') && (
                            <motion.button
                                whileHover={{ scale: 1.05, y: -2 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => { resetForm(); setIsModalOpen(true); }}
                                className="flex items-center gap-3 bg-slate-900 dark:bg-blue-600 text-white px-8 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-2xl shadow-blue-500/20 hover:bg-black transition-all group shrink-0 w-full sm:w-auto"
                            >
                                <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
                                <span>{t('common.add')}</span>
                            </motion.button>
                        )}
                    </div>
                </div>
            </div>

            {/* Grid Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                <AnimatePresence mode="popLayout">
                    {filteredSuppliers.map((supplier: any, index) => (
                        <motion.div
                            key={supplier.id}
                            layout
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            transition={{ duration: 0.4, delay: index * 0.05 }}
                            onClick={() => navigate(`/suppliers/${supplier.id}`)}
                            className="bg-white/40 dark:bg-slate-800/20 backdrop-blur-2xl p-8 rounded-[3rem] shadow-2xl border border-white/50 dark:border-slate-700/30 text-left flex flex-col justify-between min-h-[340px] h-full group relative overflow-hidden cursor-pointer"
                        >
                            {/* Card Background Decoration */}
                            <div className="absolute top-0 right-0 w-48 h-48 bg-blue-600/5 blur-[80px] -mr-24 -mt-24 pointer-events-none group-hover:bg-blue-600/10 transition-colors" />

                            <div className="flex justify-between items-start relative z-10">
                                <div className="flex items-center gap-5">
                                    <div className="w-16 h-16 rounded-[1.5rem] bg-slate-900 dark:bg-blue-600 flex items-center justify-center text-white text-2xl font-black shadow-xl shadow-blue-500/10 uppercase">
                                        {supplier.name.charAt(0)}
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black text-slate-800 dark:text-white tracking-tight uppercase line-clamp-1">{supplier.name}</h3>
                                        <div className="flex items-center gap-2 mt-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                                {supplier.taxNumber ? `${t('suppliers.tax_id')}: ${supplier.taxNumber}` : t('suppliers.no_tax_id')}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                                    {canUpdate('suppliers') && (
                                        <button onClick={() => handleEdit(supplier)} className="p-3 text-slate-400 hover:text-blue-500 hover:bg-white dark:hover:bg-slate-800 rounded-2xl transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700 shadow-sm">
                                            <Edit size={18} />
                                        </button>
                                    )}
                                    {canDelete('suppliers') && (
                                        <button onClick={() => handleDeleteClick(supplier.id!)} className="p-3 text-slate-400 hover:text-rose-500 hover:bg-white dark:hover:bg-slate-800 rounded-2xl transition-all border border-transparent hover:border-slate-200 dark:hover:border-slate-700 shadow-sm">
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="bg-slate-50/50 dark:bg-slate-900/40 p-6 rounded-[2rem] border border-slate-200/50 dark:border-slate-700/50 mt-6 relative z-10">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2">{t('purchases.balance_due')}</p>
                                <div className="flex items-center justify-between">
                                    <p className={clsx(
                                        "text-3xl font-black tracking-tighter",
                                        supplier.balance > 0 ? 'text-rose-500' : 'text-emerald-500'
                                    )}>
                                        {formatCurrency(supplier.balance)}
                                    </p>
                                    <div className="p-2 bg-white dark:bg-slate-800 rounded-xl shadow-md group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform">
                                        <ArrowUpRight size={18} className="text-blue-500" />
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mt-6 relative z-10 border-t border-dashed border-slate-200 dark:border-slate-700 pt-6">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-xl">
                                        <Phone size={14} />
                                    </div>
                                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">{supplier.phone}</span>
                                </div>
                                {supplier.email && (
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-slate-50 dark:bg-slate-800 text-slate-400 rounded-xl">
                                            <Mail size={14} />
                                        </div>
                                        <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">{supplier.email}</span>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    ))}
                </AnimatePresence>

                {suppliers.length === 0 && (
                    <div className="col-span-full py-32 text-center bg-white/40 dark:bg-slate-800/20 backdrop-blur-xl rounded-[3rem] border border-dashed border-slate-200 dark:border-slate-700/50">
                        <Building size={80} strokeWidth={1} className="mx-auto mb-6 text-slate-300" />
                        <p className="text-xl font-black text-slate-700 dark:text-slate-300 uppercase tracking-tighter">{t('suppliers.no_suppliers')}</p>
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mt-2">{t('suppliers.start_msg')}</p>
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setIsModalOpen(true)}
                            className="mt-8 px-8 py-3 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-blue-500/20"
                        >
                            {t('common.add_your_first')}
                        </motion.button>
                    </div>
                )}
            </div>

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingSupplier ? t('common.edit') : t('common.add')}
            >
                <form onSubmit={handleSave} className="p-8 space-y-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('suppliers.name')}</label>
                        <input
                            type="text"
                            required
                            placeholder="Supplier Name"
                            className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                            value={name}
                            onChange={e => setName(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('suppliers.phone')}</label>
                            <input
                                type="tel"
                                required
                                placeholder="+966"
                                className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                                value={phone}
                                onChange={e => setPhone(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('suppliers.tax_vat')}</label>
                            <input
                                type="text"
                                placeholder="VAT Number"
                                className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                                value={taxNumber}
                                onChange={e => setTaxNumber(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('suppliers.email')}</label>
                        <input
                            type="email"
                            placeholder="email@example.com"
                            className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{t('suppliers.location')}</label>
                        <textarea
                            placeholder="Full Address"
                            className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-bold dark:text-white outline-none focus:ring-4 focus:ring-blue-500/10 transition-all shadow-inner"
                            rows={3}
                            value={location}
                            onChange={e => setLocation(e.target.value)}
                        />
                    </div>

                    <div className="flex justify-end gap-4 pt-6">
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="px-8 py-4 text-slate-400 hover:text-slate-900 dark:hover:text-white font-black text-xs uppercase tracking-widest transition-all"
                        >
                            {t('common.cancel')}
                        </button>
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            type="submit"
                            className="px-10 py-4 bg-slate-900 dark:bg-blue-600 text-white rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-2xl shadow-blue-500/20"
                        >
                            {editingSupplier ? t('common.update') : t('common.save')}
                        </motion.button>
                    </div>
                </form>
            </Modal>

            <ConfirmationModal
                isOpen={!!supplierToDelete}
                onClose={() => setSupplierToDelete(null)}
                onConfirm={handleConfirmDelete}
                title={t('suppliers.delete_title')}
                message={t('suppliers.delete_confirm')}
                confirmText={t('common.delete')}
                variant="danger"
            />
        </div>
    );
};

export default Suppliers;
