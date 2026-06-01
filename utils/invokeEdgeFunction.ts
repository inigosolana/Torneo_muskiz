import { FunctionsHttpError } from '@supabase/supabase-js';

/** Extrae mensaje de error legible de una invocación a Edge Function. */
export async function getEdgeFunctionErrorMessage(
    error: unknown,
    data: unknown
): Promise<string> {
    if (data && typeof data === 'object' && 'error' in data) {
        const msg = (data as { error?: string }).error;
        if (msg) return msg;
    }

    if (error instanceof FunctionsHttpError) {
        try {
            const body = await error.context.json();
            if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') {
                return body.error;
            }
        } catch {
            /* ignore */
        }
        return error.message || 'Error del servidor';
    }

    if (error instanceof Error) return error.message;
    return 'No se pudo completar la solicitud. Inténtalo más tarde.';
}
