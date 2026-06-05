import type { Match, Team } from '../types';
import { computeStandings } from './computeStandings';
import {
    findMatchForEliminationSlot,
    isEliminationMatch,
    type DivisionEliminationSlot,
} from './finalPhaseBracket';
import { getGroupDistributionForDivision } from './groupMatchSync';
import {
    rankThirdPlaceCandidates,
    splitThirdPlaceQualification,
} from './thirdPlaceQualification';
import {
    DIVISION_CODE,
    getDivisionEliminationTemplate,
    isGroupExtraMatch,
    isGroupPhaseMatch,
    isPlaceholderTeamName,
    normalizeTeamLabel,
    resolveMatchDivision,
    teamsEligibleForSchedule,
} from '../services/muskizScheduleSimulator';

export interface FinalPhaseResolutionResult {
    matches: Match[];
    changed: boolean;
    /** Categorías en las que se sustituyó al menos un placeholder. */
    divisionsUpdated: Team['division'][];
}

function eligibleTeamsInDivision(teams: Team[], division: Team['division']): Team[] {
    return teamsEligibleForSchedule(teams).filter((t) => t.division === division);
}

/** Placeholders de plantilla que no cubre `isPlaceholderTeamName`. */
export function isExtendedEliminationPlaceholder(name: string): boolean {
    const n = normalizeTeamLabel(name);
    if (!n) return false;
    if (isPlaceholderTeamName(n)) return true;
    if (/^mejor\s+3º/i.test(n)) return true;
    if (/^gan\.\s*repesca/i.test(n)) return true;
    if (/^peor\s+3º/i.test(n)) return true;
    if (/^2º\s+peor\s+3º/i.test(n)) return true;
    return false;
}

function mapKey(label: string): string {
    return normalizeTeamLabel(label);
}

function getMatchWinner(m: Match): string | null {
    if (m.status !== 'FINISHED' || m.scoreA === null || m.scoreB === null) return null;
    if (m.scoreA === m.scoreB) return null;
    return m.scoreA > m.scoreB ? m.teamA : m.teamB;
}

function getMatchLoser(m: Match): string | null {
    if (m.status !== 'FINISHED' || m.scoreA === null || m.scoreB === null) return null;
    if (m.scoreA === m.scoreB) return null;
    return m.scoreA > m.scoreB ? m.teamB : m.teamA;
}

function resolveFromMap(name: string, map: Map<string, string>): string {
    const key = mapKey(name);
    const hit = map.get(key);
    if (hit) return hit;
    if (!isExtendedEliminationPlaceholder(name)) return name;
    return name;
}

/** Todos los partidos de grupos reales de la categoría están terminados con marcador válido. */
export function isGroupStageCompleteForDivision(
    teams: Team[],
    matches: Match[],
    division: Team['division']
): boolean {
    const groupMatches = matches.filter((m) => {
        if (resolveMatchDivision(m, teams) !== division) return false;
        if (!isGroupPhaseMatch(m)) return false;
        if (isGroupExtraMatch(m)) return false;
        if (isExtendedEliminationPlaceholder(m.teamA) || isExtendedEliminationPlaceholder(m.teamB)) {
            return false;
        }
        return true;
    });
    if (groupMatches.length === 0) return false;
    return groupMatches.every(
        (m) =>
            m.status === 'FINISHED' &&
            m.scoreA !== null &&
            m.scoreB !== null &&
            m.scoreA !== m.scoreB
    );
}

function findEliminationMatch(
    slot: DivisionEliminationSlot,
    matches: Match[],
    division: Team['division'],
    teams: Team[]
): Match | null {
    const direct = findMatchForEliminationSlot(slot, matches, division, teams);
    if (direct) return direct;

    const needle = slot.roundLabel.split('·').slice(0, 2).join('·').trim().toLowerCase();
    for (const m of matches) {
        if (!isEliminationMatch(m, division, teams)) continue;
        const r = (m.round ?? '').toLowerCase();
        if (needle && r.includes(needle)) return m;
        const short = slot.roundLabel.toLowerCase().slice(0, 18);
        if (short && r.includes(short)) return m;
    }
    return null;
}

