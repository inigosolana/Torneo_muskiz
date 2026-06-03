import React, { useMemo } from 'react';
import type { Match, Team } from '../types';
import { CompetitionResultsTable } from './CompetitionResultsTable';
import { TeamNameWithShield } from './TeamShield';
import { computeStandings, filterMatchesForDivisionGroup } from '../utils/computeStandings';
import { getTeamsInDivisionGroup } from '../utils/groupMatchSync';

export interface GroupStandingsResultsBlockProps {
    division: Team['division'];
    groupKey: string;
    matches: Match[];
    teams: Team[];
    /** Partidos en la tabla inferior (p. ej. solo los del equipo del responsable). */
    resultsMatches?: Match[];
    /** Resalta la fila del equipo en la clasificación. */
    highlightTeamName?: string;
    standingsTitle?: string;
    resultsTitle?: string;
}

export const GroupStandingsResultsBlock: React.FC<GroupStandingsResultsBlockProps> = ({
    division,
    groupKey,
    matches,
    teams,
    resultsMatches,
    highlightTeamName,
    standingsTitle,
    resultsTitle,
}) => {
    const roster = useMemo(
        () => getTeamsInDivisionGroup(teams, division, groupKey, false),
        [teams, division, groupKey]
    );

    const standings = useMemo(
        () =>
            computeStandings(teams, matches, {
                division,
                group: groupKey,
                onlyPaidTeams: false,
                rosterOverride: roster,
            }),
        [teams, matches, division, groupKey, roster]
    );

    const groupMatches = useMemo(
        () => filterMatchesForDivisionGroup(matches, teams, division, groupKey),
        [matches, teams, division, groupKey]
    );

    const tableMatches = resultsMatches ?? groupMatches;

    return (
        <section className="space-y-4 rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-surface-dark">
            <div className="overflow-hidden rounded-lg border-0 border-b border-slate-200 dark:border-white/10">
                <div className="px-4 py-2 bg-slate-100 dark:bg-white/5 border-b border-slate-200 dark:border-white/10 text-xs font-bold text-slate-600 dark:text-slate-300">
                    {standingsTitle ?? `Clasificación — Grupo ${groupKey}`}
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left min-w-[520px]">
                        <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 font-bold uppercase text-xs">
                            <tr>
                                <th className="px-6 py-4 w-10">Pos</th>
                                <th className="px-6 py-4">Equipo</th>
                                <th className="px-4 py-4 text-center">PJ</th>
                                <th className="px-4 py-4 text-center">PG</th>
                                <th className="px-4 py-4 text-center">GF</th>
                                <th className="px-4 py-4 text-center">GC</th>
                                <th className="px-4 py-4 text-center">DG</th>
                                <th className="px-6 py-4 text-right font-black">PTS</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                            {standings.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-6 py-8 text-center text-sm text-slate-400">
                                        No hay equipos en el Grupo {groupKey}.
                                    </td>
                                </tr>
                            ) : (
                                standings.map((team, index) => {
                                    const isMine = highlightTeamName && team.name === highlightTeamName;
                                    return (
                                        <tr
                                            key={team.name}
                                            className={`hover:bg-slate-50/50 dark:hover:bg-white/5 ${
                                                isMine
                                                    ? 'bg-primary/15 dark:bg-primary/20 ring-1 ring-inset ring-primary/40'
                                                    : index < 4
                                                      ? 'bg-green-50/30 dark:bg-green-900/10'
                                                      : ''
                                            }`}
                                        >
                                            <td className="px-6 py-4 font-mono text-slate-400">{index + 1}</td>
                                            <td className="px-6 py-4 font-bold text-slate-800 dark:text-white">
                                                <TeamNameWithShield
                                                    teamName={team.name}
                                                    logoUrl={team.logoUrl}
                                                    nameClassName="font-bold text-slate-800 dark:text-white"
                                                />
                                                {isMine && (
                                                    <span className="ml-2 text-[9px] font-black uppercase text-primary">
                                                        Tu equipo
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-4 text-center">{team.played}</td>
                                            <td className="px-4 py-4 text-center font-medium text-green-600">{team.won}</td>
                                            <td className="px-4 py-4 text-center text-slate-500">{team.gf}</td>
                                            <td className="px-4 py-4 text-center text-slate-500">{team.ga}</td>
                                            <td className="px-4 py-4 text-center font-mono text-slate-500">
                                                {team.gf - team.ga}
                                            </td>
                                            <td className="px-6 py-4 text-right font-black text-lg text-slate-900 dark:text-white">
                                                {team.points}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="px-4 pb-4 space-y-2">
                <h4 className="text-xs font-black uppercase text-slate-500 tracking-wide">
                    {resultsTitle ?? `Horarios y resultados — Grupo ${groupKey}`}
                    <span className="ml-2 font-semibold text-slate-400 normal-case">
                        ({tableMatches.length} partido{tableMatches.length !== 1 ? 's' : ''})
                    </span>
                </h4>
                <CompetitionResultsTable
                    matches={tableMatches}
                    teams={teams}
                    previewMode="official"
                    hideActions
                    emptyMessage={
                        highlightTeamName
                            ? `Aún no hay partidos publicados para ${highlightTeamName}.`
                            : `Aún no hay partidos publicados para el Grupo ${groupKey}.`
                    }
                />
            </div>
        </section>
    );
};
