import type { Match, Team } from '../types';
import {
    DIVISION_CODE,
    computeGroups,
    getDivisionEliminationTemplate,
    liguillaUsesCrossSemifinals,
    resolveMatchDivision,
    type DivisionEliminationSlot,
} from '../services/muskizScheduleSimulator';
import { getMatchSetsDisplay } from './beachSetScoring';

export const TOURNAMENT_DIVISIONS: Team['division'][] = [
    'Infantil Femenino',
    'Infantil Masculino',
    'Cadete Femenino',
    'Cadete Masculino',
    'Juvenil Femenino',
    'Juvenil Masculino',
    'Senior Femenino',
    'Senior Masculino',
];

const PHASE_LABELS: Record<DivisionEliminationSlot['phase'], string> = {
    REPESCA: 'Repesca / consolación',
    CUARTOS: 'Cuartos de final',
    SEMIS: 'Semifinales',
    TERCER_PUESTO: '3º y 4º puesto',
    FINAL: 'Final',
};

const PHASE_ORDER: DivisionEliminationSlot['phase'][] = [
    'REPESCA',
    'CUARTOS',
    'SEMIS',
    'TERCER_PUESTO',
    'FINAL',
];

export interface TeamFinalPhasePath {
    /** Ej. «1º del Grupo A» */
    ifPosition: string;
    /** Ej. «Semi 1: 1º Gr.A vs 2º Gr.B» */
    accessLabel: string;
    slot: DivisionEliminationSlot;
}

function paidTeamsInDivision(teams: Team[], division: Team['division']): Team[] {
    return teams.filter((t) => t.division === division && t.paymentStatus === 'PAID');
}

export function isEliminationMatch(m: Match, division: Team['division'], teams: Team[]): boolean {
    if (resolveMatchDivision(m, teams) !== division) return false;
    const r = (m.round ?? '').toLowerCase();
    if (r.includes('grupos')) return false;
    return /semi|cuarto|final|repesca|consolaci|3º|4º|perd\.|tercer/i.test(r);
}

function normalizeSide(label: string): string {
    return label.trim().toLowerCase().replace(/\s+/g, ' ');
}

function slotMatchKey(slot: DivisionEliminationSlot): string {
    const a = normalizeSide(slot.teamA);
    const b = normalizeSide(slot.teamB);
    return [a, b].sort().join('|');
}

function matchSidesKey(m: Match): string {
    const a = normalizeSide(m.teamA);
    const b = normalizeSide(m.teamB);
    return [a, b].sort().join('|');
}

/** Empareja partido publicado con hueco de plantilla (nombres reales o plantilla). */
export function findMatchForEliminationSlot(
    slot: DivisionEliminationSlot,
    matches: Match[],
    division: Team['division'],
    teams: Team[]
): Match | null {
    const slotKey = slotMatchKey(slot);
    const roundNeedle = slot.roundLabel.split('·').slice(0, 2).join('·').trim().toLowerCase();

    for (const m of matches) {
        if (!isEliminationMatch(m, division, teams)) continue;
        if (matchSidesKey(m) === slotKey) return m;
        const r = (m.round ?? '').toLowerCase();
        if (roundNeedle && r.includes(roundNeedle.replace(/\s+/g, ''))) return m;
        if (r.includes(slot.roundLabel.toLowerCase().slice(0, 12))) return m;
    }
    return null;
}

export function getEliminationSlotsForDivision(
    teams: Team[],
    division: Team['division']
): DivisionEliminationSlot[] {
    const paid = paidTeamsInDivision(teams, division);
    return getDivisionEliminationTemplate(paid).sort(
        (a, b) =>
            a.phaseOrder - b.phaseOrder ||
            PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase) ||
            a.roundLabel.localeCompare(b.roundLabel, 'es')
    );
}

function slotReferencesGroup(slot: DivisionEliminationSlot, groupKey: string): boolean {
    const blob = `${slot.teamA} ${slot.teamB} ${slot.roundLabel}`;
    const g = groupKey.trim();
    if (!g) return false;
    return new RegExp(`Gr\\.\\s*${g}\\b`, 'i').test(blob) || new RegExp(`1º${g}|2º${g}|3º${g}`, 'i').test(blob);
}

