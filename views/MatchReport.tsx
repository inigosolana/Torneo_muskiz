import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Match, Player, Team } from '../types';
import { matchService, teamService } from '../services/teamService';
import { siteContent } from '../constants/siteContent';

/** Mínimo de líneas tipo acta papel; puede crecer si hay más jugadores inscritos. */
const MIN_ROSTER_ROWS = 14;

function formatPlayerName(p: Player): string {
    const surname = (p.surnames ?? '').trim();
    const given = (p.name ?? '').trim();
    if (surname && given) return `${surname.toUpperCase()}, ${given}`;
    return (given || surname).toUpperCase();
}

function playersForActa(team: Team | undefined): Player[] {
    if (!team) return [];
    return [...team.players]
        .filter((p) => p.role === 'PLAYER')
        .sort((a, b) => (Number(a.number) || 999) - (Number(b.number) || 999));
}

function buildRosterRows(
    team: Team | undefined,
    rowCount: number
): { idx: number; player: Player | null }[] {
    const roster: (Player | null)[] = [...playersForActa(team)];
    while (roster.length < rowCount) roster.push(null);
    return roster.slice(0, rowCount).map((player, i) => ({
        idx: i + 1,
        player,
    }));
}

/**
 * Acta física imprimible (balonmano playa).
 * Diseñada para A4; sólo esta hoja aparece limpia al imprimir desde el navegador.
 */
