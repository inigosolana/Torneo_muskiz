import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast, Toaster } from 'sonner';
import { useTournamentData } from '../context/TournamentDataContext';
import { matchService } from '../services/teamService';
import type { Match } from '../types';
import { groupMatchesForDayGrid, type MuskizScheduleDayLabel } from '../services/muskizScheduleSimulator';
import { inferMatchScheduleDay, WEEKEND_SCHEDULE_DAYS } from '../services/tournamentScheduleService';
import { supabase } from '../services/supabaseClient';

function matchDay(m: Match): MuskizScheduleDayLabel | null {
    if (m.scheduleDay) return m.scheduleDay;
    return inferMatchScheduleDay(m);
}

export const RefereeAssignments: React.FC = () => {
    const navigate = useNavigate();
    const { matches, setMatches } = useTournamentData();
    const [day, setDay] = useState<MuskizScheduleDayLabel>('Sábado');
    const [savingId, setSavingId] = useState<string | null>(null);
    const [localReferees, setLocalReferees] = useState<Record<string, string>>({});

    const officialMatches = useMemo(
        () => matches.filter((m) => m.time && m.time !== 'PENDIENTE' && m.court !== 'Sin asignar'),
        [matches]
    );

    const dayMatches = useMemo(
        () => officialMatches.filter((m) => matchDay(m) === day),
        [officialMatches, day]
    );

    const sortedDayMatches = useMemo(
        () =>
            [...dayMatches].sort((a, b) => {
                const ta = a.time === 'PENDIENTE' ? 99999 : parseInt(a.time.replace(':', ''), 10);
                const tb = b.time === 'PENDIENTE' ? 99999 : parseInt(b.time.replace(':', ''), 10);
                return ta - tb || a.court.localeCompare(b.court, 'es');
            }),
        [dayMatches]
    );

    const { times, courts, grid } = groupMatchesForDayGrid(dayMatches, day, { fillEmptySlots: true });

    const getReferees = (m: Match) => localReferees[m.id] ?? m.referees ?? '';

    const saveReferees = async (matchId: string, value: string) => {
        setSavingId(matchId);
        try {
            await matchService.updateMatchReferees(matchId, value);
            setMatches((prev) => prev.map((m) => (m.id === matchId ? { ...m, referees: value.trim() || undefined } : m)));
            toast.success('Árbitros guardados');
        } catch {
            toast.error('No se pudo guardar. ¿Existe la columna referees en Supabase?');
        } finally {
            setSavingId(null);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        navigate('/arbitros-login');
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-background-dark">
            <Toaster richColors position="bottom-right" />
            <header className="bg-slate-900 text-white px-4 py-4 shadow-lg">
                <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-lg font-black flex items-center gap-2">
                            <span className="material-symbols-outlined">sports</span>
                            Asignación de árbitros
                        </h1>
                        <p className="text-xs text-slate-300 mt-0.5">Solo coordinación — calendario oficial</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void handleLogout()}
                        className="text-xs font-bold bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg"
                    >
                        Cerrar sesión
                    </button>
                </div>
            </header>

            <main className="max-w-6xl mx-auto p-4 space-y-6">
                <div className="flex flex-wrap gap-2">
                    {WEEKEND_SCHEDULE_DAYS.map((d) => (
                        <button
                            key={d}
                            type="button"
                            onClick={() => setDay(d)}
                            className={`rounded-lg px-4 py-2 text-sm font-bold ${
                                day === d ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
                            }`}
                        >
                            {d}
                        </button>
                    ))}
                </div>

                <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center">
                        <h2 className="font-bold text-slate-800">Listado · {day}</h2>
                        <span className="text-xs text-slate-500">{sortedDayMatches.length} partidos</span>
                    </div>
                    {sortedDayMatches.length === 0 ? (
                        <p className="p-6 text-sm text-slate-500 text-center">
                            No hay partidos oficiales con hora y pista en este día.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500">
                                    <tr>
                                        <th className="px-3 py-2 text-left">Hora</th>
                                        <th className="px-3 py-2 text-left">Pista</th>
                                        <th className="px-3 py-2 text-left">Partido</th>
                                        <th className="px-3 py-2 text-left min-w-[200px]">Árbitro(s)</th>
                                        <th className="px-3 py-2" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {sortedDayMatches.map((m) => (
                                        <tr key={m.id} className="hover:bg-slate-50/80">
                                            <td className="px-3 py-2 font-mono font-bold">{m.time}</td>
                                            <td className="px-3 py-2">{m.court}</td>
                                            <td className="px-3 py-2">
                                                <span className="font-medium">{m.teamA}</span>
                                                <span className="text-slate-400 mx-1">vs</span>
                                                <span className="font-medium">{m.teamB}</span>
                                            </td>
                                            <td className="px-3 py-2">
                                                <input
                                                    type="text"
                                                    value={getReferees(m)}
                                                    onChange={(e) =>
                                                        setLocalReferees((prev) => ({
                                                            ...prev,
                                                            [m.id]: e.target.value,
                                                        }))
                                                    }
                                                    placeholder="Nombre árbitro(s)"
                                                    className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm"
                                                />
                                            </td>
                                            <td className="px-3 py-2">
                                                <button
                                                    type="button"
                                                    disabled={savingId === m.id}
                                                    onClick={() => void saveReferees(m.id, getReferees(m))}
                                                    className="text-xs font-bold bg-slate-800 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                                                >
                                                    {savingId === m.id ? '…' : 'Guardar'}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100">
                        <h2 className="font-bold text-slate-800">Vista cuadrícula · {day}</h2>
                        <p className="text-xs text-slate-500">Misma franja horaria que el calendario (huecos vacíos incluidos)</p>
                    </div>
                    <div className="p-3 overflow-x-auto">
                        <table className="w-full border-collapse text-[10px] min-w-[480px]">
                            <thead>
                                <tr className="bg-slate-800 text-white">
                                    <th className="border border-slate-600 px-1 py-1">Hora</th>
                                    {courts.map((c) => (
                                        <th key={c} className="border border-slate-600 px-1 py-1">
                                            {c}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {times.map((t) => (
                                    <tr key={t}>
                                        <td className="border border-slate-200 font-mono font-bold bg-slate-50 text-center">
                                            {t}
                                        </td>
                                        {courts.map((c) => {
                                            const m = grid[t]?.[c];
                                            if (!m) {
                                                return (
                                                    <td key={c} className="border border-slate-100 bg-slate-50/40 min-h-[36px]" />
                                                );
                                            }
                                            return (
                                                <td key={c} className="border border-slate-200 align-top p-1">
                                                    <div className="text-[9px] font-semibold line-clamp-2">
                                                        {m.teamA} vs {m.teamB}
                                                    </div>
                                                    <input
                                                        type="text"
                                                        value={getReferees(m)}
                                                        onChange={(e) =>
                                                            setLocalReferees((prev) => ({
                                                                ...prev,
                                                                [m.id]: e.target.value,
                                                            }))
                                                        }
                                                        onBlur={() => {
                                                            const v = getReferees(m);
                                                            if (v !== (m.referees ?? '')) void saveReferees(m.id, v);
                                                        }}
                                                        placeholder="Árbitro(s)"
                                                        className="mt-1 w-full border border-slate-200 rounded px-1 py-0.5 text-[9px]"
                                                    />
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            </main>
        </div>
    );
};
