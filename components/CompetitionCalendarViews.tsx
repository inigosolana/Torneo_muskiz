import React, { useMemo, useState } from 'react';
import type { Match, Team } from '../types';
import { SimulationScheduleGridTabs } from './SimulationDayGrid';
import { WEEKEND_SCHEDULE_DAYS, inferMatchScheduleDay } from '../services/tournamentScheduleService';
import {
    getDivisionCodeFromRound,
    resolveMatchDivision,
    type MuskizScheduleDayLabel,
} from '../services/muskizScheduleSimulator';

const DIV_COLORS: Record<string, string> = {
    CF: 'border-pink-300 bg-pink-50',
    CM: 'border-blue-300 bg-blue-50',
    JF: 'border-purple-300 bg-purple-50',
    JM: 'border-indigo-300 bg-indigo-50',
    SF: 'border-rose-300 bg-rose-50',
    SM: 'border-cyan-300 bg-cyan-50',
    IF: 'border-emerald-300 bg-emerald-50',
    IM: 'border-teal-300 bg-teal-50',
};

const DIV_BADGE: Record<string, string> = {
    CF: 'bg-pink-200 text-pink-900',
    CM: 'bg-blue-200 text-blue-900',
    JF: 'bg-purple-200 text-purple-900',
    JM: 'bg-indigo-200 text-indigo-900',
    SF: 'bg-rose-200 text-rose-900',
    SM: 'bg-cyan-200 text-cyan-900',
    IF: 'bg-emerald-200 text-emerald-900',
    IM: 'bg-teal-200 text-teal-900',
};

type ViewMode = 'day' | 'category';

interface CompetitionCalendarViewsProps {
    matches: Match[];
    teams: Team[];
    /** Etiqueta del contexto (borrador, oficial, etc.) */
    title?: string;
    onUpdateMatch?: (matchId: string, patch: Partial<Pick<Match, 'time' | 'court' | 'teamA' | 'teamB'>>) => void;
    emptyMessage?: string;
}

function groupByDay(matches: Match[]): Record<MuskizScheduleDayLabel, Match[]> {
    const byDay: Record<MuskizScheduleDayLabel, Match[]> = {
        Viernes: [],
        Sábado: [],
        Domingo: [],
    };
    for (const m of matches) {
        const day = inferMatchScheduleDay(m);
        if (day) byDay[day].push(m);
    }
    return byDay;
}

function groupByCategory(matches: Match[], teams: Team[]): { division: Team['division']; code: string | null; matches: Match[] }[] {
    const map = new Map<Team['division'], Match[]>();
    for (const m of matches) {
        const div = resolveMatchDivision(m, teams);
        if (!div) continue;
        if (!map.has(div)) map.set(div, []);
        map.get(div)!.push(m);
    }
    return [...map.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'es'))
        .map(([division, list]) => ({
            division,
            code: getDivisionCodeFromRound(list[0]?.round) ?? null,
            matches: [...list].sort((a, b) => {
                const ta = a.time === 'PENDIENTE' ? 99999 : parseInt(a.time.replace(':', ''), 10);
                const tb = b.time === 'PENDIENTE' ? 99999 : parseInt(b.time.replace(':', ''), 10);
                return ta - tb || a.court.localeCompare(b.court, 'es');
            }),
        }));
}

