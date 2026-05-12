import { supabase } from './supabaseClient';
import type { CalendarDraft, CalendarSimulationsPayload, Match, ScheduleVisibilityPayload } from '../types';

export const CALENDAR_SIMULATIONS_KEY = 'calendar_simulations';
export const SCHEDULE_VISIBILITY_KEY = 'schedule_visibility';

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createDefaultCalendarSimulations(): CalendarSimulationsPayload {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    return {
        drafts: [{ id, name: 'Simulación 1', matches: [], createdAt: now }],
        activeDraftId: id,
    };
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
