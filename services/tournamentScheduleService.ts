import { supabase } from './supabaseClient';
import type { CalendarDraft, CalendarSimulationsPayload, Match, ScheduleVisibilityPayload } from '../types';
import type { MuskizScheduleDayLabel } from './muskizScheduleSimulator';

export const CALENDAR_SIMULATIONS_KEY = 'calendar_simulations';
export const SCHEDULE_VISIBILITY_KEY = 'schedule_visibility';

export const WEEKEND_SCHEDULE_DAYS: MuskizScheduleDayLabel[] = ['Viernes', 'Sábado', 'Domingo'];

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function matchScheduleDay(m: Match): MuskizScheduleDayLabel | null {
    if (m.scheduleDay && WEEKEND_SCHEDULE_DAYS.includes(m.scheduleDay as MuskizScheduleDayLabel)) {
        return m.scheduleDay as MuskizScheduleDayLabel;
    }
    const p = (m.round ?? '').slice(0, 3).toLowerCase();
    if (p === 'vie') return 'Viernes';
    if (p === 'sab') return 'Sábado';
    if (p === 'dom') return 'Domingo';
    return null;
}

export function createDefaultCalendarSimulations(): CalendarSimulationsPayload {
    const now = new Date().toISOString();
    const drafts: CalendarDraft[] = WEEKEND_SCHEDULE_DAYS.map((day) => ({
        id: crypto.randomUUID(),
        name: day,
        scheduleDay: day,
        formatDescription: '',
        createdAt: now,
        matches: [],
    }));
    return {
        drafts,
        activeDraftId: drafts[0]!.id,
    };
}

/**
 * Garantiza 3 borradores (Viernes / Sábado / Domingo). Reparte partidos legacy por día.
 * Conserva simulaciones extra sin scheduleDay al final.
 */
export function normalizeCalendarSimulations(payload: CalendarSimulationsPayload): CalendarSimulationsPayload {
    const now = new Date().toISOString();
    const matchesByDay: Record<MuskizScheduleDayLabel, Match[]> = {
        Viernes: [],
        Sábado: [],
        Domingo: [],
    };
    const orphanMatches: Match[] = [];
    const extraDrafts: CalendarDraft[] = [];

    const dayDraftByLabel = new Map<MuskizScheduleDayLabel, CalendarDraft>();
    for (const d of payload.drafts) {
        if (d.scheduleDay && WEEKEND_SCHEDULE_DAYS.includes(d.scheduleDay as MuskizScheduleDayLabel)) {
            const day = d.scheduleDay as MuskizScheduleDayLabel;
            if (!dayDraftByLabel.has(day)) {
                dayDraftByLabel.set(day, d);
                matchesByDay[day].push(...d.matches);
            } else {
                for (const m of d.matches) {
                    const md = matchScheduleDay(m) ?? day;
                    matchesByDay[md].push(m);
                }
            }
            continue;
        }
        if (!d.scheduleDay && d.matches.length === 0) {
            extraDrafts.push(d);
            continue;
        }
        if (!d.scheduleDay) {
            let assigned = false;
            for (const m of d.matches) {
                const md = matchScheduleDay(m);
                if (md) {
                    matchesByDay[md].push(m);
                    assigned = true;
                } else {
                    orphanMatches.push(m);
                }
            }
            if (!assigned && d.matches.length > 0) {
                extraDrafts.push(d);
            }
        }
    }

    const weekendDrafts: CalendarDraft[] = WEEKEND_SCHEDULE_DAYS.map((day) => {
        const existing = dayDraftByLabel.get(day);
        return {
            id: existing?.id ?? crypto.randomUUID(),
            name: existing?.name ?? day,
            scheduleDay: day,
            formatDescription: existing?.formatDescription ?? '',
            createdAt: existing?.createdAt ?? now,
            matches: ensureStableDraftMatchIds(matchesByDay[day]),
        };
    });

    const drafts = [...weekendDrafts, ...extraDrafts];
    if (orphanMatches.length > 0) {
        const legacy = payload.drafts.find((d) => d.name === 'Simulación 1' && !d.scheduleDay);
        drafts.push({
            id: legacy?.id ?? crypto.randomUUID(),
            name: legacy?.name ?? 'Sin día asignado',
            formatDescription: legacy?.formatDescription ?? '',
            createdAt: legacy?.createdAt ?? now,
            matches: ensureStableDraftMatchIds(orphanMatches),
        });
    }

    const activeDraftId =
        payload.activeDraftId && drafts.some((d) => d.id === payload.activeDraftId)
            ? payload.activeDraftId
            : weekendDrafts[0]!.id;

    return { drafts, activeDraftId };
}

