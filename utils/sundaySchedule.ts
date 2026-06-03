import type { Match } from '../types';

/** Pausa domingo antes de finales (sin partidos). */
export const SUNDAY_BREAK_START = '14:15';
/** Inicio de finales domingo (IF + IM). */
export const SUNDAY_FINAL_START = '14:25';

export function isSundayFinalMatch(m: Pick<Match, 'round'>): boolean {
    const r = m.round ?? '';
    return /\bFinal\b/i.test(r) && !/\bSemi\b/i.test(r);
}

/** Mueve finales de 14:50 → 14:25; resto del domingo sin cambios. */
export function moveSundayFinalsTo1425(matches: Match[]): { matches: Match[]; changed: boolean } {
    let changed = false;
    const next = matches.map((m) => {
        if (!isSundayFinalMatch(m) || m.time === SUNDAY_FINAL_START) return m;
        if (m.time === '14:50' || m.time === '14:25') {
            changed = true;
            return { ...m, time: SUNDAY_FINAL_START };
        }
        return m;
    });
    return { matches: next, changed };
}
