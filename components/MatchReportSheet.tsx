import React, { useMemo } from 'react';
import type { Match, Team } from '../types';
import { siteContent } from '../constants/siteContent';
import { resolveTeamForMatchSide } from '../services/muskizScheduleSimulator';
import {
    ACTA_CELL_ROSTER_NAME,
    ACTA_CELL_ROSTER_THIN,
    ACTA_CELL_SCORE,
    MATCH_REPORT_GRID_ROWS,
    buildActaRosterRows,
    formatPlayerNameForActa,
    inferGenderMixLabel,
} from '../utils/matchReportSheetUtils';

export interface MatchReportSheetProps {
    match: Match;
    teams: Team[];
    competitionName?: string;
    className?: string;
    id?: string;
}

/** Folio A4 del acta física (modelo Kolosaurios / RFEBM playa). */
export const MatchReportSheet: React.FC<MatchReportSheetProps> = ({
    match,
    teams,
    competitionName: competitionNameProp,
    className = '',
    id,
}) => {
    const competitionName = (competitionNameProp ?? siteContent.heroTitle ?? 'Torneo').toUpperCase();

    const teamA = useMemo(
        () => resolveTeamForMatchSide(match, match.teamA, teams),
        [teams, match]
    );
    const teamB = useMemo(
        () => resolveTeamForMatchSide(match, match.teamB, teams),
        [teams, match]
    );

    const categoryLabel = teamA?.division ?? teamB?.division ?? '';
    const groupLabel = teamA?.competitionGroup ?? teamB?.competitionGroup ?? '';
    const genderLabel = inferGenderMixLabel(teamA) || inferGenderMixLabel(teamB);

    const rosterA = useMemo(() => buildActaRosterRows(teamA, MATCH_REPORT_GRID_ROWS), [teamA]);
    const rosterB = useMemo(() => buildActaRosterRows(teamB, MATCH_REPORT_GRID_ROWS), [teamB]);

    return (
        <article
            className={`border border-black bg-white text-[6px] leading-none shadow print:shadow-none break-inside-avoid print:text-[6px] ${className}`}
            id={id}
            aria-label={`Acta ${match.teamA} vs ${match.teamB}`}
        >
            <header className="border-b border-black px-1 py-px text-center font-black uppercase tracking-tight">
                <h1 className="text-[8px] print:text-[8px]">{competitionName}</h1>
            </header>

            <section className="border-b border-black">
                <div className="border-b border-black bg-slate-100 px-1 py-px text-center text-[6px] font-bold uppercase">
                    DATOS DE LA COMPETICIÓN
                </div>
                <table className="w-full table-fixed border-collapse text-[6px]">
                    <thead>
                        <tr className="bg-slate-50 text-center uppercase">
                            <th className="border-b border-r border-black p-px font-semibold w-[20%]">TORNEO</th>
                            <th className="border-b border-r border-black p-px font-semibold w-[18%]">CATEGORÍA</th>
                            <th className="border-b border-r border-black p-px font-semibold w-[12%]">MAS/FEM/MIX</th>
                            <th className="border-b border-r border-black p-px font-semibold w-[15%]">FASE</th>
                            <th className="border-b border-r border-black p-px font-semibold w-[12%]">GRUPO</th>
                            <th className="border-b border-black p-px font-semibold w-[13%]">JORNADA</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="border-b border-r border-black h-[4mm] px-px py-0 align-top">{competitionName}</td>
                            <td className="border-b border-r border-black h-[4mm] px-px py-0 align-top">{categoryLabel || '—'}</td>
                            <td className="border-b border-r border-black h-[4mm] px-px py-0 align-top">{genderLabel || '—'}</td>
                            <td className="border-b border-r border-black h-[4mm] px-px py-0 align-top">{match.round || '—'}</td>
                            <td className="border-b border-r border-black h-[4mm] px-px py-0 align-top">{groupLabel || '—'}</td>
                            <td className="border-b border-black h-[4mm] px-px py-0 align-top" />
                        </tr>
                    </tbody>
                </table>
            </section>

            <section className="border-b border-black">
                <div className="border-b border-black bg-slate-100 px-1 py-px text-center text-[6px] font-bold uppercase">
                    DATOS DEL PARTIDO
                </div>
                <table className="w-full table-fixed border-collapse text-[6px]">
                    <thead>
                        <tr className="bg-slate-50 text-center uppercase">
                            <th className="border-b border-r border-black p-px font-semibold w-[18%]">TEMPORADA</th>
                            <th className="border-b border-r border-black p-px font-semibold w-[22%]">FECHA</th>
                            <th className="border-b border-r border-black p-px font-semibold w-[15%]">HORA</th>
                            <th className="border-b border-black p-px font-semibold">TERRENO DE JUEGO (LOCALIDAD)</th>
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

            <section className="border-b border-black">
                <table className="w-full table-fixed border-collapse text-[6px]">
                    <thead>
                        <tr className="bg-slate-50 text-center uppercase">
                            <th className="border-b border-r border-black p-px font-semibold w-[36%]">EQUIPO ORGANIZADOR</th>
                            <th className="border-b border-r border-black p-px font-semibold w-[28%]">RESULTADO FINAL</th>
                            <th className="border-b border-black p-px font-semibold w-[36%]">EQUIPO VISITANTE</th>
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

            <section className="border-b border-black overflow-x-auto print:overflow-visible">
                <table className="w-full table-fixed border-collapse text-[6px] min-w-[680px] print:min-w-0">
                    <thead>
                        <tr className="bg-slate-100 text-center uppercase">
                            <th colSpan={6} className="border-b border-r border-black py-px font-bold leading-tight">
                                COMPONENTES EQUIPO ORGANIZADOR (A)
                            </th>
                            <th colSpan={4} className="border-b border-r border-black py-px font-semibold">
                                PRIMER SET
                            </th>
                            <th colSpan={4} className="border-b border-r border-black py-px font-semibold">
                                SEGUNDO SET
                            </th>
                            <th colSpan={5} className="border-b border-r border-black py-px font-semibold">
                                SHOOT OUT
                            </th>
                            <th colSpan={6} className="border-b border-black py-px font-bold leading-tight">
                                COMPONENTES EQUIPO VISITANTE (B)
                            </th>
                        </tr>
                        <tr className="bg-white text-center uppercase">
                            <th className="border-b border-r border-black w-[2.5%] p-0 font-semibold">Nº</th>
                            <th className="border-b border-r border-black w-[11%] p-0 font-semibold">NOMBRE Y APELLIDOS</th>
                            <th className="border-b border-r border-black w-[2.2%] p-0 font-semibold">EX1</th>
                            <th className="border-b border-r border-black w-[2.2%] p-0 font-semibold">EX2</th>
                            <th className="border-b border-r border-black w-[2.2%] p-0 font-semibold">D</th>
                            <th className="border-b border-r border-black w-[2.2%] p-0 font-semibold">DD</th>
                            <th className="border-b border-r border-black w-[2.4%] p-0 font-semibold">JA</th>
                            <th className="border-b border-r border-black w-[2.4%] p-0 font-semibold">TA</th>
                            <th className="border-b border-r border-black w-[2.4%] p-0 font-semibold">TB</th>
                            <th className="border-b border-r border-black w-[2.4%] p-0 font-semibold">JB</th>
                            <th className="border-b border-r border-black w-[2.4%] p-0 font-semibold">JA</th>
                            <th className="border-b border-r border-black w-[2.4%] p-0 font-semibold">TA</th>
                            <th className="border-b border-r border-black w-[2.4%] p-0 font-semibold">TB</th>
                            <th className="border-b border-r border-black w-[2.4%] p-0 font-semibold">JB</th>
                            <th className="border-b border-r border-black w-[2%] p-0 font-semibold">Nº</th>
                            <th className="border-b border-r border-black w-[2.2%] p-0 font-semibold">TA</th>
                            <th className="border-b border-r border-black w-[2%] p-0 font-semibold">Nº</th>
                            <th className="border-b border-r border-black w-[2.2%] p-0 font-semibold">TB</th>
                            <th className="border-b border-r border-black w-[2.2%] p-0 font-semibold">JB</th>
                            <th className="border-b border-r border-black w-[2.5%] p-0 font-semibold">Nº</th>
                            <th className="border-b border-r border-black w-[11%] p-0 font-semibold">NOMBRE Y APELLIDOS</th>
                            <th className="border-b border-r border-black w-[2.2%] p-0 font-semibold">EX1</th>
                            <th className="border-b border-r border-black w-[2.2%] p-0 font-semibold">EX2</th>
                            <th className="border-b border-r border-black w-[2.2%] p-0 font-semibold">D</th>
                            <th className="border-b border-black w-[2.2%] p-0 font-semibold">DD</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rosterA.map((rowA, i) => {
                            const rowB = rosterB[i]!;
                            const pa = rowA.player;
                            const pb = rowB.player;
                            return (
                                <tr key={`grid-${i}`} className="border-b border-black">
                                    <td className={ACTA_CELL_ROSTER_THIN}>{pa?.number ?? ''}</td>
                                    <td className={ACTA_CELL_ROSTER_NAME} title={pa ? formatPlayerNameForActa(pa) : ''}>
                                        {pa ? formatPlayerNameForActa(pa) : ''}
                                    </td>
                                    <td className={ACTA_CELL_ROSTER_THIN} />
                                    <td className={ACTA_CELL_ROSTER_THIN} />
                                    <td className={ACTA_CELL_ROSTER_THIN} />
                                    <td className={ACTA_CELL_ROSTER_THIN} />
                                    <td className={ACTA_CELL_SCORE} />
                                    <td className={ACTA_CELL_SCORE} />
                                    <td className={ACTA_CELL_SCORE} />
                                    <td className={ACTA_CELL_SCORE} />
                                    <td className={ACTA_CELL_SCORE} />
                                    <td className={ACTA_CELL_SCORE} />
                                    <td className={ACTA_CELL_SCORE} />
                                    <td className={ACTA_CELL_SCORE} />
                                    <td className={ACTA_CELL_SCORE} />
                                    <td className={ACTA_CELL_SCORE} />
                                    <td className={ACTA_CELL_SCORE} />
                                    <td className={ACTA_CELL_SCORE} />
                                    <td className={ACTA_CELL_SCORE} />
                                    <td className={ACTA_CELL_SCORE} />
                                    <td className={ACTA_CELL_ROSTER_THIN}>{pb?.number ?? ''}</td>
                                    <td className={ACTA_CELL_ROSTER_NAME} title={pb ? formatPlayerNameForActa(pb) : ''}>
                                        {pb ? formatPlayerNameForActa(pb) : ''}
                                    </td>
                                    <td className={ACTA_CELL_ROSTER_THIN} />
                                    <td className={ACTA_CELL_ROSTER_THIN} />
                                    <td className={ACTA_CELL_ROSTER_THIN} />
                                    <td className={ACTA_CELL_ROSTER_THIN} />
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </section>

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
                                <td className="border-b border-r border-black bg-slate-50 p-px w-[3%]">A</td>
                                <td className="border-b border-r border-black bg-slate-50 p-px w-[3%]">B</td>
                                <td className="border-b border-r border-black bg-slate-50 p-px w-[3%]">A</td>
                                <td className="border-b border-r border-black bg-slate-50 p-px w-[3%]">B</td>
                                <td className="border-b border-r border-black bg-slate-50 p-px w-[3%]">A</td>
                                <td className="border-b border-black bg-slate-50 p-px w-[3%]">B</td>
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
                                <td className="border-b border-r border-black bg-slate-50 p-px w-[3%]">A</td>
                                <td className="border-b border-r border-black bg-slate-50 p-px w-[3%]">B</td>
                                <td className="border-b border-r border-black bg-slate-50 p-px w-[3%]">A</td>
                                <td className="border-b border-r border-black bg-slate-50 p-px w-[3%]">B</td>
                                <td className="border-b border-r border-black bg-slate-50 p-px w-[3%]">A</td>
                                <td className="border-b border-black bg-slate-50 p-px w-[3%]">B</td>
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

            <section className="border-b border-black">
                <table className="w-full border-collapse text-[6px]">
                    <tbody>
                        <tr className="bg-slate-100 text-center uppercase">
                            <td className="border-b border-r border-black p-px font-bold w-1/4">ÁRBITRO 1</td>
                            <td className="border-b border-r border-black p-px font-bold w-1/4">ÁRBITRO 2</td>
                            <td className="border-b border-r border-black p-px font-bold w-1/4">ANOTADOR</td>
                            <td className="border-b border-black p-px font-bold w-1/4">CRONOMETRADOR</td>
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
    );
};
