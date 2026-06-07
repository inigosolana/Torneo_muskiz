import {
    TOURNAMENT_WITHDRAWN_TEAMS,
    type WithdrawnTeamSpec,
} from '../constants/tournamentWithdrawals';
import { normalizeTeamLabel } from '../services/muskizScheduleSimulator';
import type { Team } from '../types';

/** Lista unificada: bajas en BD (rejected) + bajas confirmadas en app. */
export function mergedWithdrawnSpecs(
    teams: Team[],
    extra: WithdrawnTeamSpec[] = TOURNAMENT_WITHDRAWN_TEAMS
): WithdrawnTeamSpec[] {
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

export function isTeamWithdrawn(
    team: Pick<Team, 'id' | 'name' | 'division' | 'status'>,
    extra: WithdrawnTeamSpec[] = TOURNAMENT_WITHDRAWN_TEAMS
): boolean {
    if (team.status === 'rejected') return true;
    const label = normalizeTeamLabel(team.name);
    return extra.some(
        (w) =>
            (w.id && w.id === team.id) ||
            (normalizeTeamLabel(w.name) === label && w.division === team.division)
    );
}

/** Equipos activos en competición (sin bajas confirmadas). */
export function filterActiveTeams(
    teams: Team[],
    extra: WithdrawnTeamSpec[] = TOURNAMENT_WITHDRAWN_TEAMS
): Team[] {
    return teams.filter((t) => !isTeamWithdrawn(t, extra));
}

export function hasWithdrawnTeamInDivision(
    division: Team['division'],
    extra: WithdrawnTeamSpec[] = TOURNAMENT_WITHDRAWN_TEAMS
): boolean {
    return extra.some((w) => w.division === division);
}
