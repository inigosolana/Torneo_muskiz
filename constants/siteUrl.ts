/** URL pública del sitio (recuperación de contraseña, enlaces en correos). */
export const PUBLIC_SITE_URL =
    (import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined)?.replace(/\/$/, '') ||
    'https://torneomuskizbmplaya.es';

export const MANAGER_LOGIN_PATH = '/manager-login';

export function managerLoginUrl(): string {
    return `${PUBLIC_SITE_URL}${MANAGER_LOGIN_PATH}`;
}
