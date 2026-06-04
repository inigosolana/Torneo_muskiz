import React, { useMemo } from 'react';
import type { Team } from '../types';
import { useRotatingIndex } from '../hooks/useRotatingIndex';
import { TeamShield } from './TeamShield';

interface RotatingTeamSpotlightProps {
    teams: Team[];
    className?: string;
    intervalMs?: number;
    /** Solo equipos con pago validado (por defecto true). */
    onlyPaid?: boolean;
}

export const RotatingTeamSpotlight: React.FC<RotatingTeamSpotlightProps> = ({
    teams,
    className = '',
    intervalMs = 5000,
    onlyPaid = true,
}) => {
    const roster = useMemo(() => {
        const list = onlyPaid ? teams.filter((t) => t.paymentStatus === 'PAID') : teams;
        return [...list].sort((a, b) => a.name.localeCompare(b.name, 'es'));
    }, [teams, onlyPaid]);

    const index = useRotatingIndex(roster.length, intervalMs);
    const current = roster[index];

    if (!current) {
        return (
            <div className={`text-center text-slate-500 text-sm py-8 ${className}`}>
                Próximamente: equipos participantes
            </div>
        );
    }

    return (
        <div
            className={`flex flex-col items-center justify-center text-center gap-4 ${className}`}
            aria-live="polite"
            aria-label="Equipos participantes"
        >
            <div
                key={current.id}
                className="flex flex-col items-center gap-4 animate-in fade-in duration-500 w-full"
            >
                <div className="size-28 sm:size-32 rounded-2xl bg-white/10 border border-white/15 flex items-center justify-center p-4 shadow-inner">
                    <TeamShield teamName={current.name} logoUrl={current.logoUrl} size="lg" className="!rounded-xl" />
                </div>
                <div className="min-w-0 px-2">
                    <h3 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight leading-tight">
                        {current.name}
                    </h3>
                    <p className="text-primary text-xs font-bold uppercase tracking-widest mt-2">{current.division}</p>
                    {(current.competitionGroup ?? '').trim() && (
                        <p className="text-slate-400 text-[11px] mt-1">Grupo {current.competitionGroup}</p>
                    )}
                </div>
            </div>
            {roster.length > 1 && (
                <p className="text-[10px] text-slate-500 tabular-nums">
                    {index + 1} / {roster.length} equipos
                </p>
            )}
        </div>
    );
};
