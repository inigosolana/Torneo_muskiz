import type { Match, Team } from '../types';
import {
    computeGroups,
    normalizeTeamLabel,
    resolveMatchDivision,
} from '../services/muskizScheduleSimulator';
import {
    findMatchForEliminationSlot,
    getRelevantEliminationSlotsForTeam,
    getTeamFinalPhasePaths,
    isEliminationMatch,
    matchReferencesManagerGroup,
} from './finalPhaseBracket';

export function getManagerTeamNames(managerTeams: Team[]): Set<string> {
    return new Set(managerTeams.map((t) => t.name));
}

function managerTeamByMatchSide(
    m: Match,
    managerTeams: Team[]
): Team | null {
    for (const t of managerTeams) {
        if (m.teamA === t.name || m.teamB === t.name) return t;
        const label = normalizeTeamLabel(t.name);
        if (normalizeTeamLabel(m.teamA) === label || normalizeTeamLabel(m.teamB) === label) {
            return t;
        }
    }
    return null;
}

function groupCountInDivision(teams: Team[], division: Team['division']): number {
    const paid = teams.filter((t) => t.division === division && t.paymentStatus === 'PAID');
    const assigned = new Set(
        paid.map((t) => (t.competitionGroup ?? '').trim()).filter((g) => g.length > 0)
    );
    if (assigned.size > 0) return assigned.size;
    const computed = computeGroups(paid);
    return computed?.length ?? 1;
}

function eliminationRelevantForTeam(
    m: Match,
    team: Team,
    allTeams: Team[],
    allMatches: Match[]
): boolean {
    const division = team.division;
    if (resolveMatchDivision(m, allTeams) !== division) return false;
    if (!isEliminationMatch(m, division, allTeams)) return false;

    const groupKey = (team.competitionGroup ?? 'A').trim() || 'A';

    if (groupCountInDivision(allTeams, division) <= 1) {
        return true;
    }

    if (matchReferencesManagerGroup(m, groupKey, division, allTeams)) {
        return true;
    }

    const paths = getTeamFinalPhasePaths(team, allTeams, allMatches);
    for (const p of paths) {
        if (findMatchForEliminationSlot(p.slot, [m], division, allTeams)) {
            return true;
        }
    }

    const slots = getRelevantEliminationSlotsForTeam(team, allTeams, allMatches);
    for (const slot of slots) {
        if (findMatchForEliminationSlot(slot, [m], division, allTeams)) {
            return true;
        }
    }

    return false;
}

/**
 * Partidos publicados del responsable: fase de grupos donde juega su equipo y
 * eliminatorias/finales que puede alcanzar según su grupo (no todo el cuadro).
 */
export function filterMatchesForManagerTeams(
    matches: Match[],
    managerTeams: Team[],
    allTeams: Team[] = []
): Match[] {
    if (managerTeams.length === 0) return [];

    return matches.filter((m) => {
        if (!m.isPublic) return false;

        const direct = managerTeamByMatchSide(m, managerTeams);
        if (direct) return true;

        if (allTeams.length === 0) return false;

        for (const team of managerTeams) {
            if (eliminationRelevantForTeam(m, team, allTeams, matches)) {
                return true;
            }
        }
        return false;
    });
}

export function filterMatchesByTeamFilter(
    matches: Match[],
    managerTeams: Team[],
    teamFilterId: 'all' | string
): Match[] {
    if (teamFilterId === 'all') return matches;
    const team = managerTeams.find((t) => t.id === teamFilterId);
    if (!team) return matches;
    const label = normalizeTeamLabel(team.name);
    return matches.filter(
        (m) =>
            m.teamA === team.name ||
            m.teamB === team.name ||
            normalizeTeamLabel(m.teamA) === label ||
            normalizeTeamLabel(m.teamB) === label
    );
}

export interface ManagerDivisionBlock {
    division: Team['division'];
    teams: Team[];
    matches: Match[];
}

/** Agrupa partidos del responsable por categoría (varios equipos en la misma división van juntos). */
export function groupManagerMatchesByDivision(
    matches: Match[],
    managerTeams: Team[],
    allTeams: Team[]
): ManagerDivisionBlock[] {
    const divisions = [...new Set(managerTeams.map((t) => t.division))].sort((a, b) =>
        a.localeCompare(b, 'es')
    );
    return divisions.map((division) => ({
        division,
        teams: managerTeams.filter((t) => t.division === division),
        matches: matches.filter((m) => resolveMatchDivision(m, allTeams) === division),
    }));
}

export function hasPublishedScheduleForManager(
    matches: Match[],
    managerTeams: Team[],
    allTeams: Team[] = []
): boolean {
    return filterMatchesForManagerTeams(matches, managerTeams, allTeams).some(
        (m) => m.time !== 'PENDIENTE' || m.court !== 'Sin asignar'
    );
}
