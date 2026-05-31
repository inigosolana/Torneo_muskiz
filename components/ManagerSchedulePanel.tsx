import React, { useMemo, useState } from 'react';
import type { Match, Team } from '../types';
import { useTournamentData } from '../context/TournamentDataContext';
import { CompetitionCalendarViews } from './CompetitionCalendarViews';
import { CompetitionResultsTable } from './CompetitionResultsTable';
import { SimulationScheduleGridTabs } from './SimulationDayGrid';
import { WEEKEND_SCHEDULE_DAYS, inferMatchScheduleDay } from '../services/tournamentScheduleService';
import type { MuskizScheduleDayLabel } from '../services/muskizScheduleSimulator';
import {
    filterMatchesByTeamFilter,
    filterMatchesForManagerTeams,
    groupManagerMatchesByDivision,
    hasPublishedScheduleForManager,
} from '../utils/managerSchedule';
import { downloadManagerScheduleExcel, printManagerSchedulePdf } from '../utils/managerScheduleExport';

type PanelTab = 'results' | 'calendar';

interface ManagerSchedulePanelProps {
    managerTeams: Team[];
}

export const ManagerSchedulePanel: React.FC<ManagerSchedulePanelProps> = ({ managerTeams }) => {
    const { matches, teams: allTeams, publicMatchesVisible } = useTournamentData();
    const [panelTab, setPanelTab] = useState<PanelTab>('results');
    const [teamFilterId, setTeamFilterId] = useState<'all' | string>('all');
    const [calendarDay, setCalendarDay] = useState<MuskizScheduleDayLabel>('Viernes');

    const baseMatches = useMemo(
        () => filterMatchesForManagerTeams(matches, managerTeams),
        [matches, managerTeams]
    );

    const filteredMatches = useMemo(
        () => filterMatchesByTeamFilter(baseMatches, managerTeams, teamFilterId),
        [baseMatches, managerTeams, teamFilterId]
    );

    const byDivision = useMemo(
        () => groupManagerMatchesByDivision(filteredMatches, managerTeams, allTeams),
        [filteredMatches, managerTeams, allTeams]
    );

    const calendarDayMatches = useMemo(
        () => filteredMatches.filter((m) => inferMatchScheduleDay(m) === calendarDay),
        [filteredMatches, calendarDay]
    );

    const scheduleReady = hasPublishedScheduleForManager(matches, managerTeams);
    const filterLabel =
        teamFilterId === 'all'
            ? 'Todos mis equipos'
            : managerTeams.find((t) => t.id === teamFilterId)?.name ?? 'Equipo';

    const exportBaseName = `horarios_muskiz_${filterLabel.replace(/\s+/g, '_').slice(0, 40)}`;

    const handleExportExcel = () => {
        if (filteredMatches.length === 0) return;
        downloadManagerScheduleExcel(filteredMatches, allTeams, exportBaseName);
    };

    const handleExportPdf = () => {
        if (filteredMatches.length === 0) return;
        printManagerSchedulePdf(
            filteredMatches,
            allTeams,
            'II Torneo Muskiz — Mis horarios',
            `${filterLabel} · ${filteredMatches.length} partido(s)`
        );
    };

    if (baseMatches.length === 0) {
        return (
            <div className="bg-white dark:bg-surface-dark rounded-2xl border border-slate-200 dark:border-white/10 p-10 text-center space-y-3">
                <span className="material-symbols-outlined text-5xl text-slate-300">event_busy</span>
                <h3 className="text-lg font-bold text-slate-800 dark:text-white">Horarios aún no publicados</h3>
                <p className="text-sm text-slate-500 max-w-md mx-auto">
                    Cuando la organización publique el calendario oficial, aquí verás los partidos de tus equipos
                    {publicMatchesVisible ? '' : ' (la competición también aparecerá en la web pública)'}.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-white/10 p-4 shadow-sm">
                <div>
                    <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">calendar_month</span>
                        Mis horarios
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                        {scheduleReady
                            ? `${baseMatches.length} partido(s) publicados para tus equipos`
                            : 'Calendario en preparación — algunos partidos pueden estar pendientes de hora'}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <label className="text-[10px] font-black uppercase text-slate-400">Filtrar equipo</label>
                    <select
                        value={teamFilterId}
                        onChange={(e) => setTeamFilterId(e.target.value as 'all' | string)}
                        className="border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm font-semibold bg-slate-50 dark:bg-background-dark min-w-[200px]"
                    >
                        <option value="all">Todos mis equipos ({managerTeams.length})</option>
                        {managerTeams.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.name} — {t.division}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={handleExportExcel}
                        disabled={filteredMatches.length === 0}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
                    >
                        <span className="material-symbols-outlined text-sm">table</span>
                        Excel
                    </button>
                    <button
                        type="button"
                        onClick={handleExportPdf}
                        disabled={filteredMatches.length === 0}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
                    >
                        <span className="material-symbols-outlined text-sm">picture_as_pdf</span>
                        PDF
                    </button>
                </div>
            </div>

            <div className="flex gap-1 bg-white dark:bg-surface-dark rounded-lg border border-slate-200 dark:border-white/10 p-1 w-fit">
                <button
                    type="button"
                    onClick={() => setPanelTab('results')}
                    className={`px-4 py-2 rounded-md text-xs font-bold flex items-center gap-1 ${
                        panelTab === 'results'
                            ? 'bg-primary text-background-dark shadow'
                            : 'text-slate-600 hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                >
                    <span className="material-symbols-outlined text-sm">schedule</span>
                    Horarios y resultados
                </button>
                <button
                    type="button"
                    onClick={() => setPanelTab('calendar')}
                    className={`px-4 py-2 rounded-md text-xs font-bold flex items-center gap-1 ${
                        panelTab === 'calendar'
                            ? 'bg-primary text-background-dark shadow'
                            : 'text-slate-600 hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                >
                    <span className="material-symbols-outlined text-sm">grid_view</span>
                    Calendario por día (campos)
                </button>
            </div>

            {panelTab === 'results' && (
                <div className="space-y-8">
                    {byDivision.length === 0 ? (
                        <p className="text-sm text-slate-500 text-center py-8">No hay partidos con el filtro actual.</p>
                    ) : (
                        byDivision.map(({ division, teams: divTeams, matches: divMatches }) => (
                            <section
                                key={division}
                                className="rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-surface-dark"
                            >
                                <div className="px-4 py-3 bg-slate-800 text-white flex flex-wrap items-center justify-between gap-2">
                                    <div>
                                        <h4 className="font-black text-sm uppercase tracking-wide">{division}</h4>
                                        <p className="text-[11px] text-white/70 mt-0.5">
                                            {divTeams.map((t) => t.name).join(' · ')}
                                        </p>
                                    </div>
                                    <span className="text-[10px] font-bold bg-white/15 px-2 py-1 rounded-full">
                                        {divMatches.length} partido{divMatches.length !== 1 ? 's' : ''}
                                    </span>
                                </div>
                                <div className="p-4">
                                    <CompetitionResultsTable
                                        matches={divMatches}
                                        previewMode="official"
                                        hideActions
                                        emptyMessage="Sin partidos en esta categoría."
                                    />
                                </div>
                            </section>
                        ))
                    )}
                </div>
            )}

            {panelTab === 'calendar' && (
                <div className="space-y-4">
                    <p className="text-xs text-slate-500">
                        Cuadrícula por campos — solo se muestran los partidos de{' '}
                        <strong>{filterLabel.toLowerCase()}</strong>.
                    </p>

                    <div className="flex flex-wrap gap-2">
                        {WEEKEND_SCHEDULE_DAYS.map((day) => {
                            const count = filteredMatches.filter((m) => inferMatchScheduleDay(m) === day).length;
                            return (
                                <button
                                    key={day}
                                    type="button"
                                    onClick={() => setCalendarDay(day)}
                                    className={`px-4 py-2 rounded-full text-xs font-bold ${
                                        calendarDay === day
                                            ? 'bg-teal-700 text-white shadow'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                                >
                                    {day} ({count})
                                </button>
                            );
                        })}
                    </div>

                    <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-surface-dark p-3">
                        {calendarDayMatches.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-10">
                                No tienes partidos publicados el {calendarDay}.
                            </p>
                        ) : (
                            <SimulationScheduleGridTabs
                                matches={calendarDayMatches}
                                fixedDay={calendarDay}
                                fillEmptySlots
                            />
                        )}
                    </div>

                    <details className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-surface-dark p-4">
                        <summary className="text-xs font-bold text-slate-600 cursor-pointer">
                            Vista ampliada por categoría (todos los días)
                        </summary>
                        <div className="mt-4">
                            <CompetitionCalendarViews
                                matches={filteredMatches}
                                teams={allTeams}
                                emptyMessage="Sin partidos."
                            />
                        </div>
                    </details>
                </div>
            )}
        </div>
    );
};
