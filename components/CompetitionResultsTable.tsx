import React, { useMemo, useState } from 'react';
import type { BeachSetScores, Match } from '../types';
import { inferMatchScheduleDay, WEEKEND_SCHEDULE_DAYS } from '../services/tournamentScheduleService';
import type { MuskizScheduleDayLabel } from '../services/muskizScheduleSimulator';
import { getMatchSetsDisplay } from '../utils/beachSetScoring';
import { MatchSetScoreModal } from './MatchSetScoreModal';

const DAY_ORDER: Record<MuskizScheduleDayLabel, number> = { Viernes: 0, Sábado: 1, Domingo: 2 };

function timeSortKey(time: string): number {
    if (time === 'PENDIENTE') return 99999;
    const [h, m] = time.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
}

function sortMatchesBySchedule(matches: Match[]): Match[] {
    return [...matches].sort((a, b) => {
        const da = inferMatchScheduleDay(a);
        const db = inferMatchScheduleDay(b);
        const oa = da ? DAY_ORDER[da] : 99;
        const ob = db ? DAY_ORDER[db] : 99;
        if (oa !== ob) return oa - ob;
        const ta = timeSortKey(a.time);
        const tb = timeSortKey(b.time);
        if (ta !== tb) return ta - tb;
        return a.court.localeCompare(b.court, 'es');
    });
}

interface CompetitionResultsTableProps {
    matches: Match[];
    previewMode: 'official' | 'simulation';
    onUpdateSetScores?: (matchId: string, setScores: BeachSetScores) => void;
    onOpenReport?: (match: Match) => void;
    onNavigateActa?: (matchId: string) => void;
    onSocialPost?: (match: Match) => void;
    emptyMessage?: string;
    /** Oculta columna de acciones (p. ej. vista responsable). */
    hideActions?: boolean;
}

