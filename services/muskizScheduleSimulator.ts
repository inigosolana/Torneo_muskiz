/**
 * Simulador determinístico de calendario fin de semana Muskiz (balonmano playa).
 *
 * Reglas por defecto:
 * - Viernes: solo cadetes (♀♂), 17:00–21:00, 6 campos.
 * - Sábado: juvenil + senior (♀♂), 9:00–21:00, comida 13:00–14:30, 6 campos.
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
 * Se mezclan categorías en la tabla (interleaved) para mayor variedad.
 */
import type { Match, Team } from '../types';

export type MuskizScheduleDayLabel = 'Viernes' | 'Sábado' | 'Domingo';

/** Mínimo de partidos "reales" (ambos rivales son equipos inscritos) por equipo. */
export const MIN_REAL_MATCHES_PER_TEAM = 3;
/** Objetivo preferido de partidos reales por equipo (si cabe). */
export const TARGET_REAL_MATCHES_PER_TEAM = 4;

export interface MuskizBuildResult {
    matches: Match[];
    /** Bloqueo total (p. ej. sin equipos). */
    error?: string;
    /** Aviso: borrador generado pero revisar huecos o mínimos. */
    warning?: string;
}

export interface MuskizSimulatorOptions {
    /** Minutos por bloque partido+cambio (Excel referencia ~35). */
    slotDurationMins?: number;
    lunchStart?: string;
    /** Fin de comida. Por defecto 14:30 (90 min). Máximo recomendado: 15:00 (2 h). */
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
/**
 * Si todos los equipos tienen competitionGroup → los respeta.
 * Si no: asigna automáticamente según número de equipos:
 *  ≤5 → 1 grupo;  6–10 → 2 grupos;  ≥11 → 4 grupos.
 */
/** Grupos de competición para una lista de equipos (respeta competitionGroup si todos lo tienen). */
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
        return [...map.entries()]
            .sort(([a], [b]) => a.localeCompare(b, 'es'))
            .map(([key, names]) => ({ key, names: names.sort((x, y) => x.localeCompare(y, 'es')) }));
    }

    const sorted = [...teamList]
        .sort((x, y) => x.name.localeCompare(y.name, 'es'))
        .map((t) => t.name);

    if (n <= 5) {
        return [{ key: 'A', names: sorted }];
    }
    if (n <= 10) {
        const n1 = Math.ceil(n / 2);
        return [
            { key: 'A', names: sorted.slice(0, n1) },
            { key: 'B', names: sorted.slice(n1) },
        ];
    }
    // ≥11: 4 grupos lo más igualados posible
    const letters = ['A', 'B', 'C', 'D'];
    const groups: { key: string; names: string[] }[] = [];
    const baseSize = Math.floor(n / 4);
    const extras = n % 4;
    let idx = 0;
    for (let i = 0; i < 4; i++) {
        const size = baseSize + (i < extras ? 1 : 0);
        if (idx < n) {
            groups.push({ key: letters[i]!, names: sorted.slice(idx, idx + size) });
            idx += size;
        }
    }
    return groups.filter((g) => g.names.length >= 2);
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

function defaultConfigs(): Record<MuskizScheduleDayLabel, DayConfig> {
    return {
        Viernes: { label: 'Viernes', dayShort: 'Vie', playStart: '17:00', playEndExclusive: '21:00', courts: DEFAULT_COURTS_6 },
        Sábado: { label: 'Sábado', dayShort: 'Sab', playStart: '09:00', playEndExclusive: '21:00', courts: DEFAULT_COURTS_6, lunch: { start: '13:00', end: '14:30' } },
        Domingo: { label: 'Domingo', dayShort: 'Dom', playStart: '09:00', playEndExclusive: '15:00', courts: DEFAULT_COURTS_4 },
    };
}

// ─── Planificador greedy ───────────────────────────────────────────────────
interface ScheduledCell {
    timeMin: number;
    courtIdx: number;
    courtName: string;
    spec: RawMatchSpec;
}

