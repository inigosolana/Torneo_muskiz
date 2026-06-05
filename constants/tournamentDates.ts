import type { MuskizScheduleDayLabel } from '../services/muskizScheduleSimulator';

/** Fechas del fin de semana de competición (hora local del navegador). */
export const TOURNAMENT_WEEKEND_DATES: Record<MuskizScheduleDayLabel, string> = {
    Viernes: '2026-06-05',
    Sábado: '2026-06-06',
    Domingo: '2026-06-07',
};

const DATE_TO_DAY = Object.fromEntries(
    Object.entries(TOURNAMENT_WEEKEND_DATES).map(([day, date]) => [date, day as MuskizScheduleDayLabel]),
) as Record<string, MuskizScheduleDayLabel>;

function localDateKey(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/** Día de competición si hoy es viernes/sábado/domingo del torneo; si no, null. */
export function getCurrentTournamentDay(now = new Date()): MuskizScheduleDayLabel | null {
    return DATE_TO_DAY[localDateKey(now)] ?? null;
}

export function isTournamentWeekendDay(now = new Date()): boolean {
    return getCurrentTournamentDay(now) !== null;
}
