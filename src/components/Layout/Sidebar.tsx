import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import {
    LayoutDashboard,
    ShoppingCart,
    Package,
    FileText,
    Settings,
    LogOut,
    TrendingUp,
    ShoppingBag,
    DollarSign,
    Users,
    BookOpen,
    FileSpreadsheet,
    X
} from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import clsx from 'clsx';

interface SidebarProps {
    isOpen: boolean;
    onClose: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
    const { user, logout, hasPermission } = useAuth();
    const { settings } = useSettings();
    const { t } = useTranslation();
    const role = user?.role || 'shopkeeper';

    const allLinks = [
        { to: '/', icon: LayoutDashboard, label: t('sidebar.dashboard'), permission: null },
        { to: '/pos', icon: ShoppingCart, label: t('sidebar.pos'), permission: 'pos.view' },
        { to: '/inventory', icon: Package, label: settings.cafeMode ? t('sidebar.menu', { defaultValue: 'Menu' }) : t('sidebar.inventory'), permission: 'inventory.view' },
        { to: '/sales', icon: TrendingUp, label: t('sidebar.sales'), permission: 'sales.view' },
        { to: '/expenses', icon: DollarSign, label: t('sidebar.expenses'), permission: 'expenses.view' },
        { to: '/purchase', icon: ShoppingBag, label: t('sidebar.purchase'), permission: 'purchases.view' },
        { to: '/suppliers', icon: Package, label: t('sidebar.suppliers'), permission: 'suppliers.view' },
        { to: '/reports', icon: FileText, label: t('sidebar.reports'), permission: 'reports.view' },
        { to: '/cash-book', icon: BookOpen, label: t('sidebar.cashbook'), permission: 'cashbook.view' },
        { to: '/customers', icon: Users, label: t('sidebar.customers'), permission: 'customers.view' },
        { to: '/spreadsheet', icon: FileSpreadsheet, label: t('sidebar.excel_sheet'), permission: null },
        { to: '/settings', icon: Settings, label: t('sidebar.settings'), permission: 'settings_any' },
    ];

    const links = allLinks.filter(link => {
        if (!link.permission) {
            if (link.to === '/spreadsheet') return settings.enableSpreadsheet;
            return true;
        }
        if (link.permission === 'settings_any') {
            return role === 'admin'
                || hasPermission('appSettings.view')
                || hasPermission('businessProfile.update')
                || hasPermission('invoiceSettings.update')
                || hasPermission('devices.view')
                || hasPermission('scales.view')
                || hasPermission('backup.view')
                || hasPermission('users.view');
        }
        return hasPermission(link.permission);
    });

    const navRef = React.useRef<HTMLElement>(null);

    const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            const next = document.getElementById(`sidebar-link-${index + 1}`);
            if (next) (next as HTMLElement).focus();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            const prev = document.getElementById(`sidebar-link-${index - 1}`);
            if (prev) (prev as HTMLElement).focus();
        }
    };

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                className="fixed inset-0 bg-slate-900/50 z-40 xl:hidden"
            />

            {/* Sidebar Panel */}
            <div className="fixed inset-y-0 left-0 w-64 bg-[#101827] border-r border-slate-700/70 flex flex-col shadow-xl z-50 overflow-hidden">
                {/* Header */}
                <div className="px-4 py-4 border-b border-slate-700/70 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <h1 className="text-lg font-bold text-white leading-tight">
                            BILLING PRO
                        </h1>
                        <p className="text-sm text-slate-300 mt-1 font-medium truncate">{user?.name || role}</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="shrink-0 p-2 hover:bg-slate-800 rounded-lg text-slate-300 hover:text-white"
                        aria-label="Close menu"
                    >
                        <X size={19} />
                    </button>
                </div>

                {/* Nav links */}
                <nav ref={navRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5 custom-scrollbar">
                    {links.map((link, index) => (
                        <NavLink
                            key={link.to}
                            to={link.to}
                            id={`sidebar-link-${index}`}
                            onKeyDown={(e) => handleKeyDown(e, index)}
                            onClick={onClose}
                            className={({ isActive }) => clsx(
                                "relative flex items-center gap-3 px-3.5 h-11 rounded-lg outline-none group border",
                                isActive
                                    ? "bg-blue-600/25 text-white border-blue-400/45 shadow-sm"
                                    : "text-slate-200 border-transparent hover:bg-slate-800 hover:text-white hover:border-slate-700"
                            )}
                        >
                            {({ isActive }) => (
                                <>
                                    {isActive && (
                                        <div className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 bg-blue-400 rounded-r-full" />
                                    )}
                                    <link.icon
                                        size={20}
                                        className={clsx(
                                            "shrink-0",
                                            isActive ? "text-blue-300" : "text-slate-300 group-hover:text-white"
                                        )}
                                    />
                                    <span className="font-semibold text-[15px] leading-none truncate">
                                        {link.label}
                                    </span>
                                </>
                            )}
                        </NavLink>
                    ))}
                </nav>

                {/* Logout */}
                <div className="p-3 border-t border-slate-700/70 bg-[#0c1422]">
                    <button
                        onClick={logout}
                        className="flex items-center gap-3 px-3.5 h-11 w-full rounded-lg text-slate-200 hover:bg-red-500/15 hover:text-red-300 border border-transparent hover:border-red-400/30 group"
                    >
                        <LogOut size={20} className="shrink-0" />
                        <span className="font-semibold text-[15px]">{t('sidebar.logout')}</span>
                    </button>
                </div>
            </div>
        </>
    );
};

export default Sidebar;
