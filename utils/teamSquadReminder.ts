import { PLAYER_LICENSE_LAST_DAY } from '../constants/registrationDeadlines';
import type { Player, Team } from '../types';
import {
    countSquadPlayers,
    isPlayerRole,
    MIN_PLAYERS_PER_TEAM,
    maxPlayersForDivision,
} from './squadLimits';

export interface TeamSquadReminderStatus {
    needsReminder: boolean;
    playerCount: number;
    minPlayers: number;
    missingInsuranceCount: number;
    missingDniCount: number;
    pendingDocCount: number;
    rejectedDocCount: number;
    summaryLines: string[];
}

function playerLabel(p: Player): string {
    const name = [p.name, p.surnames].filter(Boolean).join(' ').trim();
    return name || `Jugador #${p.number ?? '?'}`;
}

/** Equipos aprobados con plantilla incompleta o seguro/DNI de jugadores pendiente. */
export function getTeamSquadReminderStatus(team: Team): TeamSquadReminderStatus {
    const players = team.players.filter((p) => isPlayerRole(p.role));
    const playerCount = countSquadPlayers(team.players);
    const minPlayers = MIN_PLAYERS_PER_TEAM;

    const missingInsurance = players.filter((p) => p.insuranceStatus !== 'APPROVED');
    const missingDni = players.filter((p) => p.dniStatus !== 'APPROVED');
    const pendingDoc = players.filter(
        (p) => p.dniStatus === 'PENDING' || p.insuranceStatus === 'PENDING'
    );
    const rejectedDoc = players.filter(
        (p) => p.dniStatus === 'REJECTED' || p.insuranceStatus === 'REJECTED'
    );

    const summaryLines: string[] = [];

    if (playerCount < minPlayers) {
        summaryLines.push(
            `Faltan jugadores en plantilla: ${playerCount}/${minPlayers} mínimo (máx. ${maxPlayersForDivision(team.division)} en ${team.division}).`
        );
    }

    const insEmpty = missingInsurance.filter((p) => p.insuranceStatus === 'EMPTY');
    const insPending = missingInsurance.filter((p) => p.insuranceStatus === 'PENDING');
    const insRejected = missingInsurance.filter((p) => p.insuranceStatus === 'REJECTED');

    if (insEmpty.length > 0) {
        summaryLines.push(
            `Seguro sin subir (${insEmpty.length}): ${insEmpty.slice(0, 5).map(playerLabel).join(', ')}${insEmpty.length > 5 ? '…' : ''}.`
        );
    }
    if (insPending.length > 0) {
        summaryLines.push(`Seguro pendiente de validar (${insPending.length}).`);
    }
    if (insRejected.length > 0) {
        summaryLines.push(
            `Seguro rechazado (${insRejected.length}): ${insRejected.slice(0, 4).map(playerLabel).join(', ')}${insRejected.length > 4 ? '…' : ''}.`
        );
    }

    const dniEmpty = missingDni.filter((p) => p.dniStatus === 'EMPTY');
    if (dniEmpty.length > 0 && playerCount > 0) {
        summaryLines.push(`DNI sin subir (${dniEmpty.length} jugador/es).`);
    }

    const needsReminder =
        team.status === 'approved' &&
        (playerCount < minPlayers ||
            missingInsurance.length > 0 ||
            (playerCount > 0 && missingDni.some((p) => p.dniStatus === 'EMPTY')));

    if (needsReminder && summaryLines.length === 0) {
        summaryLines.push('Revisa la plantilla y la documentación en el panel de responsable.');
    }

    if (needsReminder) {
        summaryLines.push(`Plazo licencias y plantilla completa: hasta el ${PLAYER_LICENSE_LAST_DAY}.`);
    }

    return {
        needsReminder,
        playerCount,
        minPlayers,
        missingInsuranceCount: missingInsurance.length,
        missingDniCount: missingDni.length,
        pendingDocCount: pendingDoc.length,
        rejectedDocCount: rejectedDoc.length,
        summaryLines,
    };
}
