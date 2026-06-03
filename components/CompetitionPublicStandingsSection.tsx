import React, { useMemo, useState } from 'react';
import type { Match, Team } from '../types';
import { CompetitionResultsTable } from './CompetitionResultsTable';
import { computeStandings, filterMatchesForDivisionGroup } from '../utils/computeStandings';
import { getGroupDistributionForDivision, getTeamsInDivisionGroup } from '../utils/groupMatchSync';

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

interface CompetitionPublicStandingsSectionProps {
    matches: Match[];
    teams: Team[];
    emptyMessage?: string;
}

/** Clasificación oficial por grupo + horarios/resultados del grupo (solo lectura). */
export const CompetitionPublicStandingsSection: React.FC<CompetitionPublicStandingsSectionProps> = ({
    matches,
    teams,
    emptyMessage = 'El calendario oficial se publicará próximamente.',
}) => {
    const [division, setDivision] = useState<Team['division']>('Senior Masculino');

    const groups = useMemo(
        () => getGroupDistributionForDivision(teams, division, false).filter((g) => g.key !== '—' && g.teams.length > 0),
        [teams, division]
    );

    if (matches.length === 0) {
        return (
            <div className="rounded-xl border border-slate-200 bg-slate-50 dark:bg-white/5 px-6 py-12 text-center text-slate-600 dark:text-slate-300">
                <p className="text-lg font-black text-slate-800 dark:text-white mb-2">Clasificación en preparación</p>
                <p className="text-sm leading-relaxed max-w-md mx-auto">{emptyMessage}</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in">
            <p className="text-sm text-slate-600 dark:text-slate-400">
                Clasificación por grupo como en el calendario oficial. Debajo de cada cuadro, los{' '}
                <strong>horarios y resultados</strong> de ese grupo.
            </p>

            <div className="flex overflow-x-auto no-scrollbar gap-2 pb-1">
                {DIVISIONS_LIST.map((cat) => (
                    <button
                        key={cat}
                        type="button"
                        onClick={() => setDivision(cat)}
                        className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap shrink-0 ${
                            division === cat
                                ? 'bg-primary text-background-dark shadow'
                                : 'bg-slate-100 dark:bg-white/5 text-slate-500'
                        }`}
                    >
                        {cat}
                    </button>
                ))}
            </div>

            {groups.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8 border border-dashed rounded-lg">
                    No hay grupos definidos en {division}.
                </p>
            ) : (
                groups.map(({ key: groupKey }) => (
                    <GroupStandingsBlock
                        key={`${division}-${groupKey}`}
                        division={division}
                        groupKey={groupKey}
                        matches={matches}
                        teams={teams}
                    />
                ))
            )}
        </div>
    );
};

function GroupStandingsBlock({
    division,
    groupKey,
    matches,
    teams,
}: {
    division: Team['division'];
    groupKey: string;
    matches: Match[];
    teams: Team[];
}) {
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

    return (
        <section className="space-y-4 rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden bg-white dark:bg-surface-dark">
            <div className="overflow-hidden rounded-lg border-0 border-b border-slate-200 dark:border-white/10">
                <div className="px-4 py-2 bg-slate-100 dark:bg-white/5 border-b border-slate-200 dark:border-white/10 text-xs font-bold text-slate-600 dark:text-slate-300">
                    Clasificación — Grupo {groupKey}
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
                                standings.map((team, index) => (
                                    <tr
                                        key={team.name}
                                        className={`hover:bg-slate-50/50 dark:hover:bg-white/5 ${
                                            index < 4 ? 'bg-green-50/30 dark:bg-green-900/10' : ''
                                        }`}
                                    >
                                        <td className="px-6 py-4 font-mono text-slate-400">{index + 1}</td>
                                        <td className="px-6 py-4 font-bold text-slate-800 dark:text-white">{team.name}</td>
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
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="px-4 pb-4 space-y-2">
                <h4 className="text-xs font-black uppercase text-slate-500 tracking-wide">
                    Horarios y resultados — Grupo {groupKey}
                    <span className="ml-2 font-semibold text-slate-400 normal-case">
                        ({groupMatches.length} partido{groupMatches.length !== 1 ? 's' : ''})
                    </span>
                </h4>
                <CompetitionResultsTable
                    matches={groupMatches}
                    previewMode="official"
                    hideActions
                    emptyMessage={`Aún no hay partidos publicados para el Grupo ${groupKey}.`}
                />
            </div>
        </section>
    );
}
