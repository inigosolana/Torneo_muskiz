import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Match } from '../types';
import { matchService, teamService } from '../services/teamService';
import { MatchReportSheet } from '../components/MatchReportSheet';

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
    const [teams, setTeams] = useState<Awaited<ReturnType<typeof teamService.getTeams>>>([]);

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

    const handlePrint = useCallback(() => window.print(), []);

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
                        <MatchReportSheet match={match} teams={teams} id="match-report-sheet" />
                    )}
                </div>
            </div>
        </>
    );
};
