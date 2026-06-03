import type { CalendarSimulationsPayload, Match, Team } from '../types';

/** IDs fijos Senior Masculino — intercambio de grupo B↔C (calendario B→Blue Flow, C→Bitxi). */
export const SM_BITXI_TEAM_ID = '510dfdbb-e92a-4655-92a0-9a27e711cf8f';
export const SM_BLUE_FLOW_TEAM_ID = 'b813b5aa-c50e-450b-92f4-a81824cd295f';

const BITXI = 'Bitxi Pare Bihurri';
const BLUE = 'Blue Flow';

/** Rivales del calendario que tenía Bitxi en grupo B */
const SCHEDULE_B_OPP = new Set(['Kolosaurios B', 'Blcbu', 'Stone Basauri Aristocats']);
/** Rivales del calendario que tenía Blue Flow en grupo C */
const SCHEDULE_C_OPP = new Set(['Kolosaurios A', 'U. Blue Butterflies']);

function opponent(m: Pick<Match, 'teamA' | 'teamB'>): string {
    if (m.teamA === BITXI || m.teamA === BLUE) return m.teamB;
    if (m.teamB === BITXI || m.teamB === BLUE) return m.teamA;
    return '';
}

/** Intercambia nombre en partido según calendario B/C (mismos rivales y hora). */
export function applySmBitxiBlueFlowMatchSwap(m: Match): Match {
    const opp = opponent(m);
    let teamA = m.teamA;
    let teamB = m.teamB;
    let round = m.round ?? '';

    if (SCHEDULE_B_OPP.has(opp)) {
        if (teamA === BITXI || teamA === BLUE) teamA = BLUE;
        if (teamB === BITXI || teamB === BLUE) teamB = BLUE;
        round = round.replace(/\bSM-[ABC]\b/g, 'SM-B');
    } else if (SCHEDULE_C_OPP.has(opp)) {
        if (teamA === BITXI || teamA === BLUE) teamA = BITXI;
        if (teamB === BITXI || teamB === BLUE) teamB = BITXI;
        round = round.replace(/\bSM-[ABC]\b/g, 'SM-C');
    }

    if (teamA === m.teamA && teamB === m.teamB && round === (m.round ?? '')) return m;
    return { ...m, teamA, teamB, round };
}

/** Aplica intercambio de competition_group en memoria (Grupos + Clasificación). */
export function applySmBitxiBlueFlowGroupSwap<T extends Pick<Team, 'id' | 'competitionGroup'>>(teams: T[]): T[] {
    return teams.map((t) => {
        if (t.id === SM_BITXI_TEAM_ID) return { ...t, competitionGroup: 'C' };
        if (t.id === SM_BLUE_FLOW_TEAM_ID) return { ...t, competitionGroup: 'B' };
        return t;
    });
}

/** Aplica intercambio en todos los borradores de simulación al leer/guardar. */
export function applySmBitxiBlueFlowSimulationPayload(
    payload: CalendarSimulationsPayload
): CalendarSimulationsPayload {
    return {
        ...payload,
        drafts: payload.drafts.map((d) => ({
            ...d,
            matches: d.matches.map((m) => applySmBitxiBlueFlowMatchSwap(m)),
        })),
    };
}
