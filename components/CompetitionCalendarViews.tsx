import React, { useMemo, useState } from 'react';
import type { Match, Team } from '../types';
import { SimulationScheduleGridTabs } from './SimulationDayGrid';
import { WEEKEND_SCHEDULE_DAYS, inferMatchScheduleDay } from '../services/tournamentScheduleService';
import {
    getDivisionCodeFromRound,
    resolveMatchDivision,
    type MuskizScheduleDayLabel,
} from '../services/muskizScheduleSimulator';
import {
    collectGridLegendEntries,
    getDivisionBaseColors,
    getMatchGridColors,
} from '../utils/matchGridColors';
import { downloadTournamentGridExcel, printTournamentGridPdf } from '../utils/tournamentGridExport';
import { getMatchPhaseDisplayLabel } from '../utils/matchPhaseLabel';
import { isEliminationMatch } from '../utils/finalPhaseBracket';

type ViewMode = 'day' | 'category';

interface CompetitionCalendarViewsProps {
    matches: Match[];
    teams: Team[];
    /** Etiqueta del contexto (borrador, oficial, etc.) */
    title?: string;
    /** Cuadrícula sin arrastrar ni editar (oficial publicado y web). */
    readOnly?: boolean;
    /** Texto del aviso de solo lectura (staff vs visitantes). */
    readOnlyAudience?: 'staff' | 'public';
    onUpdateMatch?: (matchId: string, patch: Partial<Pick<Match, 'time' | 'court' | 'teamA' | 'teamB'>>) => void;
    /** Descarga ZIP de actas DOCX de todos los partidos de una categoría. */
    onDownloadCategoryActas?: (division: Team['division'], matches: Match[]) => void;
    actasExporting?: boolean;
    /** Excel / PDF por día (simulación o responsables). */
    showDayExport?: boolean;
    exportFileNamePrefix?: string;
    /** Resalta en la cuadrícula los partidos de estos equipos. */
    highlightTeamNames?: string[];
    /** Solo muestra días donde hay al menos un partido de highlightTeamNames (si está definido). */
    onlyDaysWithHighlightTeams?: boolean;
    emptyMessage?: string;
}

