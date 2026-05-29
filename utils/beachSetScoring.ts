import type { BeachSetScores, Match } from '../types';

/** Marcadores finales válidos en balonmano playa (sets ganados). */
export const VALID_SETS_DISPLAY = ['2:0', '2:1', '0:2', '1:2'] as const;

export type ValidSetsDisplay = (typeof VALID_SETS_DISPLAY)[number];

export function emptyBeachSetScores(): BeachSetScores {
    return {
        set1A: null,
        set1B: null,
        set2A: null,
        set2B: null,
        shootoutA: null,
        shootoutB: null,
    };
}

export function getMatchSetScores(match: Match): BeachSetScores {
    return match.report?.setScores ?? emptyBeachSetScores();
}

function setWinner(a: number | null, b: number | null): 'A' | 'B' | null {
    if (a === null || b === null) return null;
    if (a === b) return null;
    return a > b ? 'A' : 'B';
}

export interface ComputedSetsResult {
    setsA: number;
    setsB: number;
    finished: boolean;
    needsShootout: boolean;
    validDisplay: boolean;
}

/** Calcula sets ganados (2:0, 2:1, …) a partir del detalle de cada set y shootout. */
export function computeSetsResultFromDetail(scores: BeachSetScores): ComputedSetsResult | null {
    const w1 = setWinner(scores.set1A, scores.set1B);
    const w2 = setWinner(scores.set2A, scores.set2B);

    if (!w1 || !w2) {
        const partialA = w1 === 'A' ? 1 : w2 === 'A' ? 1 : 0;
        const partialB = w1 === 'B' ? 1 : w2 === 'B' ? 1 : 0;
        return {
            setsA: partialA,
            setsB: partialB,
            finished: false,
            needsShootout: w1 && w2 ? w1 !== w2 && partialA === 1 && partialB === 1 : false,
            validDisplay: false,
        };
    }

    let setsA = (w1 === 'A' ? 1 : 0) + (w2 === 'A' ? 1 : 0);
    let setsB = (w1 === 'B' ? 1 : 0) + (w2 === 'B' ? 1 : 0);

    if (setsA === 2) {
        return { setsA: 2, setsB: 0, finished: true, needsShootout: false, validDisplay: true };
    }
    if (setsB === 2) {
        return { setsA: 0, setsB: 2, finished: true, needsShootout: false, validDisplay: true };
    }

    if (setsA === 1 && setsB === 1) {
        const so = setWinner(scores.shootoutA, scores.shootoutB);
        if (!so) {
            return { setsA: 1, setsB: 1, finished: false, needsShootout: true, validDisplay: false };
        }
        if (so === 'A') {
            return { setsA: 2, setsB: 1, finished: true, needsShootout: true, validDisplay: true };
        }
        return { setsA: 1, setsB: 2, finished: true, needsShootout: true, validDisplay: true };
    }

    return null;
}

export function formatSetsDisplay(setsA: number | null, setsB: number | null): string {
    if (setsA === null || setsB === null) return '—';
    return `${setsA}:${setsB}`;
}

export function isValidSetsPair(setsA: number, setsB: number): boolean {
    const key = `${setsA}:${setsB}` as ValidSetsDisplay;
    return VALID_SETS_DISPLAY.includes(key);
}

/** Marcador a mostrar en tabla (solo sets; usa detalle o scoreA/scoreB legacy). */
export function getMatchSetsDisplay(match: Match): string {
    const detail = match.report?.setScores;
    if (detail) {
        const computed = computeSetsResultFromDetail(detail);
        if (computed?.finished && computed.validDisplay) {
            return formatSetsDisplay(computed.setsA, computed.setsB);
        }
    }
    if (match.scoreA !== null && match.scoreB !== null && isValidSetsPair(match.scoreA, match.scoreB)) {
        return formatSetsDisplay(match.scoreA, match.scoreB);
    }
    if (match.scoreA !== null && match.scoreB !== null) {
        return formatSetsDisplay(match.scoreA, match.scoreB);
    }
    return '—';
}

/** Sincroniza scoreA/scoreB y status desde setScores. */
export function applySetScoresToMatch(match: Match, setScores: BeachSetScores): Match {
    const computed = computeSetsResultFromDetail(setScores);
    const report = {
        type: (match.report?.type ?? 'DIGITAL') as 'DIGITAL' | 'IMAGE',
        ...match.report,
        setScores,
    };

    if (computed?.finished && computed.validDisplay) {
        return {
            ...match,
            scoreA: computed.setsA,
            scoreB: computed.setsB,
            status: 'FINISHED',
            report,
        };
    }

    return {
        ...match,
        scoreA: null,
        scoreB: null,
        status: 'SCHEDULED',
        report,
    };
}
