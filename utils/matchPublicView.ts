import type { WithdrawnTeamSpec } from '../constants/tournamentWithdrawals';
import type { Match, Team } from '../types';
import { normalizeTeamLabel, resolveMatchDivision } from '../services/muskizScheduleSimulator';

function mergeWithdrawnSpecs(teams: Team[], extra: WithdrawnTeamSpec[]): WithdrawnTeamSpec[] {
    const map = new Map<string, WithdrawnTeamSpec>();
    for (const w of extra) {
        const key = w.id ?? `${w.division}|${normalizeTeamLabel(w.name)}`;
        map.set(key, w);
    }
    for (const t of teams.filter((x) => x.status === 'rejected')) {
        const key = t.id ?? `${t.division}|${normalizeTeamLabel(t.name)}`;
        map.set(key, { id: t.id, name: t.name, division: t.division });
    }
    return [...map.values()];
}

function matchSideWithdrawn(
    side: string,
    division: Team['division'] | null,
    withdrawn: WithdrawnTeamSpec[]
): boolean {
    const label = normalizeTeamLabel(side);
    return withdrawn.some(
        (w) => normalizeTeamLabel(w.name) === label && (!division || w.division === division)
    );
}

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

/** Oculta partidos de equipos dados de baja (rejected en BD + lista explícita en app/BD). */
export function excludeWithdrawnTeamMatches(
    matches: Match[],
    teams: Team[],
    extraWithdrawals: WithdrawnTeamSpec[] = []
): Match[] {
    const withdrawn = mergeWithdrawnSpecs(teams, extraWithdrawals);
    if (withdrawn.length === 0) return matches;
    return matches.filter((m) => {
        const division = resolveMatchDivision(m, teams);
        for (const side of [m.teamA, m.teamB]) {
            if (matchSideWithdrawn(side, division, withdrawn)) return false;
        }
        return true;
    });
}
