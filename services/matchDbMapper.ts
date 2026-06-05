import type { BeachSetScores, Match, Team } from '../types';
import { getMatchGoalTotals, sumGoalsFromSetScores } from '../utils/beachSetScoring';
import { inferMatchScheduleDay } from './tournamentScheduleService';
import {
    divisionFromMatchRound,
    findTeamInDivision,
    isPlaceholderTeamName,
} from './muskizScheduleSimulator';

function numOrNull(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = typeof v === 'number' ? v : parseInt(String(v), 10);
    return Number.isNaN(n) ? null : n;
}

export function parseSetScoresFromDb(raw: unknown): BeachSetScores | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const o = raw as Record<string, unknown>;
    const set1A = numOrNull(o.set1A ?? o.set1_a);
    const set1B = numOrNull(o.set1B ?? o.set1_b);
    const set2A = numOrNull(o.set2A ?? o.set2_a);
    const set2B = numOrNull(o.set2B ?? o.set2_b);
    const shootoutA = numOrNull(o.shootoutA ?? o.shootout_a);
    const shootoutB = numOrNull(o.shootoutB ?? o.shootout_b);
    const hasAny = [set1A, set1B, set2A, set2B, shootoutA, shootoutB].some((x) => x !== null);
    if (!hasAny) return undefined;
    return { set1A, set1B, set2A, set2B, shootoutA, shootoutB };
}

export function resolveTeamIdForMatchSide(
    teamName: string,
    division: Team['division'] | null,
    teams: Team[]
): string | null {
    if (isPlaceholderTeamName(teamName)) return null;
    if (!division) return null;
    const t = findTeamInDivision(teams, teamName, division);
    return t?.id ?? null;
}

export function matchToDatabaseRow(
    m: Match,
    teams: Team[]
): Record<string, unknown> {
    const division = divisionFromMatchRound(m.round);
    const row: Record<string, unknown> = {
        time: m.time,
        court: m.court,
        team_a_name: m.teamA,
        team_b_name: m.teamB,
        team_a_id: resolveTeamIdForMatchSide(m.teamA, division, teams),
        team_b_id: resolveTeamIdForMatchSide(m.teamB, division, teams),
        score_a: m.scoreA,
        score_b: m.scoreB,
        status: m.status ?? 'SCHEDULED',
        round: m.round ?? null,
        schedule_day: m.scheduleDay ?? inferMatchScheduleDay(m) ?? null,
        is_public: m.isPublic ?? true,
        referees: m.referees ?? null,
    };
    if (m.report) {
        row.report_type = m.report.type;
        row.report_image_uri = m.report.imageUri ?? null;
        row.report_observations = m.report.observations ?? null;
    }
    if (m.report?.setScores) {
        row.set_scores = m.report.setScores;
    }
    const { goalsA, goalsB } = getMatchGoalTotals(m);
    if (m.report?.setScores || (m.goalsForA != null && m.goalsForB != null)) {
        row.goals_for_a = m.goalsForA ?? goalsA;
        row.goals_for_b = m.goalsForB ?? goalsB;
    }
    return row;
}

/** Rellena goalsForA/B desde set_scores si la BD aún no tiene goals_for_* */
export function enrichMatchGoalsFromSetScores(match: Match): Match {
    if (match.goalsForA != null && match.goalsForB != null) return match;
    const s = match.report?.setScores;
    if (!s) return match;
    const { goalsA, goalsB } = sumGoalsFromSetScores(s);
    return { ...match, goalsForA: goalsA, goalsForB: goalsB };
}

export function databaseRowToMatch(row: Record<string, unknown>): Match {
    const r = row as Record<string, any>;
    const teamA =
        (r.team_a_name != null && String(r.team_a_name).trim()) ||
        (r.team_a?.name != null && String(r.team_a.name).trim()) ||
        String(r.team_a ?? r.teamA ?? '');
    const teamB =
        (r.team_b_name != null && String(r.team_b_name).trim()) ||
        (r.team_b?.name != null && String(r.team_b.name).trim()) ||
        String(r.team_b ?? r.teamB ?? '');

    const setScores = parseSetScoresFromDb(r.set_scores);

    let report: Match['report'] | undefined;
    if (r.report_type || r.report_image_uri || r.report_observations || setScores) {
        report = {
            type: r.report_type ?? 'DIGITAL',
            imageUri: r.report_image_uri ?? undefined,
            observations: r.report_observations ?? undefined,
            playerStats: [],
            ...(setScores ? { setScores } : {}),
        };
    } else if (r.report && typeof r.report === 'object') {
        report = r.report as Match['report'];
    }

    return {
        id: String(r.id ?? ''),
        time: String(r.time ?? ''),
        court: String(r.court ?? ''),
        teamA,
        teamB,
        scoreA: r.score_a ?? r.scoreA ?? null,
        scoreB: r.score_b ?? r.scoreB ?? null,
        goalsForA: numOrNull(r.goals_for_a ?? r.goalsForA),
        goalsForB: numOrNull(r.goals_for_b ?? r.goalsForB),
        status: (r.status as Match['status']) ?? 'SCHEDULED',
        round: r.round ?? undefined,
        report,
        scheduleDay: (r.schedule_day ?? r.scheduleDay) as Match['scheduleDay'] | undefined,
        isPublic: typeof r.is_public === 'boolean' ? r.is_public : true,
        referees: r.referees ? String(r.referees) : undefined,
    };
}
