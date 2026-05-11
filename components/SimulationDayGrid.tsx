import React from 'react';
import type { Match } from '../types';
import { groupMatchesForDayGrid } from '../services/muskizScheduleSimulator';
import type { MuskizScheduleDayLabel } from '../services/muskizScheduleSimulator';

const DAY_LABELS: MuskizScheduleDayLabel[] = ['Viernes', 'Sábado', 'Domingo'];

interface SimulationDayGridProps {
    matches: Match[];
}

/** Vista tipo hoja Excel: filas = horas, columnas = campos. */
export const SimulationScheduleGridTabs: React.FC<SimulationDayGridProps> = ({ matches }) => {
    const [day, setDay] = React.useState<MuskizScheduleDayLabel>('Sábado');
    const { courts, times, grid } = groupMatchesForDayGrid(matches, day);

    return (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="flex flex-wrap gap-1 border-b border-slate-100 bg-slate-50 px-2 py-2">
                <span className="text-[10px] font-black uppercase text-slate-400 self-center mr-2">
                    Vista cuadrícula
                </span>
                {DAY_LABELS.map((d) => (
                    <button
                        key={d}
                        type="button"
                        onClick={() => setDay(d)}
                        className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors ${
                            day === d
                                ? 'bg-teal-700 text-white shadow'
                                : 'bg-white text-slate-600 border border-slate-200 hover:border-teal-300'
                        }`}
                    >
                        {d}
                    </button>
                ))}
            </div>

            {!times.length || !courts.length ? (
                <div className="p-6 text-center text-sm text-slate-400">
                    No hay partidos con fecha imprimida para este día. Usa el simulador Muskiz o revisa{' '}
                    <span className="font-mono">scheduleDay</span> / prefijo Vie· Sab· Dom· en «Ronda».
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-[10px] min-w-[480px]">
                        <thead>
                            <tr className="bg-slate-800 text-white">
                                <th className="border border-slate-600 px-1 py-1.5 text-left font-bold whitespace-nowrap w-[54px]">
                                    Hora
                                </th>
                                {courts.map((c) => (
                                    <th key={c} className="border border-slate-600 px-1 py-1.5 font-bold text-center">
                                        {c}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {times.map((t) => (
                                <tr key={t} className="hover:bg-teal-50/40">
                                    <td className="border border-slate-200 bg-slate-50 font-mono font-bold px-1 py-1 text-center whitespace-nowrap">
                                        {t}
                                    </td>
                                    {courts.map((c) => {
                                        const m = grid[t]?.[c] ?? null;
                                        return (
                                            <td key={c} className="border border-slate-200 align-top p-1 min-h-[40px] max-w-[140px]">
                                                {m ? (
                                                    <div className="rounded bg-white leading-tight">
                                                        <div className="text-[9px] font-semibold text-slate-700 line-clamp-2">
                                                            {m.teamA} vs {m.teamB}
                                                        </div>
                                                        <div className="mt-0.5 text-[8px] text-slate-500 truncate" title={m.round}>
                                                            {(m.round ?? '').split('·').slice(2).join('·').trim()}
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
