import type { Match, Team } from '../types';
import {
    isPlaceholderTeamName,
    isSameScheduledTeam,
    resolveMatchDivision,
} from '../services/muskizScheduleSimulator';

export { isPlaceholderTeamName };

export type MatchSlotValidationResult =
    | { ok: true }
    | { ok: false; error: string };

/**
 * Valida mover/editar un partido: misma franja horaria no puede repetir pista ni equipo real.
 * Los equipos solo chocan dentro de la misma división (id de equipo, no nombres parecidos).
 */
export function validateMatchSlotChange(
    matches: Match[],
    matchId: string,
    patch: Partial<Pick<Match, 'time' | 'court' | 'teamA' | 'teamB'>>,
    teams: Team[] = []
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

    const movingWithPatch: Match = { ...moving, time: newTime, court: newCourt, teamA: newTeamA, teamB: newTeamB };
    const movingTeams = [newTeamA, newTeamB].filter((t) => t && !isPlaceholderTeamName(t));
    const movingDivision = resolveMatchDivision(movingWithPatch, teams);

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
            if (!isSameScheduledTeam(team, movingWithPatch, other, teams)) continue;

            const catHint = movingDivision ? ` (${movingDivision})` : '';
            return {
                ok: false,
                error: `«${team}»${catHint} ya juega a las ${newTime} (${other.teamA} vs ${other.teamB} en ${other.court}).`,
            };
        }
    }

    return { ok: true };
}
