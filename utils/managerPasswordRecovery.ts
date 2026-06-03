import type { SupabaseClient } from '@supabase/supabase-js';
import {
    clearManagerRecoveryPending,
    isManagerRecoveryPending,
    MANAGER_PASSWORD_RESET_PATH,
    setManagerRecoveryPending,
} from './managerRecoveryPending';

export type RecoveryBootstrapResult =
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready' }
    | { status: 'error'; message: string };

function decodeAuthError(raw: string): string {
    try {
        return decodeURIComponent(raw.replace(/\+/g, ' '));
    } catch {
        return raw;
    }
}

/** Indica si la URL actual parece un enlace de recuperación de contraseña. */
export function urlLooksLikePasswordRecovery(): boolean {
    if (typeof window === 'undefined') return false;
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const searchParams = new URLSearchParams(window.location.search);
    const type = hashParams.get('type') || searchParams.get('type');
    if (type === 'recovery') return true;
    if (searchParams.get('token_hash')) return true;
    if (hashParams.get('access_token') && hashParams.get('refresh_token')) return true;
    if (searchParams.get('code')) return true;
    return false;
}

function readAuthErrorFromUrl(): string | null {
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const searchParams = new URLSearchParams(window.location.search);
    const raw =
        hashParams.get('error_description') ||
        hashParams.get('error') ||
        searchParams.get('error_description') ||
        searchParams.get('error');
    return raw ? decodeAuthError(raw) : null;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRecoverySession(
    supabase: SupabaseClient,
    maxMs = 4000
): Promise<boolean> {
    const steps = Math.ceil(maxMs / 100);
    for (let i = 0; i < steps; i++) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) return true;
        await sleep(100);
    }
    return false;
}

/**
 * Activa la sesión de recuperación a partir del enlace del correo (hash, token_hash o code).
 */
export async function bootstrapManagerPasswordRecovery(
    supabase: SupabaseClient
): Promise<RecoveryBootstrapResult> {
    if (typeof window === 'undefined') return { status: 'idle' };

    const urlError = readAuthErrorFromUrl();
    if (urlError) {
        return { status: 'error', message: urlError };
    }

    const fromUrl = urlLooksLikePasswordRecovery();
    const pending = isManagerRecoveryPending();

    if (!fromUrl && !pending) {
        return { status: 'idle' };
    }

    if (fromUrl) {
        setManagerRecoveryPending();
    }

    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const searchParams = new URLSearchParams(window.location.search);
    const type = hashParams.get('type') || searchParams.get('type');

    try {
        const tokenHash = searchParams.get('token_hash');
        if (tokenHash && type === 'recovery') {
            const { error } = await supabase.auth.verifyOtp({
                type: 'recovery',
                token_hash: tokenHash,
            });
            if (error) throw error;
        } else {
            const accessToken = hashParams.get('access_token');
            const refreshToken = hashParams.get('refresh_token');
            if (accessToken && refreshToken) {
                const { error } = await supabase.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken,
                });
                if (error) throw error;
            } else {
                const code = searchParams.get('code');
                if (code) {
                    const { error } = await supabase.auth.exchangeCodeForSession(code);
                    if (error) {
                        const { data: { session } } = await supabase.auth.getSession();
                        if (!session) throw error;
                    }
                } else if (pending) {
                    const gotSession = await waitForRecoverySession(supabase);
                    if (!gotSession) {
                        return {
                            status: 'error',
                            message:
                                'No se pudo activar el enlace. Solicita uno nuevo y ábrelo en el mismo navegador (sin incógnito).',
                        };
                    }
                }
            }
        }

        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (!session) {
            return {
                status: 'error',
                message:
                    'No se pudo activar el enlace. Solicita uno nuevo desde el inicio de sesión de responsables.',
            };
        }

        window.history.replaceState({}, '', MANAGER_PASSWORD_RESET_PATH);
        return { status: 'ready' };
    } catch (err) {
        const msg =
            err instanceof Error
                ? err.message
                : 'Enlace inválido o caducado. Solicita un correo nuevo.';
        if (/code verifier|both auth code/i.test(msg)) {
            return {
                status: 'error',
                message:
                    'El enlace no se pudo validar en este dispositivo. Solicita un correo nuevo y ábrelo en el mismo navegador (sin incógnito).',
            };
        }
        return { status: 'error', message: msg };
    }
}