function daySlug(day: MuskizScheduleDayLabel): string {
    return day
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase();
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
    readOnly = false,
    readOnlyAudience = 'staff',
    onUpdateMatch,
    onDownloadCategoryActas,
    actasExporting,
    showDayExport = false,
    exportFileNamePrefix = 'calendario_simulacion',
    highlightTeamNames,
    onlyDaysWithHighlightTeams = false,
    emptyMessage = 'No hay partidos para mostrar.',
}) => {
    const [viewMode, setViewMode] = useState<ViewMode>('day');
    const gridReadOnly = readOnly || !onUpdateMatch;

    const byDay = useMemo(() => groupByDay(matches), [matches]);
    const byCategory = useMemo(() => groupByCategory(matches, teams), [matches, teams]);
    const totalByDay = WEEKEND_SCHEDULE_DAYS.reduce((n, d) => n + byDay[d].length, 0);
    const highlightSet = useMemo(
        () => new Set((highlightTeamNames ?? []).map((n) => n.trim())),
        [highlightTeamNames]
    );
    const daysToShow = useMemo(() => {
        if (!onlyDaysWithHighlightTeams || highlightSet.size === 0) return WEEKEND_SCHEDULE_DAYS;
        return WEEKEND_SCHEDULE_DAYS.filter((day) =>
            byDay[day].some((m) => highlightSet.has(m.teamA) || highlightSet.has(m.teamB))
        );
    }, [byDay, highlightSet, onlyDaysWithHighlightTeams]);

    if (matches.length === 0) {
        return (
            <div className="text-center text-slate-400 py-8 border rounded-lg border-dashed text-sm">
                {emptyMessage}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {gridReadOnly && (
                <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-slate-500">lock</span>
                    {readOnlyAudience === 'public' ? (
                        <>Calendario publicado en <strong>solo lectura</strong>.</>
                    ) : (
                        <>
                            Cuadrícula en <strong>solo lectura</strong>. Para mover partidos, usa{' '}
                            <strong>Competición → Simulación</strong> (no Oficial).
                        </>
                    )}
                </p>
            )}
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

            {highlightSet.size > 0 && (
                <p className="text-[11px] text-teal-800 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">info</span>
                    Partidos con <strong>borde verde</strong> son de tus equipos. La línea inferior indica la{' '}
                    <strong>fase o ronda</strong> (grupos, semifinal, final…).
                </p>
            )}

            {viewMode === 'day' && (
                <div className="space-y-8">
                    {daysToShow.map((day) => {
                        const dayMatches = byDay[day];
                        return (
                            <section key={day} className="rounded-xl border border-slate-200 overflow-hidden">
                                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-800 text-white">
                                    <h5 className="font-black text-sm uppercase tracking-wide flex items-center gap-2">
                                        <span className="material-symbols-outlined text-base">event</span>
                                        {day}
                                    </h5>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {showDayExport && dayMatches.length > 0 && (
                                            <>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        downloadTournamentGridExcel(
                                                            day,
                                                            dayMatches,
                                                            `${exportFileNamePrefix}_${daySlug(day)}`
                                                        )
                                                    }
                                                    className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1"
                                                    title={`Descargar Excel cuadrícula del ${day}`}
                                                >
                                                    <span className="material-symbols-outlined text-sm">table</span>
                                                    Excel
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        printTournamentGridPdf(
                                                            day,
                                                            dayMatches,
                                                            title ? `${title} — ${day}` : `Calendario — ${day}`,
                                                            'Guardar como PDF en el diálogo de impresión'
                                                        )
                                                    }
                                                    className="px-2.5 py-1 rounded-md text-[10px] font-bold bg-white/20 hover:bg-white/30 text-white flex items-center gap-1"
                                                    title={`Imprimir / PDF del ${day}`}
                                                >
                                                    <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
                                                    PDF
                                                </button>
                                            </>
                                        )}
                                        <span className="text-[11px] font-bold bg-white/15 px-2 py-0.5 rounded-full">
                                            {dayMatches.length} partido{dayMatches.length !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                </div>
                                <div className="p-3">
                                    <SimulationScheduleGridTabs
                                        matches={dayMatches}
                                        fixedDay={day}
                                        fillEmptySlots
                                        readOnly={gridReadOnly}
                                        highlightTeamNames={highlightTeamNames}
                                        onUpdateMatch={gridReadOnly ? undefined : onUpdateMatch}
                                    />
                                    {highlightSet.size > 0 &&
                                        (() => {
                                            const mineElim = dayMatches
                                                .filter(
                                                    (m) =>
                                                        (highlightSet.has(m.teamA) ||
                                                            highlightSet.has(m.teamB)) &&
                                                        isEliminationMatch(
                                                            m,
                                                            resolveMatchDivision(m, teams),
                                                            teams
                                                        )
                                                )
                                                .sort((a, b) => a.time.localeCompare(b.time));
                                            if (mineElim.length === 0) return null;
                                            return (
                                                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2.5">
                                                    <p className="text-[10px] font-black uppercase text-amber-900 mb-2 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-sm">
                                                            emoji_events
                                                        </span>
                                                        Fase final y eliminatorias — tus equipos ({day})
                                                    </p>
                                                    <ul className="space-y-1.5">
                                                        {mineElim.map((m) => (
                                                            <li
                                                                key={m.id}
                                                                className="text-[11px] text-slate-800 flex flex-wrap gap-x-2 gap-y-0.5"
                                                            >
                                                                <span className="font-mono font-bold text-slate-600">
                                                                    {m.time}
                                                                </span>
                                                                <span className="font-bold">{m.court}</span>
                                                                <span>
                                                                    {m.teamA}{' '}
                                                                    <span className="text-slate-400">vs</span>{' '}
                                                                    {m.teamB}
                                                                </span>
                                                                <span className="text-amber-800 font-bold">
                                                                    {getMatchPhaseDisplayLabel(m.round)}
                                                                </span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            );
                                        })()}
                                    {dayMatches.length === 0 && (
                                        <p className="text-xs text-slate-400 text-center mt-2">
                                            Sin partidos aún — cuadrícula vacía hasta las 21:00 para planificar.
                                        </p>
                                    )}
                                </div>
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
                            const base = getDivisionBaseColors(code);
                            const groupLegend = collectGridLegendEntries(
                                catMatches.map((m) => m.round),
                                code
                            );
                            return (
                                <section key={division} className={`rounded-xl border-2 overflow-hidden ${base.cell} ${base.drag}`}>
                                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-inherit bg-white/60">
                                        <div className="flex flex-wrap items-center gap-2">
                                            {code && (
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${base.badge}`}>
                                                    {code}
                                                </span>
                                            )}
                                            <h5 className="font-black text-sm text-slate-800">{division}</h5>
                                            {groupLegend.length > 0 && (
                                                <div className="flex flex-wrap gap-1">
                                                    {groupLegend.map((entry) => (
                                                        <span
                                                            key={entry.key}
                                                            className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${entry.colors.badge}`}
                                                        >
                                                            {entry.tone.startsWith('group-')
                                                                ? entry.tone.replace('group-', 'Gr. ')
                                                                : entry.tone === 'semi'
                                                                  ? 'Semis'
                                                                  : entry.tone === 'final'
                                                                    ? 'Final'
                                                                    : entry.tone}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {onDownloadCategoryActas && (
                                                <button
                                                    type="button"
                                                    disabled={actasExporting || catMatches.length === 0}
                                                    onClick={() => onDownloadCategoryActas(division, catMatches)}
                                                    className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-50 flex items-center gap-1"
                                                    title="ZIP con un DOCX por partido de esta categoría"
                                                >
                                                    <span className="material-symbols-outlined text-sm">download</span>
                                                    Actas ({catMatches.length})
                                                </button>
                                            )}
                                            <span className="text-[11px] font-bold text-slate-500">
                                                {catMatches.length} partidos
                                            </span>
                                        </div>
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
                                                {catMatches.map((m) => {
                                                    const rowColors = getMatchGridColors(m.round);
                                                    return (
                                                    <tr key={m.id} className={`hover:brightness-[0.98] ${rowColors.cell}`}>
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
                                                        <td className="px-4 py-2 text-[10px] font-bold text-slate-600 max-w-[200px] truncate" title={m.round}>
                                                            {getMatchPhaseDisplayLabel(m.round) || m.round}
                                                        </td>
                                                    </tr>
                                                    );
                                                })}
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
