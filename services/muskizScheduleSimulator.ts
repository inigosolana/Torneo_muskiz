/**
 * Simulador determinístico de calendario fin de semana Muskiz (balonmano playa).
 *
 * Reglas por defecto:
 * - Viernes: solo cadetes (♀♂), 17:00–21:00, 6 campos.
 * - Sábado: juvenil + senior (♀♂), 9:00–21:00, comida 14:00–15:30/15:50/16:00, 6 campos.
 * - Domingo: infantiles (♀♂), 9:00–15:00, 4 campos.
 *
 * Formato por número de equipos en la categoría:
 * - ≤3 equipos : liguilla → final 1º vs 2º
 * - 4–5 equipos: liguilla → semis (1ºA vs 3ºA, 2ºA vs 4ºA) → final
 * - 6–10 equipos: 2 grupos → semis (1ºA vs 2ºB, 1ºB vs 2ºA) → final
 * - ≥11 equipos: 4 grupos → cuartos → semis → final
 *
 * El simulador intenta que cada equipo juegue ≥4 partidos reales; si no cabe, baja a ≥3.
 * Los partidos sin hueco aparecen con hora PENDIENTE (no se bloquea la generación).
 * Las fases de grupos/cuartos se programan antes que semis/finales.
 * Las finales se reservan en las últimas franjas del día (cierre del calendario).
 * Se mezclan categorías en la tabla (interleaved) para mayor variedad.
 * Evita en lo posible que un equipo juegue dos partidos seguidos (franjas consecutivas).
 */
import type { Match, Team } from '../types';

export type MuskizScheduleDayLabel = 'Viernes' | 'Sábado' | 'Domingo';

/** Mínimo de equipos por grupo de competición. */
export const MIN_TEAMS_PER_GROUP = 3;

/** Mínimo de partidos "reales" (ambos rivales son equipos inscritos) por equipo. */
export const MIN_REAL_MATCHES_PER_TEAM = 3;
/** Objetivo preferido de partidos reales por equipo (si cabe). */
export const TARGET_REAL_MATCHES_PER_TEAM = 4;

/** Duraciones de comida (min) desde las 14:00: 1h30, 1h50 (ej. 15:50), 2h. */
const LUNCH_DURATION_MINS_OPTIONS = [90, 110, 120] as const;
/** Inicio comida sábado: tras la mañana (último hueco habitual ~13:05). */
const SATURDAY_LUNCH_START = '14:00';
const SATURDAY_LUNCH_DEFAULT_END = '15:50';

export interface MuskizBuildResult {
    matches: Match[];
    /** Bloqueo total (p. ej. sin equipos). */
    error?: string;
    /** Aviso: borrador generado pero revisar huecos o mínimos. */
    warning?: string;
    /** Comida aplicada en sábado (si se optimizó automáticamente). */
    lunchUsed?: { start: string; end: string };
}

export interface MuskizSimulatorOptions {
    /** Minutos por bloque partido+cambio (Excel referencia ~35). */
    slotDurationMins?: number;
    lunchStart?: string;
    /** Fin de comida. Por defecto 15:50 (1h50 desde 14:00). */
    lunchEnd?: string;
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
type Phase = 'GRUPOS' | 'CUARTOS' | 'SEMIS' | 'FINAL';

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
function autoGroupCount(n: number): number {
    if (n < MIN_TEAMS_PER_GROUP) return n >= 2 ? 1 : 0;
    if (n <= 5) return 1;
    if (n <= 8) return 2;
    if (n <= 11) return 3;
    return 4;
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
        return mergeUndersizedGroups(raw);
    }

    const sorted = [...teamList]
        .sort((x, y) => x.name.localeCompare(y.name, 'es'))
        .map((t) => t.name);

    let groupCount = autoGroupCount(n);
    while (groupCount > 1 && Math.floor(n / groupCount) < MIN_TEAMS_PER_GROUP) groupCount--;
    if (groupCount <= 0) return [];
    return splitNamesIntoGroups(sorted, groupCount);
}

