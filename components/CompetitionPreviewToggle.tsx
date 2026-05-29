import React from 'react';

export type CompetitionPreviewMode = 'official' | 'simulation';

interface CompetitionPreviewToggleProps {
    mode: CompetitionPreviewMode;
    onChange: (mode: CompetitionPreviewMode) => void;
    simMatchCount?: number;
    extra?: React.ReactNode;
}

/** Interruptor compartido Simulación / Oficial para Calendario, Resultados y Clasificación. */
export const CompetitionPreviewToggle: React.FC<CompetitionPreviewToggleProps> = ({
    mode,
    onChange,
    simMatchCount,
    extra,
}) => (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
        <div className="flex items-center gap-1 bg-white rounded-lg border border-slate-200 p-1">
            <button
                type="button"
                onClick={() => onChange('official')}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 ${
                    mode === 'official' ? 'bg-teal-700 text-white shadow' : 'text-slate-600 hover:bg-slate-100'
                }`}
            >
                <span className="material-symbols-outlined text-sm">public</span>
                Oficial
            </button>
            <button
                type="button"
                onClick={() => onChange('simulation')}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 ${
                    mode === 'simulation' ? 'bg-purple-600 text-white shadow' : 'text-slate-600 hover:bg-slate-100'
                }`}
            >
                <span className="material-symbols-outlined text-sm">science</span>
                Simulación
            </button>
        </div>
        {mode === 'simulation' && simMatchCount !== undefined && (
            <span className="text-[11px] text-purple-700 font-medium flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">info</span>
                Vista previa con borradores ({simMatchCount} partidos)
            </span>
        )}
        {extra}
    </div>
);
