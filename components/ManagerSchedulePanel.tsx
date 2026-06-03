import React, { useMemo, useState } from 'react';
import type { Match, Team } from '../types';
import { useTournamentData } from '../context/TournamentDataContext';
import { CompetitionCalendarViews } from './CompetitionCalendarViews';
import { FinalPhaseBracketView } from './FinalPhaseBracketView';
import { GroupStandingsResultsBlock } from './GroupStandingsResultsBlock';
import { getTeamFinalPhasePaths } from '../utils/finalPhaseBracket';
import {
    filterMatchesByTeamFilter,
    filterMatchesForManagerTeams,
    hasPublishedScheduleForManager,
} from '../utils/managerSchedule';
import { downloadManagerScheduleExcel, printManagerSchedulePdf } from '../utils/managerScheduleExport';

type PanelTab = 'calendar' | 'standings' | 'finals';

interface ManagerSchedulePanelProps {
    managerTeams: Team[];
}

function teamGroupKey(team: Team): string {
    const g = (team.competitionGroup ?? '').trim();
    return g || 'A';
}

function matchesForTeam(matches: Match[], team: Team): Match[] {
    return matches.filter((m) => m.teamA === team.name || m.teamB === team.name);
}

export const ManagerSchedulePanel: React.FC<ManagerSchedulePanelProps> = ({ managerTeams }) => {
    const { publicDisplayMatches, teams: allTeams, publicMatchesVisible } = useTournamentData();
    const [panelTab, setPanelTab] = useState<PanelTab>('calendar');
    const [teamFilterId, setTeamFilterId] = useState<'all' | string>(
        managerTeams.length === 1 ? managerTeams[0]!.id : 'all'
    );

    const baseMatches = useMemo(
        () => filterMatchesForManagerTeams(publicDisplayMatches, managerTeams),
        [publicDisplayMatches, managerTeams]
    );

    const filteredMatches = useMemo(
        () => filterMatchesByTeamFilter(baseMatches, managerTeams, teamFilterId),
        [baseMatches, managerTeams, teamFilterId]
    );

    const teamsToShow = useMemo(() => {
        if (teamFilterId === 'all') return managerTeams;
        const t = managerTeams.find((x) => x.id === teamFilterId);
        return t ? [t] : managerTeams;
    }, [managerTeams, teamFilterId]);

    const divisionsForFinals = useMemo(() => {
        const set = new Set<Team['division']>();
        for (const t of teamsToShow) set.add(t.division);
        return [...set].sort((a, b) => a.localeCompare(b, 'es'));
    }, [teamsToShow]);

    const scheduleReady = hasPublishedScheduleForManager(publicDisplayMatches, managerTeams);
    const filterLabel =
        teamFilterId === 'all'
            ? 'Todos mis equipos'
            : managerTeams.find((t) => t.id === teamFilterId)?.name ?? 'Equipo';

    const exportBaseName = `horarios_muskiz_${filterLabel.replace(/\s+/g, '_').slice(0, 40)}`;

    const highlightTeamNames = useMemo(() => teamsToShow.map((t) => t.name), [teamsToShow]);

    const fullDayGridMatches = useMemo(
        () => publicDisplayMatches.filter((m) => m.isPublic),
        [publicDisplayMatches]
    );

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
                        Mis equipos en competición
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                        {scheduleReady
                            ? `${baseMatches.length} partido(s) publicados · filtro: ${filterLabel}`
                            : 'Calendario en preparación'}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <label htmlFor="manager-team-filter" className="text-[10px] font-black uppercase text-slate-400">
                        Mi equipo
                    </label>
                    <select
                        id="manager-team-filter"
                        value={teamFilterId}
                        onChange={(e) => setTeamFilterId(e.target.value as 'all' | string)}
                        className="border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm font-semibold bg-slate-50 dark:bg-background-dark min-w-[220px]"
                    >
                        <option value="all">Todos mis equipos ({managerTeams.length})</option>
                        {managerTeams.map((t) => (
                            <option key={t.id} value={t.id}>
                                {t.name} — {t.division}
                                {(t.competitionGroup ?? '').trim() ? ` · Gr. ${t.competitionGroup}` : ''}
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

            <div className="flex flex-wrap gap-1 bg-white dark:bg-surface-dark rounded-lg border border-slate-200 dark:border-white/10 p-1 w-full sm:w-fit">
                <button
                    type="button"
                    onClick={() => setPanelTab('calendar')}
                    className={`px-3 sm:px-4 py-2 rounded-md text-xs font-bold flex items-center gap-1 ${
                        panelTab === 'calendar'
                            ? 'bg-primary text-background-dark shadow'
                            : 'text-slate-600 hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                >
                    <span className="material-symbols-outlined text-sm">grid_view</span>
                    Calendario
                </button>
                <button
                    type="button"
                    onClick={() => setPanelTab('standings')}
                    className={`px-3 sm:px-4 py-2 rounded-md text-xs font-bold flex items-center gap-1 ${
                        panelTab === 'standings'
                            ? 'bg-primary text-background-dark shadow'
                            : 'text-slate-600 hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                >
                    <span className="material-symbols-outlined text-sm">leaderboard</span>
                    Clasificación
                </button>
                <button
                    type="button"
                    onClick={() => setPanelTab('finals')}
                    className={`px-3 sm:px-4 py-2 rounded-md text-xs font-bold flex items-center gap-1 ${
                        panelTab === 'finals'
                            ? 'bg-primary text-background-dark shadow'
                            : 'text-slate-600 hover:bg-slate-50 dark:hover:bg-white/5'
                    }`}
                >
                    <span className="material-symbols-outlined text-sm">emoji_events</span>
                    Fase final
                </button>
            </div>

            {panelTab === 'calendar' && (
                <div className="space-y-3">
                    <p className="text-xs text-slate-500">
                        Cuadrícula oficial del torneo (todos los campos). Tus partidos van con{' '}
                        <strong>borde verde</strong>; en cada celda verás la <strong>fase o ronda</strong>. Puedes
                        descargar cada día en Excel ({filterLabel}).
                    </p>
                    <CompetitionCalendarViews
                        matches={fullDayGridMatches}
                        teams={allTeams}
                        readOnly
                        readOnlyAudience="public"
                        title={`Calendario — ${filterLabel}`}
                        highlightTeamNames={highlightTeamNames}
                        onlyDaysWithHighlightTeams
                        showDayExport
                        exportFileNamePrefix={exportBaseName}
                        emptyMessage="No hay calendario publicado para tus equipos."
                    />
                </div>
            )}

            {panelTab === 'standings' && (
                <div className="space-y-6">
                    <p className="text-xs text-slate-500">
                        Clasificación de tu <strong>grupo</strong> (todos los equipos del cuadro) y debajo los{' '}
                        <strong>horarios y resultados solo de {filterLabel.toLowerCase()}</strong>.
                    </p>
                    {teamsToShow.map((team) => {
                        const gk = teamGroupKey(team);
                        const teamMatches = matchesForTeam(baseMatches, team);
                        return (
                            <GroupStandingsResultsBlock
                                key={team.id}
                                division={team.division}
                                groupKey={gk}
                                matches={publicDisplayMatches}
                                teams={allTeams}
                                resultsMatches={
                                    teamFilterId === 'all' ? teamMatches : filteredMatches
                                }
                                highlightTeamName={team.name}
                                standingsTitle={`${team.name} — ${team.division} · Grupo ${gk}`}
                                resultsTitle={`Horarios y resultados — ${team.name}`}
                            />
                        );
                    })}
                </div>
            )}

            {panelTab === 'finals' && (
                <div className="space-y-8">
                    <p className="text-xs text-slate-500">
                        Cuadro de <strong>fase final</strong> de tu categoría y, para cada equipo,{' '}
                        <strong>todas las formas</strong> en que puede entrar según su grupo (1º, 2º, 3º…).
                    </p>

                    {teamsToShow.map((team) => {
                        const paths = getTeamFinalPhasePaths(team, allTeams, publicDisplayMatches);
                        if (paths.length === 0) return null;
                        return (
                            <div
                                key={`paths-${team.id}`}
                                className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/60 dark:bg-teal-950/20 p-4"
                            >
                                <h4 className="text-sm font-black text-teal-900 dark:text-teal-100 mb-2">
                                    {team.name} · {team.division} · Grupo {teamGroupKey(team)}
                                </h4>
                                <ul className="space-y-1.5 text-xs text-slate-700 dark:text-slate-200">
                                    {paths.map((p) => (
                                        <li key={`${team.id}-${p.ifPosition}-${p.slot.roundLabel}`}>
                                            <span className="font-bold">{p.ifPosition}:</span> {p.accessLabel}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        );
                    })}

                    {divisionsForFinals.map((div) => (
                        <FinalPhaseBracketView
                            key={div}
                            division={div}
                            matches={publicDisplayMatches}
                            teams={allTeams}
                            focusTeam={
                                teamFilterId === 'all'
                                    ? teamsToShow.find((t) => t.division === div) ?? null
                                    : teamsToShow[0]?.division === div
                                      ? teamsToShow[0]
                                      : null
                            }
                            showTeamPaths={teamFilterId !== 'all'}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
