import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MatchReportSheet } from '../components/MatchReportSheet';
import { teamService } from '../services/teamService';
import type { Team } from '../types';
import { clearBulkActasPayload, loadBulkActasPayload } from '../utils/bulkActasSession';
import { sortMatchesForActas } from '../utils/matchReportSheetUtils';
import { inferMatchScheduleDay } from '../services/tournamentScheduleService';

/**
 * Vista para imprimir o guardar como PDF todas las actas del listado enviado desde Admin → Resultados.
 */
export const MatchReportsBulk: React.FC = () => {
    const navigate = useNavigate();
    const payload = useMemo(() => loadBulkActasPayload(), []);
    const [teams, setTeams] = useState<Team[]>([]);
    const [loadingTeams, setLoadingTeams] = useState(true);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            setLoadingTeams(true);
            try {
                const all = await teamService.getTeams();
                if (!cancelled) setTeams(all);
            } finally {
                if (!cancelled) setLoadingTeams(false);
            }
        };
        void run();
        return () => {
            cancelled = true;
        };
    }, []);

    const sortedMatches = useMemo(
        () => (payload ? sortMatchesForActas(payload.matches) : []),
        [payload]
    );

    const handlePrint = useCallback(() => window.print(), []);

    const handleBack = () => {
        clearBulkActasPayload();
        navigate('/admin');
    };

    if (!payload || sortedMatches.length === 0) {
        return (
            <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
                <div className="max-w-md rounded-xl bg-white border border-slate-200 p-6 text-center shadow-sm">
                    <p className="text-slate-700 font-semibold mb-2">No hay actas preparadas</p>
                    <p className="text-sm text-slate-500 mb-4">
                        Ve a <strong>Admin → Competición → Resultados</strong> y pulsa{' '}
                        <strong>Descargar todas las actas</strong>.
                    </p>
                    <button
                        type="button"
                        onClick={() => navigate('/admin')}
                        className="px-4 py-2 rounded-lg bg-teal-700 text-white text-sm font-bold hover:bg-teal-800"
                    >
                        Ir al panel
                    </button>
                </div>
            </div>
        );
    }

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
          .bulk-actas-toolbar {
            display: none !important;
          }
          .bulk-actas-sheet-page {
            page-break-after: always;
            break-after: page;
          }
          .bulk-actas-sheet-page:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        }
      `}</style>

            <div className="min-h-screen bg-slate-200 text-black print:bg-white">
                <div className="bulk-actas-toolbar sticky top-0 z-20 border-b border-slate-300 bg-white/95 px-4 py-3 shadow-sm">
                    <div className="mx-auto max-w-[210mm] flex flex-wrap items-center gap-3">
                        <button
                            type="button"
                            onClick={handleBack}
                            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50"
                        >
                            Volver al admin
                        </button>
                        <button
                            type="button"
                            onClick={handlePrint}
                            disabled={loadingTeams}
                            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50 flex items-center gap-2"
                        >
                            <span className="material-symbols-outlined text-lg">print</span>
                            Imprimir / guardar PDF
                        </button>
                        <div className="text-sm text-slate-600">
                            <strong>{sortedMatches.length}</strong> actas · {payload.label}
                            {payload.source === 'simulation' && (
                                <span className="ml-2 text-purple-700 font-semibold">(borrador)</span>
                            )}
                        </div>
                    </div>
                    <p className="mx-auto max-w-[210mm] mt-2 text-xs text-slate-500 print:hidden">
                        En el diálogo de impresión elige <strong>Guardar como PDF</strong> para descargar un único archivo con todas las
                        páginas (una acta por hoja A4). Revisa la vista previa antes de imprimir.
                    </p>
                </div>

                {loadingTeams && (
                    <p className="text-center text-sm text-slate-600 py-8 print:hidden">Cargando plantillas de equipos…</p>
                )}

                <div className="mx-auto max-w-[210mm] px-4 py-6 print:px-0 print:py-0 space-y-8 print:space-y-0">
                    {sortedMatches.map((match, index) => {
                        const day = inferMatchScheduleDay(match);
                        return (
                            <div
                                key={match.id ?? `acta-${index}`}
                                className="bulk-actas-sheet-page print:mb-0"
                            >
                                <p className="text-[10px] text-slate-500 mb-1 print:hidden">
                                    {index + 1}/{sortedMatches.length} · {day ?? '—'} · {match.time} · {match.court} · {match.teamA} vs{' '}
                                    {match.teamB}
                                </p>
                                <MatchReportSheet match={match} teams={teams} id={`match-report-sheet-${match.id ?? index}`} />
                            </div>
                        );
                    })}
                </div>
            </div>
        </>
    );
};
