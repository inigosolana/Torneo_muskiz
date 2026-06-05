import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Match, Team } from '../types';
import { getCurrentTournamentDay } from '../constants/tournamentDates';
import { resolveMatchDivision } from '../services/muskizScheduleSimulator';
import { inferMatchScheduleDay } from '../services/tournamentScheduleService';
import { getMatchSetsDisplay } from '../utils/beachSetScoring';
import {
    formatNowClock,
    matchesAtCurrentHour,
    recentTournamentResults,
    shouldShowHomeLivePanel,
    upcomingMatchesToday,
} from '../utils/homeLiveMatches';
import { resolveTeamShield } from '../constants/teamShields';
import { TeamNameWithShield } from './TeamShield';

interface HomeTournamentLivePanelProps {
    matches: Match[];
    teams: Team[];
    publicMatchesVisible: boolean;
}

function shieldFor(teams: Team[], name: string): string | undefined {
    const team = teams.find((t) => t.name === name);
    return resolveTeamShield(name, team?.logoUrl);
}

function MatchScoreLine({ match }: { match: Match }) {
    const score = getMatchSetsDisplay(match);
    const live = match.status === 'LIVE';
    const finished = match.status === 'FINISHED' && score !== '—';

    return (
        <div className="flex items-center justify-center gap-2 min-w-[72px]">
            {live ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-red-400">
                    <span className="size-1.5 rounded-full bg-red-500 animate-pulse" />
                    En juego
                </span>
            ) : finished ? (
                <span className="font-mono text-lg font-black text-primary">{score}</span>
            ) : (
                <span className="text-xs font-bold text-slate-500">vs</span>
            )}
        </div>
    );
}

function MatchRow({ match, teams, compact }: { match: Match; teams: Team[]; compact?: boolean }) {
    const day = inferMatchScheduleDay(match);
    const division = resolveMatchDivision(match, teams);
    const phase = (match.round ?? '').split('·').slice(2).join('·').trim();

    return (
        <div
            className={`rounded-xl border border-white/10 bg-white/5 p-3 ${compact ? '' : 'sm:p-4'}`}
        >
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                {day && <span>{day}</span>}
                <span className="font-mono text-primary">{match.time}</span>
                <span>{match.court}</span>
                {division && <span className="text-slate-500">{division}</span>}
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                <div className="min-w-0 text-right">
                    <TeamNameWithShield
                        teamName={match.teamA}
                        logoUrl={shieldFor(teams, match.teamA)}
                        className="flex-row-reverse justify-end max-w-full"
                        nameClassName="text-sm font-bold text-white text-right"
                    />
                </div>
                <MatchScoreLine match={match} />
                <div className="min-w-0 text-left">
                    <TeamNameWithShield
                        teamName={match.teamB}
                        logoUrl={shieldFor(teams, match.teamB)}
                        nameClassName="text-sm font-bold text-white"
                    />
                </div>
            </div>
            {phase && !compact && (
                <p className="mt-2 text-center text-[10px] text-slate-500">{phase}</p>
            )}
        </div>
    );
}

export const HomeTournamentLivePanel: React.FC<HomeTournamentLivePanelProps> = ({
    matches,
    teams,
    publicMatchesVisible,
}) => {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const id = window.setInterval(() => setNow(new Date()), 60_000);
        return () => window.clearInterval(id);
    }, []);

    const visible = useMemo(
        () => shouldShowHomeLivePanel(publicMatchesVisible, matches, now),
        [publicMatchesVisible, matches, now],
    );

    const currentHourMatches = useMemo(() => matchesAtCurrentHour(matches, now), [matches, now]);
    const upcoming = useMemo(() => upcomingMatchesToday(matches, now), [matches, now]);
    const recent = useMemo(() => recentTournamentResults(matches), [matches]);

    const tournamentDay = getCurrentTournamentDay(now);
    const clockLabel = formatNowClock(now);

    if (!visible) return null;

    const showUpcoming = currentHourMatches.length === 0 && upcoming.length > 0;

    return (
        <section className="relative z-20 -mt-4 pb-8">
            <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
                <div className="rounded-2xl border border-primary/30 bg-surface-dark/95 backdrop-blur-xl shadow-2xl overflow-hidden">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/10 bg-primary/10 px-5 py-4">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-1">
                                Torneo en directo
                            </p>
                            <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                                {tournamentDay ? `${tournamentDay} · ${clockLabel}` : `Ahora · ${clockLabel}`}
                            </h2>
                        </div>
                        <Link
                            to="/schedule"
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-sm font-bold text-white transition-colors"
                        >
                            Ver calendario completo
                            <span className="material-symbols-outlined text-base">arrow_forward</span>
                        </Link>
                    </div>

                    <div className="grid lg:grid-cols-2 gap-0 lg:divide-x divide-white/10">
                        <div className="p-5 sm:p-6">
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-base text-primary">sports_handball</span>
                                {showUpcoming ? 'Próximos partidos hoy' : 'Partidos a esta hora'}
                            </h3>

                            {(showUpcoming ? upcoming : currentHourMatches).length > 0 ? (
                                <div className="space-y-3">
                                    {(showUpcoming ? upcoming : currentHourMatches).map((m) => (
                                        <MatchRow key={m.id} match={m} teams={teams} />
                                    ))}
                                </div>
                            ) : (
                                <div className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center">
                                    <p className="text-sm font-semibold text-slate-300">
                                        No hay partidos programados a las {clockLabel}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Vuelve más tarde o consulta el calendario completo.
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="p-5 sm:p-6 bg-black/20">
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-base text-amber-400">emoji_events</span>
                                Últimos resultados
                            </h3>

                            {recent.length > 0 ? (
                                <div className="space-y-3">
                                    {recent.map((m) => (
                                        <MatchRow key={m.id} match={m} teams={teams} compact />
                                    ))}
                                </div>
                            ) : (
                                <div className="rounded-xl border border-dashed border-white/15 px-4 py-8 text-center">
                                    <p className="text-sm font-semibold text-slate-300">Aún no hay resultados publicados</p>
                                    <p className="text-xs text-slate-500 mt-1">Los marcadores aparecerán aquí al finalizar los partidos.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};
