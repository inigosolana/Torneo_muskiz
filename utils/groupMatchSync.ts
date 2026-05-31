import type { Match, Team } from '../types';
import {
    autoGroupCount,
    computeGroups,
    DIVISION_CODE,
    MIN_TEAMS_PER_GROUP,
    resolveMatchDivision,
} from '../services/muskizScheduleSimulator';

const GROUP_ROUND_RX = /Grupos\s*·\s*([A-Z]{2})-([A-D])\b/i;

function divisionCode(div: Team['division']): string {
    return DIVISION_CODE[div] ?? 'XX';
}

function isGroupPhaseMatch(m: Match): boolean {
    return (m.round ?? '').includes('Grupos');
}

function matchInvolvesTeam(m: Match, teamName: string): boolean {
    return m.teamA === teamName || m.teamB === teamName;
}

function opponentName(m: Match, teamName: string): string | null {
    if (m.teamA === teamName) return m.teamB;
    if (m.teamB === teamName) return m.teamA;
    return null;
}

function namesInGroup(teams: Team[], division: Team['division'], groupKey: string): Set<string> {
    const names = new Set<string>();
    for (const t of teams) {
        if (t.division !== division) continue;
        if ((t.competitionGroup ?? '').trim() === groupKey) names.add(t.name);
    }
    return names;
}

function updateRoundGroup(round: string, code: string, newGroupKey: string): string {
    if (GROUP_ROUND_RX.test(round)) {
        return round.replace(new RegExp(`(Grupos\\s*·\\s*${code}-)[A-D]`, 'i'), `$1${newGroupKey}`);
    }
    return round;
}

function newGroupMatch(
    teamA: string,
    teamB: string,
    division: Team['division'],
    groupKey: string,
    scheduleDay?: Match['scheduleDay'],
    template?: Match
): Match {
    const code = divisionCode(division);
    const label = `Grupos · ${code}-${groupKey}`;
    const id = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    if (template) {
        const parts = template.round?.split(' · ') ?? [];
        const prefix = parts.length >= 2 ? `${parts[0]} · ${parts[1]} · ` : '';
        return {
            ...template,
            id,
            teamA,
            teamB,
            round: prefix ? `${prefix}${label}` : label,
            scoreA: null,
            scoreB: null,
            status: 'SCHEDULED',
        };
    }
    return {
        id,
        time: 'PENDIENTE',
        court: 'Sin asignar',
        teamA,
        teamB,
        scoreA: null,
        scoreB: null,
        status: 'SCHEDULED',
        round: label,
        scheduleDay,
        isPublic: true,
    };
}

function pairKey(a: string, b: string): string {
    return [a, b].sort().join('|||');
}

export interface GroupDistributionValidation {
    valid: boolean;
    needsRegenerate: boolean;
    issues: string[];
    expectedGroupCount: number;
    groupSizes: { key: string; count: number }[];
}

function rosterForDivision(
    teams: Team[],
    division: Team['division'],
    onlyPaid: boolean
): Team[] {
    return teams.filter((t) => {
        if (t.division !== division) return false;
        if (onlyPaid && t.paymentStatus !== 'PAID') return false;
        return true;
    });
}

/** Comprueba si el reparto manual encaja con el formato del simulador. */
export function validateGroupDistribution(
    teams: Team[],
    division: Team['division'],
    onlyPaid = false
): GroupDistributionValidation {
    const roster = rosterForDivision(teams, division, onlyPaid);
    const n = roster.length;
    const expectedGroupCount = n < 2 ? 0 : autoGroupCount(n);
    const counts = new Map<string, number>();
    let unassigned = 0;

    for (const t of roster) {
        const g = (t.competitionGroup ?? '').trim();
        if (!g) {
            unassigned += 1;
            continue;
        }
        counts.set(g, (counts.get(g) ?? 0) + 1);
    }

    const groupSizes = [...counts.entries()]
        .sort(([a], [b]) => a.localeCompare(b, 'es'))
        .map(([key, count]) => ({ key, count }));

    const issues: string[] = [];
    if (unassigned > 0) {
        issues.push(`${unassigned} equipo(s) sin grupo`);
    }
    if (n >= 2 && counts.size !== expectedGroupCount) {
        issues.push(
            `${counts.size} grupo(s) asignados, el formato con ${n} equipos espera ${expectedGroupCount}`
        );
    }
    if (expectedGroupCount > 1) {
        for (const { key, count } of groupSizes) {
            if (count < MIN_TEAMS_PER_GROUP) {
                issues.push(`Grupo ${key}: ${count} equipos (mín. ${MIN_TEAMS_PER_GROUP})`);
            }
        }
        if (groupSizes.length > 0) {
            const sizes = groupSizes.map((g) => g.count);
            const max = Math.max(...sizes);
            const min = Math.min(...sizes);
            const ideal = Math.ceil(n / expectedGroupCount);
            if (max > ideal + 1) {
                issues.push(`Grupo con ${max} equipos (máx. recomendado ~${ideal + 1} para ${n} equipos)`);
            }
            if (max - min > 2) {
                issues.push(`Desequilibrio entre grupos (${min}–${max} equipos)`);
            }
        }
    }

    return {
        valid: issues.length === 0,
        needsRegenerate: issues.length > 0,
        issues,
        expectedGroupCount,
        groupSizes,
    };
}

