import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import BusinessProfileTab from './Tabs/BusinessProfileTab';
import CompaniesTab from './Tabs/CompaniesTab';
import BranchesTab from './Tabs/BranchesTab';
import RemindersTab from './Tabs/RemindersTab';
import InvoicePrintTab from './Tabs/InvoicePrintTab';
import DataBackupTab from './Tabs/DataBackupTab';
import GeneralTab from './Tabs/GeneralTab';
import ActivityLogTab from './Tabs/ActivityLogTab';
import UserManagementTab from './Tabs/UserManagementTab';
import MessagingTab from './Tabs/MessagingTab';
import HelpTab from './Tabs/HelpTab';
import { 
    Scale as ScaleIcon, Building2, Cpu, Lock, LayoutGrid, MessageSquare,
    User, Printer, Users, ShieldCheck, Shield, Settings as SettingsIcon, Keyboard, Bell, Database, HelpCircle,
    Sparkles, ChevronRight
} from 'lucide-react';
import ZatcaTab from './Tabs/ZatcaTab';
import ScaleTab from './Tabs/ScaleTab';
import KeyboardShortcutsTab from './Tabs/KeyboardShortcutsTab';
import clsx from 'clsx';

type SettingsTab = {
    id: string;
    label: string;
    icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
    permission: string | null;
};

type SettingsCategory = {
    id: string;
    label: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    tabs: SettingsTab[];
};

const Settings: React.FC = () => {
    const { user, hasPermission } = useAuth();
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState('general');

    const categories: SettingsCategory[] = [
        {
            id: 'business',
            label: t('settings.categories.business', 'Store & Business'),
            icon: Building2,
            tabs: [
                { id: 'companies', label: 'Companies', icon: Building2, permission: 'companies.view' },
                { id: 'branches', label: 'Branches', icon: Building2, permission: 'branches.view' },
                { id: 'profile', label: t('settings.tabs.business_profile'), icon: User, permission: 'businessProfile.update' },
            ]
        },
        {
            id: 'hardware',
            label: t('settings.categories.hardware', 'Devices & Hardware'),
            icon: Cpu,
            tabs: [
                { id: 'print', label: t('settings.tabs.invoice_print'), icon: Printer, permission: 'invoiceSettings.update' },
                { id: 'scales', label: t('settings.tabs.scales', 'Scale Management'), icon: ScaleIcon, permission: 'scales.view' },
            ]
        },
        {
            id: 'security',
            label: t('settings.categories.security', 'Security & Compliance'),
            icon: Lock,
            tabs: [
                { id: 'users', label: t('settings.tabs.users_roles'), icon: Users, permission: 'users.view' },
                { id: 'zatca', label: t('settings.tabs.zatca'), icon: ShieldCheck, permission: 'zatca.view' },
                { id: 'logs', label: t('settings.tabs.activity_logs'), icon: Shield, permission: 'activityLogs.view' },
            ]
        },
        {
            id: 'system',
            label: t('settings.categories.system', 'App Preferences'),
            icon: LayoutGrid,
            tabs: [
                { id: 'general', label: t('settings.tabs.general'), icon: SettingsIcon, permission: 'appSettings.view' },
                { id: 'shortcuts', label: t('settings.tabs.shortcuts'), icon: Keyboard, permission: null },
                { id: 'reminders', label: t('settings.tabs.reminders'), icon: Bell, permission: 'appSettings.update' },
                { id: 'backup', label: t('settings.tabs.data_backup'), icon: Database, permission: 'backup.view' },
                { id: 'help', label: t('settings.tabs.help'), icon: HelpCircle, permission: null },
            ]
        },
        {
            id: 'engagement',
            label: t('settings.categories.engagement', 'Engagement & Marketing'),
            icon: MessageSquare,
            tabs: [
                { id: 'messaging', label: t('settings.tabs.messaging', 'Customer Messaging'), icon: MessageSquare, permission: 'messaging.view' },
            ]
        }
    ];

    const filteredCategories = categories.map(cat => ({
        ...cat,
        tabs: cat.tabs.filter((tab) => {
            if (!tab.permission) return true;
            if (tab.permission === 'admin') return user?.role === 'admin';
            return user?.role === 'admin' || hasPermission(tab.permission);
        })
    })).filter(cat => cat.tabs.length > 0);

    const renderTab = () => {
        switch (activeTab) {
            case 'general': return <GeneralTab />;
            case 'companies': return <CompaniesTab />;
            case 'branches': return <BranchesTab />;
            case 'shortcuts': return <React.Suspense fallback={<div className="p-8 text-slate-400">Loading...</div>}><KeyboardShortcutsTab /></React.Suspense>;
            case 'profile': return <BusinessProfileTab />;
            case 'zatca': return <ZatcaTab />;
            case 'users': return <UserManagementTab />;
            case 'reminders': return <RemindersTab />;
            case 'print': return <InvoicePrintTab />;
            case 'scales': return <ScaleTab />;
            case 'backup': return <DataBackupTab />;
            case 'logs': return <ActivityLogTab />;
            case 'messaging': return <MessagingTab />;
            case 'help': return <HelpTab />;
            default: return <GeneralTab />;
        }
    };

    return (
        <div className="flex h-[calc(100vh-4.5rem)] bg-white dark:bg-slate-900 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
            {/* Sidebar */}
            <div className="w-56 shrink-0 bg-slate-50 dark:bg-slate-900 flex flex-col h-full border-r border-slate-200 dark:border-slate-800 overflow-hidden">
                {/* Header */}
                <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800">
                    <h1 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <div className="p-1.5 bg-slate-900 dark:bg-blue-600 text-white rounded-lg">
                            <SettingsIcon size={18} />
                        </div>
                        {t('settings.title')}
                    </h1>
                    <p className="text-xs font-medium text-slate-500 mt-1.5 ml-0.5 flex items-center gap-1.5">
                        <Sparkles size={10} className="text-amber-500" />
                        App Configuration
                    </p>
                </div>

                {/* Nav */}
                <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto custom-scrollbar">
                    {filteredCategories.map((category) => (
                        <div key={category.id} className="space-y-1">
                            <h2 className="px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5 mb-1.5">
                                <category.icon size={10} />
                                {category.label}
                            </h2>
                            {category.tabs.map((tab) => {
                                const Icon = tab.icon;
                                const isActive = activeTab === tab.id;
                                return (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActiveTab(tab.id)}
                                        className={clsx(
                                            "w-full flex items-center justify-between px-2.5 py-2 rounded-lg group",
                                            isActive
                                                ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-lg'
                                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800/60'
                                        )}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Icon size={15} strokeWidth={isActive ? 2.5 : 2} />
                                            <span className="text-sm font-medium truncate">{tab.label}</span>
                                        </div>
                                        <ChevronRight size={12} className={clsx("shrink-0", isActive ? "opacity-100" : "opacity-0 group-hover:opacity-50")} />
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </nav>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 bg-white dark:bg-slate-900 custom-scrollbar min-w-0">
                <div className="max-w-6xl mx-auto">
                    {renderTab()}
                </div>
            </div>
        </div>
    );
};

export default Settings;