/**
 * Asigna horas y pistas evitando:
 *  - solapamiento de pista
 *  - dos partidos consecutivos del mismo equipo
 * Las specs ya vienen interleaved (GRUPOS de todas las categorías, luego CUARTOS, etc.)
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

    type Ass = { tStart: number; tEnd: number; courtIdx: number; teams: [string, string] };
    const assigned: Ass[] = [];

    const placed: ScheduledCell[] = [];
    const unplaced: RawMatchSpec[] = [];

    const teamsBusy = (teams: [string, string], tStart: number, tEnd: number): boolean =>
        assigned.some(
            (x) =>
                x.tStart < tEnd &&
                x.tEnd > tStart &&
                (x.teams.includes(teams[0]) || x.teams.includes(teams[1]))
        );

    const courtBusy = (courtIdx: number, tStart: number, tEnd: number): boolean =>
        assigned.some((x) => x.courtIdx === courtIdx && x.tStart < tEnd && x.tEnd > tStart);

    for (const spec of specs) {
        const teamsPair: [string, string] = [spec.teamA, spec.teamB];
        let ok = false;

        outer: for (const ts of slotStartsMin) {
            const te = ts + slotMins;
            for (let ci = 0; ci < courts.length; ci++) {
                if (courtBusy(ci, ts, te)) continue;
                if (teamsBusy(teamsPair, ts, te)) continue;
                assigned.push({ tStart: ts, tEnd: te, courtIdx: ci, teams: teamsPair });
                placed.push({ timeMin: ts, courtIdx: ci, courtName: courts[ci]!, spec });
                ok = true;
                break outer;
            }
        }

        if (!ok) unplaced.push(spec);
    }

    return { placed, unplaced };
}

// ─── Constructor principal por día ─────────────────────────────────────────
export function buildMuskizDayDraftMatches(
    allTeams: Team[],
    targetDay: MuskizScheduleDayLabel,
    options?: MuskizSimulatorOptions
): MuskizBuildResult {
    const slotMins = options?.slotDurationMins ?? 35;
    const lunchStart = options?.lunchStart ?? '13:00';
    const lunchEnd = options?.lunchEnd ?? '14:30';

    const paid = allTeams.filter((t) => t.paymentStatus === 'PAID');
    const byDivision = new Map<Team['division'], Team[]>();
    for (const t of paid) {
        if (!byDivision.has(t.division)) byDivision.set(t.division, []);
        byDivision.get(t.division)!.push(t);
    }

    const configs = defaultConfigs();
    configs.Sábado = { ...configs.Sábado, lunch: { start: lunchStart, end: lunchEnd } };

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
    const { placed, unplaced } = scheduleGreedy(targetDay, interleaved, configs, slotMins);

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

export function groupMatchesForDayGrid(
    matches: Match[],
    day: MuskizScheduleDayLabel
): {
    courts: string[];
    times: string[];
    grid: Record<string, Record<string, Match | null>>;
} {
    const dayMatches = matches.filter((m) => matchBelongsToDay(m, day));
    const courts = [...new Set(dayMatches.map((x) => x.court))].sort((a, b) => {
        const na = parseInt(/\d+/.exec(a)?.[0] ?? '0', 10);
        const nb = parseInt(/\d+/.exec(b)?.[0] ?? '0', 10);
        return na - nb || a.localeCompare(b, 'es');
    });
    const timesSet = [...new Set(dayMatches.map((x) => x.time))].sort((a, b) => {
        if (a === 'PENDIENTE') return 1;
        if (b === 'PENDIENTE') return -1;
        return timeToMinutes(a) - timeToMinutes(b);
    });
    const grid: Record<string, Record<string, Match | null>> = {};
    for (const t of timesSet) grid[t] = Object.fromEntries(courts.map((c) => [c, null]));
    for (const m of dayMatches) {
        if (!grid[m.time]) grid[m.time] = Object.fromEntries(courts.map((c) => [c, null]));
        grid[m.time][m.court] = m;
    }
    return { courts, times: timesSet, grid };
}