/**
 * Tras mover un equipo de grupo: actualiza etiquetas de ronda, elimina cruces inválidos
 * y crea partidos de grupos que falten contra rivales del nuevo grupo.
 */
export function remapMatchesAfterGroupChange(
    matchList: Match[],
    teams: Team[],
    teamName: string,
    _oldGroup: string | null,
    newGroup: string,
    division: Team['division']
): Match[] {
    const newKey = newGroup.trim();
    if (!newKey) return matchList;

    const code = divisionCode(division);
    const newGroupNames = namesInGroup(teams, division, newKey);
    newGroupNames.add(teamName);

    const templateGroupMatch = matchList.find(
        (m) => isGroupPhaseMatch(m) && resolveMatchDivision(m, teams) === division
    );

    let next = matchList.filter((m) => {
        if (resolveMatchDivision(m, teams) !== division) return true;
        if (!isGroupPhaseMatch(m)) return true;
        if (!matchInvolvesTeam(m, teamName)) return true;
        const opp = opponentName(m, teamName);
        if (!opp) return true;
        if (opp.startsWith('1º') || opp.startsWith('2º') || opp.startsWith('Gan.')) return true;
        return newGroupNames.has(opp);
    });

    next = next.map((m) => {
        if (!isGroupPhaseMatch(m) || !matchInvolvesTeam(m, teamName)) return m;
        return {
            ...m,
            round: m.round ? updateRoundGroup(m.round, code, newKey) : m.round,
        };
    });

    const existingPairs = new Set<string>();
    for (const m of next) {
        if (!isGroupPhaseMatch(m) || resolveMatchDivision(m, teams) !== division) continue;
        if (m.teamA.startsWith('1º') || m.teamB.startsWith('1º')) continue;
        existingPairs.add(pairKey(m.teamA, m.teamB));
    }

    const mates = [...newGroupNames].filter((n) => n !== teamName);
    const toAdd: Match[] = [];
    for (const mate of mates) {
        const pk = pairKey(teamName, mate);
        if (existingPairs.has(pk)) continue;
        toAdd.push(
            newGroupMatch(teamName, mate, division, newKey, templateGroupMatch?.scheduleDay, templateGroupMatch)
        );
        existingPairs.add(pk);
    }

    return [...next, ...toAdd];
}

/** Intercambia grupos de dos equipos y actualiza partidos de fase de grupos. */
export function remapMatchesAfterGroupSwap(
    matchList: Match[],
    teams: Team[],
    teamA: Team,
    teamB: Team
): Match[] {
    if (teamA.division !== teamB.division) return matchList;
    const groupA = (teamA.competitionGroup ?? '').trim();
    const groupB = (teamB.competitionGroup ?? '').trim();
    if (!groupA || !groupB || groupA === groupB) return matchList;

    const division = teamA.division;
    let next = matchList;
    next = remapMatchesAfterGroupChange(next, teams, teamA.name, groupA, groupB, division);
    next = remapMatchesAfterGroupChange(next, teams, teamB.name, groupB, groupA, division);
    return next;
}

/** Equipos de un grupo (misma lógica que los cuadros de distribución). */
export function getTeamsInDivisionGroup(
    teams: Team[],
    division: Team['division'],
    groupKey: string,
    onlyPaid = false
): Team[] {
    const dist = getGroupDistributionForDivision(teams, division, onlyPaid);
    const block = dist.find((g) => g.key === groupKey);
    if (block?.teams.length) return block.teams;
    return teams.filter(
        (t) => t.division === division && (t.competitionGroup ?? '').trim() === groupKey
    );
}

function explicitGroupDistribution(roster: Team[]): { key: string; teams: Team[] }[] {
    const assigned = new Map<string, Team[]>();
    for (const t of roster) {
        const k = (t.competitionGroup ?? '').trim();
        if (!k) continue;
        if (!assigned.has(k)) assigned.set(k, []);
        assigned.get(k)!.push(t);
    }

    const expected = autoGroupCount(roster.length);
    const keys = new Set<string>();
    for (let i = 0; i < Math.max(expected, 1); i++) {
        keys.add(String.fromCharCode(65 + i));
    }
    assigned.forEach((_, k) => keys.add(k));

    return [...keys]
        .sort((a, b) => a.localeCompare(b, 'es'))
        .map((key) => ({
            key,
            teams: (assigned.get(key) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'es')),
        }));
}

/** Distribución actual de grupos en una categoría (para UI). Respeta competitionGroup del admin. */
export function getGroupDistributionForDivision(
    teams: Team[],
    division: Team['division'],
    onlyPaid = false
): { key: string; teams: Team[] }[] {
    const roster = rosterForDivision(teams, division, onlyPaid);
    if (roster.length === 0) return [];

    const anyAssigned = roster.some((t) => (t.competitionGroup ?? '').trim());
    if (anyAssigned) {
        return explicitGroupDistribution(roster);
    }

    const computed = computeGroups(roster);
    if (!computed?.length) {
        return [{ key: '—', teams: roster }];
    }
    return computed.map((g) => ({
        key: g.key,
        teams: g.names
            .map((name) => roster.find((t) => t.name === name))
            .filter((t): t is Team => Boolean(t)),
    }));
}
