import React, { useMemo, useState } from 'react';
import type { Match, Team } from '../types';
import { CompetitionResultsTable } from './CompetitionResultsTable';
import { resolveMatchDivision } from '../services/muskizScheduleSimulator';

const DIVISIONS_LIST: Team['division'][] = [
    'Infantil Femenino',
    'Infantil Masculino',
    'Cadete Femenino',
    'Cadete Masculino',
    'Juvenil Femenino',
    'Juvenil Masculino',
    'Senior Femenino',
    'Senior Masculino',
];

interface CompetitionPublicResultsSectionProps {
    matches: Match[];
    teams: Team[];
    emptyMessage?: string;
}

/** Resultados y horarios oficiales (solo lectura, sin actas). */
export const CompetitionPublicResultsSection: React.FC<CompetitionPublicResultsSectionProps> = ({
    matches,
    teams,
    emptyMessage = 'El calendario oficial se publicará próximamente.',
}) => {
    const [divisionFilter, setDivisionFilter] = useState<Team['division'] | 'all'>('all');

    const countByDivision = useMemo(() => {
        const counts = new Map<Team['division'], number>();
        for (const m of matches) {
            const d = resolveMatchDivision(m, teams);
            if (!d) continue;
            counts.set(d, (counts.get(d) ?? 0) + 1);
        }
        return counts;
    }, [matches, teams]);

    const filtered = useMemo(() => {
        if (divisionFilter === 'all') return matches;
        return matches.filter((m) => resolveMatchDivision(m, teams) === divisionFilter);
    }, [matches, divisionFilter, teams]);

    if (matches.length === 0) {
        return (
            <div className="rounded-xl border border-slate-200 bg-slate-50 dark:bg-white/5 px-6 py-12 text-center text-slate-600 dark:text-slate-300">
                <p className="text-lg font-black text-slate-800 dark:text-white mb-2">Resultados en preparación</p>
                <p className="text-sm leading-relaxed max-w-md mx-auto">{emptyMessage}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4 animate-in fade-in">
            <p className="text-sm text-slate-600 dark:text-slate-400">
                Horarios y marcadores del torneo, ordenados por <strong>día, hora y campo</strong>. Solo lectura.
            </p>
            <div className="flex flex-col gap-2 max-w-sm">
                <label htmlFor="public-results-division" className="text-[10px] font-black uppercase text-slate-400">
                    Categoría
                </label>
                <select
                    id="public-results-division"
                    value={divisionFilter}
                    onChange={(e) => setDivisionFilter(e.target.value as Team['division'] | 'all')}
                    className="rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-surface-dark px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                    <option value="all">Todas ({matches.length})</option>
                    {DIVISIONS_LIST.map((cat) => {
                        const n = countByDivision.get(cat) ?? 0;
                        return (
                            <option key={cat} value={cat}>
                                {cat} ({n})
                            </option>
                        );
                    })}
                </select>
            </div>
            <CompetitionResultsTable
                matches={filtered}
                teams={teams}
                previewMode="official"
                hideActions
                emptyMessage={
                    divisionFilter !== 'all'
                        ? `No hay partidos en ${divisionFilter}.`
                        : emptyMessage
                }
            />
        </div>
    );
};
