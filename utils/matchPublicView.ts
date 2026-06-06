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

/**
 * Calendario público: oficial + borrador de simulación.
 * Si un partido existe en ambos, prevalece la simulación (marcadores más recientes).
 */
export function mergePublicScheduleMatches(official: Match[], simulation: Match[]): Match[] {
    if (official.length === 0) return simulation;
    if (simulation.length === 0) return official;
    const simById = new Map(simulation.map((m) => [m.id, m]));
    const seen = new Set<string>();
    const merged: Match[] = [];
    for (const m of official) {
        merged.push(simById.get(m.id) ?? m);
        seen.add(m.id);
    }
    for (const m of simulation) {
        if (!seen.has(m.id)) merged.push(m);
    }
    return stripActaFromMatches(merged);
}