export const MatchReport: React.FC = () => {
    const { matchId } = useParams<{ matchId: string }>();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [match, setMatch] = useState<Match | null>(null);
    const [teams, setTeams] = useState<Team[]>([]);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            if (!matchId) {
                setError('No se indicó ningún partido.');
                setLoading(false);
                return;
            }
            setLoading(true);
            setError(null);
            try {
                const [m, allTeams] = await Promise.all([
                    matchService.getMatchById(matchId),
                    teamService.getTeams(),
                ]);
                if (cancelled) return;
                if (!m) {
                    setError('No existe el partido solicitado.');
                    setMatch(null);
                } else {
                    setMatch(m);
                }
                setTeams(allTeams);
            } catch (e: unknown) {
                if (!cancelled) setError(e instanceof Error ? e.message : 'No se pudieron cargar los datos.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, [matchId]);

    const teamA = useMemo(
        () => teams.find((t) => t.name === match?.teamA),
        [teams, match?.teamA]
    );
    const teamB = useMemo(
        () => teams.find((t) => t.name === match?.teamB),
        [teams, match?.teamB]
    );

    const categoryLabel = teamA?.division ?? teamB?.division ?? '';

    const rosterRowCount = useMemo(() => {
        const na = playersForActa(teamA).length;
        const nb = playersForActa(teamB).length;
        return Math.min(24, Math.max(MIN_ROSTER_ROWS, na, nb));
    }, [teamA, teamB]);

    const rosterA = useMemo(() => buildRosterRows(teamA, rosterRowCount), [teamA, rosterRowCount]);
    const rosterB = useMemo(() => buildRosterRows(teamB, rosterRowCount), [teamB, rosterRowCount]);

    const handlePrint = useCallback(() => window.print(), []);

    const competitionName = siteContent.heroTitle ?? 'Torneo';

    return (
        <>
            <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          html, body {
            background: white !important;
          }
          .match-report-screen-tools {
            display: none !important;
          }
        }
      `}</style>

            <div className="min-h-screen bg-slate-200 text-black print:bg-white print:min-h-0">
                <div className="match-report-screen-tools sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-slate-300 bg-white/95 px-4 py-3 shadow-sm print:border-0 print:shadow-none">
                    <button
                        type="button"
                        className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                        onClick={() => navigate(-1)}
                    >
                        Volver
                    </button>
                    <button
                        type="button"
                        className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50"
                        onClick={handlePrint}
                        disabled={!match || loading}
                    >
                        Imprimir acta
                    </button>
                    <span className="text-xs text-slate-500">
                        En impresión, esta barra no aparece — sólo el acta del folio A4.
                    </span>
                </div>

                <div className="mx-auto max-w-[210mm] print:max-w-none px-4 py-6 print:px-0 print:py-0">
                    {loading && (
                        <div className="flex items-center justify-center py-24 text-sm text-slate-600 print:hidden">
                            Cargando acta...
                        </div>
                    )}
                    {!loading && error && (
                        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 print:hidden">
                            {error}
                        </div>
                    )}

                    {match && !error && (
                        <article
                            className="border border-black bg-white text-[10px] leading-tight shadow print:shadow-none break-inside-avoid"
                            id="match-report-sheet"
                            aria-label="Acta de partido"
                        >
                            {/* Cabecera título */}
                            <header className="border-b border-black px-3 py-2 text-center uppercase">
                                <h1 className="text-[11px] font-black tracking-tight">
                                    Acta de control — Balonmano playa
                                </h1>
                                <p className="mt-0.5 text-[9px] font-semibold tracking-wide text-slate-800">
                                    {competitionName}
                                </p>
                            </header>

                            {/* Dos tablas cabecera: competición | partido */}
                            <section className="grid grid-cols-2 border-b border-black">
                                <div className="border-r border-black">
                                    <div className="bg-slate-100 px-1 py-0.5 text-center text-[9px] font-bold uppercase tracking-wide border-b border-black">
                                        Datos de la competición
                                    </div>
                                    <table className="w-full border-collapse text-[9px]">
                                        <tbody>
                                            <tr className="border-b border-black">
                                                <td className="w-[38%] border-r border-black bg-slate-50 px-1 py-0.5 font-semibold uppercase">
                                                    Nombre torneo / edición
                                                </td>
                                                <td className="min-h-[5mm] px-1 py-0.5">{competitionName}</td>
                                            </tr>
                                            <tr className="border-b border-black">
                                                <td className="border-r border-black bg-slate-50 px-1 py-0.5 font-semibold uppercase">
                                                    Ubicación / sede
                                                </td>
                                                <td className="min-h-[5mm] px-1 py-0.5">Playa La Arena · Muskiz</td>
                                            </tr>
                                            <tr>
                                                <td className="border-r border-black bg-slate-50 px-1 py-0.5 font-semibold uppercase">
                                                    Observaciones
                                                </td>
                                                <td className="min-h-[6mm] px-1 py-0.5 print:min-h-[8mm]" />
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <div>
                                    <div className="bg-slate-100 px-1 py-0.5 text-center text-[9px] font-bold uppercase tracking-wide border-b border-black">
                                        Datos del partido
                                    </div>
                                    <table className="w-full border-collapse text-[9px]">
                                        <tbody>
                                            <tr className="border-b border-black">
                                                <td className="w-[32%] border-r border-black bg-slate-50 px-1 py-0.5 font-semibold uppercase">
                                                    Fecha (dd/mm/aa)
                                                </td>
                                                <td className="border-r border-black px-1 py-0.5 print:min-h-[5mm]" />
                                                <td className="w-[26%] border-r border-black bg-slate-50 px-1 py-0.5 font-semibold uppercase">
                                                    Hora
                                                </td>
                                                <td className="px-1 py-0.5 font-semibold">{match.time || '—'}</td>
                                            </tr>
                                            <tr className="border-b border-black">
                                                <td className="border-r border-black bg-slate-50 px-1 py-0.5 font-semibold uppercase">
                                                    Fase / jornada
                                                </td>
                                                <td colSpan={3} className="px-1 py-0.5">{match.round || '—'}</td>
                                            </tr>
                                            <tr className="border-b border-black">
                                                <td className="border-r border-black bg-slate-50 px-1 py-0.5 font-semibold uppercase">
                                                    Pista / campo
                                                </td>
                                                <td colSpan={3} className="px-1 py-0.5 font-semibold">
                                                    {match.court || '—'}
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="border-r border-black bg-slate-50 px-1 py-0.5 font-semibold uppercase">
                                                    Categoría
                                                </td>
                                                <td colSpan={3} className="px-1 py-0.5">{categoryLabel || '—'}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            {/* Rosters dos columnas */}
                            <section className="grid grid-cols-2 border-b border-black">
                                {/* Equipo A */}
                                <div className="border-r border-black">
                                    <div className="border-b border-black bg-teal-100 px-1 py-0.5 text-center text-[9px] font-bold uppercase">
                                        Equipo organizador — A (local)
                                    </div>
                                    <div className="border-b border-black px-1 py-0.5 text-[9px]">
                                        <span className="font-bold uppercase tracking-wide">{match.teamA}</span>
                                        {teamA?.city ? (
                                            <span className="text-slate-700"> · {teamA.city}</span>
                                        ) : null}
                                    </div>
                                    <table className="w-full border-collapse text-[9px]">
                                        <thead>
                                            <tr className="bg-slate-100 text-center uppercase">
                                                <th className="w-8 border-b border-r border-black py-0.5 font-semibold">N.º</th>
                                                <th className="w-11 border-b border-r border-black py-0.5 font-semibold">Dr.</th>
                                                <th className="border-b border-black py-0.5 font-semibold">
                                                    Apellidos, nombre
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rosterA.map(({ idx, player }) => (
                                                <tr key={`a-${idx}`} className="border-b border-black">
                                                    <td className="border-r border-black text-center py-0.5 font-mono text-[9px]">
                                                        {idx}
                                                    </td>
                                                    <td className="border-r border-black px-0.5 text-center py-0.5 font-semibold">
                                                        {player?.number ?? ''}
                                                    </td>
                                                    <td className="px-1 py-0.5 h-[18px] print:h-[17px]">
                                                        {player ? formatPlayerName(player) : ''}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Equipo B */}
                                <div>
                                    <div className="border-b border-black bg-teal-100 px-1 py-0.5 text-center text-[9px] font-bold uppercase">
                                        Equipo visitante — B
                                    </div>
                                    <div className="border-b border-black px-1 py-0.5 text-[9px]">
                                        <span className="font-bold uppercase tracking-wide">{match.teamB}</span>
                                        {teamB?.city ? (
                                            <span className="text-slate-700"> · {teamB.city}</span>
                                        ) : null}
                                    </div>
                                    <table className="w-full border-collapse text-[9px]">
                                        <thead>
                                            <tr className="bg-slate-100 text-center uppercase">
                                                <th className="w-8 border-b border-r border-black py-0.5 font-semibold">N.º</th>
                                                <th className="w-11 border-b border-r border-black py-0.5 font-semibold">Dr.</th>
                                                <th className="border-b border-black py-0.5 font-semibold">
                                                    Apellidos, nombre
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rosterB.map(({ idx, player }) => (
                                                <tr key={`b-${idx}`} className="border-b border-black">
                                                    <td className="border-r border-black text-center py-0.5 font-mono text-[9px]">
                                                        {idx}
                                                    </td>
                                                    <td className="border-r border-black px-0.5 text-center py-0.5 font-semibold">
                                                        {player?.number ?? ''}
                                                    </td>
                                                    <td className="px-1 py-0.5 h-[18px] print:h-[17px]">
                                                        {player ? formatPlayerName(player) : ''}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            {/* Cuadrícula resultado — vacío para cumplimentar a mano */}
                            <section className="border-b border-black">
                                <div className="border-b border-black bg-slate-100 px-1 py-0.5 text-center text-[9px] font-bold uppercase">
                                    Resultado (rellenar a mano)
                                </div>
                                <table className="w-full border-collapse text-[9px]">
                                    <thead>
                                        <tr className="text-center uppercase bg-white">
                                            <th className="w-[14%] border-r border-black py-0.5" />
                                            <th className="border-r border-black py-0.5 font-semibold">
                                                Tiempo corrido · Set 1
                                            </th>
                                            <th className="border-r border-black py-0.5 font-semibold">
                                                Tiempo corrido · Set 2
                                            </th>
                                            <th className="py-0.5 font-semibold">
                                                Shoot-out · (si procede)
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="border-t border-black border-r bg-slate-50 px-1 py-0.5 font-bold uppercase">
                                                Eq. A
                                            </td>
                                            <td className="border-t border-black border-r h-[11mm]" />
                                            <td className="border-t border-black border-r h-[11mm]" />
                                            <td className="border-t border-black h-[11mm]" />
                                        </tr>
                                        <tr>
                                            <td className="border-t border-black border-r bg-slate-50 px-1 py-0.5 font-bold uppercase">
                                                Eq. B
                                            </td>
                                            <td className="border-t border-black border-r h-[11mm]" />
                                            <td className="border-t border-black border-r h-[11mm]" />
                                            <td className="border-t border-black h-[11mm]" />
                                        </tr>
                                    </tbody>
                                </table>
                            </section>

                            {/* Observaciones escritas */}
                            <section className="border-b border-black">
                                <div className="flex border-black">
                                    <div className="w-[52%] border-r border-black">
                                        <div className="border-b border-black bg-slate-100 px-1 py-0.5 text-[9px] font-bold uppercase text-center">
                                            Incidencias / anotaciones
                                        </div>
                                        <div className="h-[26mm]" />
                                        <div className="h-[26mm]" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="border-b border-black bg-slate-100 px-1 py-0.5 text-[9px] font-bold uppercase text-center">
                                            Firmas (rellenar a mano)
                                        </div>
                                        <table className="w-full border-collapse text-[9px]">
                                            <tbody>
                                                <tr>
                                                    <td className="w-1/2 border-b border-r border-black px-1 py-0.5 font-semibold uppercase align-top">
                                                        Capitán equipo A
                                                    </td>
                                                    <td className="w-1/2 border-b border-black px-1 py-0.5 font-semibold uppercase align-top">
                                                        Capitán equipo B
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td className="border-r border-black h-[20mm]" />
                                                    <td className="h-[20mm]" />
                                                </tr>
                                                <tr>
                                                    <td className="border-b border-r border-black px-1 py-0.5 font-semibold uppercase align-top">
                                                        Árbitro / mesa
                                                    </td>
                                                    <td className="border-b border-black px-1 py-0.5 font-semibold uppercase align-top">
                                                        Cronometrador / Anotador
                                                    </td>
                                                </tr>
                                                <tr>
                                                    <td className="border-r border-black h-[20mm]" />
                                                    <td className="h-[20mm]" />
                                                </tr>
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </section>

                            <footer className="px-2 py-1 text-center text-[8px] text-slate-600 italic">
                                Documento modelo Kolosaurios / Muskiz — impresión A4 única cara.
                            </footer>
                        </article>
                    )}
                </div>
            </div>
        </>
    );
};
