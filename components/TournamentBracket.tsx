import React from 'react';
import { Match } from '../types';

interface TournamentBracketProps {
    matches: Match[];
}

export const TournamentBracket: React.FC<TournamentBracketProps> = ({ matches }) => {
    const finalMatch =
        matches.find((m) => (m.round || '').toLowerCase().includes('final')) ??
        matches[matches.length - 1];

    return (
        <div className="w-full overflow-x-auto py-8">
            <div className="flex justify-center items-start px-4">
                <div className="flex flex-col gap-6 w-full max-w-md">
                    <h3 className="text-center font-bold text-primary uppercase tracking-widest text-xs">Gran final</h3>
                    <MatchCard match={finalMatch} />
                </div>
            </div>
        </div>
    );
};

const MatchCard = ({ match }: { match?: Match }) => {
    if (!match) return <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-4 border border-slate-200 dark:border-white/10 opacity-50 h-24 flex items-center justify-center text-slate-400 font-bold text-sm">Por definir</div>;
    return (
        <div className="bg-white dark:bg-surface-dark rounded-xl shadow-md border border-slate-200 dark:border-white/10 overflow-hidden relative">
            {match.status === 'FINISHED' && <div className="absolute top-0 right-0 bg-primary text-background-dark text-[10px] px-2 py-0.5 font-bold rounded-bl-lg">FINALIZADO</div>}
            <div className={`flex justify-between items-center p-3 border-b border-slate-100 dark:border-white/5 ${match.scoreA && match.scoreB && match.scoreA > match.scoreB ? 'bg-primary/5' : ''}`}>
                <span className="font-bold text-sm truncate dark:text-white">{match.teamA}</span>
                <span className={`font-bold text-lg px-3 py-1 rounded-lg ${match.scoreA && match.scoreB && match.scoreA > match.scoreB ? 'bg-primary text-background-dark' : 'bg-slate-100 dark:bg-white/10 dark:text-white'}`}>{match.scoreA ?? '-'}</span>
            </div>
            <div className={`flex justify-between items-center p-3 ${match.scoreA && match.scoreB && match.scoreB > match.scoreA ? 'bg-primary/5' : ''}`}>
                <span className="font-bold text-sm truncate dark:text-white">{match.teamB}</span>
                <span className={`font-bold text-lg px-3 py-1 rounded-lg ${match.scoreA && match.scoreB && match.scoreB > match.scoreA ? 'bg-primary text-background-dark' : 'bg-slate-100 dark:bg-white/10 dark:text-white'}`}>{match.scoreB ?? '-'}</span>
            </div>
            <div className="absolute top-1 left-1 text-[8px] text-slate-400 font-bold uppercase tracking-widest">{match.round}</div>
        </div>
    )
} 
