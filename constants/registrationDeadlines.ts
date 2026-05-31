/** Cierre a las 00:00 del día siguiente (hora local): el último día inclusive sigue abierto todo el día. */
export const TEAM_REGISTRATION_CLOSE_AT = '2026-06-02T00:00:00';
export const TEAM_REGISTRATION_LAST_DAY = '1 de junio';

export const PLAYER_LICENSE_CLOSE_AT = '2026-06-05T00:00:00';
export const PLAYER_LICENSE_LAST_DAY = '4 de junio';

export function isPastDeadline(closeAtIso: string): boolean {
  return Date.now() > new Date(closeAtIso).getTime();
}

export interface RegistrationTimeLeft {
  ms: number;
  hours: number;
  minutes: number;
  seconds: number;
  isClosed: boolean;
}

/** Tiempo restante hasta el cierre (inclusive hasta fin del último día). */
export function getRegistrationTimeLeft(
  closeAtIso: string = TEAM_REGISTRATION_CLOSE_AT,
  now = Date.now(),
): RegistrationTimeLeft {
  const ms = Math.max(0, new Date(closeAtIso).getTime() - now);
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return { ms, hours, minutes, seconds, isClosed: ms === 0 };
}

/** Menos de 48 h hasta el cierre. */
export const REGISTRATION_IMMINENT_MS = 48 * 3_600_000;
