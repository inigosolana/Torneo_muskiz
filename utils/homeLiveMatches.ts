import type { Match } from '../types';
import type { MuskizScheduleDayLabel } from '../services/muskizScheduleSimulator';
import { inferMatchScheduleDay } from '../services/tournamentScheduleService';
import { getCurrentTournamentDay, isTournamentWeekendDay } from '../constants/tournamentDates';
import { getMatchSetsDisplay } from './beachSetScoring';

const DAY_ORDER: Record<MuskizScheduleDayLabel, number> = { Viernes: 0, Sábado: 1, Domingo: 2 };

export function parseMatchClock(time: string): { hour: number; minute: number } | null {
    if (!time || time === 'PENDIENTE') return null;
    const [h, m] = time.split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return null;
    return { hour: h!, minute: m! };
}

function timeSortKey(time: string): number {
    const t = parseMatchClock(time);
    if (!t) return 99999;
    return t.hour * 60 + t.minute;
}

function sortBySchedule(matches: Match[]): Match[] {
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

function sortByScheduleDesc(matches: Match[]): Match[] {
    return [...matches].sort((a, b) => {
        const da = inferMatchScheduleDay(a);
        const db = inferMatchScheduleDay(b);
        const oa = da ? DAY_ORDER[da] : -1;
        const ob = db ? DAY_ORDER[db] : -1;
        if (oa !== ob) return ob - oa;
        const ta = timeSortKey(a.time);
        const tb = timeSortKey(b.time);
        if (ta !== tb) return tb - ta;
        return a.court.localeCompare(b.court, 'es');
    });
}

/** Calendario publicado y fin de semana de torneo (o ya hay resultados). */
export function shouldShowHomeLivePanel(
    publicMatchesVisible: boolean,
    matches: Match[],
    now = new Date(),
): boolean {
    if (!publicMatchesVisible || matches.length === 0) return false;
    if (isTournamentWeekendDay(now)) return true;
    return matches.some((m) => m.status === 'FINISHED' && getMatchSetsDisplay(m) !== '—');
}

/** Partidos de la franja horaria actual (misma hora del reloj) + en directo. */
export function matchesAtCurrentHour(matches: Match[], now = new Date()): Match[] {
    const tournamentDay = getCurrentTournamentDay(now);
    const currentHour = now.getHours();
    const picked = new Map<string, Match>();

    for (const m of matches) {
        if (m.status === 'LIVE') {
            picked.set(m.id, m);
            continue;
        }
        if (!tournamentDay) continue;
        if (inferMatchScheduleDay(m) !== tournamentDay) continue;
        const clock = parseMatchClock(m.time);
        if (!clock || clock.hour !== currentHour) continue;
        picked.set(m.id, m);
    }

    return sortBySchedule([...picked.values()]);
}

/** Próximos partidos del día (si no hay nada a esta hora). */
export function upcomingMatchesToday(matches: Match[], now = new Date(), limit = 4): Match[] {
    const tournamentDay = getCurrentTournamentDay(now);
    if (!tournamentDay) return [];

    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    return sortBySchedule(
        matches.filter((m) => {
            if (m.status === 'FINISHED') return false;
            if (inferMatchScheduleDay(m) !== tournamentDay) return false;
            const clock = parseMatchClock(m.time);
            if (!clock) return false;
            return clock.hour * 60 + clock.minute >= nowMinutes;
        }),
    ).slice(0, limit);
}

export function recentTournamentResults(matches: Match[], limit = 6): Match[] {
    return sortByScheduleDesc(
        matches.filter((m) => m.status === 'FINISHED' && getMatchSetsDisplay(m) !== '—'),
    ).slice(0, limit);
}

export function formatNowClock(now = new Date()): string {
    return now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}