function buildGroupStandingsMap(
    teams: Team[],
    matches: Match[],
    division: Team['division']
): Map<string, string> {
    const map = new Map<string, string>();
    const eligible = eligibleTeamsInDivision(teams, division);
    const eligibleIds = new Set(eligible.map((t) => t.id));
    const groups = getGroupDistributionForDivision(teams, division, false)
        .map((g) => ({
            key: g.key,
            teams: g.teams.filter((t) => eligibleIds.has(t.id)),
        }))
        .filter((g) => g.teams.length > 0);

    for (const g of groups) {
        const table = computeStandings(teams, matches, {
            division,
            group: g.key,
            onlyPaidTeams: false,
            rosterOverride: g.teams,
        });
        if (table[0]) map.set(mapKey(`1º Gr.${g.key}`), table[0].name);
        if (table[1]) map.set(mapKey(`2º Gr.${g.key}`), table[1].name);
        if (table[2]) map.set(mapKey(`3º Gr.${g.key}`), table[2].name);
    }

    if (groups.length <= 1) {
        const table = computeStandings(teams, matches, {
            division,
            group: 'all',
            onlyPaidTeams: false,
            rosterOverride: eligible,
        });
        const labels = ['1º Clasificado', '2º Clasificado', '3º Clasificado', '4º Clasificado'] as const;
        labels.forEach((label, i) => {
            if (table[i]) map.set(mapKey(label), table[i]!.name);
        });
    }

    if (groups.length === 3) {
        const groupDefs = groups.map((g) => ({
            key: g.key,
            names: g.teams.map((t) => t.name),
        }));
        const ranked = rankThirdPlaceCandidates(teams, matches, groupDefs, division, false);
        const slots = ranked ? splitThirdPlaceQualification(ranked) : null;
        if (slots) {
            map.set(mapKey('Mejor 3º (directo)'), slots.bestDirect.name);
            map.set(mapKey('Peor 3º'), slots.repesca[1].name);
            map.set(mapKey('2º peor 3º'), slots.repesca[0].name);
        }
    }

    return map;
}

function buildKnockoutOutcomeMap(
    teams: Team[],
    matches: Match[],
    division: Team['division'],
    base: Map<string, string>
): Map<string, string> {
    const map = new Map(base);
    const eligible = eligibleTeamsInDivision(teams, division);
    const template = getDivisionEliminationTemplate(eligible);
    const code = DIVISION_CODE[division];
    const phases: DivisionEliminationSlot['phase'][] = [
        'REPESCA',
        'CUARTOS',
        'SEMIS',
        'TERCER_PUESTO',
        'FINAL',
    ];

    let cuartoIdx = 0;
    let semiIdx = 0;
    const semiCount = template.filter((s) => s.phase === 'SEMIS').length;

    for (const phase of phases) {
        for (const slot of template.filter((s) => s.phase === phase)) {
            const match = findEliminationMatch(slot, matches, division, teams);
            if (!match) continue;

            const winner = getMatchWinner(match);
            const loser = getMatchLoser(match);
            if (!winner && !loser) continue;

            if (phase === 'REPESCA' && winner) {
                map.set(mapKey('Gan. repesca 3º'), winner);
            } else if (phase === 'CUARTOS' && winner) {
                cuartoIdx += 1;
                map.set(mapKey(`Gan.Ctos ${code} ${cuartoIdx}`), winner);
            } else if (phase === 'SEMIS') {
                semiIdx += 1;
                if (winner) {
                    map.set(mapKey(`Gan.Semi ${code} ${semiIdx}`), winner);
                    if (semiCount === 1) {
                        map.set(mapKey(`Gan.Semi ${code}`), winner);
                    }
                }
                if (loser) {
                    map.set(mapKey(`Perd.Semi ${code} ${semiIdx}`), loser);
                }
            }
        }
    }

    return map;
}

function buildResolutionMapForDivision(
    teams: Team[],
    matches: Match[],
    division: Team['division']
): Map<string, string> {
    let map = new Map<string, string>();
    if (isGroupStageCompleteForDivision(teams, matches, division)) {
        map = buildGroupStandingsMap(teams, matches, division);
    }
    return buildKnockoutOutcomeMap(teams, matches, division, map);
}

function applyMapToMatch(m: Match, map: Map<string, string>): Match {
    const teamA = resolveFromMap(m.teamA, map);
    const teamB = resolveFromMap(m.teamB, map);
    if (teamA === m.teamA && teamB === m.teamB) return m;
    return { ...m, teamA, teamB };
}

