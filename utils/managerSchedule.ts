import type { Match, Team } from '../types';
import { resolveMatchDivision } from '../services/muskizScheduleSimulator';

export function getManagerTeamNames(managerTeams: Team[]): Set<string> {
    return new Set(managerTeams.map((t) => t.name));
}

/** Partidos publicados que involucran algún equipo del responsable. */
export function filterMatchesForManagerTeams(matches: Match[], managerTeams: Team[]): Match[] {
    const names = getManagerTeamNames(managerTeams);
    if (names.size === 0) return [];
    return matches.filter(
        (m) => m.isPublic && (names.has(m.teamA) || names.has(m.teamB))
    );
}

export function filterMatchesByTeamFilter(
    matches: Match[],
    managerTeams: Team[],
    teamFilterId: 'all' | string
): Match[] {
    if (teamFilterId === 'all') return matches;
    const team = managerTeams.find((t) => t.id === teamFilterId);
    if (!team) return matches;
    return matches.filter((m) => m.teamA === team.name || m.teamB === team.name);
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

export function hasPublishedScheduleForManager(matches: Match[], managerTeams: Team[]): boolean {
    return filterMatchesForManagerTeams(matches, managerTeams).some(
        (m) => m.time !== 'PENDIENTE' || m.court !== 'Sin asignar'
    );
}
