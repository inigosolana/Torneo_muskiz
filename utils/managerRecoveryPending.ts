/** Ruta dedicada para restablecer contraseña de responsables. */
export const MANAGER_PASSWORD_RESET_PATH = '/manager-reset-password';

const STORAGE_KEY = 'manager_password_recovery_pending';

export function isManagerRecoveryPending(): boolean {
    if (typeof window === 'undefined') return false;
    return sessionStorage.getItem(STORAGE_KEY) === '1';
}

export function setManagerRecoveryPending(): void {
    if (typeof window === 'undefined') return;
    sessionStorage.setItem(STORAGE_KEY, '1');
}

export function clearManagerRecoveryPending(): void {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(STORAGE_KEY);
}

function urlHasRecoveryTokens(): boolean {
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

/**
 * Debe ejecutarse antes de createClient: Supabase borra el hash con detectSessionInUrl
 * y React ya no puede detectar recuperación.
 */
export function captureManagerRecoveryFromUrl(): void {
    if (typeof window === 'undefined') return;
    if (!urlHasRecoveryTokens()) return;

    setManagerRecoveryPending();

    const { pathname, search, hash } = window.location;
    if (pathname === '/manager-login') {
        const dest = `${MANAGER_PASSWORD_RESET_PATH}${search}${hash}`;
        window.location.replace(dest);
    }
}
