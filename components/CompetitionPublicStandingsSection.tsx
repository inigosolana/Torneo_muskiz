import React, { useMemo, useState } from 'react';
import type { Match, Team } from '../types';
import { DivisionCategorySelect } from './DivisionCategorySelect';
import { GroupStandingsResultsBlock } from './GroupStandingsResultsBlock';
import { getGroupDistributionForDivision } from '../utils/groupMatchSync';

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

            <DivisionCategorySelect value={division} onChange={setDivision} />

            {groups.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8 border border-dashed rounded-lg">
                    No hay grupos definidos en {division}.
                </p>
            ) : (
                groups.map(({ key: groupKey }) => (
                    <GroupStandingsResultsBlock
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
