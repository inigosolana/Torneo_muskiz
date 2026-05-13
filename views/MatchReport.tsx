import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Match, Player, Team } from '../types';
import { matchService, teamService } from '../services/teamService';
import { siteContent } from '../constants/siteContent';
import { playersEligibleForMatch } from '../utils/squadLimits';

/** Filas del tanteo punto a punto según modelo acta playa (Kolosaurios / RFEBM). */
const GRID_ROWS = 44;

function inferGenderMixLabel(team: Team | undefined): string {
    const d = (team?.division ?? '').toLowerCase();
    if (d.includes('femen')) return 'FEM';
    if (d.includes('mascul')) return 'MAS';
    return '';
}

function formatPlayerName(p: Player): string {
    const surname = (p.surnames ?? '').trim();
    const given = (p.name ?? '').trim();
    if (surname && given) return `${surname.toUpperCase()}, ${given}`;
    return (given || surname).toUpperCase();
}

function playersForActa(team: Team | undefined): Player[] {
    if (!team) return [];
    return playersEligibleForMatch(team.players).sort(
        (a, b) => (Number(a.number) || 999) - (Number(b.number) || 999)
    );
}

function buildRosterRows(
    team: Team | undefined,
    rowCount: number
): { player: Player | null }[] {
    const roster: (Player | null)[] = [...playersForActa(team)];
    while (roster.length < rowCount) roster.push(null);
    return roster.slice(0, rowCount).map((player) => ({ player }));
}

const cellScore = 'h-[6px] max-h-[6px] border-r border-black p-0 align-middle';
const cellRosterThin = 'h-[6px] max-h-[6px] border-r border-black p-0 align-middle text-center text-[6px] leading-none';
const cellRosterName =
    'h-[6px] max-h-[6px] border-r border-black px-px py-0 align-middle text-[6px] leading-none whitespace-nowrap overflow-hidden text-ellipsis max-w-0';

