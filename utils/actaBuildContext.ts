import type { Match, Team } from '../types';
import { siteContent } from '../constants/siteContent';
import { inferMatchScheduleDay } from '../services/tournamentScheduleService';
import { inferGenderMixLabel, formatPlayerNameForActa } from './matchReportSheetUtils';
import { playersListedOnActa } from './squadLimits';
import { resolveMatchDivision, resolveTeamForMatchSide } from '../services/muskizScheduleSimulator';

export interface ActaPlayerLine {
    number: string;
    name: string;
    docsOk: boolean;
}

export interface ActaTeamBlock {
    name: string;
    city?: string;
    players: ActaPlayerLine[];
}

export interface ActaExportContext {
    matchId: string;
    competitionName: string;
    category: string;
    gender: string;
    phase: string;
    group: string;
    scheduleDay: string;
    time: string;
    court: string;
    teamA: ActaTeamBlock;
    teamB: ActaTeamBlock;
    fileBaseName: string;
}

function teamBlock(team: Team | undefined, fallbackName: string): ActaTeamBlock {
    const players: ActaPlayerLine[] = team
        ? playersListedOnActa(team.players).map((p) => ({
              number: String(p.number ?? ''),
              name: formatPlayerNameForActa(p),
              docsOk: p.dniStatus === 'APPROVED' && p.insuranceStatus === 'APPROVED',
          }))
        : [];
    return {
        name: team?.name ?? fallbackName,
        city: team?.city,
        players,
    };
}

function phaseLabel(match: Match): string {
    return (match.round ?? '').split('·').slice(2).join('·').trim() || match.round || '—';
}

function safeFilePart(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 60);
}

/** Datos del partido para rellenar acta digital / DOCX / PDF. */
export function buildActaExportContext(match: Match, teams: Team[]): ActaExportContext {
    const teamA = resolveTeamForMatchSide(match, match.teamA, teams);
    const teamB = resolveTeamForMatchSide(match, match.teamB, teams);
    const category = resolveMatchDivision(match, teams) ?? teamA?.division ?? teamB?.division ?? '—';
    const day = inferMatchScheduleDay(match) ?? '';
    const blockA = teamBlock(teamA, match.teamA);
    const blockB = teamBlock(teamB, match.teamB);

    const fileBaseName = safeFilePart(
        `${day || 'dia'}_${match.time}_${blockA.name}_vs_${blockB.name}`.replace(/\s+/g, '_')
    );

    return {
        matchId: match.id,
        competitionName: (siteContent.heroTitle ?? 'Torneo Muskiz').toUpperCase(),
        category,
        gender: inferGenderMixLabel(teamA) || inferGenderMixLabel(teamB) || '—',
        phase: phaseLabel(match),
        group: teamA?.competitionGroup ?? teamB?.competitionGroup ?? '—',
        scheduleDay: day || '—',
        time: match.time || '—',
        court: [match.court, 'Muskiz'].filter(Boolean).join(' · '),
        teamA: blockA,
        teamB: blockB,
        fileBaseName,
    };
}

/** Inicializa estadísticas del acta digital para todos los jugadores de plantilla. */
export function buildInitialDigitalReportStats(teamA: Team | undefined, teamB: Team | undefined): {
    playerId: string;
    goals: number;
    yellowCards: number;
    redCards: number;
}[] {
    const stats: { playerId: string; goals: number; yellowCards: number; redCards: number }[] = [];
    for (const team of [teamA, teamB]) {
        if (!team) continue;
        for (const p of playersListedOnActa(team.players)) {
            stats.push({ playerId: p.id, goals: 0, yellowCards: 0, redCards: 0 });
        }
    }
    return stats;
}
