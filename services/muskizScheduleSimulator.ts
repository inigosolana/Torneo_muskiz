/**
 * Simulador determinístico de calendario fin de semana Muskiz (balonmano playa).
 *
 * Reglas por defecto (ajustables vía opciones):
 * - Viernes: solo cadetes (♀♂), 17:00–21:00, 6 campos; último inicio garantiza hueco dentro del tramo [start, fin).
 * - Sábado: juvenil + senior (♀♂), 9:00–21:00, 6 campos, pausa para comida 1 h.
 * - Domingo: infantiles (♀♂), 9:00–15:00, 4 campos.
 *
 * Por categoría: si todos los equipos tienen competition_group definido → esos grupos;
 * si no → reparto automático (2 grupos lo más igualados si hay más de 5 equipos).
 * Eliminaciones: si 2 grupos → 2 semifinales (1ºA vs 2ºB, 1ºB vs 2ºA) + final; si 1 grupo → final 1º vs 2º.
 *
 * Restricciones:
 * - Se intenta colocar todo en las franjas; lo que no cabe se devuelve igual con hora «PENDIENTE» y aviso.
 * - Cada equipo real debería tener al menos {@link MIN_REAL_MATCHES_PER_TEAM} partidos reales; si no, se avisa pero se genera lo posible.
 */
import type { Match, Team } from '../types';

export type MuskizScheduleDayLabel = 'Viernes' | 'Sábado' | 'Domingo';

/** Mínimo de partidos “reales” (ambos rivales son equipos inscritos) por equipo. */
export const MIN_REAL_MATCHES_PER_TEAM = 3;

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
    lunchEnd?: string;
}

const DIVISION_CODE: Record<Team['division'], string> = {
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
const JUV_SEN: Team['division'][] = [
    'Juvenil Femenino',
    'Juvenil Masculino',
    'Senior Femenino',
    'Senior Masculino',
];
const INFANTIL: Team['division'][] = ['Infantil Femenino', 'Infantil Masculino'];

function timeToMinutes(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
}

function minutesToTime(mins: number): string {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Genera inicios válidos dentro de [dayStart, dayEnd) donde quepa un bloque de slotMins. Opcional hueco para comida. */
function generateSlotStarts(dayStart: string, dayEnd: string, slotMins: number, lunch?: { start: string; end: string }): number[] {
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

type Phase = 'GRUPOS' | 'SEMIS' | 'FINAL';

interface RawMatchSpec {
    teamA: string;
    teamB: string;
    roundLabel: string;
    division: Team['division'];
    phase: Phase;
    /** Orden dentro del día para programar antes las fases grupos que KO */
    phaseOrder: number;
}

/** Round‑robin: ids de equipos índices 0..n-1 por nombre estable. */
function roundRobinPairs(groupNames: string[]): { a: string; b: string }[] {
    const n = groupNames.length;
    if (n < 2) return [];
    const pairs: { a: string; b: string }[] = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            pairs.push({ a: groupNames[i]!, b: groupNames[j]! });
        }
    }
    return pairs;
}

/**
 * Agrupa equipos pagados por división. Si todos tienen `competitionGroup`, úsalo;
 * si no, reparto automático en 2 subgrupos (A,B) cuando n>5, sí no un solo grupo.
 */
function computeGroups(teamList: Team[]): { key: string; names: string[] }[] | null {
    if (teamList.length === 0) return [];

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

    const sorted = [...teamList].sort((x, y) => x.name.localeCompare(y.name, 'es')).map((t) => t.name);
    const n = sorted.length;
    if (n <= 5) {
        return [{ key: 'A', names: sorted }];
    }
    const n1 = Math.floor(n / 2);
    return [
        { key: 'A', names: sorted.slice(0, n1) },
        { key: 'B', names: sorted.slice(n1) },
    ];
}

function divisionForTeams(teams: Team[]): Team['division'] {
    const d = teams[0]?.division;
    return d!;
}

/** Especificaciones de partido sin hora ni pista. */
function specsForPaidDivision(teams: Team[]): RawMatchSpec[] {
    const div = divisionForTeams(teams);
    const code = DIVISION_CODE[div];
    const groups = computeGroups(teams);
    if (!groups || groups.length === 0) return [];

    const out: RawMatchSpec[] = [];

    for (const g of groups) {
        const label = `${code}-${g.key}`;
        for (const { a, b } of roundRobinPairs(g.names)) {
            out.push({
                teamA: a,
                teamB: b,
                division: div,
                phase: 'GRUPOS',
                phaseOrder: 0,
                roundLabel: `Grupos · ${label}`,
            });
        }
    }

    const useSemis = groups.length >= 2;
    const gk = groups.map((x) => x.key);
    const [ga, gb] = [gk[0] ?? 'A', gk[1] ?? 'B'];

    if (useSemis) {
        const rA = ga;
        const rB = gb;
        out.push(
            {
                teamA: `1º Grupo ${rA}`,
                teamB: `2º Grupo ${rB}`,
                division: div,
                phase: 'SEMIS',
                phaseOrder: 1,
                roundLabel: `Semi · ${code} 1`,
            },
            {
                teamA: `1º Grupo ${rB}`,
                teamB: `2º Grupo ${rA}`,
                division: div,
                phase: 'SEMIS',
                phaseOrder: 1,
                roundLabel: `Semi · ${code} 2`,
            }
        );
        out.push({
            teamA: `Ganador Semi ${code} 1`,
            teamB: `Ganador Semi ${code} 2`,
            division: div,
            phase: 'FINAL',
            phaseOrder: 2,
            roundLabel: `Final · ${code}`,
        });
    } else {
        out.push({
            teamA: '1º Clasificado',
            teamB: '2º Clasificado',
            division: div,
            phase: 'FINAL',
            phaseOrder: 2,
            roundLabel: `Final · ${code}`,
        });
    }

    return out;
}

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
 * Añade partidos de grupo repetidos dentro del mismo subgrupo hasta que cada equipo
 * tenga al menos `min` enfrentamientos reales.
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

        const g = groups.find((gr) => gr.names.includes(needy));
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
            roundLabel: `Grupos · ${code}-${g.key} · mín.${min} · ${supIdx}`,
        });
        supIdx++;
    }

    return out;
}

