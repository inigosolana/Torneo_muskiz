/**
 * Calendario Muskiz híbrido:
 * 1) Simulador determinístico (estructura, fases, greedy, exhaustivo local)
 * 2) Google AI en lotes para TODOS los PENDIENTE (máx. 3 peticiones/día, 24 partidos/lote)
 * 3) Optimización local de descansos entre partidos (sin API)
 * Respeta las notas del organizador (formatDescription del borrador).
 */
import type { Match, Team } from '../types';
import { optimizeMuskizSlots } from './geminiService';
import {
    applyMuskizSlotAssignments,
    buildMuskizDayDraftMatches,
    buildMuskizSlotOptimizePayload,
    divisionFromMatchRound,
    improveScheduleRestGaps,
    isPlaceholderTeamName,
    MUSKIZ_AI_MAX_CALLS_PER_DAY,
    MUSKIZ_AI_SLOT_ASSIST_MAX,
    normalizeTeamLabel,
    resolveScheduleTeamKey,
    type MuskizBuildResult,
    type MuskizScheduleDayLabel,
    type MuskizSimulatorOptions,
} from './muskizScheduleSimulator';

async function refinePendingWithAi(
    day: MuskizScheduleDayLabel,
    matches: Match[],
    scheduleTeams: Team[],
    options?: MuskizSimulatorOptions
): Promise<{ matches: Match[]; aiNote?: string }> {
    let current = matches;
    const notes: string[] = [];
    let totalPlaced = 0;
    let apiCalls = 0;

    if (options?.aiSlotAssist !== false) {
        for (let round = 0; round < MUSKIZ_AI_MAX_CALLS_PER_DAY; round++) {
            const fullPayload = buildMuskizSlotOptimizePayload(day, current, options);
            if (!fullPayload?.pending.length) break;

            const payload = {
                ...fullPayload,
                pending: fullPayload.pending.slice(0, MUSKIZ_AI_SLOT_ASSIST_MAX),
            };

            apiCalls++;
            const { assignments, error } = await optimizeMuskizSlots(payload);
            if (error) {
                notes.push(`IA (${apiCalls}): ${error}`);
                break;
            }
            if (!assignments?.length) {
                notes.push(`IA (${apiCalls}): sin huecos nuevos`);
                break;
            }

            const { matches: merged, placedCount, rejectedCount } = applyMuskizSlotAssignments(
                current,
                assignments,
                day,
                options
            );
            current = merged;
            totalPlaced += placedCount;
            if (rejectedCount > 0) notes.push(`${rejectedCount} propuesta(s) rechazadas`);

            const stillPending = current.filter((m) => m.time === 'PENDIENTE').length;
            if (stillPending === 0) break;
            if (payload.pending.length < MUSKIZ_AI_SLOT_ASSIST_MAX) break;
        }

        const remaining = current.filter((m) => m.time === 'PENDIENTE').length;
        if (totalPlaced > 0) notes.unshift(`IA colocó ${totalPlaced} partido(s) en ${apiCalls} consulta(s)`);
        if (remaining > 0 && apiCalls >= MUSKIZ_AI_MAX_CALLS_PER_DAY) {
            notes.push(
                `${remaining} siguen PENDIENTE (límite ${MUSKIZ_AI_MAX_CALLS_PER_DAY} consultas/día; ajusta a mano)`
            );
        } else if (remaining > 0) {
            notes.push(`${remaining} siguen PENDIENTE`);
        }
    }

    const improved = improveScheduleRestGaps(current, day, options, scheduleTeams);
    const beforeBb = countBackToBack(improved, options?.slotDurationMins ?? 35, scheduleTeams);
    const afterNote =
        beforeBb > 0
            ? `; ${beforeBb} equipo(s) aún con partidos seguidos (revisa cuadrícula)`
            : '';

    return {
        matches: improved,
        aiNote: notes.length ? notes.join('; ') + afterNote + '.' : afterNote ? afterNote.slice(2) + '.' : undefined,
    };
}

function countBackToBack(matches: Match[], slotMins: number, scheduleTeams: Team[]): number {
    const byTeam = new Map<string, number[]>();
    for (const m of matches) {
        if (m.time === 'PENDIENTE') continue;
        const div = divisionFromMatchRound(m.round);
        if (!div) continue;
        for (const t of [m.teamA, m.teamB]) {
            if (isPlaceholderTeamName(t)) continue;
            const key = resolveScheduleTeamKey(div, t, scheduleTeams);
            if (!key.startsWith('id:')) continue;
            if (!byTeam.has(key)) byTeam.set(key, []);
            const [h, min] = m.time.split(':').map(Number);
            byTeam.get(key)!.push((h ?? 0) * 60 + (min ?? 0));
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
}

function appendWarning(base: string | undefined, extra: string | undefined): string | undefined {
    if (!extra) return base;
    return base ? `${base} ${extra}` : extra;
}

/** Un día: determinístico completo + IA por lotes + mejora local de descansos. */
export async function buildMuskizDayDraftMatchesHybrid(
    allTeams: Team[],
    targetDay: MuskizScheduleDayLabel,
    options?: MuskizSimulatorOptions
): Promise<MuskizBuildResult> {
    const base = buildMuskizDayDraftMatches(allTeams, targetDay, options);
    if (!base.matches.length) return base;

    const { matches, aiNote } = await refinePendingWithAi(targetDay, base.matches, allTeams, options);
    return {
        ...base,
        matches,
        warning: appendWarning(base.warning, aiNote),
    };
}

/** Tres días con notas de formato por borrador si se pasan en options por día. */
export async function buildMuskizWeekendDraftsByDayHybrid(
    allTeams: Team[],
    options?: MuskizSimulatorOptions,
    notesByDay?: Partial<Record<MuskizScheduleDayLabel, string>>
): Promise<{ byDay: Record<MuskizScheduleDayLabel, Match[]>; error?: string; warning?: string }> {
    const byDay: Record<MuskizScheduleDayLabel, Match[]> = { Viernes: [], Sábado: [], Domingo: [] };
    const warnings: string[] = [];

    for (const day of ['Viernes', 'Sábado', 'Domingo'] as MuskizScheduleDayLabel[]) {
        const dayNotes = notesByDay?.[day]?.trim() || options?.organizerNotes;
        const dayOptions: MuskizSimulatorOptions = {
            ...options,
            organizerNotes: dayNotes || undefined,
        };
        const { matches, error, warning } = await buildMuskizDayDraftMatchesHybrid(allTeams, day, dayOptions);
        if (error) return { byDay, error };
        byDay[day] = matches;
        if (warning) warnings.push(`${day}: ${warning}`);
    }

    return { byDay, warning: warnings.length ? warnings.join(' | ') : undefined };
}
