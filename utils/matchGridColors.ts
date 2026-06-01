import { getDivisionCodeFromRound } from '../services/muskizScheduleSimulator';

export type MatchPhaseTone =
    | 'group-A'
    | 'group-B'
    | 'group-C'
    | 'group-D'
    | 'cuartos'
    | 'semi'
    | 'final'
    | 'default';

export interface MatchGridColors {
    cell: string;
    badge: string;
    drag: string;
}

export const DIVISION_LABELS: Record<string, string> = {
    CF: 'Cad. F',
    CM: 'Cad. M',
    JF: 'Juv. F',
    JM: 'Juv. M',
    SF: 'Senior F',
    SM: 'Senior M',
    IF: 'Inf. F',
    IM: 'Inf. M',
};

const FALLBACK: MatchGridColors = {
    cell: 'bg-slate-50',
    badge: 'bg-slate-200 text-slate-700',
    drag: 'border-slate-400',
};

/** Estilos por categoría y tono (grupo / fase eliminatoria). Clases estáticas para Tailwind. */
const GRID_BY_DIVISION: Record<string, Record<MatchPhaseTone, MatchGridColors>> = {
    CF: {
        'group-A': { cell: 'bg-pink-50', badge: 'bg-pink-100 text-pink-950', drag: 'border-pink-300' },
        'group-B': { cell: 'bg-pink-100', badge: 'bg-pink-200 text-pink-950', drag: 'border-pink-400' },
        'group-C': { cell: 'bg-pink-200/70', badge: 'bg-pink-300 text-pink-950', drag: 'border-pink-500' },
        'group-D': { cell: 'bg-pink-200', badge: 'bg-pink-400 text-pink-950', drag: 'border-pink-600' },
        cuartos: { cell: 'bg-pink-100/90', badge: 'bg-pink-200 text-pink-950', drag: 'border-pink-500 border-dashed' },
        semi: { cell: 'bg-pink-200/60', badge: 'bg-pink-300 text-pink-950', drag: 'border-pink-600 border-dashed' },
        final: { cell: 'bg-pink-300', badge: 'bg-pink-400 text-pink-950', drag: 'border-pink-700 border-2' },
        default: { cell: 'bg-pink-50', badge: 'bg-pink-200 text-pink-950', drag: 'border-pink-300' },
    },
    CM: {
        'group-A': { cell: 'bg-blue-50', badge: 'bg-blue-100 text-blue-950', drag: 'border-blue-300' },
        'group-B': { cell: 'bg-blue-100', badge: 'bg-blue-200 text-blue-950', drag: 'border-blue-400' },
        'group-C': { cell: 'bg-blue-200/70', badge: 'bg-blue-300 text-blue-950', drag: 'border-blue-500' },
        'group-D': { cell: 'bg-blue-200', badge: 'bg-blue-400 text-blue-950', drag: 'border-blue-600' },
        cuartos: { cell: 'bg-blue-100/90', badge: 'bg-blue-200 text-blue-950', drag: 'border-blue-500 border-dashed' },
        semi: { cell: 'bg-blue-200/60', badge: 'bg-blue-300 text-blue-950', drag: 'border-blue-600 border-dashed' },
        final: { cell: 'bg-blue-300', badge: 'bg-blue-400 text-blue-950', drag: 'border-blue-700 border-2' },
        default: { cell: 'bg-blue-50', badge: 'bg-blue-200 text-blue-950', drag: 'border-blue-300' },
    },
    JF: {
        'group-A': { cell: 'bg-pink-50', badge: 'bg-pink-100 text-pink-950', drag: 'border-pink-300' },
        'group-B': { cell: 'bg-pink-100', badge: 'bg-pink-200 text-pink-950', drag: 'border-pink-400' },
        'group-C': { cell: 'bg-pink-200/70', badge: 'bg-pink-300 text-pink-950', drag: 'border-pink-500' },
        'group-D': { cell: 'bg-pink-200', badge: 'bg-pink-400 text-pink-950', drag: 'border-pink-600' },
        cuartos: { cell: 'bg-pink-100/90', badge: 'bg-pink-200 text-pink-950', drag: 'border-pink-500 border-dashed' },
        semi: { cell: 'bg-pink-200/60', badge: 'bg-pink-300 text-pink-950', drag: 'border-pink-600 border-dashed' },
        final: { cell: 'bg-pink-300', badge: 'bg-pink-400 text-pink-950', drag: 'border-pink-700 border-2' },
        default: { cell: 'bg-pink-50', badge: 'bg-pink-200 text-pink-950', drag: 'border-pink-300' },
    },
    JM: {
        'group-A': { cell: 'bg-blue-50', badge: 'bg-blue-100 text-blue-950', drag: 'border-blue-300' },
        'group-B': { cell: 'bg-blue-100', badge: 'bg-blue-200 text-blue-950', drag: 'border-blue-400' },
        'group-C': { cell: 'bg-blue-200/70', badge: 'bg-blue-300 text-blue-950', drag: 'border-blue-500' },
        'group-D': { cell: 'bg-blue-200', badge: 'bg-blue-400 text-blue-950', drag: 'border-blue-600' },
        cuartos: { cell: 'bg-blue-100/90', badge: 'bg-blue-200 text-blue-950', drag: 'border-blue-500 border-dashed' },
        semi: { cell: 'bg-blue-200/60', badge: 'bg-blue-300 text-blue-950', drag: 'border-blue-600 border-dashed' },
        final: { cell: 'bg-blue-300', badge: 'bg-blue-400 text-blue-950', drag: 'border-blue-700 border-2' },
        default: { cell: 'bg-blue-50', badge: 'bg-blue-200 text-blue-950', drag: 'border-blue-300' },
    },
    SF: {
        'group-A': { cell: 'bg-rose-50', badge: 'bg-rose-100 text-rose-950', drag: 'border-rose-300' },
        'group-B': { cell: 'bg-rose-100', badge: 'bg-rose-200 text-rose-950', drag: 'border-rose-400' },
        'group-C': { cell: 'bg-rose-200/70', badge: 'bg-rose-300 text-rose-950', drag: 'border-rose-500' },
        'group-D': { cell: 'bg-rose-200', badge: 'bg-rose-400 text-rose-950', drag: 'border-rose-600' },
        cuartos: { cell: 'bg-rose-100/90', badge: 'bg-rose-200 text-rose-950', drag: 'border-rose-500 border-dashed' },
        semi: { cell: 'bg-rose-200/60', badge: 'bg-rose-300 text-rose-950', drag: 'border-rose-600 border-dashed' },
        final: { cell: 'bg-rose-300', badge: 'bg-rose-400 text-rose-950', drag: 'border-rose-700 border-2' },
        default: { cell: 'bg-rose-50', badge: 'bg-rose-200 text-rose-950', drag: 'border-rose-300' },
    },
    SM: {
        'group-A': { cell: 'bg-cyan-50', badge: 'bg-cyan-100 text-cyan-950', drag: 'border-cyan-300' },
        'group-B': { cell: 'bg-cyan-100', badge: 'bg-cyan-200 text-cyan-950', drag: 'border-cyan-400' },
        'group-C': { cell: 'bg-cyan-200/70', badge: 'bg-cyan-300 text-cyan-950', drag: 'border-cyan-500' },
        'group-D': { cell: 'bg-cyan-200', badge: 'bg-cyan-400 text-cyan-950', drag: 'border-cyan-600' },
        cuartos: { cell: 'bg-cyan-100/90', badge: 'bg-cyan-200 text-cyan-950', drag: 'border-cyan-500 border-dashed' },
        semi: { cell: 'bg-cyan-200/60', badge: 'bg-cyan-300 text-cyan-950', drag: 'border-cyan-600 border-dashed' },
        final: { cell: 'bg-cyan-300', badge: 'bg-cyan-400 text-cyan-950', drag: 'border-cyan-700 border-2' },
        default: { cell: 'bg-cyan-50', badge: 'bg-cyan-200 text-cyan-950', drag: 'border-cyan-300' },
    },
    IF: {
        'group-A': { cell: 'bg-emerald-50', badge: 'bg-emerald-100 text-emerald-950', drag: 'border-emerald-300' },
        'group-B': { cell: 'bg-emerald-100', badge: 'bg-emerald-200 text-emerald-950', drag: 'border-emerald-400' },
        'group-C': { cell: 'bg-emerald-200/70', badge: 'bg-emerald-300 text-emerald-950', drag: 'border-emerald-500' },
        'group-D': { cell: 'bg-emerald-200', badge: 'bg-emerald-400 text-emerald-950', drag: 'border-emerald-600' },
        cuartos: { cell: 'bg-emerald-100/90', badge: 'bg-emerald-200 text-emerald-950', drag: 'border-emerald-500 border-dashed' },
        semi: { cell: 'bg-emerald-200/60', badge: 'bg-emerald-300 text-emerald-950', drag: 'border-emerald-600 border-dashed' },
        final: { cell: 'bg-emerald-300', badge: 'bg-emerald-400 text-emerald-950', drag: 'border-emerald-700 border-2' },
        default: { cell: 'bg-emerald-50', badge: 'bg-emerald-200 text-emerald-950', drag: 'border-emerald-300' },
    },
    IM: {
        'group-A': { cell: 'bg-teal-50', badge: 'bg-teal-100 text-teal-950', drag: 'border-teal-300' },
        'group-B': { cell: 'bg-teal-100', badge: 'bg-teal-200 text-teal-950', drag: 'border-teal-400' },
        'group-C': { cell: 'bg-teal-200/70', badge: 'bg-teal-300 text-teal-950', drag: 'border-teal-500' },
        'group-D': { cell: 'bg-teal-200', badge: 'bg-teal-400 text-teal-950', drag: 'border-teal-600' },
        cuartos: { cell: 'bg-teal-100/90', badge: 'bg-teal-200 text-teal-950', drag: 'border-teal-500 border-dashed' },
        semi: { cell: 'bg-teal-200/60', badge: 'bg-teal-300 text-teal-950', drag: 'border-teal-600 border-dashed' },
        final: { cell: 'bg-teal-300', badge: 'bg-teal-400 text-teal-950', drag: 'border-teal-700 border-2' },
        default: { cell: 'bg-teal-50', badge: 'bg-teal-200 text-teal-950', drag: 'border-teal-300' },
    },
};