/** Resultados con horario; marcador visible = sets ganados (2:0, 2:1, 0:2, 1:2). */
export const CompetitionResultsTable: React.FC<CompetitionResultsTableProps> = ({
    matches,
    previewMode,
    onUpdateSetScores,
    onOpenReport,
    onNavigateActa,
    onSocialPost,
    emptyMessage = 'No hay partidos.',
    hideActions = false,
}) => {
    const sorted = useMemo(() => sortMatchesBySchedule(matches), [matches]);
    const isSim = previewMode === 'simulation';
    const canEditScores = Boolean(onUpdateSetScores) && !hideActions;
    const canActa = Boolean(onOpenReport || onNavigateActa) && !hideActions;
    const showActionsCol = !hideActions && (canEditScores || canActa || onSocialPost);
    const [editingMatch, setEditingMatch] = useState<Match | null>(null);

    if (sorted.length === 0) {
        return (
            <div className="text-center text-slate-400 py-10 border rounded-lg border-dashed text-sm">{emptyMessage}</div>
        );
    }

    return (
        <>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm text-left min-w-[720px]">
                    <thead className="bg-slate-800 text-white text-[10px] font-bold uppercase">
                        <tr>
                            <th className="px-3 py-2.5">Día</th>
                            <th className="px-3 py-2.5">Hora</th>
                            <th className="px-3 py-2.5">Campo</th>
                            <th className="px-3 py-2.5">Equipo A</th>
                            <th className="px-3 py-2.5 text-center">Sets</th>
                            <th className="px-3 py-2.5">Equipo B</th>
                            <th className="px-3 py-2.5">Fase</th>
                            {showActionsCol && <th className="px-3 py-2.5 text-right">Acciones</th>}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {sorted.map((match) => {
                            const day = inferMatchScheduleDay(match);
                            const phaseLabel = (match.round ?? '').split('·').slice(2).join('·').trim() || match.round || '—';
                            const display = getMatchSetsDisplay(match);
                            const hasResult = display !== '—';

                            return (
                                <tr
                                    key={match.id}
                                    className={`hover:bg-slate-50/80 ${isSim ? 'bg-purple-50/30' : 'bg-white'} ${match.time === 'PENDIENTE' ? 'bg-amber-50/50' : ''}`}
                                >
                                    <td className="px-3 py-2.5 text-xs font-bold text-slate-600 whitespace-nowrap">
                                        {day ?? '—'}
                                    </td>
                                    <td className="px-3 py-2.5 font-mono text-xs font-black whitespace-nowrap">
                                        <span className={match.time === 'PENDIENTE' ? 'text-amber-700' : 'text-teal-800'}>
                                            {match.time}
                                        </span>
                                    </td>
                                    <td className="px-3 py-2.5 text-xs text-slate-600 whitespace-nowrap">{match.court}</td>
                                    <td className="px-3 py-2.5 font-semibold text-slate-800 max-w-[140px] truncate" title={match.teamA}>
                                        {match.teamA}
                                    </td>
                                    <td className="px-3 py-2.5 text-center">
                                        {canEditScores ? (
                                            <button
                                                type="button"
                                                onClick={() => setEditingMatch(match)}
                                                className={`min-w-[4.5rem] px-3 py-1.5 rounded-lg text-base font-black tabular-nums border-2 transition-colors ${
                                                    hasResult
                                                        ? isSim
                                                            ? 'border-purple-400 bg-white text-purple-900 hover:bg-purple-50'
                                                            : 'border-teal-500 bg-teal-50 text-teal-900 hover:bg-teal-100'
                                                        : 'border-dashed border-slate-300 text-slate-400 hover:border-teal-400 hover:text-teal-700'
                                                }`}
                                                title="Introducir resultado por sets y shootout"
                                            >
                                                {display}
                                            </button>
                                        ) : (
                                            <span className="text-base font-black tabular-nums text-slate-700">{display}</span>
                                        )}
                                    </td>
                                    <td className="px-3 py-2.5 font-semibold text-slate-800 max-w-[140px] truncate" title={match.teamB}>
                                        {match.teamB}
                                    </td>
                                    <td className="px-3 py-2.5 text-[10px] text-slate-500 max-w-[120px] truncate" title={match.round}>
                                        {phaseLabel}
                                    </td>
                                    {showActionsCol && (
                                    <td className="px-3 py-2.5">
                                        <div className="flex flex-wrap justify-end gap-1">
                                            {isSim && !canActa && (
                                                <span className="text-[9px] font-black text-purple-600 px-1.5 py-0.5 bg-purple-100 rounded">
                                                    SIM
                                                </span>
                                            )}
                                            {match.id && onNavigateActa && (
                                                <button
                                                    type="button"
                                                    onClick={() => onNavigateActa(match.id)}
                                                    className="px-2 py-1 rounded text-[10px] font-bold border border-teal-200 bg-teal-50 text-teal-900 hover:bg-teal-100"
                                                    title="Acta imprimible (oficial)"
                                                >
                                                    Imprimir
                                                </button>
                                            )}
                                            {match.status === 'FINISHED' && onSocialPost && (
                                                <button
                                                    type="button"
                                                    onClick={() => onSocialPost(match)}
                                                    className="px-2 py-1 rounded text-[10px] font-bold border border-purple-200 bg-purple-50 text-purple-700"
                                                >
                                                    IG
                                                </button>
                                            )}
                                            {onOpenReport && (
                                                <button
                                                    type="button"
                                                    onClick={() => onOpenReport(match)}
                                                    className={`px-2 py-1 rounded text-[10px] font-bold border ${
                                                        match.report
                                                            ? 'bg-green-50 text-green-700 border-green-200'
                                                            : isSim
                                                              ? 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'
                                                              : 'bg-slate-50 text-slate-600 border-slate-200'
                                                    }`}
                                                >
                                                    {match.report ? 'Ver acta' : 'Acta'}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <p className="text-[10px] text-slate-400 px-3 py-2 bg-slate-50 border-t border-slate-100">
                    Marcador = sets ganados (2:0, 2:1, 0:2, 1:2). Pulsa para introducir cada set y shootout. Orden:{' '}
                    {WEEKEND_SCHEDULE_DAYS.join(' → ')}.
                </p>
            </div>

            {editingMatch && onUpdateSetScores && (
                <MatchSetScoreModal
                    match={editingMatch}
                    onClose={() => setEditingMatch(null)}
                    onSave={(setScores) => {
                        onUpdateSetScores(editingMatch.id, setScores);
                        setEditingMatch(null);
                    }}
                />
            )}
        </>
    );
};
