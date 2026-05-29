import React, { useMemo } from 'react';
import type { Match } from '../types';
import { inferMatchScheduleDay, WEEKEND_SCHEDULE_DAYS } from '../services/tournamentScheduleService';
import type { MuskizScheduleDayLabel } from '../services/muskizScheduleSimulator';

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
    onUpdateScore?: (matchId: string, scoreA: string, scoreB: string) => void;
    onOpenReport?: (match: Match) => void;
    onNavigateActa?: (matchId: string) => void;
    onSocialPost?: (match: Match) => void;
    emptyMessage?: string;
}

/** Resultados con horario (día, hora, campo) en tabla ordenada. */
export const CompetitionResultsTable: React.FC<CompetitionResultsTableProps> = ({
    matches,
    previewMode,
    onUpdateScore,
    onOpenReport,
    onNavigateActa,
    onSocialPost,
    emptyMessage = 'No hay partidos.',
}) => {
    const sorted = useMemo(() => sortMatchesBySchedule(matches), [matches]);
    const isSim = previewMode === 'simulation';

    if (sorted.length === 0) {
        return (
            <div className="text-center text-slate-400 py-10 border rounded-lg border-dashed text-sm">{emptyMessage}</div>
        );
    }

    return (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm text-left min-w-[720px]">
                <thead className="bg-slate-800 text-white text-[10px] font-bold uppercase">
                    <tr>
                        <th className="px-3 py-2.5">Día</th>
                        <th className="px-3 py-2.5">Hora</th>
                        <th className="px-3 py-2.5">Campo</th>
                        <th className="px-3 py-2.5">Equipo A</th>
                        <th className="px-3 py-2.5 text-center w-16">Marcador</th>
                        <th className="px-3 py-2.5">Equipo B</th>
                        <th className="px-3 py-2.5">Fase</th>
                        <th className="px-3 py-2.5 text-right">Acciones</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {sorted.map((match) => {
                        const day = inferMatchScheduleDay(match);
                        const phaseLabel = (match.round ?? '').split('·').slice(2).join('·').trim() || match.round || '—';
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
                                <td className="px-3 py-2.5">
                                    <div className="flex items-center justify-center gap-1">
                                        <input
                                            type="number"
                                            readOnly={isSim}
                                            className={`w-12 text-center text-sm font-bold border rounded-lg p-1 ${
                                                isSim
                                                    ? 'bg-purple-50 border-purple-200 text-purple-400 cursor-not-allowed'
                                                    : 'bg-slate-50 border-slate-300'
                                            }`}
                                            value={match.scoreA ?? ''}
                                            onChange={(e) =>
                                                !isSim && onUpdateScore?.(match.id, e.target.value, match.scoreB?.toString() ?? '')
                                            }
                                            placeholder="-"
                                        />
                                        <span className="text-slate-400 font-bold">:</span>
                                        <input
                                            type="number"
                                            readOnly={isSim}
                                            className={`w-12 text-center text-sm font-bold border rounded-lg p-1 ${
                                                isSim
                                                    ? 'bg-purple-50 border-purple-200 text-purple-400 cursor-not-allowed'
                                                    : 'bg-slate-50 border-slate-300'
                                            }`}
                                            value={match.scoreB ?? ''}
                                            onChange={(e) =>
                                                !isSim && onUpdateScore?.(match.id, match.scoreA?.toString() ?? '', e.target.value)
                                            }
                                            placeholder="-"
                                        />
                                    </div>
                                </td>
                                <td className="px-3 py-2.5 font-semibold text-slate-800 max-w-[140px] truncate" title={match.teamB}>
                                    {match.teamB}
                                </td>
                                <td className="px-3 py-2.5 text-[10px] text-slate-500 max-w-[120px] truncate" title={match.round}>
                                    {phaseLabel}
                                </td>
                                <td className="px-3 py-2.5">
                                    <div className="flex flex-wrap justify-end gap-1">
                                        {isSim && (
                                            <span className="text-[9px] font-black text-purple-600 px-1.5 py-0.5 bg-purple-100 rounded">
                                                SIM
                                            </span>
                                        )}
                                        {!isSim && match.id && onNavigateActa && (
                                            <button
                                                type="button"
                                                onClick={() => onNavigateActa(match.id)}
                                                className="px-2 py-1 rounded text-[10px] font-bold border border-teal-200 bg-teal-50 text-teal-900 hover:bg-teal-100"
                                            >
                                                Acta
                                            </button>
                                        )}
                                        {!isSim && match.status === 'FINISHED' && onSocialPost && (
                                            <button
                                                type="button"
                                                onClick={() => onSocialPost(match)}
                                                className="px-2 py-1 rounded text-[10px] font-bold border border-purple-200 bg-purple-50 text-purple-700"
                                            >
                                                IG
                                            </button>
                                        )}
                                        {!isSim && onOpenReport && (
                                            <button
                                                type="button"
                                                onClick={() => onOpenReport(match)}
                                                className={`px-2 py-1 rounded text-[10px] font-bold border ${
                                                    match.report
                                                        ? 'bg-green-50 text-green-700 border-green-200'
                                                        : 'bg-slate-50 text-slate-600 border-slate-200'
                                                }`}
                                            >
                                                {match.report ? 'Ver acta' : 'Acta'}
                                            </button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            <p className="text-[10px] text-slate-400 px-3 py-2 bg-slate-50 border-t border-slate-100">
                Orden: {WEEKEND_SCHEDULE_DAYS.join(' → ')} · por hora y campo.
            </p>
        </div>
    );
};