/** Semifinales: mismo aspecto que finales; finales con anillo extra para distinguirlas. */
for (const palette of Object.values(GRID_BY_DIVISION)) {
    const baseFinal = palette.final;
    palette.semi = { ...baseFinal };
    palette.final = {
        ...baseFinal,
        drag: `${baseFinal.drag} ring-2 ring-offset-1 ring-black/15`,
    };
}

const TONE_LABELS: Record<MatchPhaseTone, string> = {
    'group-A': 'Gr. A',
    'group-B': 'Gr. B',
    'group-C': 'Gr. C',
    'group-D': 'Gr. D',
    cuartos: 'Cuartos',
    semi: 'Semis',
    final: 'Final',
    default: 'Grupos',
};

/** Detecta grupo (A–D) o fase eliminatoria desde el campo `round`. */
export function getMatchPhaseTone(round?: string): MatchPhaseTone {
    if (!round) return 'default';
    if (/\bFinal\b/i.test(round)) return 'final';
    if (/\bSemis?\b/i.test(round)) return 'semi';
    if (/\bRepesca\b/i.test(round) || /\bConsolaci[oó]n\b/i.test(round)) return 'cuartos';
    if (/\bCuartos?\b/i.test(round)) return 'cuartos';

    const afterCode = round.match(/\b(?:CF|CM|JF|JM|SF|SM|IF|IM)-([A-Da-d])\b/);
    if (afterCode) return `group-${afterCode[1]!.toUpperCase()}` as MatchPhaseTone;

    const grupo = round.match(/Grupo\s+([A-Da-d])\b/i);
    if (grupo) return `group-${grupo[1]!.toUpperCase()}` as MatchPhaseTone;

    const grDot = round.match(/Gr\.\s*([A-Da-d])\b/i);
    if (grDot) return `group-${grDot[1]!.toUpperCase()}` as MatchPhaseTone;

    const loose = round.match(/(?:^|[\s·-])([A-Da-d])(?:\s|$|·|-)/);
    if (loose && /Grupos/i.test(round)) return `group-${loose[1]!.toUpperCase()}` as MatchPhaseTone;

    return 'default';
}