function resolveDivision(
    teams: Team[],
    matches: Match[],
    division: Team['division']
): { matches: Match[]; changed: boolean } {
    const map = buildResolutionMapForDivision(teams, matches, division);
    if (map.size === 0) return { matches, changed: false };

    let changed = false;
    const next = matches.map((m) => {
        if (resolveMatchDivision(m, teams) !== division) return m;
        if (!isEliminationMatch(m, division, teams)) return m;
        const updated = applyMapToMatch(m, map);
        if (updated.teamA !== m.teamA || updated.teamB !== m.teamB) changed = true;
        return updated;
    });

    return { matches: next, changed };
}

/**
 * Sustituye placeholders de fase final por equipos reales:
 * - Tras terminar grupos de una categoría: clasificación → repesca/cuartos/semis/final.
 * - Tras jugar eliminatorias: ganadores/perdedores avanzan (Gan.Semi, Gan.Ctos, Perd.Semi…).
 * Aplica a todas las categorías (Viernes cadetes, Sábado juvenil/senior, Domingo infantil).
 */
export function applyFinalPhaseResolution(
    matches: Match[],
    teams: Team[],
    divisionFilter?: Team['division']
): FinalPhaseResolutionResult {
    const divisions = divisionFilter
        ? [divisionFilter]
        : ([...new Set(teamsEligibleForSchedule(teams).map((t) => t.division))] as Team['division'][]);

    let working = matches;
    const divisionsUpdated: Team['division'][] = [];

    for (const division of divisions) {
        if (eligibleTeamsInDivision(teams, division).length < 2) continue;
        const { matches: next, changed } = resolveDivision(teams, working, division);
        if (changed) {
            working = next;
            divisionsUpdated.push(division);
        }
    }

    return {
        matches: working,
        changed: divisionsUpdated.length > 0,
        divisionsUpdated,
    };
}

export interface FinalPhaseTeamPatch {
    id: string;
    teamA: string;
    teamB: string;
}

/** Partidos cuyos bandos deben actualizarse en BD (raw vs resuelto). */
export function getFinalPhaseTeamPatches(
    rawMatches: Match[],
    teams: Team[],
    divisionFilter?: Team['division']
): { patches: FinalPhaseTeamPatch[]; divisionsUpdated: Team['division'][] } {
    const { matches: resolved, divisionsUpdated } = applyFinalPhaseResolution(
        rawMatches,
        teams,
        divisionFilter
    );
    const patches: FinalPhaseTeamPatch[] = [];
    for (const m of resolved) {
        const orig = rawMatches.find((o) => o.id === m.id);
        if (!orig) continue;
        if (orig.teamA !== m.teamA || orig.teamB !== m.teamB) {
            patches.push({ id: m.id, teamA: m.teamA, teamB: m.teamB });
        }
    }
    return { patches, divisionsUpdated };
}

/** Categorías con todos los partidos de grupos (sin extras) terminados. */
export function divisionsWithCompleteGroupStage(
    teams: Team[],
    matches: Match[]
): Team['division'][] {
    return teamsEligibleForSchedule(teams)
        .map((t) => t.division)
        .filter((div, i, arr) => arr.indexOf(div) === i)
        .filter((div) => isGroupStageCompleteForDivision(teams, matches, div));
}

/** Hay cruces de fase final con placeholders que se pueden rellenar desde clasificación. */
export function hasPendingFinalPhaseTeamPatches(teams: Team[], matches: Match[]): boolean {
    return getFinalPhaseTeamPatches(matches, teams).patches.length > 0;
}

export interface PersistFinalPhaseOptions {
    divisionFilter?: Team['division'];
}

/**
 * Calcula parches y los aplica en memoria. `persistPatches` guarda solo los partidos cambiados en BD.
 */
export async function persistFinalPhaseTeamNames(
    rawMatches: Match[],
    teams: Team[],
    persistPatches: (patches: FinalPhaseTeamPatch[]) => Promise<void>,
    options?: PersistFinalPhaseOptions
): Promise<FinalPhaseResolutionResult> {
    const divisionFilter = options?.divisionFilter;
    const { patches, divisionsUpdated } = getFinalPhaseTeamPatches(rawMatches, teams, divisionFilter);
    if (patches.length === 0) {
        return { matches: rawMatches, changed: false, divisionsUpdated: [] };
    }
    await persistPatches(patches);
    const { matches: resolved } = applyFinalPhaseResolution(rawMatches, teams, divisionFilter);
    return { matches: resolved, changed: true, divisionsUpdated };
}
