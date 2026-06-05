import type { Match } from '../types';

/** Quita actas del partido (solo staff en Admin oficial). Conserva setScores para clasificación GF/GC. */
export function stripActaFromMatch(match: Match): Match {
    if (!match.report) return match;
    const { setScores } = match.report;
    if (!setScores) return { ...match, report: undefined };
    return {
        ...match,
        report: { type: 'DIGITAL', setScores },
    };
}

export function stripActaFromMatches(matches: Match[]): Match[] {
    return matches.map(stripActaFromMatch);
}

/** Partidos oficiales visibles en web / responsables (sin actas). */
export function matchesForPublicSchedule(matches: Match[]): Match[] {
    return stripActaFromMatches(matches.filter((m) => m.isPublic === true));
}
