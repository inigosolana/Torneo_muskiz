import type { Match, Team } from '../types';
import { computeStandings, type StandingsRow } from './computeStandings';

/** Candidato 3º de un grupo (para repesca / mejores terceros). */
export interface ThirdPlaceCandidate {
    name: string;
    groupKey: string;
    points: number;
    played: number;
    gf: number;
    ga: number;
    /** Puntos / partidos jugados (comparación entre grupos con distinto nº de partidos). */
    coefficient: number;
    goalDiff: number;
}

export function thirdPlaceCoefficient(row: Pick<StandingsRow, 'points' | 'played'>): number {
    if (row.played <= 0) return 0;
    return row.points / row.played;
}

/** Orden: mayor coeficiente → más puntos → mejor diferencia → más GF → nombre. */
export function compareThirdPlaceCandidates(a: ThirdPlaceCandidate, b: ThirdPlaceCandidate): number {
    if (b.coefficient !== a.coefficient) return b.coefficient - a.coefficient;
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDiff !== a.goalDiff) return b.goalDiff - a.goalDiff;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.name.localeCompare(b.name, 'es');
}

function rowToCandidate(row: StandingsRow, groupKey: string): ThirdPlaceCandidate {
    return {
        name: row.name,
        groupKey,
        points: row.points,
        played: row.played,
        gf: row.gf,
        ga: row.ga,
        coefficient: thirdPlaceCoefficient(row),
        goalDiff: row.gf - row.ga,
    };
}

/**
 * Obtiene el 3º de cada grupo y los ordena por coeficiente.
 * Formato ≥11 equipos (3 grupos): el mejor 3º pasa directo a cuartos; los dos peores juegan repesca.
 */
export function rankThirdPlaceCandidates(
    teams: Team[],
    matches: Match[],
    groups: { key: string; names: string[] }[],
    division: Team['division'],
    onlyPaidTeams = true
): ThirdPlaceCandidate[] | null {
    if (groups.length !== 3) return null;

    const thirds: ThirdPlaceCandidate[] = [];
    for (const g of groups) {
        const roster = teams.filter((t) => {
            if (t.division !== division) return false;
            if (onlyPaidTeams && t.paymentStatus !== 'PAID') return false;
            return g.names.includes(t.name);
        });
        if (roster.length < 3) continue;

        const table = computeStandings(teams, matches, {
            division,
            group: g.key,
            onlyPaidTeams,
            rosterOverride: roster,
        });
        if (table.length < 3) continue;
        thirds.push(rowToCandidate(table[2]!, g.key));
    }

    if (thirds.length !== 3) return null;
    return [...thirds].sort(compareThirdPlaceCandidates);
}

export interface ThirdPlaceQualificationSlots {
    /** Pasa directo a cuartos (`3º mejor 1`). */
    bestDirect: ThirdPlaceCandidate;
    /** Juegan repesca (`3º peor 1` vs `3º peor 2`); el ganador es `3º mejor 2`. */
    repesca: [ThirdPlaceCandidate, ThirdPlaceCandidate];
}

export function splitThirdPlaceQualification(
    ranked: ThirdPlaceCandidate[]
): ThirdPlaceQualificationSlots | null {
    if (ranked.length !== 3) return null;
    return {
        bestDirect: ranked[0]!,
        repesca: [ranked[1]!, ranked[2]!],
    };
}
