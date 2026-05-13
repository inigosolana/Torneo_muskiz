import type { Player, Team } from '../types';

/** Máximo entrenadores + oficiales por equipo. */
export const MAX_STAFF_PER_TEAM = 2;

/** Mínimo de jugadores inscritos en plantilla. */
export const MIN_PLAYERS_PER_TEAM = 6;

/** Jugadores que pueden jugar cada partido (informativo). */
export const MATCH_DAY_PLAYER_COUNT = 12;

export function maxPlayersForDivision(division: Team['division']): number {
    if (division === 'Senior Femenino' || division === 'Senior Masculino') return 12;
    return 14;
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

export function countSquadStaff(players: Player[]): number {
    return players.filter((p) => isStaffRole(p.role)).length;
}

export function canAddSquadMember(
    players: Player[],
    division: Team['division'],
    role: Player['role']
): { ok: boolean; reason?: string } {
    if (isPlayerRole(role)) {
        const n = countSquadPlayers(players);
        const max = maxPlayersForDivision(division);
        if (n >= max) {
            return {
                ok: false,
                reason: `Máximo ${max} jugadores en plantilla (en partido juegan ${MATCH_DAY_PLAYER_COUNT}).`,
            };
        }
        return { ok: true };
    }
    const staff = countSquadStaff(players);
    if (staff >= MAX_STAFF_PER_TEAM) {
        return { ok: false, reason: `Máximo ${MAX_STAFF_PER_TEAM} entre entrenadores y oficiales.` };
    }
    return { ok: true };
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
