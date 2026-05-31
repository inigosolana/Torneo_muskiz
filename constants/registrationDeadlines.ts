/** Cierre a las 00:00 del día siguiente (hora local): el último día inclusive sigue abierto todo el día. */
export const TEAM_REGISTRATION_CLOSE_AT = '2026-06-02T00:00:00';
export const TEAM_REGISTRATION_LAST_DAY = '1 de junio';

export const PLAYER_LICENSE_CLOSE_AT = '2026-06-05T00:00:00';
export const PLAYER_LICENSE_LAST_DAY = '4 de junio';

export function isPastDeadline(closeAtIso: string): boolean {
  return Date.now() > new Date(closeAtIso).getTime();
}
