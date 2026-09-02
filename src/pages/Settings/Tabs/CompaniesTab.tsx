import React, { useEffect, useState } from 'react';
import { Building2, Edit2, Plus, Save, Trash2, X } from 'lucide-react';
import { db, type Company, DEFAULT_COMPANY_ID } from '../../../services/db';
import { useAuth } from '../../../contexts/AuthContext';
import { useNotification } from '../../../contexts/NotificationContext';

const emptyCompany = {
    name: '',
    legalName: '',
    vatNumber: '',
    crNumber: '',
    phone: '',
    email: '',
    address: '',
    country: 'Saudi Arabia',
};

const CompaniesTab: React.FC = () => {
    const { canCreate, canUpdate, canDelete } = useAuth();
    const { addToast } = useNotification();
    const [companies, setCompanies] = useState<Company[]>([]);
    const [editingCompany, setEditingCompany] = useState<Company | null>(null);
    const [form, setForm] = useState(emptyCompany);

    const loadCompanies = React.useCallback(async () => {
        const rows = await db.companies
            .filter(company => !company.deletedAt)
            .toArray();
        setCompanies(rows);
    }, []);

    useEffect(() => {
        const timeoutId = window.setTimeout(() => {
            loadCompanies();
        }, 0);
        return () => window.clearTimeout(timeoutId);
    }, [loadCompanies]);

    const resetForm = () => {
        setEditingCompany(null);
        setForm(emptyCompany);
    };

    const editCompany = (company: Company) => {
        setEditingCompany(company);
        setForm({
            name: company.name || '',
            legalName: company.legalName || '',
            vatNumber: company.vatNumber || '',
            crNumber: company.crNumber || '',
            phone: company.phone || '',
            email: company.email || '',
            address: company.address || '',
            country: company.country || 'Saudi Arabia',
        });
    };

    const saveCompany = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!form.name.trim()) {
            addToast('Company name is required.', 'error');
            return;
        }

        const now = new Date();
        if (editingCompany) {
            if (!canUpdate('companies')) {
                addToast('You do not have permission to update companies.', 'error');
                return;
            }

            await db.companies.update(editingCompany.id, {
                ...form,
                updatedAt: now,
            });
            addToast('Company updated.', 'success');
        } else {
            if (!canCreate('companies')) {
                addToast('You do not have permission to create companies.', 'error');
                return;
            }

            await db.companies.add({
                id: crypto.randomUUID(),
                ...form,
                legalName: form.legalName || form.name,
                status: 'active',
                createdAt: now,
                updatedAt: now,
            });
            addToast('Company created.', 'success');
        }

        resetForm();
        loadCompanies();
    };

    const deleteCompany = async (company: Company) => {
        if (!canDelete('companies')) {
            addToast('You do not have permission to delete companies.', 'error');
            return;
        }
        if (company.id === DEFAULT_COMPANY_ID) {
            addToast('The default company cannot be deleted.', 'error');
            return;
        }

        const branchCount = await db.branches.where('companyId').equals(company.id).count();
        if (branchCount > 0) {
            addToast('Move or delete this company branches first.', 'error');
            return;
        }

        await db.companies.update(company.id, {
            status: 'inactive',
            deletedAt: new Date(),
            updatedAt: new Date(),
        });
        addToast('Company deleted.', 'success');
        loadCompanies();
    };

    return (
        <div className="space-y-5">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">Companies</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Manage legal business profiles used by branches, reports, invoices, and future web sync.</p>
                </div>
                {editingCompany && (
                    <button onClick={resetForm} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                        <X size={16} />
                        Cancel edit
                    </button>
                )}
            </div>

            <form onSubmit={saveCompany} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm dark:text-white" placeholder="Company name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} />
                    <input className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm dark:text-white" placeholder="Legal name" value={form.legalName} onChange={event => setForm({ ...form, legalName: event.target.value })} />
                    <input className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm dark:text-white" placeholder="VAT number" value={form.vatNumber} onChange={event => setForm({ ...form, vatNumber: event.target.value })} />
                    <input className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm dark:text-white" placeholder="CR number" value={form.crNumber} onChange={event => setForm({ ...form, crNumber: event.target.value })} />
                    <input className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm dark:text-white" placeholder="Phone" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} />
                    <input className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm dark:text-white" placeholder="Email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} />
                    <input className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm dark:text-white" placeholder="Country" value={form.country} onChange={event => setForm({ ...form, country: event.target.value })} />
                    <input className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm dark:text-white" placeholder="Address" value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} />
                </div>
                <div className="mt-4 flex justify-end">
                    <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
                        {editingCompany ? <Save size={16} /> : <Plus size={16} />}
                        {editingCompany ? 'Save company' : 'Add company'}
                    </button>
                </div>
            </form>

            <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-900/60 text-xs uppercase text-slate-500">
                        <tr>
                            <th className="px-4 py-3">Company</th>
                            <th className="px-4 py-3">Tax IDs</th>
                            <th className="px-4 py-3">Contact</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {companies.map(company => (
                            <tr key={company.id}>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <Building2 size={18} className="text-blue-500" />
                                        <div>
                                            <p className="font-semibold text-slate-900 dark:text-white">{company.name}</p>
                                            <p className="text-xs text-slate-500">{company.legalName || company.country || 'No legal details'}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                    <p>VAT: {company.vatNumber || '-'}</p>
                                    <p className="text-xs text-slate-500">CR: {company.crNumber || '-'}</p>
                                </td>
                                <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                    <p>{company.phone || '-'}</p>
                                    <p className="text-xs text-slate-500">{company.email || '-'}</p>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex justify-end gap-2">
                                        <button onClick={() => editCompany(company)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-700">
                                            <Edit2 size={16} />
                                        </button>
                                        <button onClick={() => deleteCompany(company)} className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30">
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

export default CompaniesTab;