/** Partidos previstos por equipo en la categoría (fase grupos + extras hasta objetivo). */
export function countMatchesPerTeamForDivision(teamList: Team[]): { name: string; matches: number }[] {
    if (teamList.length === 0) return [];
    const base = specsForPaidDivision(teamList);
    const specs = ensureMinRealMatchesPerTeam(teamList, base, TARGET_REAL_MATCHES_PER_TEAM);
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
 * ≤3 equipos  → liguilla + final
 * 4–5 equipos → liguilla + semis (1º vs 3º, 2º vs 4º) + final
 * 6–10 equipos → 2 grupos + semis + final
 * ≥11 equipos → 4 grupos + cuartos + semis + final
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
    if (n >= 11 && numGroups >= 4) {
        // ≥11 equipos: cuartos → semis → final
        const [ga, gb, gc, gd] = [gkeys[0] ?? 'A', gkeys[1] ?? 'B', gkeys[2] ?? 'C', gkeys[3] ?? 'D'];
        out.push(
            { teamA: `1º Gr.${ga}`, teamB: `2º Gr.${gb}`, division: div, phase: 'CUARTOS', phaseOrder: 1, roundLabel: `Cuartos · ${code} 1` },
            { teamA: `1º Gr.${gb}`, teamB: `2º Gr.${ga}`, division: div, phase: 'CUARTOS', phaseOrder: 1, roundLabel: `Cuartos · ${code} 2` },
            { teamA: `1º Gr.${gc}`, teamB: `2º Gr.${gd}`, division: div, phase: 'CUARTOS', phaseOrder: 1, roundLabel: `Cuartos · ${code} 3` },
            { teamA: `1º Gr.${gd}`, teamB: `2º Gr.${gc}`, division: div, phase: 'CUARTOS', phaseOrder: 1, roundLabel: `Cuartos · ${code} 4` },
        );
        out.push(
            { teamA: `Gan.Ctos ${code} 1`, teamB: `Gan.Ctos ${code} 2`, division: div, phase: 'SEMIS', phaseOrder: 2, roundLabel: `Semi · ${code} 1` },
            { teamA: `Gan.Ctos ${code} 3`, teamB: `Gan.Ctos ${code} 4`, division: div, phase: 'SEMIS', phaseOrder: 2, roundLabel: `Semi · ${code} 2` },
        );
        out.push({ teamA: `Gan.Semi ${code} 1`, teamB: `Gan.Semi ${code} 2`, division: div, phase: 'FINAL', phaseOrder: 3, roundLabel: `Final · ${code}` });
    } else if (numGroups >= 2) {
        // 6–10 equipos: semis + final
        const [ga, gb] = [gkeys[0] ?? 'A', gkeys[1] ?? 'B'];
        out.push(
            { teamA: `1º Grupo ${ga}`, teamB: `2º Grupo ${gb}`, division: div, phase: 'SEMIS', phaseOrder: 1, roundLabel: `Semi · ${code} 1` },
            { teamA: `1º Grupo ${gb}`, teamB: `2º Grupo ${ga}`, division: div, phase: 'SEMIS', phaseOrder: 1, roundLabel: `Semi · ${code} 2` },
        );
        out.push({ teamA: `Gan.Semi ${code} 1`, teamB: `Gan.Semi ${code} 2`, division: div, phase: 'FINAL', phaseOrder: 2, roundLabel: `Final · ${code}` });
    } else if (n >= 4) {
        // 4–5 equipos, 1 grupo: liguilla + semis (1vs3, 2vs4) + final
        out.push(
            { teamA: `1º Grupo A`, teamB: `3º Grupo A`, division: div, phase: 'SEMIS', phaseOrder: 1, roundLabel: `Semi · ${code} 1` },
            { teamA: `2º Grupo A`, teamB: `4º Grupo A`, division: div, phase: 'SEMIS', phaseOrder: 1, roundLabel: `Semi · ${code} 2` },
        );
        out.push({ teamA: `Gan.Semi ${code} 1`, teamB: `Gan.Semi ${code} 2`, division: div, phase: 'FINAL', phaseOrder: 2, roundLabel: `Final · ${code}` });
    } else {
        // 2–3 equipos: solo final
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
 * Añade partidos de grupo repetidos hasta que cada equipo tenga al menos `min` enfrentamientos reales.
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

        const others = g.names.filter((n) => n !== needy).sort((a, b) => (m.get(a) ?? 0) - (m.get(b) ?? 0));
        const partner = others[0];
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
        Viernes: { label: 'Viernes', dayShort: 'Vie', playStart: '17:00', playEndExclusive: '21:00', courts: DEFAULT_COURTS_6 },
        Sábado: { label: 'Sábado', dayShort: 'Sab', playStart: '09:00', playEndExclusive: '21:00', courts: DEFAULT_COURTS_6, lunch: { start: '14:00', end: '15:50' } },
        Domingo: { label: 'Domingo', dayShort: 'Dom', playStart: '09:00', playEndExclusive: '15:00', courts: DEFAULT_COURTS_4 },
    };
}