export const CompetitionCalendarViews: React.FC<CompetitionCalendarViewsProps> = ({
    matches,
    teams,
    title,
    onUpdateMatch,
    emptyMessage = 'No hay partidos para mostrar.',
}) => {
    const [viewMode, setViewMode] = useState<ViewMode>('day');

    const byDay = useMemo(() => groupByDay(matches), [matches]);
    const byCategory = useMemo(() => groupByCategory(matches, teams), [matches, teams]);
    const totalByDay = WEEKEND_SCHEDULE_DAYS.reduce((n, d) => n + byDay[d].length, 0);

    if (matches.length === 0) {
        return (
            <div className="text-center text-slate-400 py-8 border rounded-lg border-dashed text-sm">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                {title && <h4 className="text-sm font-black uppercase text-slate-600">{title}</h4>}
                <div className="flex items-center gap-1 bg-white rounded-lg border border-slate-200 p-1 ml-auto">
                    <button
                        type="button"
                        onClick={() => setViewMode('day')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-colors ${
                            viewMode === 'day' ? 'bg-teal-700 text-white shadow' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        <span className="material-symbols-outlined text-sm">calendar_view_month</span>
                        Tabla por día
                    </button>
                    <button
                        type="button"
                        onClick={() => setViewMode('category')}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-1 transition-colors ${
                            viewMode === 'category' ? 'bg-teal-700 text-white shadow' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                        <span className="material-symbols-outlined text-sm">category</span>
                        Por categoría
                    </button>
                </div>
            </div>

            {viewMode === 'day' && (
                <div className="space-y-8">
                    {WEEKEND_SCHEDULE_DAYS.map((day) => {
                        const dayMatches = byDay[day];
                        return (
                            <section key={day} className="rounded-xl border border-slate-200 overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-3 bg-slate-800 text-white">
                                    <h5 className="font-black text-sm uppercase tracking-wide flex items-center gap-2">
                                        <span className="material-symbols-outlined text-base">event</span>
                                        {day}
                                    </h5>
                                    <span className="text-[11px] font-bold bg-white/15 px-2 py-0.5 rounded-full">
                                        {dayMatches.length} partido{dayMatches.length !== 1 ? 's' : ''}
                                    </span>
                                </div>
                                {dayMatches.length === 0 ? (
                                    <p className="text-sm text-slate-400 text-center py-6">Sin partidos este día.</p>
                                ) : (
                                    <div className="p-3">
                                        <SimulationScheduleGridTabs
                                            matches={dayMatches}
                                            fixedDay={day}
                                            onUpdateMatch={onUpdateMatch}
                                        />
                                    </div>
                                )}
                            </section>
                        );
                    })}
                    {totalByDay < matches.length && (
                        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                            {matches.length - totalByDay} partido(s) sin día asignado (no aparecen en las tablas).
                        </p>
                    )}
                </div>
            )}

            {viewMode === 'category' && (
                <div className="space-y-6">
                    {byCategory.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-6">No se pudo agrupar por categoría.</p>
                    ) : (
                        byCategory.map(({ division, code, matches: catMatches }) => {
                            const color = (code && DIV_COLORS[code]) ?? 'border-slate-200 bg-slate-50';
                            const badge = (code && DIV_BADGE[code]) ?? 'bg-slate-200 text-slate-700';
                            return (
                                <section key={division} className={`rounded-xl border-2 overflow-hidden ${color}`}>
                                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-inherit bg-white/60">
                                        <div className="flex items-center gap-2">
                                            {code && (
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${badge}`}>
                                                    {code}
                                                </span>
                                            )}
                                            <h5 className="font-black text-sm text-slate-800">{division}</h5>
                                        </div>
                                        <span className="text-[11px] font-bold text-slate-500">
                                            {catMatches.length} partidos
                                        </span>
                                    </div>
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-white/80 text-slate-500 font-bold uppercase text-[10px]">
                                                <tr>
                                                    <th className="px-4 py-2">Día</th>
                                                    <th className="px-4 py-2">Hora</th>
                                                    <th className="px-4 py-2">Campo</th>
                                                    <th className="px-4 py-2">Equipo A</th>
                                                    <th className="px-4 py-2">Equipo B</th>
                                                    <th className="px-4 py-2">Fase</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/80">
                                                {catMatches.map((m) => (
                                                    <tr key={m.id} className="hover:bg-white/50">
                                                        <td className="px-4 py-2 text-xs font-bold text-slate-600">
                                                            {inferMatchScheduleDay(m) ?? '—'}
                                                        </td>
                                                        <td className="px-4 py-2 font-mono text-xs font-bold">
                                                            <span className={m.time === 'PENDIENTE' ? 'text-amber-700' : ''}>
                                                                {m.time}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-2 text-xs">{m.court}</td>
                                                        <td className="px-4 py-2 font-semibold text-slate-800">{m.teamA}</td>
                                                        <td className="px-4 py-2 font-semibold text-slate-800">{m.teamB}</td>
                                                        <td className="px-4 py-2 text-[10px] text-slate-500 max-w-[160px] truncate" title={m.round}>
                                                            {(m.round ?? '').split('·').slice(2).join('·').trim() || m.round}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </section>
                            );
                        })
                    )}
                </div>
            )}
        </div>
    );
};