/**
 * Acta física imprimible — alineada al PDF modelo acta playa (Kolosaurios).
 * Un folio A4; tipografía compacta para 44 filas de tanteo.
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
    const groupLabel = teamA?.competitionGroup ?? teamB?.competitionGroup ?? '';
    const genderLabel = inferGenderMixLabel(teamA) || inferGenderMixLabel(teamB);

    const rosterA = useMemo(() => buildRosterRows(teamA, GRID_ROWS), [teamA]);
    const rosterB = useMemo(() => buildRosterRows(teamB, GRID_ROWS), [teamB]);

    const handlePrint = useCallback(() => window.print(), []);

    const competitionName = (siteContent.heroTitle ?? 'Torneo').toUpperCase();

    return (
        <>
            <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm;
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
                        Modelo según PDF acta playa Kolosaurios — comprobar encaje A4 en vista previa.
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
                            className="border border-black bg-white text-[6px] leading-none shadow print:shadow-none break-inside-avoid print:text-[6px]"
                            id="match-report-sheet"
                            aria-label="Acta de partido"
                        >
                            <header className="border-b border-black px-1 py-px text-center font-black uppercase tracking-tight">
                                <h1 className="text-[8px] print:text-[8px]">{competitionName}</h1>
                            </header>

                            {/* DATOS DE LA COMPETICIÓN */}
                            <section className="border-b border-black">
                                <div className="border-b border-black bg-slate-100 px-1 py-px text-center text-[6px] font-bold uppercase">
                                    DATOS DE LA COMPETICIÓN
                                </div>
                                <table className="w-full table-fixed border-collapse text-[6px]">
                                    <thead>
                                        <tr className="bg-slate-50 text-center uppercase">
                                            <th className="border-b border-r border-black p-px font-semibold w-[20%]">
                                                TORNEO
                                            </th>
                                            <th className="border-b border-r border-black p-px font-semibold w-[18%]">
                                                CATEGORÍA
                                            </th>
                                            <th className="border-b border-r border-black p-px font-semibold w-[12%]">
                                                MAS/FEM/MIX
                                            </th>
                                            <th className="border-b border-r border-black p-px font-semibold w-[15%]">
                                                FASE
                                            </th>
                                            <th className="border-b border-r border-black p-px font-semibold w-[12%]">
                                                GRUPO
                                            </th>
                                            <th className="border-b border-black p-px font-semibold w-[13%]">
                                                JORNADA
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="border-b border-r border-black h-[4mm] px-px py-0 align-top">
                                                {competitionName}
                                            </td>
                                            <td className="border-b border-r border-black h-[4mm] px-px py-0 align-top">
                                                {categoryLabel || '—'}
                                            </td>
                                            <td className="border-b border-r border-black h-[4mm] px-px py-0 align-top">
                                                {genderLabel || '—'}
                                            </td>
                                            <td className="border-b border-r border-black h-[4mm] px-px py-0 align-top">
                                                {match.round || '—'}
                                            </td>
                                            <td className="border-b border-r border-black h-[4mm] px-px py-0 align-top">
                                                {groupLabel || '—'}
                                            </td>
                                            <td className="border-b border-black h-[4mm] px-px py-0 align-top" />
                                        </tr>
                                    </tbody>
                                </table>
                            </section>

                            {/* DATOS DEL PARTIDO */}
                            <section className="border-b border-black">
                                <div className="border-b border-black bg-slate-100 px-1 py-px text-center text-[6px] font-bold uppercase">
                                    DATOS DEL PARTIDO
                                </div>
                                <table className="w-full table-fixed border-collapse text-[6px]">
                                    <thead>
                                        <tr className="bg-slate-50 text-center uppercase">
                                            <th className="border-b border-r border-black p-px font-semibold w-[18%]">
                                                TEMPORADA
                                            </th>
                                            <th className="border-b border-r border-black p-px font-semibold w-[22%]">
                                                FECHA
                                            </th>
                                            <th className="border-b border-r border-black p-px font-semibold w-[15%]">
                                                HORA
                                            </th>
                                            <th className="border-b border-black p-px font-semibold">
                                                TERRENO DE JUEGO (LOCALIDAD)
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="border-b border-r border-black h-[4mm] p-px" />
                                            <td className="border-b border-r border-black h-[4mm] p-px" />
                                            <td className="border-b border-r border-black h-[4mm] p-px text-center font-semibold">
                                                {match.time || '—'}
                                            </td>
                                            <td className="border-b border-black h-[4mm] px-px py-0">
                                                {[match.court, 'Muskiz'].filter(Boolean).join(' · ')}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </section>

                            {/* EQUIPOS + RESULTADO FINAL */}
                            <section className="border-b border-black">
                                <table className="w-full table-fixed border-collapse text-[6px]">
                                    <thead>
                                        <tr className="bg-slate-50 text-center uppercase">
                                            <th className="border-b border-r border-black p-px font-semibold w-[36%]">
                                                EQUIPO ORGANIZADOR
                                            </th>
                                            <th className="border-b border-r border-black p-px font-semibold w-[28%]">
                                                RESULTADO FINAL
                                            </th>
                                            <th className="border-b border-black p-px font-semibold w-[36%]">
                                                EQUIPO VISITANTE
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr className="text-center font-bold uppercase">
                                            <td className="border-b border-r border-black bg-slate-100 p-px">A</td>
                                            <td className="border-b border-r border-black p-px" rowSpan={2} />
                                            <td className="border-b border-black bg-slate-100 p-px">B</td>
                                        </tr>
                                        <tr>
                                            <td className="border-b border-r border-black px-px py-px text-left normal-case font-bold leading-tight">
                                                {match.teamA}
                                                {teamA?.city ? ` · ${teamA.city}` : ''}
                                            </td>
                                            <td className="border-b border-black px-px py-px text-left normal-case font-bold leading-tight">
                                                {match.teamB}
                                                {teamB?.city ? ` · ${teamB.city}` : ''}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </section>

                            {/* Cuadrícula: plantilla A | tanteo | plantilla B */}
                            <section className="border-b border-black overflow-x-auto print:overflow-visible">
                                <table className="w-full table-fixed border-collapse text-[6px] min-w-[680px] print:min-w-0">
                                    <thead>
                                        <tr className="bg-slate-100 text-center uppercase">
                                            <th
                                                colSpan={6}
                                                className="border-b border-r border-black py-px font-bold leading-tight"
                                            >
                                                COMPONENTES EQUIPO ORGANIZADOR (A)
                                            </th>
                                            <th
                                                colSpan={4}
                                                className="border-b border-r border-black py-px font-semibold"
                                            >
                                                PRIMER SET
                                            </th>
                                            <th
                                                colSpan={4}
                                                className="border-b border-r border-black py-px font-semibold"
                                            >
                                                SEGUNDO SET
                                            </th>
                                            <th
                                                colSpan={5}
                                                className="border-b border-r border-black py-px font-semibold"
                                            >
                                                SHOOT OUT
                                            </th>
                                            <th
                                                colSpan={6}
                                                className="border-b border-black py-px font-bold leading-tight"
                                            >
                                                COMPONENTES EQUIPO VISITANTE (B)
                                            </th>
                                        </tr>
                                        <tr className="bg-white text-center uppercase">
                                            <th className="border-b border-r border-black w-[2.5%] p-0 font-semibold">
                                                Nº
                                            </th>
                                            <th className="border-b border-r border-black w-[11%] p-0 font-semibold">
                                                NOMBRE Y APELLIDOS
                                            </th>
                                            <th className="border-b border-r border-black w-[2.2%] p-0 font-semibold">
                                                EX1
                                            </th>
                                            <th className="border-b border-r border-black w-[2.2%] p-0 font-semibold">
                                                EX2
                                            </th>
                                            <th className="border-b border-r border-black w-[2.2%] p-0 font-semibold">
                                                D
                                            </th>
                                            <th className="border-b border-r border-black w-[2.2%] p-0 font-semibold">
                                                DD
                                            </th>
                                            <th className="border-b border-r border-black w-[2.4%] p-0 font-semibold">
                                                JA
                                            </th>
                                            <th className="border-b border-r border-black w-[2.4%] p-0 font-semibold">
                                                TA
                                            </th>
                                            <th className="border-b border-r border-black w-[2.4%] p-0 font-semibold">
                                                TB
                                            </th>
                                            <th className="border-b border-r border-black w-[2.4%] p-0 font-semibold">
                                                JB
                                            </th>
                                            <th className="border-b border-r border-black w-[2.4%] p-0 font-semibold">
                                                JA
                                            </th>
                                            <th className="border-b border-r border-black w-[2.4%] p-0 font-semibold">
                                                TA
                                            </th>
                                            <th className="border-b border-r border-black w-[2.4%] p-0 font-semibold">
                                                TB
                                            </th>
                                            <th className="border-b border-r border-black w-[2.4%] p-0 font-semibold">
                                                JB
                                            </th>
                                            <th className="border-b border-r border-black w-[2%] p-0 font-semibold">
                                                Nº
                                            </th>
                                            <th className="border-b border-r border-black w-[2.2%] p-0 font-semibold">
                                                TA
                                            </th>
                                            <th className="border-b border-r border-black w-[2%] p-0 font-semibold">
                                                Nº
                                            </th>
                                            <th className="border-b border-r border-black w-[2.2%] p-0 font-semibold">
                                                TB
                                            </th>
                                            <th className="border-b border-r border-black w-[2.2%] p-0 font-semibold">
                                                JB
                                            </th>
                                            <th className="border-b border-r border-black w-[2.5%] p-0 font-semibold">
                                                Nº
                                            </th>
                                            <th className="border-b border-r border-black w-[11%] p-0 font-semibold">
                                                NOMBRE Y APELLIDOS
                                            </th>
                                            <th className="border-b border-r border-black w-[2.2%] p-0 font-semibold">
                                                EX1
                                            </th>
                                            <th className="border-b border-r border-black w-[2.2%] p-0 font-semibold">
                                                EX2
                                            </th>
                                            <th className="border-b border-r border-black w-[2.2%] p-0 font-semibold">
                                                D
                                            </th>
                                            <th className="border-b border-black w-[2.2%] p-0 font-semibold">
                                                DD
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rosterA.map((rowA, i) => {
                                            const rowB = rosterB[i]!;
                                            const pa = rowA.player;
                                            const pb = rowB.player;
                                            return (
                                                <tr key={`grid-${i}`} className="border-b border-black">
                                                    <td className={cellRosterThin}>{pa?.number ?? ''}</td>
                                                    <td className={cellRosterName} title={pa ? formatPlayerName(pa) : ''}>
                                                        {pa ? formatPlayerName(pa) : ''}
                                                    </td>
                                                    <td className={cellRosterThin} />
                                                    <td className={cellRosterThin} />
                                                    <td className={cellRosterThin} />
                                                    <td className={cellRosterThin} />
                                                    <td className={cellScore} />
                                                    <td className={cellScore} />
                                                    <td className={cellScore} />
                                                    <td className={cellScore} />
                                                    <td className={cellScore} />
                                                    <td className={cellScore} />
                                                    <td className={cellScore} />
                                                    <td className={cellScore} />
                                                    <td className={cellScore} />
                                                    <td className={cellScore} />
                                                    <td className={cellScore} />
                                                    <td className={cellScore} />
                                                    <td className={cellScore} />
                                                    <td className={cellRosterThin}>{pb?.number ?? ''}</td>
                                                    <td className={cellRosterName} title={pb ? formatPlayerName(pb) : ''}>
                                                        {pb ? formatPlayerName(pb) : ''}
                                                    </td>
                                                    <td className={cellRosterThin} />
                                                    <td className={cellRosterThin} />
                                                    <td className={cellRosterThin} />
                                                    <td className={cellRosterThin} />
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </section>

                            {/* Resumen PUNTOS + RESULTADO (modelo PDF) */}
                            <section className="grid grid-cols-2 border-b border-black">
                                <div className="border-r border-black">
                                    <table className="w-full border-collapse text-[6px]">
                                        <tbody>
                                            <tr className="bg-slate-100 text-center uppercase">
                                                <td className="border-b border-r border-black p-px font-bold" colSpan={2}>
                                                    PUNTOS
                                                </td>
                                                <td className="border-b border-r border-black p-px font-bold" colSpan={2}>
                                                    PUNTOS
                                                </td>
                                                <td className="border-b border-black p-px font-bold" colSpan={2}>
                                                    PUNTOS
                                                </td>
                                            </tr>
                                            <tr className="bg-white text-center uppercase">
                                                <td className="border-b border-r border-black p-px font-semibold" colSpan={2}>
                                                    PRIMER SET
                                                </td>
                                                <td className="border-b border-r border-black p-px font-semibold" colSpan={2}>
                                                    SEGUNDO SET
                                                </td>
                                                <td className="border-b border-black p-px font-semibold" colSpan={2}>
                                                    SHOOT OUT
                                                </td>
                                            </tr>
                                            <tr className="text-center font-semibold uppercase">
                                                <td className="border-b border-r border-black bg-slate-50 p-px w-[3%]">
                                                    A
                                                </td>
                                                <td className="border-b border-r border-black bg-slate-50 p-px w-[3%]">
                                                    B
                                                </td>
                                                <td className="border-b border-r border-black bg-slate-50 p-px w-[3%]">
                                                    A
                                                </td>
                                                <td className="border-b border-r border-black bg-slate-50 p-px w-[3%]">
                                                    B
                                                </td>
                                                <td className="border-b border-r border-black bg-slate-50 p-px w-[3%]">
                                                    A
                                                </td>
                                                <td className="border-b border-black bg-slate-50 p-px w-[3%]">
                                                    B
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="border-b border-r border-black h-[5mm] p-0" />
                                                <td className="border-b border-r border-black h-[5mm] p-0" />
                                                <td className="border-b border-r border-black h-[5mm] p-0" />
                                                <td className="border-b border-r border-black h-[5mm] p-0" />
                                                <td className="border-b border-r border-black h-[5mm] p-0" />
                                                <td className="border-b border-black h-[5mm] p-0" />
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <div>
                                    <table className="w-full border-collapse text-[6px]">
                                        <tbody>
                                            <tr className="bg-slate-100 text-center uppercase">
                                                <td className="border-b border-r border-black p-px font-bold" colSpan={2}>
                                                    RESULTADO
                                                </td>
                                                <td className="border-b border-r border-black p-px font-bold" colSpan={2}>
                                                    RESULTADO
                                                </td>
                                                <td className="border-b border-black p-px font-bold" colSpan={2}>
                                                    RESULTADO
                                                </td>
                                            </tr>
                                            <tr className="bg-white text-center uppercase">
                                                <td className="border-b border-r border-black p-px font-semibold" colSpan={2}>
                                                    PRIMER SET
                                                </td>
                                                <td className="border-b border-r border-black p-px font-semibold" colSpan={2}>
                                                    SEGUNDO SET
                                                </td>
                                                <td className="border-b border-black p-px font-semibold" colSpan={2}>
                                                    SHOOT OUT
                                                </td>
                                            </tr>
                                            <tr className="text-center font-semibold uppercase">
                                                <td className="border-b border-r border-black bg-slate-50 p-px w-[3%]">
                                                    A
                                                </td>
                                                <td className="border-b border-r border-black bg-slate-50 p-px w-[3%]">
                                                    B
                                                </td>
                                                <td className="border-b border-r border-black bg-slate-50 p-px w-[3%]">
                                                    A
                                                </td>
                                                <td className="border-b border-r border-black bg-slate-50 p-px w-[3%]">
                                                    B
                                                </td>
                                                <td className="border-b border-r border-black bg-slate-50 p-px w-[3%]">
                                                    A
                                                </td>
                                                <td className="border-b border-black bg-slate-50 p-px w-[3%]">
                                                    B
                                                </td>
                                            </tr>
                                            <tr>
                                                <td className="border-b border-r border-black h-[5mm] p-0" />
                                                <td className="border-b border-r border-black h-[5mm] p-0" />
                                                <td className="border-b border-r border-black h-[5mm] p-0" />
                                                <td className="border-b border-r border-black h-[5mm] p-0" />
                                                <td className="border-b border-r border-black h-[5mm] p-0" />
                                                <td className="border-b border-black h-[5mm] p-0" />
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            {/* Oficiales + observaciones */}
                            <section className="border-b border-black">
                                <table className="w-full border-collapse text-[6px]">
                                    <tbody>
                                        <tr className="bg-slate-100 text-center uppercase">
                                            <td className="border-b border-r border-black p-px font-bold w-1/4">
                                                ÁRBITRO 1
                                            </td>
                                            <td className="border-b border-r border-black p-px font-bold w-1/4">
                                                ÁRBITRO 2
                                            </td>
                                            <td className="border-b border-r border-black p-px font-bold w-1/4">
                                                ANOTADOR
                                            </td>
                                            <td className="border-b border-black p-px font-bold w-1/4">
                                                CRONOMETRADOR
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="border-b border-r border-black h-[7mm] p-0" />
                                            <td className="border-b border-r border-black h-[7mm] p-0" />
                                            <td className="border-b border-r border-black h-[7mm] p-0" />
                                            <td className="border-b border-black h-[7mm] p-0" />
                                        </tr>
                                    </tbody>
                                </table>
                                <div className="border-b border-black bg-slate-100 px-1 py-px text-center text-[6px] font-bold uppercase">
                                    OBSERVACIONES
                                </div>
                                <div className="min-h-[10mm] p-px" />
                            </section>

                            <footer className="px-1 py-px text-center text-[5px] text-slate-600 italic leading-none">
                                Acta balonmano playa — modelo Kolosaurios / Muskiz. PDF de referencia en documentación del club.
                            </footer>
                        </article>
                    )}
                </div>
            </div>
        </>
    );
};
