import React, { useEffect, useMemo, useState } from 'react';
import { Edit2, MapPin, Plus, Save, Trash2, X } from 'lucide-react';
import { db, type Branch, type Company, createRecordMetadata, DEFAULT_BRANCH_ID } from '../../../services/db';
import { useAuth } from '../../../contexts/AuthContext';
import { useNotification } from '../../../contexts/NotificationContext';

const BranchesTab: React.FC = () => {
    const { activeCompanyId, canCreate, canUpdate, canDelete } = useAuth();
    const { addToast } = useNotification();
    const [companies, setCompanies] = useState<Company[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
    const [form, setForm] = useState({
        companyId: activeCompanyId,
        name: '',
        location: '',
        phone: '',
        email: '',
        vatNo: '',
        crNo: '',
        country: 'Saudi Arabia',
        taxName: 'VAT',
        taxRate: '15',
        isMaster: false,
    });

    const companyById = useMemo(() => new Map(companies.map(company => [company.id, company])), [companies]);

    const loadData = React.useCallback(async () => {
        const [companyRows, branchRows] = await Promise.all([
            db.companies.filter(company => !company.deletedAt && company.status === 'active').toArray(),
            db.branches.filter(branch => !branch.deletedAt).toArray(),
        ]);
        setCompanies(companyRows);
        setBranches(branchRows);
    }, []);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            loadData();
        }, 0);
        return () => window.clearTimeout(timeoutId);
    }, [loadData]);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            setForm(prev => ({ ...prev, companyId: activeCompanyId }));
        }, 0);
        return () => window.clearTimeout(timeoutId);
    }, [activeCompanyId]);

    const resetForm = () => {
        setEditingBranch(null);
        setForm({
            companyId: activeCompanyId,
            name: '',
            location: '',
            phone: '',
            email: '',
            vatNo: '',
            crNo: '',
            country: 'Saudi Arabia',
            taxName: 'VAT',
            taxRate: '15',
            isMaster: false,
        });
    };

    const editBranch = (branch: Branch) => {
        setEditingBranch(branch);
        setForm({
            companyId: branch.companyId,
            name: branch.name || '',
            location: branch.location || '',
            phone: branch.phone || '',
            email: branch.email || '',
            vatNo: branch.vatNo || branch.gstin || '',
            crNo: branch.crNo || '',
            country: branch.country || 'Saudi Arabia',
            taxName: branch.taxName || 'VAT',
            taxRate: String(branch.taxRate ?? 15),
            isMaster: !!branch.isMaster,
        });
    };

    const saveBranch = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!form.name.trim()) {
            addToast('Branch name is required.', 'error');
            return;
        }

        if (editingBranch) {
            if (!canUpdate('branches')) {
                addToast('You do not have permission to update branches.', 'error');
                return;
            }
            await db.branches.update(editingBranch.id, {
                ...form,
                taxRate: Number(form.taxRate) || 0,
                updatedAt: new Date(),
            });
            addToast('Branch updated.', 'success');
        } else {
            if (!canCreate('branches')) {
                addToast('You do not have permission to create branches.', 'error');
                return;
            }
            await db.branches.add({
                ...createRecordMetadata(),
                companyId: form.companyId,
                name: form.name,
                location: form.location,
                phone: form.phone,
                email: form.email,
                vatNo: form.vatNo,
                crNo: form.crNo,
                country: form.country,
                taxName: form.taxName,
                taxRate: Number(form.taxRate) || 0,
                isMaster: form.isMaster,
                status: 'active',
            });
            addToast('Branch created.', 'success');
        }

        resetForm();
        loadData();
    };

    const deleteBranch = async (branch: Branch) => {
        if (!canDelete('branches')) {
            addToast('You do not have permission to delete branches.', 'error');
            return;
        }
        if (branch.id === DEFAULT_BRANCH_ID) {
            addToast('The default branch cannot be deleted.', 'error');
            return;
        }

        await db.branches.update(branch.id, {
            status: 'inactive',
            deletedAt: new Date(),
            updatedAt: new Date(),
        });
        addToast('Branch deleted.', 'success');
        loadData();
    };

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Branches</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Manage store locations, tax identity, and branch-level operating settings.</p>
                </div>
                {editingBranch && (
                    <button onClick={resetForm} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                        <X size={16} />
                        Cancel edit
                    </button>
                )}
            </div>

            <form onSubmit={saveBranch} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <select className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm dark:text-white" value={form.companyId} onChange={event => setForm({ ...form, companyId: event.target.value })}>
                        {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
                    </select>
                    <input className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm dark:text-white" placeholder="Branch name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
                    <input className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm dark:text-white" placeholder="Phone" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} />
                    <input className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm dark:text-white" placeholder="Email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} />
                    <input className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm dark:text-white" placeholder="VAT number" value={form.vatNo} onChange={event => setForm({ ...form, vatNo: event.target.value })} />
                    <input className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm dark:text-white" placeholder="CR number" value={form.crNo} onChange={event => setForm({ ...form, crNo: event.target.value })} />
                    <input className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm dark:text-white" placeholder="Country" value={form.country} onChange={event => setForm({ ...form, country: event.target.value })} />
                    <input className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm dark:text-white" placeholder="Tax name" value={form.taxName} onChange={event => setForm({ ...form, taxName: event.target.value })} />
                    <input className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm dark:text-white" placeholder="Tax rate" type="number" value={form.taxRate} onChange={event => setForm({ ...form, taxRate: event.target.value })} />
                    <input className="md:col-span-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm dark:text-white" placeholder="Address/location" value={form.location} onChange={event => setForm({ ...form, location: event.target.value })} />
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300">
                    <input type="checkbox" checked={form.isMaster} onChange={event => setForm({ ...form, isMaster: event.target.checked })} />
                    Master branch can view all branch data for this company
                </label>
                <div className="mt-4 flex justify-end">
                    <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                        {editingBranch ? <Save size={16} /> : <Plus size={16} />}
                        {editingBranch ? 'Save branch' : 'Add branch'}
                    </button>
                </div>
            </form>

            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs uppercase text-slate-500">
                        <tr>
                            <th className="px-4 py-3">Branch</th>
                            <th className="px-4 py-3">Company</th>
                            <th className="px-4 py-3">Tax</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {branches.map(branch => (
                            <tr key={branch.id}>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <MapPin size={18} className="text-blue-500" />
                                        <div>
                                            <p className="font-semibold text-slate-900 dark:text-white">{branch.name}</p>
                                            <p className="text-xs text-slate-500">{branch.location || branch.phone || 'No location details'}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{companyById.get(branch.companyId)?.name || '-'}</td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{branch.taxName || 'VAT'} {branch.taxRate ?? 0}%</td>
                                <td className="px-4 py-3">
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => editBranch(branch)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-700">
                                            <Edit2 size={16} />
                                        </button>
                                        <button onClick={() => deleteBranch(branch)} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default BranchesTab;
