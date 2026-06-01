import type { Match } from '../types';

/** Equipos ficticios de cruces (no bloquean por duplicado de nombre). */
export function isPlaceholderTeamName(name: string): boolean {
    return (
        /grupo|gr\.\s*[a-d]\b|clasificado|gan\.|ganador|ctos?\b|mejor|peor|repesca|consolaci[oó]n/i.test(name) ||
        /^\d+º/i.test(name)
    );
}

function teamsInMatch(m: Match): string[] {
    return [m.teamA, m.teamB].filter((t) => t && !isPlaceholderTeamName(t));
}

export type MatchSlotValidationResult =
    | { ok: true }
    | { ok: false; error: string };

/**
 * Valida mover/editar un partido: misma franja horaria no puede repetir pista ni equipo real.
 */
export function validateMatchSlotChange(
    matches: Match[],
    matchId: string,
    patch: Partial<Pick<Match, 'time' | 'court' | 'teamA' | 'teamB'>>
): MatchSlotValidationResult {
    const moving = matches.find((m) => m.id === matchId);
    if (!moving) return { ok: false, error: 'Partido no encontrado.' };

    const newTime = patch.time ?? moving.time;
    const newCourt = patch.court ?? moving.court;
    const newTeamA = patch.teamA ?? moving.teamA;
    const newTeamB = patch.teamB ?? moving.teamB;

    if (newTime === 'PENDIENTE' || newCourt === 'Sin asignar') {
        return { ok: true };
    }

    const movingTeams = [newTeamA, newTeamB].filter((t) => t && !isPlaceholderTeamName(t));

    for (const other of matches) {
        if (other.id === matchId) continue;
        if (other.time !== newTime) continue;

        if (other.court === newCourt) {
            return {
                ok: false,
                error: `Ya hay un partido en ${newCourt} a las ${newTime} (${other.teamA} vs ${other.teamB}).`,
            };
        }

        for (const team of movingTeams) {
            if (teamsInMatch(other).includes(team)) {
                return {
                    ok: false,
                    error: `«${team}» ya juega a las ${newTime} (${other.teamA} vs ${other.teamB} en ${other.court}).`,
                };
            }
        }
    }

    return { ok: true };
}
