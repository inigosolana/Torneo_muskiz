import { supabase } from './supabaseClient';

export async function sendSocialPostImageToTelegram(
    imageBase64: string,
    caption?: string,
): Promise<{ ok: boolean; results?: { chatId: string; ok: boolean; error?: string }[]; error?: string }> {
    const { data, error } = await supabase.functions.invoke('send-telegram-image', {
        body: { imageBase64, caption: caption ?? '' },
    });
    if (error) {
        return { ok: false, error: error.message };
    }
    const payload = data as { ok?: boolean; results?: { chatId: string; ok: boolean; error?: string }[]; error?: string };
    if (payload?.error) return { ok: false, error: payload.error };
    return { ok: !!payload?.ok, results: payload.results };
}
