import React, { useMemo } from 'react';
import type { Match, Team } from '../types';
import {
    findMatchForEliminationSlot,
    formatEliminationMatchLine,
    getEliminationSlotsForDivision,
    getTeamFinalPhasePaths,
    phaseLabel,
    type TeamFinalPhasePath,
} from '../utils/finalPhaseBracket';
import type { DivisionEliminationSlot } from '../services/muskizScheduleSimulator';

interface FinalPhaseBracketViewProps {
    division: Team['division'];
    matches: Match[];
    teams: Team[];
    /** Resalta posibilidades de un equipo concreto (panel responsables). */
    focusTeam?: Team | null;
    /** Varios equipos del responsable en la misma categoría. */
    focusTeams?: Team[];
    /** Oculta cruces de otros grupos (solo huecos alcanzables desde tus grupos). */
    onlyRelevantSlots?: boolean;
    showTeamPaths?: boolean;
}

function groupSlotsByPhase(slots: DivisionEliminationSlot[]): Map<DivisionEliminationSlot['phase'], DivisionEliminationSlot[]> {
    const map = new Map<DivisionEliminationSlot['phase'], DivisionEliminationSlot[]>();
    for (const s of slots) {
        if (!map.has(s.phase)) map.set(s.phase, []);
        map.get(s.phase)!.push(s);
    }
    return map;
}

const TeamPathsCard: React.FC<{ team: Team; paths: TeamFinalPhasePath[] }> = ({ team, paths }) => (
    <div className="rounded-xl border border-teal-200 dark:border-teal-800 bg-teal-50/80 dark:bg-teal-950/30 p-4 space-y-2">
        <h4 className="text-sm font-black text-teal-900 dark:text-teal-100">
            {team.name} · Grupo {(team.competitionGroup ?? 'A').trim() || 'A'}
        </h4>
        <p className="text-[11px] text-teal-800/90 dark:text-teal-200/90">
            Según el resultado de la fase de grupos, tu equipo podría acceder así a la fase final:
        </p>
        <ul className="space-y-2">
            {paths.map((p) => (
                <li
                    key={`${p.ifPosition}-${p.slot.roundLabel}`}
                    className="text-xs bg-white/80 dark:bg-black/20 rounded-lg px-3 py-2 border border-teal-100 dark:border-teal-900"
                >
                    <span className="font-bold text-teal-900 dark:text-teal-100">{p.ifPosition}</span>
                    <span className="text-slate-600 dark:text-slate-300 block mt-0.5">{p.accessLabel}</span>
                </li>
            ))}
        </ul>
    </div>
);

export const FinalPhaseBracketView: React.FC<FinalPhaseBracketViewProps> = ({
    division,
    matches,
    teams,
    focusTeam,
    focusTeams,
    onlyRelevantSlots = false,
    showTeamPaths = false,
}) => {
    const resolvedFocusTeams = useMemo(() => {
        if (focusTeams?.length) return focusTeams.filter((t) => t.division === division);
        if (focusTeam?.division === division) return [focusTeam];
        return [];
    }, [focusTeam, focusTeams, division]);

    const allSlots = useMemo(() => getEliminationSlotsForDivision(teams, division), [teams, division]);

    const slots = useMemo(() => {
        if (!onlyRelevantSlots || resolvedFocusTeams.length === 0) return allSlots;
        const labels = new Set<string>();
        for (const t of resolvedFocusTeams) {
            for (const p of getTeamFinalPhasePaths(t, teams, matches)) {
                labels.add(p.slot.roundLabel);
            }
        }
        return allSlots.filter((s) => labels.has(s.roundLabel));
    }, [allSlots, onlyRelevantSlots, resolvedFocusTeams, teams, matches]);

    const byPhase = useMemo(() => groupSlotsByPhase(slots), [slots]);

    const focusPaths = useMemo(() => {
        const paths: ReturnType<typeof getTeamFinalPhasePaths> = [];
        for (const t of resolvedFocusTeams) {
            paths.push(...getTeamFinalPhasePaths(t, teams, matches));
        }
        return paths;
    }, [resolvedFocusTeams, teams, matches]);

    if (slots.length === 0) {
        return (
            <p className="text-sm text-slate-500 text-center py-8 border border-dashed rounded-xl">
                No hay cuadro de fase final definido para {division} (pocos equipos inscritos).
            </p>
        );
    }

    const phaseSequence: DivisionEliminationSlot['phase'][] = [
        'REPESCA',
        'CUARTOS',
        'SEMIS',
        'TERCER_PUESTO',
        'FINAL',
    ];

    return (
        <div className="space-y-6">
            {showTeamPaths &&
                resolvedFocusTeams.map((team) => {
                    const paths = getTeamFinalPhasePaths(team, teams, matches);
                    if (paths.length === 0) return null;
                    return <TeamPathsCard key={team.id} team={team} paths={paths} />;
                })}

            {showTeamPaths && resolvedFocusTeams.length === 0 && (
                <p className="text-xs text-slate-500">
                    Elige un equipo en el filtro superior para ver sus posibles accesos a la fase final.
                </p>
            )}

            {onlyRelevantSlots && slots.length === 0 && (
                <p className="text-sm text-slate-500 text-center py-6 border border-dashed rounded-xl">
                    No hay cruces de fase final previstos para tu grupo en {division}.
                </p>
            )}

            {slots.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-surface-dark">
                <div className="px-4 py-3 bg-slate-800 text-white">
                    <h3 className="text-sm font-black uppercase tracking-wide">
                        Fase final — {division}
                        {onlyRelevantSlots ? ' (solo tus grupos)' : ''}
                    </h3>
                </div>
                <div className="p-4 space-y-6">
                    {phaseSequence.map((phase) => {
                        const phaseSlots = byPhase.get(phase);
                        if (!phaseSlots?.length) return null;
                        return (
                            <section key={phase}>
                                <h4 className="text-[11px] font-black uppercase text-primary mb-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-base">emoji_events</span>
                                    {phaseLabel(phase)}
                                </h4>
                                <div className="grid gap-2 sm:grid-cols-2">
                                    {phaseSlots.map((slot) => {
                                        const scheduled = findMatchForEliminationSlot(
                                            slot,
                                            matches,
                                            division,
                                            teams
                                        );
                                        const isFocusPath = focusPaths.some(
                                            (p) => p.slot.roundLabel === slot.roundLabel
                                        );
                                        return (
                                            <div
                                                key={slot.roundLabel}
                                                className={`rounded-lg border px-3 py-2.5 text-xs ${
                                                    isFocusPath
                                                        ? 'border-teal-400 bg-teal-50 dark:bg-teal-950/40 ring-1 ring-teal-300'
                                                        : 'border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/5'
                                                }`}
                                            >
                                                <p className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                                                    {formatEliminationMatchLine(scheduled, slot)}
                                                </p>
                                                {scheduled && (
                                                    <p className="text-[10px] text-slate-500 font-mono">
                                                        {scheduled.time}
                                                        {scheduled.court ? ` · ${scheduled.court}` : ''}
                                                        {scheduled.status === 'FINISHED'
                                                            ? ' · Finalizado'
                                                            : scheduled.status === 'LIVE'
                                                              ? ' · En juego'
                                                              : ''}
                                                    </p>
                                                )}
                                                {!scheduled && (
                                                    <p className="text-[10px] text-amber-700 dark:text-amber-300">
                                                        Horario por publicar
                                                    </p>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </section>
                        );
                    })}
                </div>
            </div>
            )}
        </div>
    );
};
