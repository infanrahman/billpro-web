import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Building2, ChevronDown, ChevronLeft, ChevronRight, MapPin, Menu, Zap, Search, Command } from 'lucide-react';
import Sidebar from './Sidebar';
import NotificationBell from '../UI/NotificationBell';
import QuickPaymentModal from '../Sales/QuickPaymentModal';
import clsx from 'clsx';
import { useAuth } from '../../contexts/AuthContext';

const MainLayout: React.FC = () => {
    const {
        user,
        activeCompanyId,
        activeBranchId,
        availableCompanies,
        availableBranches,
        switchCompany,
        switchBranch,
    } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [isQuickPayOpen, setIsQuickPayOpen] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    const [isDesktop, setIsDesktop] = useState(window.innerWidth > 1280);
    const SIDEBAR_WIDTH = 256;

    useEffect(() => {
        const handleResize = () => {
            const desktop = window.innerWidth > 1280;
            setIsDesktop(desktop);
            if (!desktop) {
                setIsSidebarOpen(false);
            } else {
                setIsSidebarOpen(true);
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const handleKvKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'F9') {
                e.preventDefault();
                setIsQuickPayOpen(true);
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
                e.preventDefault();
                setIsSidebarOpen(prev => !prev);
            }
        };

        window.addEventListener('keydown', handleKvKeyDown);
        return () => window.removeEventListener('keydown', handleKvKeyDown);
    }, []);

    // Auto-hide sidebar on mobile when navigating
    useEffect(() => {
        if (!isDesktop) {
            const timeoutId = window.setTimeout(() => setIsSidebarOpen(false), 0);
            return () => window.clearTimeout(timeoutId);
        }
    }, [location.pathname, isDesktop]);

    const isPosPage = location.pathname === '/pos';

    return (
        <div className="app-compact orbit-app flex h-screen w-screen bg-slate-50 overflow-hidden text-slate-900 selection:bg-blue-500/30">
            <Sidebar 
                isOpen={isSidebarOpen} 
                onClose={() => setIsSidebarOpen(false)} 
            />

            <div 
                style={{ 
                    paddingLeft: (isDesktop && isSidebarOpen) ? `${SIDEBAR_WIDTH}px` : 0 
                }}
                className="flex-1 flex flex-col h-screen overflow-hidden relative"
            >
                {/* Premium Header - Minimized for POS */}
                <header className={clsx(
                    "orbit-header bg-white border-b border-slate-200 px-3 md:px-4 flex items-center justify-between sticky top-0 z-30 transition-all duration-200",
                    isPosPage ? "h-12" : "h-14"
                )}>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                            className={clsx(
                                "bg-white hover:bg-blue-50 rounded-lg text-slate-600 border border-slate-200 shadow-sm",
                                "p-2"
                            )}
                        >
                            <Menu size={18} />
                        </button>

                        <div className="hidden md:flex items-center gap-2">
                            <div className="relative">
                                <Building2 size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                <select
                                    value={activeCompanyId}
                                    onChange={(event) => switchCompany(event.target.value)}
                                    className="h-9 min-w-40 max-w-52 appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-xs font-semibold text-slate-700 outline-none hover:bg-blue-50 focus:ring-2 focus:ring-blue-500/20"
                                    title="Active company"
                                >
                                    {availableCompanies.map(company => (
                                        <option key={company.id} value={company.id}>
                                            {company.name}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>

                            <div className="relative">
                                <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                <select
                                    value={activeBranchId}
                                    onChange={(event) => switchBranch(event.target.value)}
                                    className="h-9 min-w-36 max-w-48 appearance-none rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-xs font-semibold text-slate-700 outline-none hover:bg-blue-50 focus:ring-2 focus:ring-blue-500/20"
                                    title="Active branch"
                                >
                                    {availableBranches.map(branch => (
                                        <option key={branch.id} value={branch.id}>
                                            {branch.name}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                        </div>

                        <div className="hidden lg:flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 group focus-within:ring-2 focus-within:ring-blue-500/20 transition-all">
                            <Search size={16} className="text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                            <input 
                                type="text" 
                                placeholder="Search everything..." 
                                className="bg-transparent border-none outline-none text-sm font-medium w-52 placeholder:text-slate-400"
                            />
                            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-700 text-[10px] text-slate-400 font-mono">
                                <Command size={10} /> K
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 md:gap-3">
                        <div className="hidden md:flex items-center gap-2 mr-2">
                            <button
                                onClick={() => navigate(-1)}
                                className="p-2 text-slate-400 hover:text-blue-500 transition-colors"
                            >
                                <ChevronLeft size={24} />
                            </button>
                            <button
                                onClick={() => navigate(1)}
                                className="p-2 text-slate-400 hover:text-blue-500 transition-colors"
                            >
                                <ChevronRight size={24} />
                            </button>
                        </div>

                        <button
                            onClick={() => setIsQuickPayOpen(true)}
                            className="px-3 py-2 bg-blue-600 text-white rounded-lg flex items-center gap-2 font-semibold text-sm shadow-sm hover:bg-blue-700"
                        >
                            <Zap size={14} className="fill-white" />
                            <span className="hidden sm:inline">Quick Pay</span>
                        </button>

                        <div className="h-7 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

                        <div className="flex items-center gap-3">
                            <NotificationBell />
                            
                            <div className="flex items-center gap-2 pl-2 pr-1 py-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm cursor-pointer">
                                <div className="hidden sm:block text-right">
                                    <p className="text-xs font-semibold text-slate-800 dark:text-white leading-none">{user?.name || user?.username || 'User'}</p>
                                    <p className="text-[11px] font-medium text-blue-500 mt-0.5">{user?.role === 'admin' ? 'Administrator' : 'Staff'}</p>
                                </div>
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 p-0.5 shadow-sm">
                                    <div className="w-full h-full rounded-[10px] bg-white dark:bg-slate-900 overflow-hidden">
                                        <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>

                <main className={clsx(
                    "orbit-content flex-1 bg-slate-50 relative custom-scrollbar",
                    isPosPage ? "overflow-hidden flex flex-col" : "overflow-auto"
                )}>
                    {/* Decorative background elements */}
                    <div className={clsx(
                        "mx-auto relative z-10 flex flex-col w-full min-h-0",
                        isPosPage ? "max-w-full p-2 h-full flex-1" : "max-w-[1600px] p-3 md:p-4 min-h-full"
                    )}>
                        <div className={clsx("flex-1", isPosPage ? "flex flex-col min-h-0 h-full" : "")}>
                            <Outlet />
                        </div>
                    </div>
                </main>
            </div>

            <QuickPaymentModal
                isOpen={isQuickPayOpen}
                onClose={() => setIsQuickPayOpen(false)}
            />
        </div>
    );
};

export default MainLayout;

