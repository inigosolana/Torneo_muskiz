import type { Player, Team } from '../types';

/** Mínimo de jugadores inscritos en plantilla. */
export const MIN_PLAYERS_PER_TEAM = 6;

export const MAX_COACHES_PER_TEAM = 1;
export const MAX_OFFICIALS_PER_TEAM = 1;

/** @deprecated Usa matchDayPlayerCountForDivision(division) */
export const MATCH_DAY_PLAYER_COUNT = 12;

export function isSeniorDivision(division: Team['division']): boolean {
    return division === 'Senior Femenino' || division === 'Senior Masculino';
}

/** Máximo de jugadores en plantilla (inscripción). */
export function maxPlayersForDivision(division: Team['division']): number {
    return isSeniorDivision(division) ? 12 : 14;
}

/** Máximo de jugadores convocables por partido. */
export function matchDayPlayerCountForDivision(division: Team['division']): number {
    return isSeniorDivision(division) ? 10 : 12;
}

export function isPlayerRole(role?: Player['role']): boolean {
    return (role ?? 'PLAYER') === 'PLAYER';
}

export function isStaffRole(role?: Player['role']): boolean {
    return role === 'COACH' || role === 'OFFICIAL';
}

export function playerRoleLabel(role?: Player['role']): string {
    switch (role) {
        case 'COACH':
            return 'Entrenador';
        case 'OFFICIAL':
            return 'Oficial';
        default:
            return 'Jugador';
    }
}

export function countSquadPlayers(players: Player[]): number {
    return players.filter((p) => isPlayerRole(p.role)).length;
}

/** Estimación cuando un equipo inscrito aún no ha cargado plantilla. */
export const ESTIMATED_PLAYERS_IF_EMPTY_ROSTER = 10;

export function participantPlayerCountForTeam(team: Team): number {
    const registered = countSquadPlayers(team.players);
    return registered > 0 ? registered : ESTIMATED_PLAYERS_IF_EMPTY_ROSTER;
}

export function totalParticipantPlayers(teams: Team[], onlyPaid = true): number {
    const list = onlyPaid ? teams.filter((t) => t.paymentStatus === 'PAID') : teams;
    return list.reduce((sum, team) => sum + participantPlayerCountForTeam(team), 0);
}

export function countSquadCoaches(players: Player[]): number {
    return players.filter((p) => p.role === 'COACH').length;
}

export function countSquadOfficials(players: Player[]): number {
    return players.filter((p) => p.role === 'OFFICIAL').length;
}

/** @deprecated Usa countSquadCoaches + countSquadOfficials */
export function countSquadStaff(players: Player[]): number {
    return countSquadCoaches(players) + countSquadOfficials(players);
}

export function canAddSquadMember(
    players: Player[],
    division: Team['division'],
    role: Player['role']
): { ok: boolean; reason?: string } {
    if (role === 'COACH') {
        if (countSquadCoaches(players) >= MAX_COACHES_PER_TEAM) {
            return { ok: false, reason: 'Solo puedes tener 1 entrenador en la plantilla.' };
        }
        return { ok: true };
    }
    if (role === 'OFFICIAL') {
        if (countSquadOfficials(players) >= MAX_OFFICIALS_PER_TEAM) {
            return { ok: false, reason: 'Solo puedes tener 1 oficial en la plantilla.' };
        }
        return { ok: true };
    }
    const n = countSquadPlayers(players);
    const max = maxPlayersForDivision(division);
    if (n >= max) {
        const convocados = matchDayPlayerCountForDivision(division);
        return {
            ok: false,
            reason: `Máximo ${max} jugadores en plantilla (en partido se convocan hasta ${convocados}).`,
        };
    }
    return { ok: true };
}

export function canAddMoreSquadMembers(players: Player[], division: Team['division']): boolean {
    if (countSquadPlayers(players) < maxPlayersForDivision(division)) return true;
    if (countSquadCoaches(players) < MAX_COACHES_PER_TEAM) return true;
    if (countSquadOfficials(players) < MAX_OFFICIALS_PER_TEAM) return true;
    return false;
}

export function memberDocsComplete(p: Player): boolean {
    if (isPlayerRole(p.role)) {
        return p.dniStatus === 'APPROVED' && p.insuranceStatus === 'APPROVED';
    }
    return p.dniStatus === 'APPROVED';
}

export function memberDocsPending(p: Player): boolean {
    if (p.dniStatus === 'PENDING') return true;
    return isPlayerRole(p.role) && p.insuranceStatus === 'PENDING';
}

export function memberDocsMissing(p: Player): boolean {
    if (p.dniStatus === 'EMPTY') return true;
    return isPlayerRole(p.role) && p.insuranceStatus === 'EMPTY';
}

/** Jugador con documentación validada: puede figurar en actas y estadísticas de partido. */
export function isPlayerEligibleForMatch(p: Player): boolean {
    if (!isPlayerRole(p.role)) return false;
    return p.dniStatus === 'APPROVED' && p.insuranceStatus === 'APPROVED';
}

export function playersEligibleForMatch(players: Player[]): Player[] {
    return players.filter(isPlayerEligibleForMatch);
}

/**
 * Jugadores que aparecen en el acta impresa/digital (preparación de torneo).
 * Incluye toda la plantilla de jugadores aunque el DNI/seguro aún no esté aprobado.
 */
export function playersListedOnActa(players: Player[]): Player[] {
    return players
        .filter((p) => isPlayerRole(p.role))
        .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999));
}