export function getMatchGridColors(round?: string): MatchGridColors {
    const code = getDivisionCodeFromRound(round);
    if (!code || !GRID_BY_DIVISION[code]) return FALLBACK;
    const tone = getMatchPhaseTone(round);
    return GRID_BY_DIVISION[code][tone] ?? GRID_BY_DIVISION[code].default;
}

export function getMatchGridLegendLabel(code: string, tone: MatchPhaseTone): string {
    const cat = DIVISION_LABELS[code] ?? code;
    const toneLabel = TONE_LABELS[tone];
    if (tone.startsWith('group-')) return `${code} · ${cat} · ${toneLabel}`;
    return `${code} · ${cat} · ${toneLabel}`;
}

export interface GridLegendEntry {
    key: string;
    code: string;
    tone: MatchPhaseTone;
    colors: MatchGridColors;
    label: string;
}

export function collectGridLegendEntries(
    rounds: (string | undefined)[],
    filterCode?: string | null
): GridLegendEntry[] {
    const seen = new Map<string, GridLegendEntry>();

    for (const round of rounds) {
        const code = getDivisionCodeFromRound(round);
        if (!code) continue;
        if (filterCode && code !== filterCode) continue;
        const tone = getMatchPhaseTone(round);
        const key = `${code}:${tone}`;
        if (seen.has(key)) continue;
        seen.set(key, {
            key,
            code,
            tone,
            colors: getMatchGridColors(round),
            label: getMatchGridLegendLabel(code, tone),
        });
    }

    const order: MatchPhaseTone[] = ['group-A', 'group-B', 'group-C', 'group-D', 'cuartos', 'semi', 'final', 'default'];
    return [...seen.values()].sort((a, b) => {
        if (a.code !== b.code) return a.code.localeCompare(b.code);
        return order.indexOf(a.tone) - order.indexOf(b.tone);
    });
}

/** Color base de categoría (sin tono de grupo) para cabeceras de sección. */
export function getDivisionBaseColors(code: string | null | undefined): MatchGridColors {
    if (!code || !GRID_BY_DIVISION[code]) return FALLBACK;
    return GRID_BY_DIVISION[code].default;
}
