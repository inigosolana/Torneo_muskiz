import * as XLSX from 'xlsx';
import type { Player, Team } from '../types';
import { isPlayerRole } from './squadLimits';

function insuranceYesNo(status: Player['insuranceStatus']): string {
    return status === 'APPROVED' ? 'Sí' : 'No';
}

function buildPlayerRows(teams: Team[]): Record<string, string>[] {
    const rows: Record<string, string>[] = [];

    const sortedTeams = [...teams].sort(
        (a, b) =>
            a.division.localeCompare(b.division, 'es') || a.name.localeCompare(b.name, 'es'),
    );

    for (const team of sortedTeams) {
        const players = team.players
            .filter((p) => isPlayerRole(p.role))
            .sort(
                (a, b) =>
                    (a.surnames ?? '').localeCompare(b.surnames ?? '', 'es') ||
                    a.name.localeCompare(b.name, 'es'),
            );

        for (const player of players) {
            rows.push({
                Nombre: player.name ?? '',
                Apellidos: player.surnames ?? '',
                Categoría: team.division,
                Equipo: team.name,
                DNI: player.dniNumber ?? '',
                Seguro: insuranceYesNo(player.insuranceStatus),
            });
        }
    }

    return rows;
}

/** Excel con todos los jugadores del torneo (nombre, apellidos, categoría, equipo, DNI, seguro). */
export function downloadAllTournamentPlayersExcel(teams: Team[], filenameBase = 'jugadores_torneo'): void {
    const rows = buildPlayerRows(teams);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Jugadores');
    XLSX.writeFile(wb, `${filenameBase}.xlsx`);
}