/** Une los 3 calendarios de fin de semana para publicar en BD. */
export function mergeWeekendDraftMatches(drafts: CalendarDraft[]): Match[] {
    const ordered: Match[] = [];
    for (const day of WEEKEND_SCHEDULE_DAYS) {
        const d = drafts.find((x) => x.scheduleDay === day);
        if (d?.matches.length) ordered.push(...d.matches);
    }
    return ensureStableDraftMatchIds(ordered);
}

export function isWeekendDraftSetComplete(drafts: CalendarDraft[]): boolean {
    return WEEKEND_SCHEDULE_DAYS.every((day) => drafts.some((d) => d.scheduleDay === day));
}

/** Asegura id estable en borradores (para keys de React). */
export function ensureStableDraftMatchIds(matches: Match[]): Match[] {
    return matches.map((m, i) => ({
        ...m,
        id: m.id && String(m.id).length > 0 ? m.id : `draft_${crypto.randomUUID()}_${i}`,
        isPublic: m.isPublic ?? true,
    }));
}

/** Al volcar borrador a tabla oficial: sólo UUIDs válidos para Supabase (sin campos sólo‑borrador). */
export function finalizeMatchesForDatabase(
    matches: Match[],
    options?: { isPublic?: boolean }
): Match[] {
    const isPublic = options?.isPublic ?? true;
    return matches.map((m) => ({
        id: UUID_RX.test(m.id) ? m.id : crypto.randomUUID(),
        time: m.time,
        court: m.court,
        teamA: m.teamA,
        teamB: m.teamB,
        scoreA: m.scoreA ?? null,
        scoreB: m.scoreB ?? null,
        status: m.status ?? 'SCHEDULED',
        round: m.round,
        report: m.report,
        isPublic,
    }));
}

export async function fetchCalendarSimulations(): Promise<CalendarSimulationsPayload | null> {
    const { data, error } = await supabase
        .from('site_content')
        .select('value')
        .eq('key', CALENDAR_SIMULATIONS_KEY)
        .maybeSingle();

    if (error) {
        console.error('fetchCalendarSimulations', error);
        return null;
    }
    const v = data?.value as CalendarSimulationsPayload | undefined;
    if (!v || !Array.isArray(v.drafts) || v.drafts.length === 0) return null;
    return v;
}

export async function saveCalendarSimulations(payload: CalendarSimulationsPayload): Promise<void> {
    const { error } = await supabase
        .from('site_content')
        .upsert({ key: CALENDAR_SIMULATIONS_KEY, value: payload }, { onConflict: 'key' });
    if (error) throw new Error(error.message);
}

export async function fetchScheduleVisibility(): Promise<ScheduleVisibilityPayload> {
    const { data, error } = await supabase
        .from('site_content')
        .select('value')
        .eq('key', SCHEDULE_VISIBILITY_KEY)
        .maybeSingle();

    if (error) {
        console.error('fetchScheduleVisibility', error);
        return { publicMatchesVisible: false };
    }
    const v = data?.value as Partial<ScheduleVisibilityPayload> | undefined;
    return { publicMatchesVisible: !!v?.publicMatchesVisible };
}

export async function saveScheduleVisibility(publicMatchesVisible: boolean): Promise<void> {
    const { error } = await supabase
        .from('site_content')
        .upsert(
            { key: SCHEDULE_VISIBILITY_KEY, value: { publicMatchesVisible } satisfies ScheduleVisibilityPayload },
            { onConflict: 'key' }
        );
    if (error) throw new Error(error.message);
}

export function duplicateDraft(d: CalendarDraft): CalendarDraft {
    return {
        ...d,
        id: crypto.randomUUID(),
        name: `${d.name} (copia)`,
        createdAt: new Date().toISOString(),
        matches: d.matches.map((m) => ({ ...m, id: `draft_${crypto.randomUUID()}` })),
    };
}