/** Posibles accesos a fase final desde el grupo del equipo (todas las opciones del formato). */
export function getTeamFinalPhasePaths(
    team: Team,
    teams: Team[],
    _matches: Match[]
): TeamFinalPhasePath[] {
    const division = team.division;
    const groupKey = (team.competitionGroup ?? 'A').trim() || 'A';
    const paid = paidTeamsInDivision(teams, division);
    const slots = getDivisionEliminationTemplate(paid);
    const groups = computeGroups(paid);
    const paths: TeamFinalPhasePath[] = [];
    const seen = new Set<string>();

    const push = (ifPosition: string, slot: DivisionEliminationSlot) => {
        const key = `${ifPosition}|${slot.roundLabel}`;
        if (seen.has(key)) return;
        seen.add(key);
        const side =
            slot.teamA.includes(`Gr.${groupKey}`) || slot.teamA.includes(`Gr.${groupKey.toUpperCase()}`)
                ? slot.teamA
                : slot.teamB.includes(`Gr.${groupKey}`) || slot.teamB.includes(`Gr.${groupKey.toUpperCase()}`)
                  ? slot.teamB
                  : ifPosition;
        paths.push({
            ifPosition,
            accessLabel: `${slot.roundLabel}: ${slot.teamA} vs ${slot.teamB}`,
            slot,
        });
        void side;
    };

    if (groups && groups.length >= 2) {
        for (const slot of slots) {
            if (!slotReferencesGroup(slot, groupKey)) continue;
            if (/1º\s*Gr\./i.test(slot.teamA) && slot.teamA.includes(groupKey)) {
                push(`1º del Grupo ${groupKey}`, slot);
            } else if (/2º\s*Gr\./i.test(slot.teamA) && slot.teamA.includes(groupKey)) {
                push(`2º del Grupo ${groupKey}`, slot);
            } else if (/2º\s*Gr\./i.test(slot.teamB) && slot.teamB.includes(groupKey)) {
                push(`2º del Grupo ${groupKey}`, slot);
            } else if (/1º\s*Gr\./i.test(slot.teamB) && slot.teamB.includes(groupKey)) {
                push(`1º del Grupo ${groupKey}`, slot);
            } else if (/3º\s*Gr\./i.test(slot.teamA + slot.teamB) && (slot.teamA + slot.teamB).includes(groupKey)) {
                push(`3º del Grupo ${groupKey}`, slot);
            }
        }
    }

    if (groups && groups.length === 1) {
        if (liguillaUsesCrossSemifinals(division) && paid.length >= 4) {
            const semiSlots = slots.filter((s) => s.phase === 'SEMIS');
            for (const pos of ['1º', '2º', '3º', '4º'] as const) {
                const label = `${pos} Clasificado`;
                const slot =
                    pos === '1º' || pos === '4º'
                        ? semiSlots.find((s) => /1º.*4º|4º.*1º/i.test(`${s.teamA} ${s.teamB}`))
                        : semiSlots.find((s) => /2º.*3º|3º.*2º/i.test(`${s.teamA} ${s.teamB}`));
                if (slot) push(`Si quedas ${label} en la liguilla`, slot);
            }
            const finalSlot = slots.find((s) => s.phase === 'FINAL');
            if (finalSlot) {
                push('Si ganas tu semifinal', finalSlot);
            }
        } else {
            const finalSlot = slots.find((s) => s.phase === 'FINAL');
            if (finalSlot) {
                push('Si quedas 1º en la liguilla', finalSlot);
                push('Si quedas 2º en la liguilla', finalSlot);
            }
        }
    }

    if (paths.length === 0) {
        for (const slot of slots) {
            if (slotReferencesGroup(slot, groupKey)) {
                push(`Participación desde Grupo ${groupKey}`, slot);
            }
        }
    }

    return paths.filter((p) => p.slot);
}

export function phaseLabel(phase: DivisionEliminationSlot['phase']): string {
    return PHASE_LABELS[phase];
}

export function formatEliminationMatchLine(m: Match | null, slot: DivisionEliminationSlot): string {
    if (!m) return `${slot.teamA} vs ${slot.teamB}`;
    const score = getMatchSetsDisplay(m);
    return `${m.teamA} vs ${m.teamB}${score ? ` (${score})` : ''}`;
}

export function divisionShortLabel(division: Team['division']): string {
    const code = DIVISION_CODE[division];
    const short: Record<string, string> = {
        IF: 'Inf. F',
        IM: 'Inf. M',
        CF: 'Cad. F',
        CM: 'Cad. M',
        JF: 'Juv. F',
        JM: 'Juv. M',
        SF: 'Sen. F',
        SM: 'Sen. M',
    };
    return short[code] ?? division;
}
