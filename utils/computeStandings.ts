import type { Match, Team } from '../types';
import { DIVISION_CODE, normalizeTeamLabel, resolveMatchDivision } from '../services/muskizScheduleSimulator';
import { getTeamsInDivisionGroup } from './groupMatchSync';

export interface StandingsRow {
    name: string;
    logoUrl?: string;
    played: number;
    won: number;
    lost: number;
    gf: number;
    ga: number;
    points: number;
}

export interface ComputeStandingsOpts {
    division: Team['division'];
    /** 'all' = todos los equipos de la categoría con el filtro de pago aplicado */
    group: string | 'all';
    /** Si true (defecto), solo equipos con pago PAID entran en la clasificación */
    onlyPaidTeams?: boolean;
    /** Plantilla fija (p. ej. misma distribución que los cuadros de grupos del admin) */
    rosterOverride?: Team[];
}

/**
 * Clasificación por categoría y, opcionalmente, grupo de competición.
 * Solo cuenta partidos FINALIZADOS donde ambos equipos pertenecen al conjunto filtrado.
 */
export function computeStandings(
    teams: Team[],
    matches: Match[],
    opts: ComputeStandingsOpts
): StandingsRow[] {
    const onlyPaid = opts.onlyPaidTeams !== false;
    const roster =
        opts.rosterOverride ??
        teams.filter((t) => {
            if (t.division !== opts.division) return false;
            if (onlyPaid && t.paymentStatus !== 'PAID') return false;
            if (opts.group !== 'all' && (t.competitionGroup ?? '').trim() !== opts.group) return false;
            return true;
        });
    const rosterNames = new Set(roster.map((t) => t.name));

    const stats: Record<string, StandingsRow> = {};
    roster.forEach((t) => {
        stats[t.name] = {
            name: t.name,
            logoUrl: t.logoUrl,
            played: 0,
            won: 0,
            lost: 0,
            gf: 0,
            ga: 0,
            points: 0,
        };
    });

    matches.forEach((m) => {
        if (m.status !== 'FINISHED' || m.scoreA === null || m.scoreB === null) return;
        if (!rosterNames.has(m.teamA) || !rosterNames.has(m.teamB)) return;

        if (!stats[m.teamA]) stats[m.teamA] = { name: m.teamA, played: 0, won: 0, lost: 0, gf: 0, ga: 0, points: 0 };
        if (!stats[m.teamB]) stats[m.teamB] = { name: m.teamB, played: 0, won: 0, lost: 0, gf: 0, ga: 0, points: 0 };

        stats[m.teamA].played += 1;
        stats[m.teamA].gf += m.scoreA;
        stats[m.teamA].ga += m.scoreB;

        stats[m.teamB].played += 1;
        stats[m.teamB].gf += m.scoreB;
        stats[m.teamB].ga += m.scoreA;

        if (m.scoreA > m.scoreB) {
            stats[m.teamA].won += 1;
            stats[m.teamA].points += 3;
            stats[m.teamB].lost += 1;
        } else if (m.scoreB > m.scoreA) {
            stats[m.teamB].won += 1;
            stats[m.teamB].points += 3;
            stats[m.teamA].lost += 1;
        } else {
            stats[m.teamA].points += 1;
            stats[m.teamB].points += 1;
        }
    });

    return Object.values(stats).sort((a, b) => b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga));
}

/** Partidos de una categoría y grupo (fase de grupos por round o ambos equipos del cuadro). */
export function filterMatchesForDivisionGroup(
    matches: Match[],
    teams: Team[],
    division: Team['division'],
    groupKey: string
): Match[] {
    const roster = getTeamsInDivisionGroup(teams, division, groupKey, false);
    const rosterNames = new Set(roster.map((t) => t.name));
    const rosterNorm = new Set(roster.map((t) => normalizeTeamLabel(t.name)));
    const code = DIVISION_CODE[division];
    const groupRoundRx = code ? new RegExp(`Grupos\\s*·\\s*${code}-${groupKey}\\b`, 'i') : null;

    const inRoster = (name: string) =>
        rosterNames.has(name) || rosterNorm.has(normalizeTeamLabel(name));

    return matches.filter((m) => {
        if (resolveMatchDivision(m, teams) !== division) return false;
        const round = m.round ?? '';
        if (round.includes('Grupos') && groupRoundRx?.test(round)) return true;
        return inRoster(m.teamA) && inRoster(m.teamB);
    });
}

/** Grupos distintos (no vacíos) usados por equipos PAID en una división */
export function competitionGroupsForDivision(teams: Team[], division: Team['division'], onlyPaid = true): string[] {
    const set = new Set<string>();
    teams
        .filter((t) => t.division === division && (!onlyPaid || t.paymentStatus === 'PAID'))
        .forEach((t) => {
            const g = (t.competitionGroup ?? '').trim();
            if (g) set.add(g);
        });
    return [...set].sort((a, b) => a.localeCompare(b, 'es'));
}
