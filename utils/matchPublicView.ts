import type { Match } from '../types';

/** Quita actas del partido (solo staff en Admin oficial). */
export function stripActaFromMatch(match: Match): Match {
    if (!match.report) return match;
    return { ...match, report: undefined };
}

export function stripActaFromMatches(matches: Match[]): Match[] {
    return matches.map(stripActaFromMatch);
}

/** Partidos oficiales visibles en web / responsables (sin actas). */
export function matchesForPublicSchedule(matches: Match[]): Match[] {
    return stripActaFromMatches(matches.filter((m) => m.isPublic === true));
}
