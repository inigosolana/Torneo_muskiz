import type { Match, Player, Team } from '../types';
import { inferMatchScheduleDay, WEEKEND_SCHEDULE_DAYS } from '../services/tournamentScheduleService';
import type { MuskizScheduleDayLabel } from '../services/muskizScheduleSimulator';
import { maxPlayersForDivision, playersListedOnActa } from '../utils/squadLimits';

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

export interface ActaDayCourtSlot {
    day: MuskizScheduleDayLabel;
    court: string;
    key: string;
    label: string;
    count: number;
}

const DAY_COURT_KEY_SEP = '::';

export function dayCourtSlotKey(day: MuskizScheduleDayLabel, court: string): string {
    return `${day}${DAY_COURT_KEY_SEP}${court}`;
}

export function parseDayCourtSlotKey(key: string): { day: MuskizScheduleDayLabel; court: string } | null {
    const idx = key.indexOf(DAY_COURT_KEY_SEP);
    if (idx < 0) return null;
    const day = key.slice(0, idx) as MuskizScheduleDayLabel;
    const court = key.slice(idx + DAY_COURT_KEY_SEP.length);
    if (!WEEKEND_SCHEDULE_DAYS.includes(day) || !court) return null;
    return { day, court };
}

/** Slots día + campo con partidos (para llevar actas a cada pista). */
export function listActaDayCourtSlots(matches: Match[]): ActaDayCourtSlot[] {
    const counts = new Map<string, { day: MuskizScheduleDayLabel; court: string; count: number }>();
    for (const m of matches) {
        const day = inferMatchScheduleDay(m);
        const court = (m.court ?? '').trim();
        if (!day || !court) continue;
        const key = dayCourtSlotKey(day, court);
        const prev = counts.get(key);
        if (prev) prev.count += 1;
        else counts.set(key, { day, court, count: 1 });
    }
    return [...counts.values()]
        .sort((a, b) => {
            const oa = DAY_ORDER[a.day];
            const ob = DAY_ORDER[b.day];
            if (oa !== ob) return oa - ob;
            return a.court.localeCompare(b.court, 'es');
        })
        .map(({ day, court, count }) => ({
            day,
            court,
            key: dayCourtSlotKey(day, court),
            label: `${day} · ${court} (${count})`,
            count,
        }));
}

export function filterMatchesByDayCourt(
    matches: Match[],
    day: MuskizScheduleDayLabel,
    court: string,
): Match[] {
    const courtNorm = court.trim();
    return matches.filter(
        (m) => inferMatchScheduleDay(m) === day && (m.court ?? '').trim() === courtNorm,
    );
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
    const cap = maxPlayersForDivision(team.division);
    return playersListedOnActa(team.players).slice(0, cap);
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
