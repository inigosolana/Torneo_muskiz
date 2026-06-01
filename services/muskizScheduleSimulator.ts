/**
 * Simulador determinístico de calendario fin de semana Muskiz (balonmano playa).
 *
 * Reglas por defecto:
 * - Viernes: solo cadetes (♀♂), 17:00–22:00, 6 campos.
 * - Sábado: juvenil + senior (♀♂), 9:00–22:00 (cuadrícula hasta ~21:00), comida fija 14:15–15:45, 6 campos.
 * - Domingo: infantiles (♀♂), 9:00–15:00, 4 campos.
 *
 * Formato por número de equipos en la categoría (Viernes, Sábado y Domingo):
 * - 2–6 equipos : liguilla (1 grupo) → final 1º vs 2º (sin semifinales)
 * - 7 equipos   : grupos 3+4 → consolación (3ºA vs 3ºB) → semis (2 mejores/grupo) → final
 * - 8–10 equipos : 2 grupos → semis → final (9: 4+5)
 * - ≥11 equipos  : 3 grupos (11: 4+4+3) → repesca 2 peores 3º + cuartos + semis → final
 *
 * El simulador intenta que cada equipo juegue ≥4 partidos reales; si no cabe, baja a ≥3.
 * Los partidos sin hueco aparecen con hora PENDIENTE (no se bloquea la generación).
 * Las fases de grupos/cuartos se programan antes que semis/finales.
 * Las finales se reservan en las últimas franjas del día (cierre del calendario).
 * Orden estricto: todos los grupos → cuartos → semis → finales (sin mezclar fases).
 * Entre fases se usa un snapshot de maxAssignedEndMin antes de cada lote (no nextPhaseSlotMin dinámico).
 * Máximo 2 partidos consecutivos por equipo; nunca 3 seguidos (rechazo duro en scoreSlot).
 * Se mezclan categorías en la tabla (interleaved) para mayor variedad.
 * Evita partidos seguidos del mismo equipo cuando hay hueco; si no caben todos,
 * permite hasta 2 consecutivos para reducir PENDIENTE.
 */
import type { Match, Team } from '../types';

export type MuskizScheduleDayLabel = 'Viernes' | 'Sábado' | 'Domingo';

/** Mínimo de equipos por grupo de competición. */
export const MIN_TEAMS_PER_GROUP = 3;

/** Mínimo global por defecto si la categoría no tiene valor configurado. */
export const MIN_REAL_MATCHES_PER_TEAM = 3;
/** @deprecated Usar min_matches_per_team por categoría (tabla categories). */
export const TARGET_REAL_MATCHES_PER_TEAM = 4;

export type DivisionMinMatchesMap = Partial<Record<Team['division'], number>>;

/** Comida sábado fija para todas las categorías. */
const SATURDAY_LUNCH_START = '14:15';
const SATURDAY_LUNCH_DEFAULT_END = '15:45';

export interface MuskizBuildResult {
    matches: Match[];
    /** Bloqueo total (p. ej. sin equipos). */
    error?: string;
    /** Aviso: borrador generado pero revisar huecos o mínimos. */
    warning?: string;
    /** Comida fija del sábado (14:15–15:45). */
    lunchUsed?: { start: string; end: string };
}

export interface MuskizSimulatorOptions {
    /** Minutos por bloque partido+cambio (Excel referencia ~35). */
    slotDurationMins?: number;
    /** @deprecated La comida del sábado es fija (14:15–15:45); se ignora. */
    lunchStart?: string;
    /** @deprecated La comida del sábado es fija (14:15–15:45); se ignora. */
    lunchEnd?: string;
    /** Mínimo (y objetivo) de partidos reales por equipo, por categoría. */
    divisionMinMatches?: DivisionMinMatchesMap;
    /**
     * Si quedan partidos PENDIENTE tras el greedy, intenta llamadas ligeras a Gemini
     * (lotes de 24, máx. 3 por día). Por defecto true en el flujo híbrido del admin.
     */
    aiSlotAssist?: boolean;
    /** Notas del organizador (campo «Formato del torneo» del borrador). */
    organizerNotes?: string;
}

/** Máximo de partidos sin hueco por petición a Gemini. */
export const MUSKIZ_AI_SLOT_ASSIST_MAX = 24;
/** Máximo de peticiones Gemini por día (evita agotar cuota). */
export const MUSKIZ_AI_MAX_CALLS_PER_DAY = 3;

/** Reglas Muskiz resumidas para el prompt de IA (el calendario base ya las cumple). */
export const MUSKIZ_RULES_SUMMARY = [
    'Viernes: cadetes. Sábado: juvenil/senior, comida 14:15–15:45. Domingo: infantiles.',
    '2–6: liguilla + final. 7: 3+4 + consolación + semis + final. 8–10: 2 grupos + semis + final. ≥11: 3 grupos + repesca 3º + cuartos + semis + final.',
    'Orden: grupos → consolación/repesca (si aplica) → cuartos (≥11) → semis → finales.',
    'Evitar dos partidos seguidos del mismo equipo si hay hueco.',
].join(' ');

export interface MuskizSlotOptimizePayload {
    day: MuskizScheduleDayLabel;
    slotDurationMins: number;
    playStart: string;
    playEndExclusive: string;
    courts: string[];
    lunch?: { start: string; end: string };
    slots: string[];
    placed: { id: string; time: string; court: string; teamA: string; teamB: string; round?: string }[];
    pending: { id: string; teamA: string; teamB: string; round: string }[];
    organizerNotes?: string;
    rulesSummary?: string;
}

export interface MuskizSlotAssignment {
    id: string;
    time: string;
    court: string;
}

/** Construye el mapa categoría → mínimo desde filas de `categories`. */
export function buildDivisionMinMatchesFromCategories(
    categories: { name: string; min_matches_per_team?: number | null }[]
): DivisionMinMatchesMap {
    const out: DivisionMinMatchesMap = {};
    for (const cat of categories) {
        const n = Number(cat.min_matches_per_team);
        if (cat.name && Number.isFinite(n) && n >= 1) {
            out[cat.name as Team['division']] = Math.floor(n);
        }
    }
    return out;
}

/** Mínimo de partidos reales para una categoría (fallback global 3). */
export function resolveMinMatchesForDivision(
    division: Team['division'],
    options?: MuskizSimulatorOptions
): number {
    const configured = options?.divisionMinMatches?.[division];
    if (configured != null && Number.isFinite(configured) && configured >= 1) {
        return Math.floor(configured);
    }
    return MIN_REAL_MATCHES_PER_TEAM;
}

// ─── División → código corto ───────────────────────────────────────────────
export const DIVISION_CODE: Record<Team['division'], string> = {
    'Infantil Femenino': 'IF',
    'Infantil Masculino': 'IM',
    'Cadete Femenino': 'CF',
    'Cadete Masculino': 'CM',
    'Juvenil Femenino': 'JF',
    'Juvenil Masculino': 'JM',
    'Senior Femenino': 'SF',
    'Senior Masculino': 'SM',
};

const CADETES: Team['division'][] = ['Cadete Femenino', 'Cadete Masculino'];
const JUV_SEN: Team['division'][] = ['Juvenil Femenino', 'Juvenil Masculino', 'Senior Femenino', 'Senior Masculino'];
const INFANTIL: Team['division'][] = ['Infantil Femenino', 'Infantil Masculino'];