export function getDayScheduleConfig(
    day: MuskizScheduleDayLabel,
    options?: MuskizSimulatorOptions
): DayConfig {
    const configs = defaultConfigs();
    if (day === 'Sábado') {
        const start = options?.lunchStart ?? configs.Sábado.lunch?.start ?? SATURDAY_LUNCH_START;
        const end = options?.lunchEnd ?? configs.Sábado.lunch?.end ?? SATURDAY_LUNCH_DEFAULT_END;
        configs.Sábado = { ...configs.Sábado, lunch: { start, end } };
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

/** Elige duración de comida (90, 110 o 120 min desde 14:00) que maximice partidos colocados. */
function pickOptimalSaturdayLunch(
    day: MuskizScheduleDayLabel,
    specs: RawMatchSpec[],
    configs: Record<MuskizScheduleDayLabel, DayConfig>,
    slotMins: number
): { start: string; end: string } {
    const fallback = { start: SATURDAY_LUNCH_START, end: SATURDAY_LUNCH_DEFAULT_END };
    if (day !== 'Sábado' || !configs.Sábado.lunch) return fallback;

    const startMin = timeToMinutes(SATURDAY_LUNCH_START);
    let best: { start: string; end: string; placed: number; endMin: number } = {
        ...fallback,
        placed: -1,
        endMin: timeToMinutes(fallback.end),
    };

    for (const duration of LUNCH_DURATION_MINS_OPTIONS) {
        const endMin = startMin + duration;
        if (endMin + slotMins > timeToMinutes('21:00')) continue;
        const lunch = { start: minutesToTime(startMin), end: minutesToTime(endMin) };
        const trialConfigs = {
            ...configs,
            Sábado: { ...configs.Sábado, lunch },
        };
        const { placed } = scheduleGreedy(day, specs, trialConfigs, slotMins);
        if (
            placed.length > best.placed ||
            (placed.length === best.placed && endMin < best.endMin)
        ) {
            best = { start: lunch.start, end: lunch.end, placed: placed.length, endMin };
        }
    }
    return { start: best.start, end: best.end };
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
        /grupo|gr\.\s*[a-d]\b|clasificado|gan\.|ganador|ctos?\b/i.test(name) ||
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

interface ScheduleGreedyState {
    slotStartsMin: number[];
    courts: string[];
    slotMins: number;
    assigned: { tStart: number; tEnd: number; courtIdx: number; teams: [string, string] }[];
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
    }
): void {
    const { slotStartsMin, courts, slotMins, assigned } = state;
    const allowedSet =
        options.allowedSlotStarts != null ? new Set(options.allowedSlotStarts) : null;
    const forbiddenSet =
        options.forbiddenSlotStarts != null ? new Set(options.forbiddenSlotStarts) : null;

    const courtUsage = () => courts.map((_, ci) => assigned.filter((x) => x.courtIdx === ci).length);

    const teamLastEnd = (team: string): number => {
        let last = -Infinity;
        for (const x of assigned) {
            if (x.teams.includes(team)) last = Math.max(last, x.tEnd);
        }
        return last;
    };

    const teamMatchCount = (team: string): number =>
        assigned.filter((x) => x.teams.includes(team)).length;

    const restGapBefore = (team: string, ts: number): number => {
        const last = teamLastEnd(team);
        return Number.isFinite(last) && last !== -Infinity ? ts - last : Infinity;
    };

    const teamsBusy = (teams: [string, string], tStart: number, tEnd: number): boolean =>
        assigned.some(
            (x) =>
                x.tStart < tEnd &&
                x.tEnd > tStart &&
                (x.teams.includes(teams[0]) || x.teams.includes(teams[1]))
        );

    const courtBusy = (courtIdx: number, tStart: number, tEnd: number): boolean =>
        assigned.some((x) => x.courtIdx === courtIdx && x.tStart < tEnd && x.tEnd > tStart);

    const hasBackToBack = (teams: [string, string], ts: number): boolean => {
        for (const t of teams) {
            if (isPlaceholderTeamName(t)) continue;
            if (restGapBefore(t, ts) < slotMins) return true;
        }
        return false;
    };

    const scoreSlot = (
        teams: [string, string],
        ts: number,
        ci: number,
        usage: number[],
        allowBackToBack: boolean,
        slotTimePolicy: SlotTimePolicy
    ): number | null => {
        const te = ts + slotMins;
        if (courtBusy(ci, ts, te) || teamsBusy(teams, ts, te)) return null;

        const gapA = restGapBefore(teams[0], ts);
        const gapB = restGapBefore(teams[1], ts);
        const minGap = Math.min(gapA, gapB);

        if (!allowBackToBack && hasBackToBack(teams, ts)) return null;

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
        teams: [string, string],
        allowBackToBack: boolean,
        slotTimePolicy: SlotTimePolicy
    ): { ts: number; ci: number } | null => {
        let best: { ts: number; ci: number } | null = null;
        let bestScore = Infinity;

        const slotOrder =
            slotTimePolicy === 'earliest' ? slotStartsMin : [...slotStartsMin].reverse();

        for (const ts of slotOrder) {
            if (allowedSet && !allowedSet.has(ts)) continue;
            if (forbiddenSet?.has(ts)) continue;

            const usage = courtUsage();
            const courtOrder = courts.map((_, ci) => ci).sort((a, b) => usage[a]! - usage[b]!);
            for (const ci of courtOrder) {
                const score = scoreSlot(teams, ts, ci, usage, allowBackToBack, slotTimePolicy);
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
        const loadA = teamMatchCount(a.teamA) + teamMatchCount(a.teamB);
        const loadB = teamMatchCount(b.teamA) + teamMatchCount(b.teamB);
        if (loadB !== loadA) return loadB - loadA;
        return a.roundLabel.localeCompare(b.roundLabel, 'es');
    });

    for (const spec of sortedSpecs) {
        const teamsPair: [string, string] = [spec.teamA, spec.teamB];
        let best = findBestSlot(teamsPair, false, options.slotTimePolicy);
        if (!best) best = findBestSlot(teamsPair, true, options.slotTimePolicy);

        if (best) {
            const te = best.ts + slotMins;
            assigned.push({ tStart: best.ts, tEnd: te, courtIdx: best.ci, teams: teamsPair });
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

/**
 * Asigna horas y pistas evitando solapamiento de pista/equipo y, en lo posible,
 * dos partidos seguidos del mismo equipo (sin al menos una franja de descanso).
 * Las finales se reservan en las últimas franjas del día.
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

    const finalSpecs = specs.filter((s) => s.phase === 'FINAL');
    const nonFinalSpecs = specs.filter((s) => s.phase !== 'FINAL');
    const reservedFinalSlots = reservedFinalSlotStarts(slotStartsMin, finalSpecs.length, courts.length);

    const state = createScheduleGreedyState(slotStartsMin, courts, slotMins);

    scheduleSpecBatch(state, nonFinalSpecs, {
        slotTimePolicy: 'earliest',
        forbiddenSlotStarts: reservedFinalSlots,
    });

    scheduleSpecBatch(state, finalSpecs, {
        slotTimePolicy: 'latest',
        allowedSlotStarts: reservedFinalSlots.length > 0 ? reservedFinalSlots : slotStartsMin,
    });

    // Si alguna final no cabe en las franjas reservadas, reintenta en todo el día (tarde).
    const unplacedFinals = state.unplaced.filter((s) => s.phase === 'FINAL');
    if (unplacedFinals.length > 0) {
        state.unplaced = state.unplaced.filter((s) => s.phase !== 'FINAL');
        scheduleSpecBatch(state, unplacedFinals, {
            slotTimePolicy: 'latest',
        });
    }

    return { placed: state.placed, unplaced: state.unplaced };
}

/** Cuenta equipos reales con dos partidos en franjas consecutivas (sin descanso). */
function countBackToBackTeamSlots(placed: ScheduledCell[], slotMins: number): number {
    const byTeam = new Map<string, number[]>();
    for (const cell of placed) {
        for (const t of [cell.spec.teamA, cell.spec.teamB]) {
            if (isPlaceholderTeamName(t)) continue;
            if (!byTeam.has(t)) byTeam.set(t, []);
            byTeam.get(t)!.push(cell.timeMin);
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
            if (g.names.length < MIN_TEAMS_PER_GROUP) {
                warnings.push(
                    `«${div}» grupo ${g.key}: ${g.names.length} equipos (mínimo ${MIN_TEAMS_PER_GROUP}).`
                );
            }
        }

        const baseSpecs = specsForPaidDivision(list);
        const realNames = new Set(list.map((t) => t.name));

        // Intentar TARGET (4), bajar a MIN (3) si no caben
        let divSpecs = ensureMinRealMatchesPerTeam(list, [...baseSpecs], TARGET_REAL_MATCHES_PER_TEAM);
        if (allDivSpecs.length + divSpecs.length > cap) {
            divSpecs = ensureMinRealMatchesPerTeam(list, [...baseSpecs], MIN_REAL_MATCHES_PER_TEAM);
        }

        // Verificar mínimo alcanzado
        const m = countRealRealMatches(divSpecs, realNames);
        const underMin = list.filter((t) => (m.get(t.name) ?? 0) < MIN_REAL_MATCHES_PER_TEAM);
        if (underMin.length > 0) {
            warnings.push(
                `«${div}»: ${underMin.length} equipo(s) con menos de ${MIN_REAL_MATCHES_PER_TEAM} partidos reales (ej. ${underMin[0]!.name}).`
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
        const lunch = pickOptimalSaturdayLunch(targetDay, interleaved, configs, slotMins);
        configs.Sábado = { ...configs.Sábado, lunch };
    } else if (options?.lunchStart && options?.lunchEnd) {
        configs.Sábado = { ...configs.Sábado, lunch: { start: options.lunchStart, end: options.lunchEnd } };
    }

    const { placed, unplaced } = scheduleGreedy(targetDay, interleaved, configs, slotMins);

    const backToBack = countBackToBackTeamSlots(placed, slotMins);
    if (backToBack > 0) {
        warnings.push(
            `${backToBack} caso(s) de equipo con dos partidos seguidos (sin franja de descanso); revisa si puedes moverlos en la cuadrícula.`
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

export function resolveMatchDivision(match: Match, teams: Team[]): Team['division'] | null {
    const code = getDivisionCodeFromRound(match.round);
    if (code && CODE_TO_DIVISION[code]) return CODE_TO_DIVISION[code];
    const ta = teams.find((t) => t.name === match.teamA);
    if (ta) return ta.division;
    const tb = teams.find((t) => t.name === match.teamB);
    return tb?.division ?? null;
}

export interface DayGridOptions {
    /** Rellena todas las franjas 09:00–21:00 (o fin del día) con celdas vacías para arrastrar partidos. */
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
