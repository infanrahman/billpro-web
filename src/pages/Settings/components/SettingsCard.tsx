import React from 'react';
import { motion } from 'framer-motion';

interface SettingsCardProps {
    children: React.ReactNode;
    title?: string;
    description?: string;
    icon?: React.ElementType;
    className?: string;
}

const SettingsCard: React.FC<SettingsCardProps> = ({ children, title, description, icon: Icon, className = "" }) => {
    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden ${className}`}
        >
            {(title || Icon) && (
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3 bg-slate-50 dark:bg-slate-950/50">
                    {Icon && (
                        <div className="p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-lg border border-blue-500/20">
                            <Icon size={18} strokeWidth={2.25} />
                        </div>
                    )}
                    <div>
                        {title && <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>}
                        {description && <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>}
                    </div>
                </div>
            )}
            <div className="p-5">
                {children}
            </div>
        </motion.div>
    );
};

export default SettingsCard;
