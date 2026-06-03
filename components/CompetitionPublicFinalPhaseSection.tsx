import React, { useMemo, useState } from 'react';
import type { Match, Team } from '../types';
import { DivisionCategorySelect } from './DivisionCategorySelect';
import { FinalPhaseBracketView } from './FinalPhaseBracketView';
import { getEliminationSlotsForDivision } from '../utils/finalPhaseBracket';

interface CompetitionPublicFinalPhaseSectionProps {
    matches: Match[];
    teams: Team[];
    emptyMessage?: string;
}

export const CompetitionPublicFinalPhaseSection: React.FC<CompetitionPublicFinalPhaseSectionProps> = ({
    matches,
    teams,
    emptyMessage = 'El calendario oficial se publicará próximamente.',
}) => {
    const [division, setDivision] = useState<Team['division']>('Senior Masculino');

    const hasBracket = useMemo(
        () => getEliminationSlotsForDivision(teams, division).length > 0,
        [teams, division]
    );

    if (matches.length === 0) {
        return (
            <div className="rounded-xl border border-slate-200 bg-slate-50 dark:bg-white/5 px-6 py-12 text-center text-slate-600 dark:text-slate-300">
                <p className="text-lg font-black text-slate-800 dark:text-white mb-2">Fase final en preparación</p>
                <p className="text-sm leading-relaxed max-w-md mx-auto">{emptyMessage}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in">
            <p className="text-sm text-slate-600 dark:text-slate-400">
                Cuadro eliminatorio por categoría: repesca, cuartos, semifinales, 3º/4º puesto y final. Los
                horarios y resultados aparecen cuando el partido está publicado.
            </p>

            <DivisionCategorySelect value={division} onChange={setDivision} />

            {hasBracket ? (
                <FinalPhaseBracketView division={division} matches={matches} teams={teams} />
            ) : (
                <p className="text-sm text-slate-500 text-center py-8 border border-dashed rounded-lg">
                    Sin fase eliminatoria para {division}.
                </p>
            )}
        </div>
    );
};
