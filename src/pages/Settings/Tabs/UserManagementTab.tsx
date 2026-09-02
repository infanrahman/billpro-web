import React, { useState, useEffect } from 'react';
import {
    db,
    type Branch,
    type Company,
    type User,
    softDeleteMetadata,
    createRecordMetadata,
    DEFAULT_BRANCH_ID,
    DEFAULT_COMPANY_ID,
} from '../../../services/db';
import { useAuth } from '../../../contexts/AuthContext';
import { PERMISSIONS, PERMISSION_GROUPS, normalizePermission } from '../../../auth/permissions';
import Modal from '../../../components/UI/Modal';
import ConfirmationModal from '../../../components/UI/ConfirmationModal';
import { useNotification } from '../../../contexts/NotificationContext';
import { Plus, Edit2, Trash2, Shield, User as UserIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const UserManagementTab: React.FC = () => {
    const { user: currentUser, canCreate, canUpdate, canDelete } = useAuth();
    const { addToast } = useNotification();
    const { t } = useTranslation();
    const [users, setUsers] = useState<User[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [branches, setBranches] = useState<Branch[]>([]);
    // const [isLoading, setIsLoading] = useState(true);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);

    // Form State
    const [formData, setFormData] = useState<Partial<User>>({
        name: '',
        username: '',
        password: '',
        role: 'shopkeeper',
        permissions: [],
        companyIds: [DEFAULT_COMPANY_ID],
        branchIds: [DEFAULT_BRANCH_ID],
        defaultCompanyId: DEFAULT_COMPANY_ID,
        defaultBranchId: DEFAULT_BRANCH_ID
    });

    const loadUsers = React.useCallback(async () => {
        try {
            const [allUsers, allCompanies, allBranches] = await Promise.all([
                db.users.filter((u: User) => !u.deletedAt).toArray(),
                db.companies.filter((company: Company) => !company.deletedAt && company.status === 'active').toArray(),
                db.branches.filter((branch: Branch) => !branch.deletedAt && branch.status === 'active').toArray(),
            ]);
            setUsers(allUsers);
            setCompanies(allCompanies);
            setBranches(allBranches);
        } catch (error) {
            console.error("Failed to load users", error);
            addToast(t('users.load_error'), 'error');
        }
    }, [addToast, t]);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    const handleOpenModal = (userToEdit?: User) => {
        if (userToEdit) {
            setEditingUser(userToEdit);
            setFormData({
                name: userToEdit.name,
                username: userToEdit.username,
                password: userToEdit.password,
                role: userToEdit.role,
                permissions: Array.from(new Set((userToEdit.permissions || []).map(normalizePermission))),
                companyIds: userToEdit.companyIds?.length ? userToEdit.companyIds : [userToEdit.defaultCompanyId || DEFAULT_COMPANY_ID],
                branchIds: userToEdit.branchIds?.length ? userToEdit.branchIds : [userToEdit.defaultBranchId || DEFAULT_BRANCH_ID],
                defaultCompanyId: userToEdit.defaultCompanyId || userToEdit.companyIds?.[0] || DEFAULT_COMPANY_ID,
                defaultBranchId: userToEdit.defaultBranchId || userToEdit.branchIds?.[0] || DEFAULT_BRANCH_ID
            });
        } else {
            setEditingUser(null);
            setFormData({
                name: '',
                username: '',
                password: '',
                role: 'shopkeeper',
                permissions: [],
                companyIds: [DEFAULT_COMPANY_ID],
                branchIds: [DEFAULT_BRANCH_ID],
                defaultCompanyId: DEFAULT_COMPANY_ID,
                defaultBranchId: DEFAULT_BRANCH_ID
            });
        }
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setEditingUser(null);
    };

    const handlePermissionToggle = (permissionId: string) => {
        setFormData(prev => {
            const currentPermissions = (prev.permissions || []).map(normalizePermission);
            let newPermissions = [...currentPermissions];

            if (currentPermissions.includes(permissionId)) {
                newPermissions = newPermissions.filter((p) => p !== permissionId);
                if (permissionId.endsWith('.view')) {
                    const section = permissionId.split('.')[0];
                    newPermissions = newPermissions.filter((p) => !p.startsWith(`${section}.`));
                }
            } else {
                newPermissions.push(permissionId);
                const [section, action] = permissionId.split('.');
                const viewPermission = `${section}.view`;
                if (action !== 'view' && !newPermissions.includes(viewPermission)) {
                    newPermissions.push(viewPermission);
                }
            }

            return {
                ...prev,
                permissions: Array.from(new Set(newPermissions))
            };
        });
    };

    const selectedCompanyIds = formData.companyIds?.length ? formData.companyIds : [DEFAULT_COMPANY_ID];
    const selectedBranchIds = formData.branchIds?.length ? formData.branchIds : [DEFAULT_BRANCH_ID];
    const availableDefaultBranches = branches.filter(branch => selectedCompanyIds.includes(branch.companyId));

    const toggleCompanyAccess = (companyId: string) => {
        setFormData(prev => {
            const currentCompanyIds = prev.companyIds?.length ? prev.companyIds : [DEFAULT_COMPANY_ID];
            const nextCompanyIds = currentCompanyIds.includes(companyId)
                ? currentCompanyIds.filter(id => id !== companyId)
                : [...currentCompanyIds, companyId];
            const safeCompanyIds = nextCompanyIds.length ? nextCompanyIds : [DEFAULT_COMPANY_ID];
            const allowedBranchIds = branches
                .filter(branch => safeCompanyIds.includes(branch.companyId))
                .map(branch => branch.id);
            const currentBranchIds = prev.branchIds?.length ? prev.branchIds : [DEFAULT_BRANCH_ID];
            const nextBranchIds = currentBranchIds.filter(id => allowedBranchIds.includes(id));
            const safeBranchIds = nextBranchIds.length ? nextBranchIds : [allowedBranchIds[0] || DEFAULT_BRANCH_ID];
            const defaultCompanyId = safeCompanyIds.includes(prev.defaultCompanyId || '')
                ? prev.defaultCompanyId
                : safeCompanyIds[0];
            const defaultBranchId = safeBranchIds.includes(prev.defaultBranchId || '')
                ? prev.defaultBranchId
                : safeBranchIds[0] || DEFAULT_BRANCH_ID;

            return {
                ...prev,
                companyIds: safeCompanyIds,
                branchIds: safeBranchIds,
                defaultCompanyId,
                defaultBranchId
            };
        });
    };

    const toggleBranchAccess = (branch: Branch) => {
        setFormData(prev => {
            const currentCompanyIds = prev.companyIds?.length ? prev.companyIds : [DEFAULT_COMPANY_ID];
            const nextCompanyIds = currentCompanyIds.includes(branch.companyId)
                ? currentCompanyIds
                : [...currentCompanyIds, branch.companyId];
            const currentBranchIds = prev.branchIds?.length ? prev.branchIds : [DEFAULT_BRANCH_ID];
            const nextBranchIds = currentBranchIds.includes(branch.id)
                ? currentBranchIds.filter(id => id !== branch.id)
                : [...currentBranchIds, branch.id];
            const safeBranchIds = nextBranchIds.length ? nextBranchIds : [DEFAULT_BRANCH_ID];
            const defaultBranchId = safeBranchIds.includes(prev.defaultBranchId || '')
                ? prev.defaultBranchId
                : safeBranchIds[0];

            return {
                ...prev,
                companyIds: nextCompanyIds,
                branchIds: safeBranchIds,
                defaultCompanyId: prev.defaultCompanyId || branch.companyId,
                defaultBranchId
            };
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (!formData.name || !formData.username || !formData.password) {
            addToast(t('users.fill_required'), 'error');
            return;
        }

        const userCompanyIds = formData.companyIds?.length ? formData.companyIds : [DEFAULT_COMPANY_ID];
        const userBranchIds = formData.branchIds?.length ? formData.branchIds : [DEFAULT_BRANCH_ID];
        const defaultCompanyId = userCompanyIds.includes(formData.defaultCompanyId || '')
            ? formData.defaultCompanyId
            : userCompanyIds[0];
        const defaultBranchId = userBranchIds.includes(formData.defaultBranchId || '')
            ? formData.defaultBranchId
            : userBranchIds[0];

        try {
            if (editingUser) {
                if (!canUpdate('users')) {
                    addToast(t('common.access_denied'), 'error');
                    return;
                }

                // Update
                if (editingUser.id === currentUser?.id && formData.role !== 'admin') {
                    addToast(t('users.cannot_demote_self'), 'error');
                    return;
                }

                await db.users.update(editingUser.id!, {
                    name: formData.name,
                    username: formData.username,
                    password: formData.password,
                    role: formData.role as 'admin' | 'shopkeeper',
                    permissions: formData.role === 'admin' ? [] : formData.permissions,
                    companyIds: userCompanyIds,
                    branchIds: userBranchIds,
                    defaultCompanyId,
                    defaultBranchId
                });
                addToast(t('users.update_success'), 'success');
            } else {
                if (!canCreate('users')) {
                    addToast(t('common.access_denied'), 'error');
                    return;
                }

                // Create
                // Check username existence
                const existing = await db.users.where('username').equalsIgnoreCase(formData.username!).first();
                if (existing) {
                    addToast(t('users.username_exists'), 'error');
                    return;
                }

                await db.users.add({
                    ...createRecordMetadata(),
                    name: formData.name!,
                    username: formData.username!,
                    password: formData.password!,
                    role: formData.role as 'admin' | 'shopkeeper',
                    permissions: formData.role === 'admin' ? [] : formData.permissions,
                    companyIds: userCompanyIds,
                    branchIds: userBranchIds,
                    defaultCompanyId,
                    defaultBranchId
                });
                addToast(t('users.create_success'), 'success');
            }
            handleCloseModal();
            loadUsers();
        } catch (error) {
            console.error(error);
            addToast(t('common.operation_failed'), 'error');
        }
    };

    const [userToDeleteState, setUserToDeleteState] = useState<User | null>(null);

    const handleDeleteClick = (user: User) => {
        if (!canDelete('users')) {
            addToast(t('common.access_denied'), 'error');
            return;
        }

        if (user.id === currentUser?.id) {
            addToast(t('users.cannot_delete_self'), 'error');
            return;
        }
        setUserToDeleteState(user);
    };

    const handleConfirmDelete = async () => {
        if (!userToDeleteState) return;
        if (!canDelete('users')) {
            addToast(t('common.access_denied'), 'error');
            return;
        }

        try {
            await db.users.update(userToDeleteState.id!, softDeleteMetadata());
            addToast(t('users.delete_success'), 'success');
            loadUsers();
        } catch {
            addToast(t('users.delete_error'), 'error');
        } finally {
            setUserToDeleteState(null);
        }
    };

    const renderMiniToggle = (id: string, label: string) => {
        const isSelected = formData.permissions?.includes(id);
        return (
            <div
                className={`flex flex-col items-center gap-1 p-2 rounded-lg cursor-pointer transition-all select-none ${
                    isSelected
                        ? 'bg-blue-600/10 dark:bg-blue-500/20 ring-1 ring-blue-500'
                        : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
                onClick={() => handlePermissionToggle(id)}
            >
                <span className={`text-[10px] font-bold uppercase tracking-wide ${isSelected ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}>
                    {label}
                </span>
                <div className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-200 ${
                    isSelected ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                }`}>
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform duration-200 ${
                        isSelected ? 'translate-x-3.5' : 'translate-x-0.5'
                    }`} />
                </div>
            </div>
        );
    };

    const renderPermissionGroup = (group: typeof PERMISSION_GROUPS[number]) => (
        <div key={group.id} className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
            <div className="mb-3">
                <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">{group.label}</h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{group.description}</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {group.permissions.map(permission => renderMiniToggle(permission.id, permission.action.replace(/([A-Z])/g, ' $1')))}
            </div>
        </div>
    );

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white">{t('users.title')}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t('users.subtitle')}</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                    <Plus size={18} />
                    {t('common.add')}
                </button>
            </div>

            {/* Users List */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {users.map((u) => (
                    <div key={u.id} className="bg-white dark:bg-slate-800 p-5 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
                        <div>
                            <div className="flex justify-between items-start mb-4">
                                <div className="flex items-center gap-3">
                                    <div className={`p-3 rounded-full ${u.role === 'admin' ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30'}`}>
                                        {u.role === 'admin' ? <Shield size={20} /> : <UserIcon size={20} />}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800 dark:text-white mb-0.5">{u.name}</h3>
                                        <p className="text-xs text-slate-500 uppercase font-semibold tracking-wider">{u.role === 'admin' ? t('users.admin') : t('users.shopkeeper')}</p>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => handleOpenModal(u)}
                                        className="p-2 text-slate-400 hover:text-blue-500 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                    >
                                        <Edit2 size={16} />
                                    </button>

                                    {currentUser?.role === 'admin' && ( // Only actual admins can delete users
                                        <button
                                            onClick={() => handleDeleteClick(u)}
                                            className="p-2 text-slate-400 hover:text-red-500 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-lg transition-colors"
                                            disabled={u.id === currentUser?.id}
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="text-sm text-slate-600 dark:text-slate-300">
                                    <span className="font-medium text-slate-500 dark:text-slate-500 block text-xs mb-1">{t('users.username')}</span>
                                    {u.username}
                                </div>
                                <div className="text-sm text-slate-600 dark:text-slate-300">
                                    <span className="font-medium text-slate-500 dark:text-slate-500 block text-xs mb-1">Scope</span>
                                    <span>{u.companyIds?.length || 1} company</span>
                                    <span className="mx-1 text-slate-400">/</span>
                                    <span>{u.branchIds?.length || 1} branch</span>
                                </div>
                                {u.role !== 'admin' && (
                                    <div className="mt-3">
                                        <span className="font-medium text-slate-500 dark:text-slate-500 block text-xs mb-2">{t('users.permissions')}</span>
                                        <div className="flex flex-wrap gap-2">
                                            {u.permissions?.length ? u.permissions.map((p) => {
                                                const normalizedPermission = normalizePermission(p);
                                                return (
                                                <span key={p} className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs rounded-md border border-slate-200 dark:border-slate-600">
                                                    {PERMISSIONS.find(perm => perm.id === normalizedPermission)?.label || p}
                                                </span>
                                            )}) : <span className="text-xs text-slate-400 italic">{t('users.no_permissions')}</span>}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                ))}
            </div>

            {/* Modal */}
            <Modal
                isOpen={isModalOpen}
                onClose={handleCloseModal}
                title={editingUser ? t('users.edit_user') : t('users.new_user')}
            >
                <div className="p-6 space-y-4 max-h-[85vh] overflow-y-auto custom-scrollbar">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('users.full_name')}</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    placeholder={t('users.name_placeholder')}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('users.username')}</label>
                                <input
                                    type="text"
                                    required
                                    className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                    value={formData.username}
                                    onChange={e => setFormData({ ...formData, username: e.target.value })}
                                    placeholder={t('users.username_placeholder')}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('users.password')}</label>
                            <input
                                type="text"
                                required
                                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                value={formData.password}
                                onChange={e => setFormData({ ...formData, password: e.target.value })}
                                placeholder={t('users.password_placeholder')}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('users.role')}</label>
                            <select
                                className="w-full px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                                value={formData.role}
                                onChange={e => setFormData({ ...formData, role: e.target.value as 'admin' | 'shopkeeper' })}
                            >
                                <option value="shopkeeper">{t('users.shopkeeper')}</option>
                                <option value="admin">{t('users.admin')}</option>
                            </select>
                            <p className="text-xs text-slate-500 mt-1">{t('users.admin_note')}</p>
                        </div>

                        <div className="border-t border-slate-200 dark:border-slate-700 pt-5 mt-4">
                            <div className="mb-4">
                                <h3 className="text-base font-bold text-slate-800 dark:text-white">Organization Access</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Choose which companies and branches this user can work with. Admin users keep full permissions but still get sensible defaults.</p>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
                                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3">Companies</h4>
                                    <div className="space-y-2 max-h-44 overflow-y-auto custom-scrollbar pr-1">
                                        {companies.map(company => {
                                            const isChecked = selectedCompanyIds.includes(company.id);
                                            return (
                                                <label key={company.id} className="flex items-center justify-between gap-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 cursor-pointer">
                                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{company.name}</span>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => toggleCompanyAccess(company.id)}
                                                        className="h-4 w-4"
                                                    />
                                                </label>
                                            );
                                        })}
                                    </div>
                                    <label className="block text-xs font-semibold text-slate-500 mt-4 mb-1">Default company</label>
                                    <select
                                        value={formData.defaultCompanyId || selectedCompanyIds[0]}
                                        onChange={e => setFormData({ ...formData, defaultCompanyId: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white outline-none"
                                    >
                                        {companies.filter(company => selectedCompanyIds.includes(company.id)).map(company => (
                                            <option key={company.id} value={company.id}>{company.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4">
                                    <h4 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3">Branches</h4>
                                    <div className="space-y-2 max-h-44 overflow-y-auto custom-scrollbar pr-1">
                                        {branches.filter(branch => selectedCompanyIds.includes(branch.companyId)).map(branch => {
                                            const company = companies.find(item => item.id === branch.companyId);
                                            const isChecked = selectedBranchIds.includes(branch.id);
                                            return (
                                                <label key={branch.id} className="flex items-center justify-between gap-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-3 py-2 cursor-pointer">
                                                    <span className="min-w-0">
                                                        <span className="block text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{branch.name}</span>
                                                        <span className="block text-[11px] text-slate-400 truncate">{company?.name || 'Company'}</span>
                                                    </span>
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => toggleBranchAccess(branch)}
                                                        className="h-4 w-4"
                                                    />
                                                </label>
                                            );
                                        })}
                                    </div>
                                    <label className="block text-xs font-semibold text-slate-500 mt-4 mb-1">Default branch</label>
                                    <select
                                        value={formData.defaultBranchId || selectedBranchIds[0]}
                                        onChange={e => setFormData({ ...formData, defaultBranchId: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white outline-none"
                                    >
                                        {availableDefaultBranches.filter(branch => selectedBranchIds.includes(branch.id)).map(branch => (
                                            <option key={branch.id} value={branch.id}>{branch.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Permissions Section - Only for non-admin */}
                        {formData.role !== 'admin' && (
                            <div className="border-t border-slate-200 dark:border-slate-700 pt-5 mt-4">
                                <label className="block text-base font-bold text-slate-800 dark:text-white mb-4">{t('users.permissions')}</label>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                    {PERMISSION_GROUPS.map(renderPermissionGroup)}
                                </div>
                            </div>
                        )}

                        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700">
                            <button
                                type="button"
                                onClick={handleCloseModal}
                                className="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                            >
                                {t('common.cancel')}
                            </button>
                            <button
                                type="submit"
                                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-all shadow-lg shadow-blue-500/30"
                            >
                                {editingUser ? t('common.save_changes') : t('common.create')}
                            </button>
                        </div>
                    </form>
                </div>
            </Modal>

            <ConfirmationModal
                isOpen={!!userToDeleteState}
                onClose={() => setUserToDeleteState(null)}
                onConfirm={handleConfirmDelete}
                title={t('users.delete_title')}
                message={t('users.delete_confirm', { name: userToDeleteState?.name })}
                confirmText={t('common.delete')}
                variant="danger"
            />
        </div >
    );
};

export default UserManagementTab;