// ─── Utilidades de tiempo ──────────────────────────────────────────────────
function timeToMinutes(t: string): number {
    if (!t || t === 'PENDIENTE') return 0;
    const [h, m] = t.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
}
function minutesToTime(mins: number): string {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Slots válidos dentro de [dayStart, dayEnd) donde quepa un bloque de slotMins. */
function generateSlotStarts(
    dayStart: string,
    dayEnd: string,
    slotMins: number,
    lunch?: { start: string; end: string }
): number[] {
    const out: number[] = [];
    let t = timeToMinutes(dayStart);
    const endExclusive = timeToMinutes(dayEnd);
    while (t + slotMins <= endExclusive) {
        const slotEnd = t + slotMins;
        if (lunch) {
            const ls = timeToMinutes(lunch.start);
            const le = timeToMinutes(lunch.end);
            if (t < le && slotEnd > ls) {
                t = le;
                continue;
            }
        }
        out.push(t);
        t += slotMins;
    }
    return out;
}

// ─── Fases ─────────────────────────────────────────────────────────────────
type Phase = 'GRUPOS' | 'REPESCA' | 'CUARTOS' | 'SEMIS' | 'FINAL';

interface RawMatchSpec {
    teamA: string;
    teamB: string;
    roundLabel: string;
    division: Team['division'];
    phase: Phase;
    phaseOrder: number;
}

// ─── Round-robin ───────────────────────────────────────────────────────────
function roundRobinPairs(names: string[]): { a: string; b: string }[] {
    const n = names.length;
    if (n < 2) return [];
    const pairs: { a: string; b: string }[] = [];
    for (let i = 0; i < n; i++)
        for (let j = i + 1; j < n; j++)
            pairs.push({ a: names[i]!, b: names[j]! });
    return pairs;
}

// ─── Cálculo de grupos ─────────────────────────────────────────────────────
export function autoGroupCount(n: number): number {
    if (n < 2) return 0;
    if (n <= 6) return 1; // liguilla → final
    if (n >= 11) return 3; // ≥11 → 3 grupos → repesca + cuartos + semis + final
    return 2; // 7–10 → 2 grupos → semis + final (7: + consolación 3º)
}

/** ¿Formato con cuartos de final? Con 11 equipos o más. */
export function usesQuarterFinalFormat(n: number): boolean {
    return n >= 11;
}

/** Tamaños fijos de grupo A, B… cuando el formato lo exige. */
export function expectedGroupSizesForTeamCount(n: number): number[] | null {
    if (n === 7) return [3, 4];
    if (n === 9) return [4, 5];
    if (n === 11) return [4, 4, 3];
    return null;
}

function splitNamesIntoGroups(sorted: string[], groupCount: number): { key: string; names: string[] }[] {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
    const n = sorted.length;
    if (groupCount <= 0 || n === 0) return [];
    const base = Math.floor(n / groupCount);
    const extras = n % groupCount;
    const groups: { key: string; names: string[] }[] = [];
    let idx = 0;
    for (let i = 0; i < groupCount; i++) {
        const size = base + (i < extras ? 1 : 0);
        if (size > 0) {
            groups.push({ key: letters[i] ?? String(i + 1), names: sorted.slice(idx, idx + size) });
            idx += size;
        }
    }
    return groups;
}

/** Reparto automático; 7 y 9 equipos usan tamaños fijos 3+4 y 4+5. */
function splitNamesForTeamCount(
    sorted: string[],
    n: number,
    groupCount: number
): { key: string; names: string[] }[] {
    const fixed = expectedGroupSizesForTeamCount(n);
    if (fixed && groupCount === fixed.length) {
        const letters = ['A', 'B', 'C', 'D', 'E', 'F'];
        let idx = 0;
        return fixed.map((size, i) => {
            const names = sorted.slice(idx, idx + size);
            idx += size;
            return { key: letters[i] ?? String(i + 1), names };
        });
    }
    return splitNamesIntoGroups(sorted, groupCount);
}

/** Fusiona grupos con menos de MIN_TEAMS_PER_GROUP en otros hasta cumplir el mínimo. */
function mergeUndersizedGroups(groups: { key: string; names: string[] }[]): { key: string; names: string[] }[] {
    const out = groups.map((g) => ({ ...g, names: [...g.names] }));
    for (let guard = 0; guard < 20; guard++) {
        const small = out.find((g) => g.names.length > 0 && g.names.length < MIN_TEAMS_PER_GROUP);
        if (!small) break;
        const target = out
            .filter((g) => g !== small && g.names.length > 0)
            .sort((a, b) => a.names.length - b.names.length)[0];
        if (!target) break;
        target.names.push(...small.names);
        small.names = [];
    }
    return out
        .filter((g) => g.names.length > 0)
        .map((g, i) => ({
            key: String.fromCharCode(65 + i),
            names: g.names.sort((a, b) => a.localeCompare(b, 'es')),
        }));
}

/**
 * Si todos los equipos tienen competitionGroup → los respeta (fusionando si hace falta para ≥3).
 * Si no: asigna automáticamente sin grupos de menos de 3 equipos.
 */
export function computeGroups(teamList: Team[]): { key: string; names: string[] }[] | null {
    if (teamList.length === 0) return [];
    const n = teamList.length;

    const withG = teamList.filter((t) => (t.competitionGroup ?? '').trim().length > 0);
    if (withG.length === teamList.length) {
        const map = new Map<string, string[]>();
        for (const t of teamList) {
            const k = (t.competitionGroup ?? '').trim();
            if (!map.has(k)) map.set(k, []);
            map.get(k)!.push(t.name);
        }
        const raw = [...map.entries()]
            .sort(([a], [b]) => a.localeCompare(b, 'es'))
            .map(([key, names]) => ({ key, names: names.sort((x, y) => x.localeCompare(y, 'es')) }));
        return raw;
    }

    const sorted = [...teamList]
        .sort((x, y) => x.name.localeCompare(y.name, 'es'))
        .map((t) => t.name);

    let groupCount = autoGroupCount(n);
    while (groupCount > 1 && Math.floor(n / groupCount) < MIN_TEAMS_PER_GROUP) groupCount--;
    if (groupCount <= 0) return [];
    return mergeUndersizedGroups(splitNamesForTeamCount(sorted, n, groupCount));
}

export interface DivisionMatchBreakdown {
    grupos: number;
    /** Repesca entre los dos peores 3º (formato ≥11, 3 grupos). */
    repesca: number;
    cuartos: number;
    semis: number;
    final: number;
    /** Repesca + cuartos + semis + final */
    eliminatoria: number;
    total: number;
}

/** Totales de partidos previstos por fase (formato actual de la categoría). */
export function countDivisionMatchBreakdown(
    teamList: Team[],
    options?: MuskizSimulatorOptions
): { planned: DivisionMatchBreakdown; withMinPerTeam: DivisionMatchBreakdown } {
    const empty: DivisionMatchBreakdown = {
        grupos: 0,
        repesca: 0,
        cuartos: 0,
        semis: 0,
        final: 0,
        eliminatoria: 0,
        total: 0,
    };
    if (teamList.length < 2) {
        return { planned: empty, withMinPerTeam: empty };
    }

    const min = resolveMinMatchesForDivision(divisionForTeams(teamList), options);
    const base = specsForPaidDivision(teamList);
    const full = ensureMinRealMatchesPerTeam(teamList, base, min);

    const summarize = (specs: RawMatchSpec[]): DivisionMatchBreakdown => {
        let grupos = 0;
        let repesca = 0;
        let cuartos = 0;
        let semis = 0;
        let finals = 0;
        for (const s of specs) {
            if (s.phase === 'GRUPOS') grupos++;
            else if (s.phase === 'REPESCA') repesca++;
            else if (s.phase === 'CUARTOS') cuartos++;
            else if (s.phase === 'SEMIS') semis++;
            else if (s.phase === 'FINAL') finals++;
        }
        const eliminatoria = repesca + cuartos + semis + finals;
        return {
            grupos,
            repesca,
            cuartos,
            semis,
            final: finals,
            eliminatoria,
            total: specs.length,
        };
    };

    return {
        planned: summarize(base),
        withMinPerTeam: summarize(full),
    };
}

/** Partidos previstos por equipo en la categoría (fase grupos + extras hasta objetivo). */
export function countMatchesPerTeamForDivision(
    teamList: Team[],
    options?: MuskizSimulatorOptions
): { name: string; matches: number }[] {
    if (teamList.length === 0) return [];
    const min = resolveMinMatchesForDivision(divisionForTeams(teamList), options);
    const base = specsForPaidDivision(teamList);
    const specs = ensureMinRealMatchesPerTeam(teamList, base, min);
    const realNames = new Set(teamList.map((t) => t.name));
    const counts = countRealRealMatches(specs, realNames);
    return teamList
        .map((t) => ({ name: t.name, matches: counts.get(t.name) ?? 0 }))
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function divisionForTeams(teams: Team[]): Team['division'] {
    return teams[0]!.division;
}

// ─── Especificaciones de partido (sin hora ni pista) ───────────────────────
/**
 * 2–6 equipos  → liguilla (1 grupo) + final
 * 7 equipos    → 2 grupos (3+4) + consolación 3º + semis + final
 * 8–10 equipos → 2 grupos + semis + final
 * ≥11 equipos  → 3 grupos + repesca 3º + cuartos + semis + final
 */
function specsForPaidDivision(teams: Team[]): RawMatchSpec[] {
    const div = divisionForTeams(teams);
    const code = DIVISION_CODE[div];
    const n = teams.length;
    if (n < 2) return [];

    const groups = computeGroups(teams);
    if (!groups || groups.length === 0) return [];

    const out: RawMatchSpec[] = [];
    const numGroups = groups.length;
    const gkeys = groups.map((x) => x.key);

    // ── Fase de grupos ──────────────────────────────────────────────────────
    for (const g of groups) {
        const label = `${code}-${g.key}`;
        for (const { a, b } of roundRobinPairs(g.names)) {
            out.push({ teamA: a, teamB: b, division: div, phase: 'GRUPOS', phaseOrder: 0, roundLabel: `Grupos · ${label}` });
        }
    }

    // ── Fases eliminatorias ─────────────────────────────────────────────────
    if (numGroups === 3 && usesQuarterFinalFormat(n)) {
        // ≥11 equipos: 6 primeros + mejor 3º (coef.) + ganador repesca de los 2 peores 3º → cuartos
        const [ga, gb, gc] = [gkeys[0] ?? 'A', gkeys[1] ?? 'B', gkeys[2] ?? 'C'];
        out.push({
            teamA: '3º peor 1',
            teamB: '3º peor 2',
            division: div,
            phase: 'REPESCA',
            phaseOrder: 1,
            roundLabel: `Repesca 3º · ${code}`,
        });
        out.push(
            { teamA: `1º Gr.${ga}`, teamB: `2º Gr.${gb}`, division: div, phase: 'CUARTOS', phaseOrder: 2, roundLabel: `Cuartos · ${code} 1` },
            { teamA: `1º Gr.${gb}`, teamB: `2º Gr.${ga}`, division: div, phase: 'CUARTOS', phaseOrder: 2, roundLabel: `Cuartos · ${code} 2` },
            { teamA: `1º Gr.${gc}`, teamB: `3º mejor 2`, division: div, phase: 'CUARTOS', phaseOrder: 2, roundLabel: `Cuartos · ${code} 3` },
            { teamA: `2º Gr.${gc}`, teamB: `3º mejor 1`, division: div, phase: 'CUARTOS', phaseOrder: 2, roundLabel: `Cuartos · ${code} 4` },
        );
        out.push(
            { teamA: `Gan.Ctos ${code} 1`, teamB: `Gan.Ctos ${code} 2`, division: div, phase: 'SEMIS', phaseOrder: 3, roundLabel: `Semi · ${code} 1` },
            { teamA: `Gan.Ctos ${code} 3`, teamB: `Gan.Ctos ${code} 4`, division: div, phase: 'SEMIS', phaseOrder: 3, roundLabel: `Semi · ${code} 2` },
        );
        out.push({ teamA: `Gan.Semi ${code} 1`, teamB: `Gan.Semi ${code} 2`, division: div, phase: 'FINAL', phaseOrder: 4, roundLabel: `Final · ${code}` });
    } else if (numGroups >= 2) {
        const [ga, gb] = [gkeys[0] ?? 'A', gkeys[1] ?? 'B'];
        if (n === 7) {
            // 7 equipos (3+4): pasan 2 por grupo; consolación entre los 3º
            out.push({
                teamA: `3º Gr.${ga}`,
                teamB: `3º Gr.${gb}`,
                division: div,
                phase: 'REPESCA',
                phaseOrder: 1,
                roundLabel: `Consolación 3º · ${code}`,
            });
            out.push(
                { teamA: `1º Gr.${ga}`, teamB: `2º Gr.${gb}`, division: div, phase: 'SEMIS', phaseOrder: 2, roundLabel: `Semi · ${code} 1` },
                { teamA: `1º Gr.${gb}`, teamB: `2º Gr.${ga}`, division: div, phase: 'SEMIS', phaseOrder: 2, roundLabel: `Semi · ${code} 2` },
            );
            out.push({ teamA: `Gan.Semi ${code} 1`, teamB: `Gan.Semi ${code} 2`, division: div, phase: 'FINAL', phaseOrder: 3, roundLabel: `Final · ${code}` });
        } else {
            // 8–10 equipos (9 → 4+5; 8 → 4+4; 10 → 5+5): semis + final
            out.push(
                { teamA: `1º Gr.${ga}`, teamB: `2º Gr.${gb}`, division: div, phase: 'SEMIS', phaseOrder: 1, roundLabel: `Semi · ${code} 1` },
                { teamA: `1º Gr.${gb}`, teamB: `2º Gr.${ga}`, division: div, phase: 'SEMIS', phaseOrder: 1, roundLabel: `Semi · ${code} 2` },
            );
            out.push({ teamA: `Gan.Semi ${code} 1`, teamB: `Gan.Semi ${code} 2`, division: div, phase: 'FINAL', phaseOrder: 2, roundLabel: `Final · ${code}` });
        }
    } else {
        // 2–6 equipos, 1 grupo: liguilla → final 1º vs 2º (sin semifinales)
        out.push({ teamA: '1º Clasificado', teamB: '2º Clasificado', division: div, phase: 'FINAL', phaseOrder: 1, roundLabel: `Final · ${code}` });
    }

    return out;
}

// ─── Conteo de partidos reales ─────────────────────────────────────────────
function countRealRealMatches(specs: RawMatchSpec[], realNames: Set<string>): Map<string, number> {
    const m = new Map<string, number>();
    for (const s of specs) {
        if (!realNames.has(s.teamA) || !realNames.has(s.teamB)) continue;
        m.set(s.teamA, (m.get(s.teamA) ?? 0) + 1);
        m.set(s.teamB, (m.get(s.teamB) ?? 0) + 1);
    }
    return m;
}

/**
 * Añade partidos de liguilla/grupo repetidos hasta que cada equipo tenga al menos `min` enfrentamientos reales.
 * Los extras se generan siempre dentro del mismo grupo de competición.
 */
function ensureMinRealMatchesPerTeam(teams: Team[], specs: RawMatchSpec[], min: number): RawMatchSpec[] {
    const realNames = new Set(teams.map((t) => t.name));
    const groups = computeGroups(teams);
    if (!groups?.length || teams.length < 2) return specs;

    const div = divisionForTeams(teams);
    const code = DIVISION_CODE[div];
    const out = [...specs];
    let supIdx = 1;

    const counts = (): Map<string, number> => countRealRealMatches(out, realNames);

    const existingGroupPair = (a: string, b: string, groupKey: string): boolean =>
        out.some(
            (s) =>
                s.phase === 'GRUPOS' &&
                s.roundLabel.includes(`${code}-${groupKey}`) &&
                ((s.teamA === a && s.teamB === b) || (s.teamA === b && s.teamB === a))
        );

    for (let iter = 0; iter < 800; iter++) {
        const m = counts();
        let needy: string | null = null;
        let lowest = Infinity;
        for (const t of teams) {
            const c = m.get(t.name) ?? 0;
            if (c < min && c < lowest) {
                lowest = c;
                needy = t.name;
            }
        }
        if (needy === null || lowest >= min) break;

        const g = groups.find((gr) => gr.names.includes(needy!));
        if (!g || g.names.length < 2) break;

        const others = g.names
            .filter((n) => n !== needy)
            .sort((a, b) => {
                const diff = (m.get(a) ?? 0) - (m.get(b) ?? 0);
                if (diff !== 0) return diff;
                return a.localeCompare(b, 'es');
            });
        const partner = others.find((n) => !existingGroupPair(needy!, n, g.key)) ?? others[0];
        if (!partner) break;

        out.push({
            teamA: needy,
            teamB: partner,
            division: div,
            phase: 'GRUPOS',
            phaseOrder: 0,
            roundLabel: `Grupos · ${code}-${g.key} · extra${supIdx}`,
        });
        supIdx++;
    }

    return out;
}

// ─── Interleave de categorías (mezcla en el horario) ──────────────────────
/**
 * Mezcla specs de distintas categorías dentro de cada fase.
 * Resultado: CF, CM, JF, JM, CF, CM, JF, JM… (una vuelta por categoría).
 */
function interleaveSpecsByDivision(specs: RawMatchSpec[]): RawMatchSpec[] {
    const byPhaseDiv = new Map<number, Map<string, RawMatchSpec[]>>();
    for (const s of specs) {
        if (!byPhaseDiv.has(s.phaseOrder)) byPhaseDiv.set(s.phaseOrder, new Map());
        const dm = byPhaseDiv.get(s.phaseOrder)!;
        const dk = DIVISION_CODE[s.division];
        if (!dm.has(dk)) dm.set(dk, []);
        dm.get(dk)!.push(s);
    }

    const result: RawMatchSpec[] = [];
    const phases = [...byPhaseDiv.keys()].sort((a, b) => a - b);
    for (const ph of phases) {
        const dm = byPhaseDiv.get(ph)!;
        const arrays = [...dm.values()];
        const maxLen = Math.max(...arrays.map((a) => a.length));
        for (let i = 0; i < maxLen; i++) {
            for (const arr of arrays) {
                if (i < arr.length) result.push(arr[i]!);
            }
        }
    }
    return result;
}

// ─── Capacidad del día ─────────────────────────────────────────────────────
function daySlotsCourtCapacity(
    day: MuskizScheduleDayLabel,
    configs: Record<MuskizScheduleDayLabel, DayConfig>,
    slotMins: number
): number {
    const cfg = configs[day];
    const slots = generateSlotStarts(cfg.playStart, cfg.playEndExclusive, slotMins, cfg.lunch).length;
    return slots * cfg.courts.length;
}

function dayBucketForDivision(division: Team['division']): MuskizScheduleDayLabel {
    if ((CADETES as string[]).includes(division)) return 'Viernes';
    if ((JUV_SEN as string[]).includes(division)) return 'Sábado';
    return 'Domingo';
}

export function divisionBelongsToScheduleDay(division: Team['division'], day: MuskizScheduleDayLabel): boolean {
    return dayBucketForDivision(division) === day;
}

// ─── Defaults por día ─────────────────────────────────────────────────────
export function getMuskizDayGenDefaults(day: MuskizScheduleDayLabel): {
    startTime: string;
    endTime: string;
    intervalMins: number;
    courtsInput: string;
    lunchBreak: boolean;
    customPrompt: string;
} {
    const configs = defaultConfigs();
    const cfg = configs[day];
    const courts = cfg.courts.join(', ');
    const categories =
        day === 'Viernes'
            ? 'cadete femenino y cadete masculino'
            : day === 'Sábado'
              ? 'juvenil y senior (femenino y masculino)'
              : 'infantil femenino e infantil masculino';
    return {
        startTime: cfg.playStart,
        endTime: cfg.playEndExclusive,
        intervalMins: 35,
        courtsInput: courts,
        lunchBreak: !!cfg.lunch,
        customPrompt: `Solo categorías de ${day} (${categories}). Fase de grupos por categoría y solo la gran final (sin cuartos ni semifinales). Reparte horarios y pistas sin solapes. Todo debe caber entre ${cfg.playStart} y ${cfg.playEndExclusive}.`,
    };
}

// ─── Configuración de días ─────────────────────────────────────────────────
interface DayConfig {
    label: MuskizScheduleDayLabel;
    dayShort: string;
    playStart: string;
    playEndExclusive: string;
    courts: string[];
    lunch?: { start: string; end: string };
}

const DEFAULT_COURTS_6 = ['Campo 1', 'Campo 2', 'Campo 3', 'Campo 4', 'Campo 5', 'Campo 6'];
const DEFAULT_COURTS_4 = ['Campo 1', 'Campo 2', 'Campo 3', 'Campo 4'];

export function defaultConfigs(): Record<MuskizScheduleDayLabel, DayConfig> {
    return {
        Viernes: { label: 'Viernes', dayShort: 'Vie', playStart: '17:00', playEndExclusive: '22:00', courts: DEFAULT_COURTS_6 },
        Sábado: { label: 'Sábado', dayShort: 'Sab', playStart: '09:00', playEndExclusive: '22:00', courts: DEFAULT_COURTS_6, lunch: { start: SATURDAY_LUNCH_START, end: SATURDAY_LUNCH_DEFAULT_END } },
        Domingo: { label: 'Domingo', dayShort: 'Dom', playStart: '09:00', playEndExclusive: '15:00', courts: DEFAULT_COURTS_4 },
    };
}

export function getDayScheduleConfig(
    day: MuskizScheduleDayLabel,
    _options?: MuskizSimulatorOptions
): DayConfig {
    const configs = defaultConfigs();
    if (day === 'Sábado') {
        configs.Sábado = {
            ...configs.Sábado,
            lunch: { start: SATURDAY_LUNCH_START, end: SATURDAY_LUNCH_DEFAULT_END },
        };
    }
    return configs[day];
}

export function buildFullDayTimeSlots(
    day: MuskizScheduleDayLabel,
    slotMins = 35,
    options?: MuskizSimulatorOptions
): string[] {
    const cfg = getDayScheduleConfig(day, options);
    return generateSlotStarts(cfg.playStart, cfg.playEndExclusive, slotMins, cfg.lunch).map(minutesToTime);
}

// ─── Planificador greedy ───────────────────────────────────────────────────
interface ScheduledCell {
    timeMin: number;
    courtIdx: number;
    courtName: string;
    spec: RawMatchSpec;
}

/** Equipos ficticios de cruces (no aplican descanso entre partidos). */
function isPlaceholderTeamName(name: string): boolean {
    return (
        /grupo|gr\.\s*[a-d]\b|clasificado|gan\.|ganador|ctos?\b|mejor|peor|repesca|consolaci[oó]n/i.test(name) ||
        /^\d+º/i.test(name)
    );
}

/** Franjas reservadas al final del día para colocar todas las finales. */
function reservedFinalSlotStarts(slotStartsMin: number[], finalCount: number, courtCount: number): number[] {
    if (finalCount <= 0 || slotStartsMin.length === 0) return [];
    const waves = Math.max(1, Math.ceil(finalCount / courtCount));
    return slotStartsMin.slice(-Math.min(waves, slotStartsMin.length));
}

type SlotTimePolicy = 'earliest' | 'latest';

/** Hueco ocupado en el greedy; la división evita mezclar homónimos CF/CM, etc. */
type GreedyAssignment = {
    tStart: number;
    tEnd: number;
    courtIdx: number;
    teams: [string, string];
    division: Team['division'];
};

function assignmentUsesTeam(a: GreedyAssignment, teamName: string): boolean {
    return a.teams[0] === teamName || a.teams[1] === teamName;
}

/** Conflicto de equipo solo dentro de la misma división (Cadete F ≠ Cadete M). */
function teamsBusyInDivision(
    assigned: GreedyAssignment[],
    division: Team['division'],
    teamsPair: [string, string],
    tStart: number,
    tEnd: number
): boolean {
    return assigned.some((x) => {
        if (x.division !== division) return false;
        if (x.tStart >= tEnd || x.tEnd <= tStart) return false;
        for (const t of teamsPair) {
            if (isPlaceholderTeamName(t)) continue;
            if (assignmentUsesTeam(x, t)) return true;
        }
        return false;
    });
}

function teamScheduleKey(division: Team['division'], teamName: string): string {
    return `${division}\0${teamName}`;
}

interface ScheduleGreedyState {
    slotStartsMin: number[];
    courts: string[];
    slotMins: number;
    assigned: GreedyAssignment[];
    placed: ScheduledCell[];
    unplaced: RawMatchSpec[];
}

function createScheduleGreedyState(
    slotStartsMin: number[],
    courts: string[],
    slotMins: number
): ScheduleGreedyState {
    return { slotStartsMin, courts, slotMins, assigned: [], placed: [], unplaced: [] };
}

function scheduleSpecBatch(
    state: ScheduleGreedyState,
    specs: RawMatchSpec[],
    options: {
        slotTimePolicy: SlotTimePolicy;
        allowedSlotStarts?: number[];
        forbiddenSlotStarts?: number[];
        /** Ningún partido de este lote antes de este minuto (fin de la fase anterior). */
        minSlotStartMin?: number;
        /** Solo considera huecos aunque el equipo juegue la franja anterior (sin descanso). */
        allowBackToBackOnly?: boolean;
        /** Ignora franjas prohibidas/reservadas para intentar colocar partidos sin hueco. */
        relaxSlotRestrictions?: boolean;
        /** En recuperación: ignora también el mínimo de fase anterior. */
        relaxPhaseMinStart?: boolean;
    }
): void {
    const { slotStartsMin, courts, slotMins, assigned } = state;
    const allowedSet =
        options.relaxSlotRestrictions || options.allowedSlotStarts == null
            ? null
            : new Set(options.allowedSlotStarts);
    const forbiddenSet =
        options.relaxSlotRestrictions || options.forbiddenSlotStarts == null
            ? null
            : new Set(options.forbiddenSlotStarts);

    const courtUsage = () => courts.map((_, ci) => assigned.filter((x) => x.courtIdx === ci).length);

    const teamLastEnd = (division: Team['division'], team: string): number => {
        let last = -Infinity;
        for (const x of assigned) {
            if (x.division !== division) continue;
            if (assignmentUsesTeam(x, team)) last = Math.max(last, x.tEnd);
        }
        return last;
    };

    const teamMatchCount = (division: Team['division'], team: string): number =>
        assigned.filter((x) => x.division === division && assignmentUsesTeam(x, team)).length;

    const restGapBefore = (division: Team['division'], team: string, ts: number): number => {
        const last = teamLastEnd(division, team);
        return Number.isFinite(last) && last !== -Infinity ? ts - last : Infinity;
    };

    const courtBusy = (courtIdx: number, tStart: number, tEnd: number): boolean =>
        assigned.some((x) => x.courtIdx === courtIdx && x.tStart < tEnd && x.tEnd > tStart);

    const hasBackToBack = (division: Team['division'], teams: [string, string], ts: number): boolean => {
        for (const t of teams) {
            if (isPlaceholderTeamName(t)) continue;
            if (restGapBefore(division, t, ts) < slotMins) return true;
        }
        return false;
    };

    const teamAssignedStarts = (division: Team['division'], team: string): number[] =>
        assigned
            .filter((x) => x.division === division && assignmentUsesTeam(x, team))
            .map((x) => x.tStart);

    /** Tres franjas seguidas (sin descanso) si se coloca el partido en proposedStart. */
    const hasTripleConsecutive = (
        division: Team['division'],
        team: string,
        proposedStart: number
    ): boolean => {
        if (isPlaceholderTeamName(team)) return false;
        const starts = [...teamAssignedStarts(division, team), proposedStart].sort((a, b) => a - b);
        for (let i = 0; i <= starts.length - 3; i++) {
            const s0 = starts[i]!;
            const s1 = starts[i + 1]!;
            const s2 = starts[i + 2]!;
            if (s1 - s0 < slotMins && s2 - s1 < slotMins) return true;
        }
        return false;
    };

    const matchWouldTripleConsecutive = (
        division: Team['division'],
        teams: [string, string],
        ts: number
    ): boolean =>
        hasTripleConsecutive(division, teams[0], ts) || hasTripleConsecutive(division, teams[1], ts);

    const scoreSlot = (
        division: Team['division'],
        teams: [string, string],
        ts: number,
        ci: number,
        usage: number[],
        allowBackToBack: boolean,
        slotTimePolicy: SlotTimePolicy
    ): number | null => {
        const te = ts + slotMins;
        if (courtBusy(ci, ts, te) || teamsBusyInDivision(assigned, division, teams, ts, te)) return null;
        if (matchWouldTripleConsecutive(division, teams, ts)) return null;

        const gapA = restGapBefore(division, teams[0], ts);
        const gapB = restGapBefore(division, teams[1], ts);
        const minGap = Math.min(gapA, gapB);

        if (!allowBackToBack && hasBackToBack(division, teams, ts)) return null;

        const PENALTY_BACK_TO_BACK = 50_000_000;
        const PENALTY_ONE_SLOT_REST = 8_000_000;
        const lastSlot = slotStartsMin[slotStartsMin.length - 1] ?? ts;

        let score =
            slotTimePolicy === 'earliest'
                ? ts * 100 + usage[ci]! * 10
                : (lastSlot - ts) * 100 + usage[ci]! * 10;

        if (minGap < slotMins) score += PENALTY_BACK_TO_BACK;
        else if (minGap < 2 * slotMins) score += PENALTY_ONE_SLOT_REST;
        else score -= Math.min(minGap, 6 * slotMins);

        return score;
    };

    const findBestSlot = (
        division: Team['division'],
        teams: [string, string],
        allowBackToBack: boolean,
        slotTimePolicy: SlotTimePolicy
    ): { ts: number; ci: number } | null => {
        let best: { ts: number; ci: number } | null = null;
        let bestScore = Infinity;

        const slotOrder =
            slotTimePolicy === 'earliest' ? slotStartsMin : [...slotStartsMin].reverse();

        for (const ts of slotOrder) {
            if (!options.relaxPhaseMinStart && options.minSlotStartMin != null && ts < options.minSlotStartMin) continue;
            if (allowedSet && !allowedSet.has(ts)) continue;
            if (forbiddenSet?.has(ts)) continue;

            const usage = courtUsage();
            const courtOrder = courts.map((_, ci) => ci).sort((a, b) => usage[a]! - usage[b]!);
            for (const ci of courtOrder) {
                const score = scoreSlot(division, teams, ts, ci, usage, allowBackToBack, slotTimePolicy);
                if (score !== null && score < bestScore) {
                    bestScore = score;
                    best = { ts, ci };
                }
            }
        }
        return best;
    };

    const sortedSpecs = [...specs].sort((a, b) => {
        if (a.phaseOrder !== b.phaseOrder) return a.phaseOrder - b.phaseOrder;
        const loadA =
            teamMatchCount(a.division, a.teamA) + teamMatchCount(a.division, a.teamB);
        const loadB =
            teamMatchCount(b.division, b.teamA) + teamMatchCount(b.division, b.teamB);
        if (loadB !== loadA) return loadB - loadA;
        return a.roundLabel.localeCompare(b.roundLabel, 'es');
    });

    for (const spec of sortedSpecs) {
        const teamsPair: [string, string] = [spec.teamA, spec.teamB];
        const div = spec.division;
        let best = options.allowBackToBackOnly
            ? findBestSlot(div, teamsPair, true, options.slotTimePolicy)
            : findBestSlot(div, teamsPair, false, options.slotTimePolicy);
        if (!best && !options.allowBackToBackOnly) {
            best = findBestSlot(div, teamsPair, true, options.slotTimePolicy);
        }

        if (best) {
            const te = best.ts + slotMins;
            assigned.push({
                tStart: best.ts,
                tEnd: te,
                courtIdx: best.ci,
                teams: teamsPair,
                division: div,
            });
            state.placed.push({
                timeMin: best.ts,
                courtIdx: best.ci,
                courtName: courts[best.ci]!,
                spec,
            });
        } else {
            state.unplaced.push(spec);
        }
    }
}

/** Mayor instante de fin (tEnd) ya asignado en el estado. */
function maxAssignedEndMin(state: ScheduleGreedyState): number {
    if (!state.assigned.length) return -Infinity;
    return Math.max(...state.assigned.map((a) => a.tEnd));
}

function maxAssignedEndForPhase(state: ScheduleGreedyState, phase: Phase): number {
    let max = -Infinity;
    for (const p of state.placed) {
        if (p.spec.phase !== phase) continue;
        max = Math.max(max, p.timeMin + state.slotMins);
    }
    return max;
}

/** Mayor hora de inicio de una fase ya colocada (para bloquear eliminatorias antes de grupos). */
function maxPhaseStartMin(state: ScheduleGreedyState, phase: Phase): number {
    let max = -Infinity;
    for (const p of state.placed) {
        if (p.spec.phase === phase) max = Math.max(max, p.timeMin);
    }
    return max;
}

/** Primera franja ≥ snapshot de fin de fase anterior (usar snapshot fijo, no releer estado a mitad de lote). */
function minSlotStartFromPhaseEnd(slotStartsMin: number[], phaseEndSnapshot: number): number | undefined {
    if (!Number.isFinite(phaseEndSnapshot) || phaseEndSnapshot === -Infinity) return undefined;
    return slotStartsMin.find((ts) => ts >= phaseEndSnapshot);
}

/** Franjas reservadas antes de las finales para cuartos/semis (no mezclar con grupos). */
function reservedKnockoutSlotStarts(
    slotStartsMin: number[],
    knockoutCount: number,
    courtCount: number,
    finalReserved: number[]
): number[] {
    if (knockoutCount <= 0) return [];
    const finalSet = new Set(finalReserved);
    const available = slotStartsMin.filter((ts) => !finalSet.has(ts));
    const waves = Math.max(1, Math.ceil(knockoutCount / courtCount));
    return available.slice(-Math.min(waves, available.length));
}

function specsByPhase(specs: RawMatchSpec[]) {
    return {
        grupos: specs.filter((s) => s.phase === 'GRUPOS'),
        repesca: specs.filter((s) => s.phase === 'REPESCA'),
        cuartos: specs.filter((s) => s.phase === 'CUARTOS'),
        semis: specs.filter((s) => s.phase === 'SEMIS'),
        finals: specs.filter((s) => s.phase === 'FINAL'),
    };
}

/** Reintento por fase sin saltar el orden grupos → cuartos → semis → final. */
function scheduleUnplacedRecovery(state: ScheduleGreedyState, slotStartsMin: number[]): void {
    if (!state.unplaced.length) return;

    const pool = [...state.unplaced];
    state.unplaced = [];

    const phaseOrder: Phase[] = ['GRUPOS', 'REPESCA', 'CUARTOS', 'SEMIS', 'FINAL'];
    let phaseEndSnapshot = maxAssignedEndMin(state);

    for (const phase of phaseOrder) {
        const batch = pool.filter((s) => s.phase === phase);
        if (!batch.length) continue;

        const minAfterPrevious =
            phase === 'GRUPOS'
                ? undefined
                : minSlotStartFromPhaseEnd(slotStartsMin, phaseEndSnapshot);

        scheduleSpecBatch(state, batch, {
            slotTimePolicy: phase === 'FINAL' ? 'latest' : 'earliest',
            allowBackToBackOnly: true,
            relaxSlotRestrictions: phase === 'GRUPOS',
            minSlotStartMin: minAfterPrevious,
        });

        phaseEndSnapshot = maxAssignedEndMin(state);
    }
}

/** Termina de colocar partidos de grupos antes de cualquier eliminatoria. */
function finishGruposPhase(
    state: ScheduleGreedyState,
    slotStartsMin: number[],
    groupsForbidden: number[]
): void {
    for (let round = 0; round < 6; round++) {
        const before = state.unplaced.filter((s) => s.phase === 'GRUPOS').length;
        if (before === 0) return;

        exhaustivePlaceUnplacedPhased(state, { onlyPhase: 'GRUPOS', forbiddenSlotStarts: groupsForbidden });

        const stillGrupos = state.unplaced.filter((s) => s.phase === 'GRUPOS');
        if (stillGrupos.length > 0) {
            scheduleSpecBatch(state, stillGrupos, {
                slotTimePolicy: 'earliest',
                allowBackToBackOnly: true,
                relaxSlotRestrictions: true,
                forbiddenSlotStarts: groupsForbidden,
            });
        }

        const after = state.unplaced.filter((s) => s.phase === 'GRUPOS').length;
        if (after >= before) break;
    }
}

/**
 * Asigna horas y pistas evitando solapamiento de pista/equipo y, en lo posible,
 * dos partidos seguidos del mismo equipo. Si quedan sin hueco, reintenta permitiendo
 * partidos consecutivos para reducir PENDIENTE.
 * Orden estricto: grupos → cuartos → semis → finales (al cierre del día).
 */
function scheduleGreedy(
    day: MuskizScheduleDayLabel,
    specs: RawMatchSpec[],
    configs: Record<MuskizScheduleDayLabel, DayConfig>,
    slotMins: number
): { placed: ScheduledCell[]; unplaced: RawMatchSpec[] } {
    const cfg = configs[day];
    const slotStartsMin = generateSlotStarts(cfg.playStart, cfg.playEndExclusive, slotMins, cfg.lunch);
    const courts = cfg.courts;

    const { grupos, repesca, cuartos, semis, finals } = specsByPhase(specs);
    const reservedFinalSlots = reservedFinalSlotStarts(slotStartsMin, finals.length, courts.length);
    const reservedKnockoutSlots = reservedKnockoutSlotStarts(
        slotStartsMin,
        repesca.length + cuartos.length + semis.length,
        courts.length,
        reservedFinalSlots
    );
    const groupsForbidden = [...new Set([...reservedFinalSlots, ...reservedKnockoutSlots])];

    const state = createScheduleGreedyState(slotStartsMin, courts, slotMins);

    scheduleSpecBatch(state, grupos, {
        slotTimePolicy: 'earliest',
        forbiddenSlotStarts: groupsForbidden,
    });

    finishGruposPhase(state, slotStartsMin, groupsForbidden);

    const endAfterGrupos = Math.max(
        maxAssignedEndForPhase(state, 'GRUPOS'),
        maxAssignedEndMin(state)
    );
    const minAfterGrupos = minSlotStartFromPhaseEnd(slotStartsMin, endAfterGrupos);

    const knockoutSlotsAfterGrupos = (slots: number[]) =>
        slots.filter((ts) => minAfterGrupos == null || ts >= minAfterGrupos);

    scheduleSpecBatch(state, repesca, {
        slotTimePolicy: 'earliest',
        allowedSlotStarts: repesca.length > 0 ? knockoutSlotsAfterGrupos(reservedKnockoutSlots) : undefined,
        forbiddenSlotStarts: reservedFinalSlots,
        minSlotStartMin: minAfterGrupos,
    });
    const endAfterRepesca = Math.max(maxAssignedEndForPhase(state, 'REPESCA'), endAfterGrupos);
    const minAfterRepesca = minSlotStartFromPhaseEnd(slotStartsMin, endAfterRepesca);

    scheduleSpecBatch(state, cuartos, {
        slotTimePolicy: 'earliest',
        allowedSlotStarts:
            cuartos.length > 0
                ? knockoutSlotsAfterGrupos(reservedKnockoutSlots)
                : undefined,
        forbiddenSlotStarts: reservedFinalSlots,
        minSlotStartMin: minAfterRepesca,
    });
    const endAfterCuartos = Math.max(
        maxAssignedEndForPhase(state, 'CUARTOS'),
        endAfterRepesca
    );
    const minAfterCuartos = minSlotStartFromPhaseEnd(slotStartsMin, endAfterCuartos);

    scheduleSpecBatch(state, semis, {
        slotTimePolicy: 'earliest',
        allowedSlotStarts:
            semis.length > 0
                ? knockoutSlotsAfterGrupos(reservedKnockoutSlots)
                : undefined,
        forbiddenSlotStarts: reservedFinalSlots,
        minSlotStartMin: minAfterCuartos,
    });
    const endAfterSemis = maxAssignedEndMin(state);

    const minAfterKnockout = minSlotStartFromPhaseEnd(slotStartsMin, endAfterSemis);
    const finalSlots = reservedFinalSlots.filter(
        (ts) => minAfterKnockout == null || ts >= minAfterKnockout
    );

    scheduleSpecBatch(state, finals, {
        slotTimePolicy: 'latest',
        allowedSlotStarts: finalSlots.length > 0 ? finalSlots : slotStartsMin,
        minSlotStartMin: minAfterKnockout,
    });

    const unplacedFinals = state.unplaced.filter((s) => s.phase === 'FINAL');
    if (unplacedFinals.length > 0) {
        state.unplaced = state.unplaced.filter((s) => s.phase !== 'FINAL');
        scheduleSpecBatch(state, unplacedFinals, {
            slotTimePolicy: 'latest',
            minSlotStartMin: minAfterKnockout,
        });
    }

    scheduleUnplacedRecovery(state, slotStartsMin);
    exhaustivePlaceUnplacedPhased(state);

    enforcePhaseTimeOrder(state, slotStartsMin, slotMins);

    return { placed: state.placed, unplaced: state.unplaced };
}

/** Si una eliminatoria empieza antes de que acabe el último partido de grupos, se reintenta. */
function enforcePhaseTimeOrder(
    state: ScheduleGreedyState,
    slotStartsMin: number[],
    _slotMins: number
): void {
    const lastGrupoEnd = maxAssignedEndForPhase(state, 'GRUPOS');
    const earliestAfterGrupos = minSlotStartFromPhaseEnd(slotStartsMin, lastGrupoEnd);
    if (earliestAfterGrupos == null) return;

    const lastRepescaEnd = maxAssignedEndForPhase(state, 'REPESCA');
    const earliestCuartos =
        Number.isFinite(lastRepescaEnd) && lastRepescaEnd !== -Infinity
            ? minSlotStartFromPhaseEnd(slotStartsMin, lastRepescaEnd)
            : earliestAfterGrupos;

    const toRequeue: ScheduledCell[] = [];
    for (const cell of state.placed) {
        if (cell.spec.phase === 'GRUPOS') continue;
        if (cell.spec.phase === 'REPESCA') {
            if (cell.timeMin < earliestAfterGrupos) toRequeue.push(cell);
            continue;
        }
        const minStart = earliestCuartos ?? earliestAfterGrupos;
        if (cell.timeMin < minStart) toRequeue.push(cell);
    }

    for (const cell of toRequeue) {
        state.placed = state.placed.filter(
            (p) => !(p.timeMin === cell.timeMin && p.courtIdx === cell.courtIdx && p.spec === cell.spec)
        );
        state.assigned = state.assigned.filter(
            (a) =>
                !(
                    a.tStart === cell.timeMin &&
                    a.courtIdx === cell.courtIdx &&
                    a.teams[0] === cell.spec.teamA &&
                    a.teams[1] === cell.spec.teamB
                )
        );
        state.unplaced.push(cell.spec);
    }

    if (!toRequeue.length) return;

    exhaustivePlaceUnplacedPhased(state);
    scheduleUnplacedRecovery(state, slotStartsMin);
}

type ExhaustivePhaseOptions = {
    onlyPhase?: Phase;
    forbiddenSlotStarts?: number[];
};

/** Coloca pendientes respetando orden de fase (nunca semis antes de acabar grupos). */
function exhaustivePlaceUnplacedPhased(
    state: ScheduleGreedyState,
    options?: ExhaustivePhaseOptions
): void {
    if (!state.unplaced.length) return;

    const { slotStartsMin, courts, slotMins, assigned } = state;
    const forbiddenSet = options?.forbiddenSlotStarts?.length
        ? new Set(options.forbiddenSlotStarts)
        : null;

    const phases: Phase[] = options?.onlyPhase
        ? [options.onlyPhase]
        : ['GRUPOS', 'REPESCA', 'CUARTOS', 'SEMIS', 'FINAL'];

    const allPending = [...state.unplaced];
    const holdOther = options?.onlyPhase
        ? allPending.filter((s) => s.phase !== options.onlyPhase)
        : [];
    const remaining = options?.onlyPhase
        ? allPending.filter((s) => s.phase === options.onlyPhase)
        : allPending;
    state.unplaced = [...holdOther];

    const courtBusy = (courtIdx: number, tStart: number, tEnd: number): boolean =>
        assigned.some((x) => x.courtIdx === courtIdx && x.tStart < tEnd && x.tEnd > tStart);

    const teamAssignedStarts = (division: Team['division'], team: string): number[] =>
        assigned
            .filter((x) => x.division === division && assignmentUsesTeam(x, team))
            .map((x) => x.tStart);

    const hasTripleConsecutive = (
        division: Team['division'],
        team: string,
        proposedStart: number
    ): boolean => {
        if (isPlaceholderTeamName(team)) return false;
        const starts = [...teamAssignedStarts(division, team), proposedStart].sort((a, b) => a - b);
        for (let i = 0; i <= starts.length - 3; i++) {
            const s0 = starts[i]!;
            const s1 = starts[i + 1]!;
            const s2 = starts[i + 2]!;
            if (s1 - s0 < slotMins && s2 - s1 < slotMins) return true;
        }
        return false;
    };

    let phaseEndSnapshot = maxAssignedEndMin(state);

    for (const phase of phases) {
        const batch = remaining.filter((s) => s.phase === phase);
        const minStart =
            phase === 'GRUPOS'
                ? undefined
                : minSlotStartFromPhaseEnd(slotStartsMin, phaseEndSnapshot);

        for (const spec of batch) {
            const teamsPair: [string, string] = [spec.teamA, spec.teamB];
            const div = spec.division;
            let best: { ts: number; ci: number } | null = null;
            let bestScore = Infinity;

            for (const ts of slotStartsMin) {
                if (minStart != null && ts < minStart) continue;
                if (forbiddenSet?.has(ts)) continue;

                const te = ts + slotMins;
                for (let ci = 0; ci < courts.length; ci++) {
                    if (courtBusy(ci, ts, te) || teamsBusyInDivision(assigned, div, teamsPair, ts, te)) {
                        continue;
                    }
                    if (
                        hasTripleConsecutive(div, teamsPair[0], ts) ||
                        hasTripleConsecutive(div, teamsPair[1], ts)
                    ) {
                        continue;
                    }

                    let score = ts * 10 + ci;
                    for (const t of teamsPair) {
                        if (isPlaceholderTeamName(t)) continue;
                        let last = -Infinity;
                        for (const x of assigned) {
                            if (x.division !== div || !assignmentUsesTeam(x, t)) continue;
                            last = Math.max(last, x.tEnd);
                        }
                        const gap = Number.isFinite(last) && last !== -Infinity ? ts - last : Infinity;
                        if (gap < slotMins) score += 50_000;
                        else if (gap < 2 * slotMins) score += 5_000;
                    }
                    if (score < bestScore) {
                        bestScore = score;
                        best = { ts, ci };
                    }
                }
            }

            if (best) {
                const te = best.ts + slotMins;
                assigned.push({
                    tStart: best.ts,
                    tEnd: te,
                    courtIdx: best.ci,
                    teams: teamsPair,
                    division: div,
                });
                state.placed.push({
                    timeMin: best.ts,
                    courtIdx: best.ci,
                    courtName: courts[best.ci]!,
                    spec,
                });
            } else {
                state.unplaced.push(spec);
            }
        }

        phaseEndSnapshot = maxAssignedEndMin(state);
    }

}

/** @deprecated Usar exhaustivePlaceUnplacedPhased */
function exhaustivePlaceUnplaced(state: ScheduleGreedyState): void {
    exhaustivePlaceUnplacedPhased(state);
}

/** Payload compacto para la Edge Function de refinado IA (solo partidos PENDIENTE). */
export function buildMuskizSlotOptimizePayload(
    day: MuskizScheduleDayLabel,
    matches: Match[],
    options?: MuskizSimulatorOptions
): MuskizSlotOptimizePayload | null {
    const pending = matches.filter((m) => m.time === 'PENDIENTE');
    if (!pending.length) return null;

    const slotMins = options?.slotDurationMins ?? 35;
    const cfg = getDayScheduleConfig(day, options);
    const slots = buildFullDayTimeSlots(day, slotMins, options);
    const placed = matches
        .filter((m) => m.time !== 'PENDIENTE' && m.court !== 'Sin asignar')
        .map((m) => ({
            id: m.id,
            time: m.time,
            court: m.court,
            teamA: m.teamA,
            teamB: m.teamB,
            round: m.round,
        }));

    const notes = options?.organizerNotes?.trim();

    return {
        day,
        slotDurationMins: slotMins,
        playStart: cfg.playStart,
        playEndExclusive: cfg.playEndExclusive,
        courts: cfg.courts,
        lunch: cfg.lunch,
        slots,
        placed,
        pending: pending.map((m) => ({
            id: m.id,
            teamA: m.teamA,
            teamB: m.teamB,
            round: m.round ?? 'Partido',
        })),
        organizerNotes: notes || undefined,
        rulesSummary: MUSKIZ_RULES_SUMMARY,
    };
}

/** Intercambia hora/pista entre dos partidos colocados si mejora descansos (sin API). */
export function improveScheduleRestGaps(
    matches: Match[],
    _day: MuskizScheduleDayLabel,
    options?: MuskizSimulatorOptions
): Match[] {
    const slotMins = options?.slotDurationMins ?? 35;
    const slots = new Set(
        buildFullDayTimeSlots(_day, slotMins, options)
    );
    const courts = new Set(getDayScheduleConfig(_day, options).courts);

    const placed = matches.filter((m) => m.time !== 'PENDIENTE' && m.court !== 'Sin asignar');
    if (placed.length < 2) return matches;

    const countViolations = (list: Match[]): number => {
        const byTeam = new Map<string, number[]>();
        for (const m of list) {
            const div = divisionFromMatchRound(m.round);
            if (!div) continue;
            for (const t of [m.teamA, m.teamB]) {
                if (isPlaceholderTeamName(t)) continue;
                const key = teamScheduleKey(div, t);
                if (!byTeam.has(key)) byTeam.set(key, []);
                byTeam.get(key)!.push(timeToMinutes(m.time));
            }
        }
        let v = 0;
        for (const starts of byTeam.values()) {
            starts.sort((a, b) => a - b);
            for (let i = 1; i < starts.length; i++) {
                if (starts[i]! - starts[i - 1]! < slotMins) v++;
            }
        }
        return v;
    };

    const swapValid = (list: Match[], ma: Match, mb: Match): boolean => {
        if (!slots.has(ma.time) || !slots.has(mb.time)) return false;
        if (!courts.has(ma.court) || !courts.has(mb.court)) return false;

        const trial = list.map((m) => {
            if (m.id === ma.id) return { ...m, time: mb.time, court: mb.court };
            if (m.id === mb.id) return { ...m, time: ma.time, court: ma.court };
            return m;
        });
        const trialPlaced = trial.filter((m) => m.time !== 'PENDIENTE');

        for (const m of trialPlaced) {
            const tStart = timeToMinutes(m.time);
            const tEnd = tStart + slotMins;
            const teams = [m.teamA, m.teamB];
            for (const o of trialPlaced) {
                if (o.id === m.id) continue;
                const oStart = timeToMinutes(o.time);
                const oEnd = oStart + slotMins;
                if (tStart >= oEnd || tEnd <= oStart) continue;
                if (o.court === m.court) return false;
                if (realTeamsOverlapInSameDivision(m, o)) return false;
            }
        }
        return true;
    };

    let current = [...matches];
    let bestViolations = countViolations(placed);

    for (let pass = 0; pass < 40; pass++) {
        let improved = false;
        const idxs = current.filter((m) => m.time !== 'PENDIENTE' && m.court !== 'Sin asignar');

        for (let a = 0; a < idxs.length; a++) {
            for (let b = a + 1; b < idxs.length; b++) {
                const ma = idxs[a]!;
                const mb = idxs[b]!;
                if (!swapValid(current, ma, mb)) continue;

                const swapped: Match[] = current.map((m) => {
                    if (m.id === ma.id) return { ...m, time: mb.time, court: mb.court };
                    if (m.id === mb.id) return { ...m, time: ma.time, court: ma.court };
                    return m;
                });
                const v = countViolations(swapped.filter((m) => m.time !== 'PENDIENTE'));
                if (v < bestViolations) {
                    current = swapped;
                    bestViolations = v;
                    improved = true;
                }
            }
        }
        if (!improved) break;
    }

    return current;
}

type OccupiedSlot = { time: string; court: string; teamA: string; teamB: string; round?: string };

function occupiedSlotsForValidation(
    payload: MuskizSlotOptimizePayload,
    accepted: MuskizSlotAssignment[]
): OccupiedSlot[] {
    const out: OccupiedSlot[] = payload.placed.map((p) => ({
        time: p.time,
        court: p.court,
        teamA: p.teamA,
        teamB: p.teamB,
        round: p.round,
    }));
    for (const a of accepted) {
        const p = payload.pending.find((x) => x.id === a.id);
        if (!p) continue;
        out.push({
            time: a.time,
            court: a.court,
            teamA: p.teamA,
            teamB: p.teamB,
            round: p.round,
        });
    }
    return out;
}

function slotAssignmentValid(
    payload: MuskizSlotOptimizePayload,
    assignment: MuskizSlotAssignment,
    accepted: MuskizSlotAssignment[]
): boolean {
    if (!payload.slots.includes(assignment.time)) return false;
    if (!payload.courts.includes(assignment.court)) return false;

    const pending = payload.pending.find((p) => p.id === assignment.id);
    if (!pending) return false;

    const slotMins = payload.slotDurationMins;
    const tStart = timeToMinutes(assignment.time);
    const tEnd = tStart + slotMins;
    const moving = {
        teamA: pending.teamA,
        teamB: pending.teamB,
        round: pending.round,
    };

    for (const other of occupiedSlotsForValidation(payload, accepted)) {
        const oStart = timeToMinutes(other.time);
        const oEnd = oStart + slotMins;
        const overlap = tStart < oEnd && tEnd > oStart;
        if (!overlap) continue;
        if (other.court === assignment.court) return false;
        if (realTeamsOverlapInSameDivision(moving, other)) return false;
    }

    return true;
}

/** Aplica asignaciones devueltas por IA (o validación local) al borrador. */
export function applyMuskizSlotAssignments(
    matches: Match[],
    assignments: MuskizSlotAssignment[],
    day: MuskizScheduleDayLabel,
    options?: MuskizSimulatorOptions
): { matches: Match[]; placedCount: number; rejectedCount: number } {
    const payload = buildMuskizSlotOptimizePayload(day, matches, options);
    if (!payload) return { matches, placedCount: 0, rejectedCount: assignments.length };

    const dayCfg = getDayScheduleConfig(day, options);
    const accepted: MuskizSlotAssignment[] = [];
    let rejectedCount = 0;

    for (const a of assignments) {
        if (!payload.pending.some((p) => p.id === a.id)) {
            rejectedCount++;
            continue;
        }
        if (!slotAssignmentValid(payload, a, accepted)) {
            rejectedCount++;
            continue;
        }
        accepted.push(a);
    }

    const placedCount = accepted.length;

    const next = matches.map((m) => {
        const a = accepted.find((x) => x.id === m.id);
        if (!a) return m;
        const timeStr = a.time;
        const roundTail = m.round?.split('·').map((s) => s.trim()).filter(Boolean).pop() ?? 'Partido';
        return {
            ...m,
            time: timeStr,
            court: a.court,
            round: `${dayCfg.dayShort} · ${timeStr} · ${roundTail}`,
        };
    });

    return { matches: next, placedCount, rejectedCount };
}

/** Cuenta equipos reales con dos partidos en franjas consecutivas (sin descanso). */
function countBackToBackTeamSlots(placed: ScheduledCell[], slotMins: number): number {
    const byTeam = new Map<string, number[]>();
    for (const cell of placed) {
        for (const t of [cell.spec.teamA, cell.spec.teamB]) {
            if (isPlaceholderTeamName(t)) continue;
            const key = teamScheduleKey(cell.spec.division, t);
            if (!byTeam.has(key)) byTeam.set(key, []);
            byTeam.get(key)!.push(cell.timeMin);
        }
    }
    let violations = 0;
    for (const starts of byTeam.values()) {
        starts.sort((a, b) => a - b);
        for (let i = 1; i < starts.length; i++) {
            if (starts[i]! - starts[i - 1]! < slotMins) violations++;
        }
    }
    return violations;
}

// ─── Constructor principal por día ─────────────────────────────────────────
export function buildMuskizDayDraftMatches(
    allTeams: Team[],
    targetDay: MuskizScheduleDayLabel,
    options?: MuskizSimulatorOptions
): MuskizBuildResult {
    const slotMins = options?.slotDurationMins ?? 35;

    const paid = allTeams.filter((t) => t.paymentStatus === 'PAID');
    const byDivision = new Map<Team['division'], Team[]>();
    for (const t of paid) {
        if (!byDivision.has(t.division)) byDivision.set(t.division, []);
        byDivision.get(t.division)!.push(t);
    }

    const configs = defaultConfigs();

    const orderDiv: Team['division'][] = [
        'Cadete Femenino', 'Cadete Masculino',
        'Juvenil Femenino', 'Juvenil Masculino',
        'Senior Femenino', 'Senior Masculino',
        'Infantil Femenino', 'Infantil Masculino',
    ];

    const cap = daySlotsCourtCapacity(targetDay, configs, slotMins);
    const warnings: string[] = [];

    // ── Primera pasada: calcular specs para cada división ───────────────────
    const allDivSpecs: RawMatchSpec[] = [];
    for (const div of orderDiv) {
        if (dayBucketForDivision(div) !== targetDay) continue;
        const list = byDivision.get(div);
        if (!list?.length || list.length < 2) continue;

        const groups = computeGroups(list);
        for (const g of groups ?? []) {
            if (g.names.length < MIN_TEAMS_PER_GROUP && list.length > 6) {
                warnings.push(
                    `«${div}» grupo ${g.key}: ${g.names.length} equipos (mínimo ${MIN_TEAMS_PER_GROUP}).`
                );
            }
        }

        const baseSpecs = specsForPaidDivision(list);
        const realNames = new Set(list.map((t) => t.name));
        const divMin = resolveMinMatchesForDivision(div, options);

        let divSpecs = ensureMinRealMatchesPerTeam(list, [...baseSpecs], divMin);
        let effectiveMin = divMin;
        if (allDivSpecs.length + divSpecs.length > cap && divMin > 2) {
            effectiveMin = Math.max(2, divMin - 1);
            divSpecs = ensureMinRealMatchesPerTeam(list, [...baseSpecs], effectiveMin);
        }

        const m = countRealRealMatches(divSpecs, realNames);
        const underMin = list.filter((t) => (m.get(t.name) ?? 0) < effectiveMin);
        if (underMin.length > 0) {
            warnings.push(
                `«${div}»: ${underMin.length} equipo(s) con menos de ${effectiveMin} partidos reales (ej. ${underMin[0]!.name}).`
            );
        }

        allDivSpecs.push(...divSpecs);
    }

    if (!allDivSpecs.length) {
        return { matches: [] };
    }

    // ── Segunda pasada: mezclar categorías e intentar programar ────────────
    const interleaved = interleaveSpecsByDivision(allDivSpecs);

    if (targetDay === 'Sábado') {
        configs.Sábado = {
            ...configs.Sábado,
            lunch: { start: SATURDAY_LUNCH_START, end: SATURDAY_LUNCH_DEFAULT_END },
        };
    }

    const { placed, unplaced } = scheduleGreedy(targetDay, interleaved, configs, slotMins);

    const backToBack = countBackToBackTeamSlots(placed, slotMins);
    if (backToBack > 0) {
        const pendingNote = unplaced.length > 0 ? ' Algunos siguen sin hueco (PENDIENTE).' : '';
        warnings.push(
            `${backToBack} equipo(s) con dos partidos seguidos (permitido para encajar el calendario).${pendingNote} Puedes moverlos en la cuadrícula si quieres más descanso.`
        );
    }

    if (unplaced.length > 0) {
        const sample = unplaced
            .slice(0, 3)
            .map((s) => `${s.teamA} vs ${s.teamB} (${DIVISION_CODE[s.division]})`)
            .join('; ');
        warnings.push(
            `${unplaced.length} partido(s) sin hueco en ${targetDay} (marcados PENDIENTE). Ej.: ${sample}.`
        );
    }

    const now = Date.now();
    const dayCfg = configs[targetDay];

    const placedMatches: Match[] = placed
        .sort((a, b) => (a.timeMin !== b.timeMin ? a.timeMin - b.timeMin : a.courtIdx - b.courtIdx))
        .map((c, idx) => {
            const timeStr = minutesToTime(c.timeMin);
            return {
                id: `draft_muskiz_${targetDay}_${now}_${idx}`,
                time: timeStr,
                court: c.courtName,
                teamA: c.spec.teamA,
                teamB: c.spec.teamB,
                scoreA: null,
                scoreB: null,
                status: 'SCHEDULED' as const,
                round: `${dayCfg.dayShort} · ${timeStr} · ${c.spec.roundLabel}`,
                scheduleDay: dayCfg.label,
                isPublic: true,
            };
        });

    const overflowMatches: Match[] = unplaced.map((spec, idx) => ({
        id: `draft_muskiz_${targetDay}_${now}_pending_${idx}`,
        time: 'PENDIENTE',
        court: 'Sin asignar',
        teamA: spec.teamA,
        teamB: spec.teamB,
        scoreA: null,
        scoreB: null,
        status: 'SCHEDULED' as const,
        round: `${dayCfg.dayShort} · PENDIENTE · ${spec.roundLabel}`,
        scheduleDay: dayCfg.label,
        isPublic: true,
    }));

    return {
        matches: [...placedMatches, ...overflowMatches],
        warning: warnings.length > 0 ? warnings.join(' ') : undefined,
        lunchUsed:
            targetDay === 'Sábado' && configs.Sábado.lunch
                ? { start: configs.Sábado.lunch.start, end: configs.Sábado.lunch.end }
                : undefined,
    };
}

// ─── Constructor 3 días ───────────────────────────────────────────────────
export function buildMuskizWeekendDraftsByDay(
    allTeams: Team[],
    options?: MuskizSimulatorOptions
): { byDay: Record<MuskizScheduleDayLabel, Match[]>; error?: string; warning?: string } {
    const byDay: Record<MuskizScheduleDayLabel, Match[]> = { Viernes: [], Sábado: [], Domingo: [] };
    const warnings: string[] = [];
    for (const day of ['Viernes', 'Sábado', 'Domingo'] as MuskizScheduleDayLabel[]) {
        const { matches, error, warning } = buildMuskizDayDraftMatches(allTeams, day, options);
        if (error) return { byDay, error };
        byDay[day] = matches;
        if (warning) warnings.push(`${day}: ${warning}`);
    }
    return { byDay, warning: warnings.length > 0 ? warnings.join(' | ') : undefined };
}

export function buildMuskizWeekendDraftMatches(allTeams: Team[], options?: MuskizSimulatorOptions): MuskizBuildResult {
    const { byDay, error, warning } = buildMuskizWeekendDraftsByDay(allTeams, options);
    if (error) return { matches: [], error };
    return { matches: [...byDay.Viernes, ...byDay.Sábado, ...byDay.Domingo], warning };
}

// ─── Agrupación para cuadrícula ────────────────────────────────────────────
function matchBelongsToDay(m: Match, day: MuskizScheduleDayLabel): boolean {
    if (m.scheduleDay === day) return true;
    const p = (m.round ?? '').slice(0, 3).toLowerCase();
    if (day === 'Viernes') return p === 'vie';
    if (day === 'Sábado') return p === 'sab';
    return p === 'dom';
}

/** Extrae el código de categoría (CF, CM, JF…) del campo `round`. */
const CODE_TO_DIVISION: Record<string, Team['division']> = {
    CF: 'Cadete Femenino',
    CM: 'Cadete Masculino',
    JF: 'Juvenil Femenino',
    JM: 'Juvenil Masculino',
    SF: 'Senior Femenino',
    SM: 'Senior Masculino',
    IF: 'Infantil Femenino',
    IM: 'Infantil Masculino',
};

export function getDivisionCodeFromRound(round?: string): string | null {
    if (!round) return null;
    const m = /\b(CF|CM|JF|JM|SF|SM|IF|IM)\b/.exec(round);
    return m?.[1] ?? null;
}

/** Categoría+sexo desde la etiqueta del partido (CF, CM…). */
export function divisionFromMatchRound(round?: string): Team['division'] | null {
    const code = getDivisionCodeFromRound(round);
    return code ? CODE_TO_DIVISION[code] ?? null : null;
}

function realTeamsOverlapInSameDivision(
    a: { teamA: string; teamB: string; round?: string },
    b: { teamA: string; teamB: string; round?: string }
): boolean {
    const divA = divisionFromMatchRound(a.round);
    const divB = divisionFromMatchRound(b.round);
    if (!divA || !divB || divA !== divB) return false;
    const aTeams = [a.teamA, a.teamB].filter((t) => t && !isPlaceholderTeamName(t));
    const bSet = new Set([b.teamA, b.teamB]);
    return aTeams.some((t) => bSet.has(t));
}

export function resolveMatchDivision(match: Match, teams: Team[]): Team['division'] | null {
    const code = getDivisionCodeFromRound(match.round);
    if (code && CODE_TO_DIVISION[code]) return CODE_TO_DIVISION[code];

    const linked = teams.filter((t) => t.name === match.teamA || t.name === match.teamB);
    if (linked.length === 0) return null;
    const divisions = new Set(linked.map((t) => t.division));
    if (divisions.size === 1) return linked[0]!.division;
    return null;
}

/** Equipo real de un bando del partido dentro de su categoría (evita homónimos CF/CM, etc.). */
export function resolveTeamForMatchSide(
    match: Match,
    teamName: string,
    teams: Team[]
): Team | null {
    const division = resolveMatchDivision(match, teams);
    const roster = division
        ? teams.filter((t) => t.division === division && t.name === teamName)
        : teams.filter((t) => t.name === teamName);
    if (roster.length === 1) return roster[0]!;
    return null;
}

/** Misma identidad de equipo en dos partidos (solo compara dentro de la misma categoría). */
export function isSameScheduledTeam(
    teamName: string,
    matchA: Match,
    matchB: Match,
    teams: Team[]
): boolean {
    const divA = resolveMatchDivision(matchA, teams);
    const divB = resolveMatchDivision(matchB, teams);
    if (!divA || !divB || divA !== divB) return false;

    const teamA = resolveTeamForMatchSide(matchA, teamName, teams);
    const teamB = resolveTeamForMatchSide(matchB, teamName, teams);
    if (teamA && teamB) return teamA.id === teamB.id;
    return (
        (matchA.teamA === teamName || matchA.teamB === teamName) &&
        (matchB.teamA === teamName || matchB.teamB === teamName)
    );
}

export interface DayGridOptions {
    /** Rellena todas las franjas del día (p. ej. sábado 9:00–~21:00) con celdas vacías para arrastrar partidos. */
    fillEmptySlots?: boolean;
    slotDurationMins?: number;
    simulatorOptions?: MuskizSimulatorOptions;
}

export function groupMatchesForDayGrid(
    matches: Match[],
    day: MuskizScheduleDayLabel,
    gridOptions?: DayGridOptions
): {
    courts: string[];
    times: string[];
    grid: Record<string, Record<string, Match | null>>;
} {
    const dayMatches = matches.filter((m) => matchBelongsToDay(m, day));
    const cfg = getDayScheduleConfig(day, gridOptions?.simulatorOptions);
    const slotMins = gridOptions?.slotDurationMins ?? 35;

    let courts = gridOptions?.fillEmptySlots
        ? [...cfg.courts]
        : [...new Set(dayMatches.map((x) => x.court).filter((c) => c && c !== 'Sin asignar'))].sort((a, b) => {
              const na = parseInt(/\d+/.exec(a)?.[0] ?? '0', 10);
              const nb = parseInt(/\d+/.exec(b)?.[0] ?? '0', 10);
              return na - nb || a.localeCompare(b, 'es');
          });
    if (!courts.length) courts = [...cfg.courts];

    let times: string[];
    if (gridOptions?.fillEmptySlots) {
        times = buildFullDayTimeSlots(day, slotMins, gridOptions.simulatorOptions);
        if (dayMatches.some((m) => m.time === 'PENDIENTE')) times.push('PENDIENTE');
    } else {
        times = [...new Set(dayMatches.map((x) => x.time))].sort((a, b) => {
            if (a === 'PENDIENTE') return 1;
            if (b === 'PENDIENTE') return -1;
            return timeToMinutes(a) - timeToMinutes(b);
        });
    }

    const grid: Record<string, Record<string, Match | null>> = {};
    for (const t of times) grid[t] = Object.fromEntries(courts.map((c) => [c, null]));
    for (const m of dayMatches) {
        if (m.time === 'PENDIENTE' && !grid['PENDIENTE']) {
            grid['PENDIENTE'] = Object.fromEntries(courts.map((c) => [c, null]));
            if (!times.includes('PENDIENTE')) times.push('PENDIENTE');
        }
        if (!grid[m.time]) grid[m.time] = Object.fromEntries(courts.map((c) => [c, null]));
        if (!courts.includes(m.court) && m.court !== 'Sin asignar') courts.push(m.court);
        grid[m.time]![m.court] = m;
    }
    return { courts, times, grid };
}
