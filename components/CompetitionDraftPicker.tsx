import React from 'react';
import type { CalendarDraft } from '../types';

interface CompetitionDraftPickerProps {
    drafts: CalendarDraft[];
    value: string | 'all';
    onChange: (id: string | 'all') => void;
    disabled?: boolean;
}

/** Selector de borrador al previsualizar calendario / resultados / clasificación en modo Simulación. */
export const CompetitionDraftPicker: React.FC<CompetitionDraftPickerProps> = ({
    drafts,
    value,
    onChange,
    disabled,
}) => (
    <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-purple-50 border border-purple-200">
        <span className="text-[10px] font-black uppercase text-purple-800 flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">science</span>
            Borrador a previsualizar
        </span>
        <select
            value={value}
            disabled={disabled || drafts.length === 0}
            onChange={(e) => onChange(e.target.value === 'all' ? 'all' : e.target.value)}
            className="border border-purple-200 rounded-lg px-3 py-2 text-sm font-semibold min-w-[240px] bg-white disabled:opacity-50"
        >
            <option value="all">Todos los días (Viernes + Sábado + Domingo)</option>
            {drafts.map((d) => (
                <option key={d.id} value={d.id}>
                    {d.scheduleDay ? `${d.scheduleDay} · ` : ''}
                    {d.name} ({d.matches.length} partidos)
                </option>
            ))}
        </select>
    </div>
);
