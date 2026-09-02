import React from 'react';

interface SettingsSectionHeaderProps {
    title: string;
    description?: string;
    className?: string;
}

const SettingsSectionHeader: React.FC<SettingsSectionHeaderProps> = ({ title, description, className = "" }) => {
    return (
        <div className={`mb-5 relative ${className}`}>
            <div className="flex items-center gap-3">
                <div className="h-9 w-1 bg-blue-600 rounded-full" />
                <div>
                    <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">{title}</h2>
                    {description && (
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mt-0.5">
                            {description}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default SettingsSectionHeader;