function daySlotsCourtCapacity(day: MuskizScheduleDayLabel, configs: Record<MuskizScheduleDayLabel, DayConfig>, slotMins: number): number {
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

interface DayConfig {
    label: MuskizScheduleDayLabel;
    dayShort: string;
    /** Inicio primera franja HH:mm */
    playStart: string;
    /** Fin exclusivo: último inicio+hueco debe ser < esto */
    playEndExclusive: string;
    courts: string[];
    lunch?: { start: string; end: string };
}

const DEFAULT_COURTS_6 = ['Campo 1', 'Campo 2', 'Campo 3', 'Campo 4', 'Campo 5', 'Campo 6'];
const DEFAULT_COURTS_4 = ['Campo 1', 'Campo 2', 'Campo 3', 'Campo 4'];

function defaultConfigs(): Record<MuskizScheduleDayLabel, DayConfig> {
    return {
        Viernes: {
            label: 'Viernes',
            dayShort: 'Vie',
            playStart: '17:00',
            playEndExclusive: '21:00',
            courts: DEFAULT_COURTS_6,
        },
        Sábado: {
            label: 'Sábado',
            dayShort: 'Sab',
            playStart: '09:00',
            playEndExclusive: '21:00',
            courts: DEFAULT_COURTS_6,
            lunch: { start: '13:00', end: '14:00' },
        },
        Domingo: {
            label: 'Domingo',
            dayShort: 'Dom',
            playStart: '09:00',
            playEndExclusive: '15:00',
            courts: DEFAULT_COURTS_4,
        },
    };
}

interface ScheduledCell {
    timeMin: number;
    courtIdx: number;
    courtName: string;
    spec: RawMatchSpec;
}

function scheduleGreedy(day: MuskizScheduleDayLabel, specs: RawMatchSpec[], configs: Record<MuskizScheduleDayLabel, DayConfig>, slotMins: number): { placed: ScheduledCell[]; unplaced: RawMatchSpec[] } {
    const cfg = configs[day];
    const slotStartsMin = generateSlotStarts(cfg.playStart, cfg.playEndExclusive, slotMins, cfg.lunch);
    const courts = cfg.courts;

    /** Asignaciones: cada una bloquea [t,t+slotMins) × court y jugadores */
    type Ass = {
        tStart: number;
        tEnd: number;
        courtIdx: number;
        teams: [string, string];
    };
    const assigned: Ass[] = [];

    const sorted = [...specs].sort((a, b) => {
        if (a.phaseOrder !== b.phaseOrder) return a.phaseOrder - b.phaseOrder;
        return DIVISION_CODE[a.division].localeCompare(DIVISION_CODE[b.division], 'es');
    });

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

    for (const spec of sorted) {
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

/**
 * Equipos incluidos: pagados (`paymentStatus === 'PAID'`).
 * Genera partidos de un solo día de competición.
 */
export function buildMuskizDayDraftMatches(
    allTeams: Team[],
    targetDay: MuskizScheduleDayLabel,
    options?: MuskizSimulatorOptions
): MuskizBuildResult {
    const slotMins = options?.slotDurationMins ?? 35;
    const lunchStart = options?.lunchStart ?? '13:00';
    const lunchEnd = options?.lunchEnd ?? '14:00';
    const minReal = MIN_REAL_MATCHES_PER_TEAM;

    const paid = allTeams.filter((t) => t.paymentStatus === 'PAID');
    const byDivision = new Map<Team['division'], Team[]>();
    for (const t of paid) {
        if (!byDivision.has(t.division)) byDivision.set(t.division, []);
        byDivision.get(t.division)!.push(t);
    }

    const configs = defaultConfigs();
    if (lunchStart && lunchEnd) {
        configs.Sábado = { ...configs.Sábado, lunch: { start: lunchStart, end: lunchEnd } };
    }

    const specs: RawMatchSpec[] = [];
    const warnings: string[] = [];

    const orderDiv: Team['division'][] = [
        'Cadete Femenino',
        'Cadete Masculino',
        'Juvenil Femenino',
        'Juvenil Masculino',
        'Senior Femenino',
        'Senior Masculino',
        'Infantil Femenino',
        'Infantil Masculino',
    ];

    for (const div of orderDiv) {
        if (dayBucketForDivision(div) !== targetDay) continue;
        const list = byDivision.get(div);
        if (!list?.length || list.length < 2) continue;
        let divSpecs = specsForPaidDivision(list);
        const realNames = new Set(list.map((t) => t.name));
        divSpecs = ensureMinRealMatchesPerTeam(list, divSpecs, minReal);

        const m = countRealRealMatches(divSpecs, realNames);
        const underMin = list.filter((t) => (m.get(t.name) ?? 0) < minReal);
        if (underMin.length > 0) {
            warnings.push(
                `«${div}»: ${underMin.length} equipo(s) con menos de ${minReal} partidos reales (p. ej. ${underMin[0]!.name}).`
            );
        }

        const cap = daySlotsCourtCapacity(targetDay, configs, slotMins);
        if (specs.length + divSpecs.length > cap) {
            warnings.push(
                `«${div}»: ${specs.length + divSpecs.length} partidos previstos, capacidad teórica ${cap} (${slotMins} min). Revisa horarios o reduce fases.`
            );
        }
        specs.push(...divSpecs);
    }

    if (!specs.length) {
        return { matches: [] };
    }

    const { placed, unplaced } = scheduleGreedy(targetDay, specs, configs, slotMins);
    if (unplaced.length > 0) {
        const sample = unplaced
            .slice(0, 3)
            .map((s) => `${s.teamA} vs ${s.teamB} (${DIVISION_CODE[s.division]})`)
            .join('; ');
        warnings.push(
            `${unplaced.length} partido(s) sin hueco en ${targetDay} (hora «PENDIENTE»). Ej.: ${sample}.`
        );
    }

    const now = Date.now();
    const dayCfg = configs[targetDay];
    const placedMatches = placed
        .sort((a, b) => {
            if (a.timeMin !== b.timeMin) return a.timeMin - b.timeMin;
            return a.courtIdx - b.courtIdx;
        })
        .map((c, idx) => {
            const timeStr = minutesToTime(c.timeMin);
            const roundPrefix = `${dayCfg.dayShort} · ${timeStr}`;
            return {
                id: `draft_muskiz_${targetDay}_${now}_${idx}`,
                time: timeStr,
                court: c.courtName,
                teamA: c.spec.teamA,
                teamB: c.spec.teamB,
                scoreA: null,
                scoreB: null,
                status: 'SCHEDULED' as const,
                round: `${roundPrefix} · ${c.spec.roundLabel}`,
                scheduleDay: dayCfg.label,
                isPublic: true,
            };
        });

    const overflowMatches = unplaced.map((spec, idx) => ({
        id: `draft_muskiz_${targetDay}_${now}_pending_${idx}`,
        time: 'PENDIENTE',
        court: 'Sin asignar',
        teamA: spec.teamA,
        teamB: spec.teamB,
        scoreA: null,
        scoreB: null,
        status: 'SCHEDULED' as const,
        round: `${dayCfg.dayShort} · PENDIENTE · sin hueco · ${spec.roundLabel}`,
        scheduleDay: dayCfg.label,
        isPublic: true,
    }));

    const matches = [...placedMatches, ...overflowMatches];

    return {
        matches,
        warning: warnings.length > 0 ? warnings.join(' ') : undefined,
    };
}

export function buildMuskizWeekendDraftsByDay(
    allTeams: Team[],
    options?: MuskizSimulatorOptions
): { byDay: Record<MuskizScheduleDayLabel, Match[]>; error?: string; warning?: string } {
    const byDay: Record<MuskizScheduleDayLabel, Match[]> = {
        Viernes: [],
        Sábado: [],
        Domingo: [],
    };
    const warnings: string[] = [];
    for (const day of ['Viernes', 'Sábado', 'Domingo'] as MuskizScheduleDayLabel[]) {
        const { matches, error, warning } = buildMuskizDayDraftMatches(allTeams, day, options);
        if (error) return { byDay, error };
        byDay[day] = matches;
        if (warning) warnings.push(`${day}: ${warning}`);
    }
    return { byDay, warning: warnings.length > 0 ? warnings.join(' | ') : undefined };
}

/**
 * Equipos incluidos: pagados (`paymentStatus === 'PAID'`).
 */
export function buildMuskizWeekendDraftMatches(allTeams: Team[], options?: MuskizSimulatorOptions): MuskizBuildResult {
    const { byDay, error, warning } = buildMuskizWeekendDraftsByDay(allTeams, options);
    if (error) return { matches: [], error };
    const matches = [...byDay.Viernes, ...byDay.Sábado, ...byDay.Domingo];
    return { matches, warning };
}

/** Para la cuadrícula: agrupa por día y ordena huecos temporales únicos + columnas campo. */
function matchBelongsToDay(m: Match, day: MuskizScheduleDayLabel): boolean {
    if (m.scheduleDay === day) return true;
    const p = (m.round ?? '').slice(0, 3).toLowerCase();
    if (day === 'Viernes') return p === 'vie';
    if (day === 'Sábado') return p === 'sab';
    return p === 'dom';
}

/** Para la vista tipo Excel por día */
export function groupMatchesForDayGrid(matches: Match[], day: MuskizScheduleDayLabel): {
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
    for (const t of timesSet) grid[t] = Object.fromEntries(courts.map((c) => [c, null])) as Record<string, Match | null>;
    for (const m of dayMatches) {
        if (!grid[m.time]) grid[m.time] = Object.fromEntries(courts.map((c) => [c, null])) as Record<string, Match | null>;
        grid[m.time][m.court] = m;
    }
    return { courts, times: timesSet, grid };
}
