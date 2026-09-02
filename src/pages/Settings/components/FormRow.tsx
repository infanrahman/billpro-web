import React from 'react';

interface FormRowProps {
    label: string;
    description?: string;
    children: React.ReactNode;
    icon?: React.ElementType;
    className?: string;
    inline?: boolean;
}

const FormRow: React.FC<FormRowProps> = ({ 
    label, 
    description, 
    children, 
    icon: Icon, 
    className = "",
    inline = true
}) => {
    return (
        <div className={`py-3 first:pt-0 last:pb-0 ${className}`}>
            <div className={`flex ${inline ? 'flex-col md:flex-row md:items-center' : 'flex-col'} justify-between gap-3 md:gap-5`}>
                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        {Icon && (
                            <div className="p-1.5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-md">
                                <Icon size={15} />
                            </div>
                        )}
                        <label className="text-sm font-semibold text-slate-900 dark:text-white">
                            {label}
                        </label>
                    </div>
                    {description && (
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mt-1 max-w-xl leading-relaxed">
                            {description}
                        </p>
                    )}
                </div>
                <div className={`${inline ? 'w-full md:w-auto md:min-w-[220px]' : 'w-full'} flex items-center`}>
                    {children}
                </div>
            </div>
        </div>
    );
};

export default FormRow;
