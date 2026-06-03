import React from 'react';
import { resolveTeamShield } from '../constants/teamShields';

const SIZE_CLASS = {
    sm: 'size-6',
    md: 'size-8',
} as const;

interface TeamShieldProps {
    teamName: string;
    logoUrl?: string | null;
    size?: keyof typeof SIZE_CLASS;
    className?: string;
}

export const TeamShield: React.FC<TeamShieldProps> = ({
    teamName,
    logoUrl,
    size = 'sm',
    className = '',
}) => {
    const src = resolveTeamShield(teamName, logoUrl);
    if (!src) return null;
    return (
        <img
            src={src}
            alt=""
            className={`${SIZE_CLASS[size]} shrink-0 rounded-full object-contain bg-white ring-1 ring-slate-200/80 ${className}`}
        />
    );
};

interface TeamNameWithShieldProps {
    teamName: string;
    logoUrl?: string | null;
    size?: keyof typeof SIZE_CLASS;
    className?: string;
    nameClassName?: string;
}

/** Nombre de equipo con escudo (clasificación / resultados; no usar en calendario). */
export const TeamNameWithShield: React.FC<TeamNameWithShieldProps> = ({
    teamName,
    logoUrl,
    size = 'sm',
    className = '',
    nameClassName = '',
}) => {
    return (
        <span className={`inline-flex items-center gap-2 min-w-0 max-w-full ${className}`}>
            <TeamShield teamName={teamName} logoUrl={logoUrl} size={size} />
            <span className={`truncate ${nameClassName}`}>{teamName}</span>
        </span>
    );
};
