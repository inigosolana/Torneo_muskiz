import type { Match, Team } from '../types';
import { supabase } from './supabaseClient';

export type SocialContentType = 'standings_group' | 'results_day' | 'match_result' | 'live_digest';

export interface SocialContentRequest {
    contentType: SocialContentType;
    division?: Team['division'];
    groupKey?: string;
    scheduleDay?: 'Viernes' | 'Sábado' | 'Domingo';
    matchId?: string;
    template?: string;
}

export async function exportSocialPayload(
    req: SocialContentRequest & { sendToTelegram?: boolean }
): Promise<Record<string, unknown>> {
    const { data, error } = await supabase.functions.invoke('social-content-export', { body: req });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    return data.payload as Record<string, unknown>;
}

export async function generateInstagramCaption(payload: Record<string, unknown>): Promise<string> {
    const { data, error } = await supabase.functions.invoke('generate-social-post', {
        body: { payload, captionDraft: payload.captionDraft, template: payload.template },
    });
    if (error) throw error;
    return String(data?.post ?? payload.captionDraft ?? '');
}

export async function sendPayloadToN8n(
    payload: Record<string, unknown> | { mode: string; scheduleDay?: string; division?: string; groupKey?: string }
): Promise<{ ok: boolean; n8nConfigured?: boolean; telegram?: { sent: boolean; draftId?: string; error?: string } }> {
    const { data, error } = await supabase.functions.invoke('trigger-n8n-social', {
        body: 'mode' in payload ? payload : { payload },
    });
    if (error) throw error;
    return { ok: !!data?.ok, n8nConfigured: data?.n8nConfigured, telegram: data?.telegram };
}

export async function sendDraftToTelegramReview(
    payload: Record<string, unknown>,
    caption?: string
): Promise<{ sent: boolean; draftId?: string; error?: string }> {
    const body = caption ? { ...payload, captionDraft: caption } : payload;
    const { data, error } = await supabase.functions.invoke('trigger-n8n-social', {
        body: { payload: body, skipN8n: true },
    });
    if (error) throw error;
    const tg = data?.telegram as { sent: boolean; draftId?: string; error?: string } | undefined;
    return tg ?? { sent: false, error: 'Sin respuesta Telegram' };
}

export async function triggerAllGroupStoriesToN8n(): Promise<{ sent: { template: string; ok: boolean }[] }> {
    const { data, error } = await supabase.functions.invoke('trigger-n8n-social', {
        body: { mode: 'all_groups' },
    });
    if (error) throw error;
    return { sent: data?.sent ?? [] };
}

export async function buildMatchSocialPayload(match: Match, story = false): Promise<Record<string, unknown>> {
    return exportSocialPayload({
        contentType: 'match_result',
        matchId: match.id,
        template: story ? 'match_result_story' : 'match_result_feed',
    });
}
