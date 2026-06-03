import React from 'react';
import type { Team } from '../types';
import { TOURNAMENT_DIVISIONS } from '../utils/finalPhaseBracket';

interface DivisionCategorySelectProps {
    value: Team['division'];
    onChange: (division: Team['division']) => void;
    id?: string;
    className?: string;
    label?: string;
}

/** Selector de categoría (desplegable, cómodo en móvil). */
export const DivisionCategorySelect: React.FC<DivisionCategorySelectProps> = ({
    value,
    onChange,
    id = 'division-category-select',
    className = '',
    label = 'Categoría',
}) => (
    <div className={`flex flex-col gap-1.5 ${className}`}>
        <label htmlFor={id} className="text-[10px] font-black uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {label}
        </label>
        <select
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value as Team['division'])}
            className="w-full max-w-md border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-bold bg-white dark:bg-background-dark text-slate-800 dark:text-white shadow-sm"
        >
            {TOURNAMENT_DIVISIONS.map((cat) => (
                <option key={cat} value={cat}>
                    {cat}
                </option>
            ))}
        </select>
    </div>
);
