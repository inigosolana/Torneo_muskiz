import type { Match, Player, Team } from '../types';
import { inferMatchScheduleDay, WEEKEND_SCHEDULE_DAYS } from '../services/tournamentScheduleService';
import type { MuskizScheduleDayLabel } from '../services/muskizScheduleSimulator';
import { playersListedOnActa } from '../utils/squadLimits';

/** Filas del tanteo punto a punto según modelo acta playa (Kolosaurios / RFEBM). */
export const MATCH_REPORT_GRID_ROWS = 44;

/** Columnas de la tabla central: 6 (A) + 4 (set1) + 4 (set2) + 5 (shoot out) + 6 (B). */
export const ACTA_MAIN_GRID_COLUMNS = 25;

const DAY_ORDER: Record<MuskizScheduleDayLabel, number> = { Viernes: 0, Sábado: 1, Domingo: 2 };

function timeSortKey(time: string): number {
    if (time === 'PENDIENTE') return 99999;
    const [h, m] = time.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
}

/** Mismo orden que la tabla de resultados del admin. */
export function sortMatchesForActas(matches: Match[]): Match[] {
    return [...matches].sort((a, b) => {
        const da = inferMatchScheduleDay(a);
        const db = inferMatchScheduleDay(b);
        const oa = da ? DAY_ORDER[da] : 99;
        const ob = db ? DAY_ORDER[db] : 99;
        if (oa !== ob) return oa - ob;
        const ta = timeSortKey(a.time);
        const tb = timeSortKey(b.time);
        if (ta !== tb) return ta - tb;
        return a.court.localeCompare(b.court, 'es');
    });
}

export function inferGenderMixLabel(team: Team | undefined): string {
    const d = (team?.division ?? '').toLowerCase();
    if (d.includes('femen')) return 'FEM';
    if (d.includes('mascul')) return 'MAS';
    return '';
}

export function formatPlayerNameForActa(p: Player): string {
    const surname = (p.surnames ?? '').trim();
    const given = (p.name ?? '').trim();
    if (surname && given) return `${surname.toUpperCase()}, ${given}`;
    return (given || surname).toUpperCase();
}

function playersForActa(team: Team | undefined): Player[] {
    if (!team) return [];
    return playersListedOnActa(team.players);
}

export function buildActaRosterRows(team: Team | undefined, rowCount: number): { player: Player | null }[] {
    const roster: (Player | null)[] = [...playersForActa(team)];
    while (roster.length < rowCount) roster.push(null);
    return roster.slice(0, rowCount).map((player) => ({ player }));
}

export const ACTA_CELL_SCORE = 'h-[6px] max-h-[6px] border-r border-black p-0 align-middle';
export const ACTA_CELL_ROSTER_THIN =
    'h-[6px] max-h-[6px] border-r border-black p-0 align-middle text-center text-[6px] leading-none';
export const ACTA_CELL_ROSTER_NAME =
    'h-[6px] max-h-[6px] border-r border-black px-px py-0 align-middle text-[6px] leading-none whitespace-nowrap overflow-hidden text-ellipsis max-w-0';

export { WEEKEND_SCHEDULE_DAYS };
