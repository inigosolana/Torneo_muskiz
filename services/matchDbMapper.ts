import type { Match, Team } from '../types';
import { inferMatchScheduleDay } from './tournamentScheduleService';
import {
    divisionFromMatchRound,
    findTeamInDivision,
    isPlaceholderTeamName,
} from './muskizScheduleSimulator';

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
    return row;
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

    let report: Match['report'] | undefined;
    if (r.report_type || r.report_image_uri || r.report_observations) {
        report = {
            type: r.report_type ?? 'DIGITAL',
            imageUri: r.report_image_uri ?? undefined,
            observations: r.report_observations ?? undefined,
            playerStats: [],
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
        status: (r.status as Match['status']) ?? 'SCHEDULED',
        round: r.round ?? undefined,
        report,
        scheduleDay: (r.schedule_day ?? r.scheduleDay) as Match['scheduleDay'] | undefined,
        isPublic: typeof r.is_public === 'boolean' ? r.is_public : true,
        referees: r.referees ? String(r.referees) : undefined,
    };
}
