import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { db, createRecordMetadata, matchesActiveScope, updateRecordMetadata } from '../../services/db';
import type { Item, Supplier, Category } from '../../services/db';
import { useNotification } from '../../contexts/NotificationContext';
import { 
    Save, ArrowLeft, ScanBarcode, ShieldOff, 
    Upload, X, Box, Tag, Banknote, 
    Warehouse, Hash, Info, Sparkles, Package, Wand2
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSettings } from '../../contexts/SettingsContext';
import { motion } from 'framer-motion';
import clsx from 'clsx';

const ItemForm: React.FC = () => {
    const { t } = useTranslation();
    const { id } = useParams();
    const navigate = useNavigate();
    const { addToast } = useNotification();
    const { canCreate, canUpdate, activeCompanyId, activeBranchId, activeBranch } = useAuth();
    const { settings } = useSettings();
    const isEdit = !!id;
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);

    const [formData, setFormData] = useState<Item>({
        id: '',
        branchId: '',
        updatedAt: new Date(),
        name: '',
        arabicName: '',
        barcode: '',
        salePrice: 0,
        purchasePrice: 0,
        taxType: 'exclusive',
        taxRate: 0,
        stock: 0,
        minStock: 5,
        location: '',
        unit: 'pc',
        itemCode: ''
    });

    useEffect(() => {
        const saved = localStorage.getItem('businessDetails');
        if (saved) {
            const details = JSON.parse(saved);
            if (details.taxRate && parseFloat(details.taxRate) > 0) {
                const rate = parseFloat(details.taxRate);
                if (!isEdit) {
                    setFormData(prev => ({
                        ...prev,
                        taxRate: rate,
                        taxType: 'exclusive'
                    }));
                }
            }
        }

        const fetchData = async () => {
            const allSuppliers = await db.suppliers
                .filter(supplier => matchesActiveScope(supplier, activeCompanyId, activeBranchId, activeBranch?.isMaster) && !supplier.deletedAt)
                .toArray();
            setSuppliers(allSuppliers);

            const allCategories = await db.categories
                .filter(category => matchesActiveScope(category, activeCompanyId, activeBranchId, activeBranch?.isMaster) && !category.deletedAt)
                .toArray();
            setCategories(allCategories);
        };
        fetchData();
    }, [isEdit, activeCompanyId, activeBranchId, activeBranch?.isMaster]);

    useEffect(() => {
        if (isEdit) {
            db.items.get(id!).then((item) => {
                if (item && matchesActiveScope(item, activeCompanyId, activeBranchId, activeBranch?.isMaster)) setFormData(item);
            });
        }
    }, [id, isEdit, activeCompanyId, activeBranchId, activeBranch?.isMaster]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        let value: any = e.target.type === 'number' ? parseFloat(e.target.value) : e.target.value;
        if (value === '') {
            if (e.target.name === 'supplierId' || e.target.name === 'categoryId') {
                value = undefined;
            }
        }
        setFormData({ ...formData, [e.target.name]: value });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (isEdit) {
                if (!canUpdate('inventory')) {
                    addToast(t('common.access_denied'), 'error');
                    return;
                }
                const updatedItem = { ...formData, ...updateRecordMetadata() };
                await db.items.update(id!, updatedItem);
                addToast(t('inventory.update_success'), 'success');
            } else {
                if (!canCreate('inventory')) {
                    addToast(t('common.access_denied'), 'error');
                    return;
                }
                const newItem = { ...formData, ...createRecordMetadata() };
                await db.items.add(newItem);
                addToast(t('inventory.save_success'), 'success');
            }
            navigate('/inventory');
        } catch (error) {
            console.error("Failed to save item:", error);
            addToast(t('inventory.save_error'), 'error');
        }
    };

    const generateBarcode = () => {
        const random = Math.floor(10000000 + Math.random() * 90000000).toString();
        setFormData({ ...formData, barcode: random });
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 700 * 1024) {
            addToast(t('inventory.image_size_error') || 'Image size must be less than 700KB', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            setFormData(prev => ({ ...prev, image: base64String }));
        };
        reader.readAsDataURL(file);
    };

    const handleRemoveImage = () => {
        setFormData(prev => ({ ...prev, image: undefined }));
    };

    if (isEdit ? !canUpdate('inventory') : !canCreate('inventory')) {
        return (
            <div className="flex flex-col items-center justify-center h-screen text-center p-8">
                <ShieldOff size={48} className="text-slate-300 mb-4" />
                <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">{t('common.access_denied')}</h2>
                <button onClick={() => navigate('/inventory')} className="mt-4 px-6 py-2 bg-slate-900 text-white rounded-xl uppercase text-[10px] font-black tracking-widest">{t('inventory.back_to_list')}</button>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8 pb-20">
            <div className="flex justify-between items-center">
                <button
                    onClick={() => navigate('/inventory')}
                    className="flex items-center gap-2 text-slate-500 hover:text-slate-800 dark:hover:text-white transition-all font-black text-[10px] uppercase tracking-widest group"
                >
                    <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" /> {t('inventory.back_to_inventory')}
                </button>

                <div className="flex items-center gap-2 bg-blue-500/10 text-blue-600 px-4 py-2 rounded-full border border-blue-500/20">
                    <Sparkles size={14} />
                    <span className="text-[10px] font-black uppercase tracking-widest">Premium Catalog</span>
                </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-4">
                <div>
                    <h1 className="text-4xl font-black dark:text-white tracking-tighter uppercase flex items-center gap-4">
                        <Package size={40} className="text-blue-600 dark:text-blue-400" />
                        {isEdit ? t('inventory.edit_item') : t('inventory.add_item')}
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 font-bold mt-2 text-[10px] uppercase tracking-[0.3em]">
                        {isEdit ? 'Update product specifications and pricing' : 'Initialize a new product in your system'}
                    </p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Left Column: Primary Details */}
                <div className="xl:col-span-2 space-y-8">
                    {/* General Info Card */}
                    <div className="bg-white/40 dark:bg-slate-800/20 backdrop-blur-2xl p-8 rounded-[3rem] shadow-2xl border border-white/50 dark:border-slate-700/30">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-2 bg-indigo-500/10 text-indigo-600 rounded-xl">
                                <Info size={18} />
                            </div>
                            <h2 className="text-sm font-black dark:text-white uppercase tracking-widest">{t('inventory.general_info') || 'Product Details'}</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="col-span-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">{t('inventory.item_name')}</label>
                                <input
                                    type="text"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleChange}
                                    placeholder="Enter product name..."
                                    className="w-full p-4 rounded-2xl bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 font-black text-sm outline-none focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white"
                                    required
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">{t('inventory.arabic_name')}</label>
                                <input
                                    type="text"
                                    name="arabicName"
                                    value={formData.arabicName || ''}
                                    onChange={handleChange}
                                    dir="rtl"
                                    placeholder="الاسم العربي"
                                    className="w-full p-4 rounded-2xl bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 font-black text-lg outline-none focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white"
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">{t('inventory.unit')}</label>
                                <select
                                    name="unit"
                                    value={formData.unit || 'pc'}
                                    onChange={handleChange}
                                    className="w-full p-4 rounded-2xl bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 font-black text-sm outline-none focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white cursor-pointer"
                                >
                                    <option value="pc">{t('units.pc')}</option>
                                    <option value="kg">{t('units.kg')}</option>
                                    <option value="g">{t('units.g')}</option>
                                    <option value="ltr">{t('units.ltr')}</option>
                                    <option value="ml">{t('units.ml')}</option>
                                    <option value="box">{t('units.box')}</option>
                                    <option value="pack">{t('units.pack')}</option>
                                    <option value="set">{t('units.set')}</option>
                                    <option value="meter">{t('units.meter')}</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Pricing & Tax Card */}
                    <div className="bg-white/40 dark:bg-slate-800/20 backdrop-blur-2xl p-8 rounded-[3rem] shadow-2xl border border-white/50 dark:border-slate-700/30 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-3xl -mr-32 -mt-32 pointer-events-none" />
                        
                        <div className="flex items-center gap-3 mb-8 relative z-10">
                            <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-xl">
                                <Banknote size={18} />
                            </div>
                            <h2 className="text-sm font-black dark:text-white uppercase tracking-widest">{t('inventory.pricing_tax')}</h2>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative z-10">
                            <div className="bg-blue-500/5 p-6 rounded-3xl border border-blue-500/10">
                                <label className="block text-[10px] font-black text-blue-500 uppercase tracking-widest mb-3 px-1">{t('inventory.sale_price')}</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-blue-400">$</span>
                                    <input
                                        type="number"
                                        name="salePrice"
                                        value={formData.salePrice}
                                        onChange={handleChange}
                                        step="0.01"
                                        className="w-full pl-10 pr-4 py-4 bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl font-black text-2xl tracking-tighter outline-none focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="bg-emerald-500/5 p-6 rounded-3xl border border-emerald-500/10">
                                <label className="block text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-3 px-1">{t('inventory.purchase_price')}</label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 font-black text-emerald-400">$</span>
                                    <input
                                        type="number"
                                        name="purchasePrice"
                                        value={formData.purchasePrice}
                                        onChange={handleChange}
                                        step="0.01"
                                        className="w-full pl-10 pr-4 py-4 bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-2xl font-black text-2xl tracking-tighter outline-none focus:ring-4 focus:ring-emerald-500/10 transition-all dark:text-white"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">{t('inventory.tax_type')}</label>
                                <select
                                    name="taxType"
                                    value={formData.taxType}
                                    onChange={handleChange}
                                    className="w-full p-4 rounded-2xl bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 font-black text-sm outline-none focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white cursor-pointer"
                                >
                                    <option value="exclusive">{t('common.exclusive')}</option>
                                    <option value="inclusive">{t('common.inclusive')}</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">{t('inventory.tax_rate')} (%)</label>
                                <input
                                    type="number"
                                    name="taxRate"
                                    value={formData.taxRate || 0}
                                    onChange={handleChange}
                                    step="0.1"
                                    className="w-full p-4 rounded-2xl bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 font-black text-sm outline-none focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white"
                                    required
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Column: Identification & Stock */}
                <div className="space-y-8">
                    {/* Product Image Card */}
                    <div className="bg-white/40 dark:bg-slate-800/20 backdrop-blur-2xl p-8 rounded-[3rem] shadow-2xl border border-white/50 dark:border-slate-700/30">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-2 bg-blue-500/10 text-blue-600 rounded-xl">
                                <Upload size={18} />
                            </div>
                            <h2 className="text-sm font-black dark:text-white uppercase tracking-widest">{t('inventory.product_image') || 'Product Image'}</h2>
                        </div>

                        <div className="space-y-4">
                            {formData.image ? (
                                <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 aspect-[16/10]">
                                    <img src={formData.image} className="w-full h-full object-cover" alt="Preview" />
                                    <button
                                        type="button"
                                        onClick={handleRemoveImage}
                                        className="absolute top-3 right-3 p-2 bg-red-500 hover:bg-red-600 text-white rounded-full shadow-lg transition-transform hover:scale-105"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ) : (
                                <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-8 cursor-pointer hover:border-blue-500 dark:hover:border-blue-500 transition-all bg-slate-50/50 dark:bg-slate-900/30 group">
                                    <Upload size={32} className="text-slate-400 group-hover:text-blue-500 group-hover:scale-110 transition-all mb-3" />
                                    <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest text-center">
                                        Drag & drop or click to upload
                                    </span>
                                    <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 uppercase">
                                        Max size: 700KB (PNG, JPG)
                                    </span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleImageChange}
                                        className="hidden"
                                    />
                                </label>
                            )}
                        </div>
                    </div>

                    {/* Identification Card */}
                    <div className="bg-white/40 dark:bg-slate-800/20 backdrop-blur-2xl p-8 rounded-[3rem] shadow-2xl border border-white/50 dark:border-slate-700/30">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-2 bg-purple-500/10 text-purple-600 rounded-xl">
                                <ScanBarcode size={18} />
                            </div>
                            <h2 className="text-sm font-black dark:text-white uppercase tracking-widest">{t('inventory.identification') || 'Identification'}</h2>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">{t('inventory.barcode')}</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        name="barcode"
                                        value={formData.barcode}
                                        onChange={handleChange}
                                        className="flex-1 p-4 rounded-2xl bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 font-mono font-bold text-xs tracking-widest outline-none focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white"
                                    />
                                    <button
                                        type="button"
                                        onClick={generateBarcode}
                                        className="p-4 bg-slate-900 dark:bg-indigo-600 text-white rounded-2xl shadow-xl hover:scale-105 transition-transform"
                                    >
                                        <Wand2 size={20} />
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">{t('inventory.item_code')}</label>
                                <input
                                    type="text"
                                    name="itemCode"
                                    value={formData.itemCode || ''}
                                    onChange={handleChange}
                                    placeholder="Scale PLU or Internal Code"
                                    className="w-full p-4 rounded-2xl bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 font-mono font-bold text-xs tracking-widest outline-none focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Stock & Location Card */}
                    <div className="bg-white/40 dark:bg-slate-800/20 backdrop-blur-2xl p-8 rounded-[3rem] shadow-2xl border border-white/50 dark:border-slate-700/30">
                        <div className="flex items-center gap-3 mb-8">
                            <div className="p-2 bg-rose-500/10 text-rose-600 rounded-xl">
                                <Warehouse size={18} />
                            </div>
                            <h2 className="text-sm font-black dark:text-white uppercase tracking-widest">{t('inventory.stock_management')}</h2>
                        </div>

                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">{t('inventory.current_stock')}</label>
                                    <input
                                        type="number"
                                        name="stock"
                                        value={formData.stock}
                                        onChange={handleChange}
                                        className="w-full p-4 rounded-2xl bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 font-black text-sm outline-none focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">{t('inventory.min_stock_alert')}</label>
                                    <input
                                        type="number"
                                        name="minStock"
                                        value={formData.minStock}
                                        onChange={handleChange}
                                        className="w-full p-4 rounded-2xl bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 font-black text-sm outline-none focus:ring-4 focus:ring-rose-500/10 transition-all dark:text-white text-rose-500"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">{t('inventory.location_shelf')}</label>
                                <input
                                    type="text"
                                    name="location"
                                    value={formData.location || ''}
                                    onChange={handleChange}
                                    className="w-full p-4 rounded-2xl bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 font-black text-sm outline-none focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white"
                                />
                            </div>

                            {/* Organization */}
                            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">{t('purchases.supplier')}</label>
                                    <select
                                        name="supplierId"
                                        value={formData.supplierId || ''}
                                        onChange={handleChange}
                                        className="w-full p-4 rounded-2xl bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 font-black text-xs outline-none focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white cursor-pointer"
                                    >
                                        <option value="">-- {t('common.select')} --</option>
                                        {suppliers.map((sup: any) => (
                                            <option key={sup.id} value={sup.id}>{sup.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 px-1">{t('inventory.category')}</label>
                                    <select
                                        name="categoryId"
                                        value={formData.categoryId || ''}
                                        onChange={handleChange}
                                        className="w-full p-4 rounded-2xl bg-white/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 font-black text-xs outline-none focus:ring-4 focus:ring-blue-500/10 transition-all dark:text-white cursor-pointer"
                                    >
                                        <option value="">-- {t('common.select')} --</option>
                                        {categories.map((cat: any) => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="xl:col-span-3 flex flex-col md:flex-row justify-end gap-4 pt-8">
                    <button
                        type="button"
                        onClick={() => navigate('/inventory')}
                        className="px-12 py-4 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
                    >
                        {t('common.cancel')}
                    </button>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        type="submit"
                        className="px-20 py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-2xl shadow-blue-500/20 flex items-center justify-center gap-3"
                    >
                        <Save size={18} />
                        {isEdit ? t('common.update') : t('common.save')}
                    </motion.button>
                </div>
            </form>
        </div>
    );
};

export default ItemForm;
