import React, { useState, useRef } from 'react';
import type { Match } from '../types';
import {
    buildFullDayTimeSlots,
    groupMatchesForDayGrid,
    getDivisionCodeFromRound,
} from '../services/muskizScheduleSimulator';
import type { MuskizScheduleDayLabel } from '../services/muskizScheduleSimulator';

// ─── Color por categoría ───────────────────────────────────────────────────
const DIV_COLORS: Record<string, { cell: string; badge: string; drag: string }> = {
    CF: { cell: 'bg-pink-50',    badge: 'bg-pink-200 text-pink-900',    drag: 'border-pink-400' },
    CM: { cell: 'bg-blue-50',    badge: 'bg-blue-200 text-blue-900',    drag: 'border-blue-400' },
    JF: { cell: 'bg-purple-50',  badge: 'bg-purple-200 text-purple-900', drag: 'border-purple-400' },
    JM: { cell: 'bg-indigo-50',  badge: 'bg-indigo-200 text-indigo-900', drag: 'border-indigo-400' },
    SF: { cell: 'bg-rose-50',    badge: 'bg-rose-200 text-rose-900',    drag: 'border-rose-400' },
    SM: { cell: 'bg-cyan-50',    badge: 'bg-cyan-200 text-cyan-900',    drag: 'border-cyan-400' },
    IF: { cell: 'bg-emerald-50', badge: 'bg-emerald-200 text-emerald-900', drag: 'border-emerald-400' },
    IM: { cell: 'bg-teal-50',    badge: 'bg-teal-200 text-teal-900',    drag: 'border-teal-400' },
};
const FALLBACK_COLORS = { cell: 'bg-slate-50', badge: 'bg-slate-200 text-slate-700', drag: 'border-slate-400' };

function divColors(round?: string) {
    const code = getDivisionCodeFromRound(round);
    return (code && DIV_COLORS[code]) ?? FALLBACK_COLORS;
}

// ─── Leyenda ───────────────────────────────────────────────────────────────
const DIV_LABELS: Record<string, string> = {
    CF: 'Cad. F', CM: 'Cad. M', JF: 'Juv. F', JM: 'Juv. M',
    SF: 'Senior F', SM: 'Senior M', IF: 'Inf. F', IM: 'Inf. M',
};

const DAY_LABELS: MuskizScheduleDayLabel[] = ['Viernes', 'Sábado', 'Domingo'];

// ─── Modal edición de partido ──────────────────────────────────────────────
interface EditModalProps {
    match: Match;
    availableTimes: string[];
    availableCourts: string[];
    onSave: (patch: Partial<Pick<Match, 'time' | 'court' | 'teamA' | 'teamB'>>) => void;
    onClose: () => void;
}
const EditMatchModal: React.FC<EditModalProps> = ({ match, availableTimes, availableCourts, onSave, onClose }) => {
    const [time, setTime] = useState(match.time);
    const [court, setCourt] = useState(match.court);
    const [teamA, setTeamA] = useState(match.teamA);
    const [teamB, setTeamB] = useState(match.teamB);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4 border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="font-black text-slate-800 text-base">Editar partido</h3>
                    <button type="button" onClick={onClose} className="size-7 flex items-center justify-center rounded-full hover:bg-slate-100 text-slate-500">
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>
                <div className="space-y-3">
                    <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Hora</label>
                        <select value={time} onChange={(e) => setTime(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                            {availableTimes.filter(t => t !== 'PENDIENTE').map(t => (
                                <option key={t} value={t}>{t}</option>
                            ))}
                            <option value="PENDIENTE">PENDIENTE</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Campo</label>
                        <select value={court} onChange={(e) => setCourt(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
                            {availableCourts.map(c => <option key={c} value={c}>{c}</option>)}
                            <option value="Sin asignar">Sin asignar</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Equipo A</label>
                        <input value={teamA} onChange={(e) => setTeamA(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                    </div>
                    <div>
                        <label className="text-[11px] font-bold text-slate-500 uppercase block mb-1">Equipo B</label>
                        <input value={teamB} onChange={(e) => setTeamB(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                    </div>
                </div>
                <div className="flex gap-2 mt-5">
                    <button type="button" onClick={onClose} className="flex-1 border border-slate-200 rounded-lg py-2 text-sm font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
                    <button
                        type="button"
                        onClick={() => { onSave({ time, court, teamA, teamB }); onClose(); }}
                        className="flex-1 bg-teal-700 hover:bg-teal-800 text-white rounded-lg py-2 text-sm font-bold"
                    >
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Props ─────────────────────────────────────────────────────────────────
interface SimulationDayGridProps {
    matches: Match[];
    fixedDay?: Match['scheduleDay'];
    /** Cuadrícula completa del día (huecos vacíos hasta el cierre) para mover partidos. */
    fillEmptySlots?: boolean;
    /** Callback cuando el usuario edita o arrastra un partido */
    onUpdateMatch?: (matchId: string, patch: Partial<Pick<Match, 'time' | 'court' | 'teamA' | 'teamB'>>) => void;
}

// ─── Componente principal ──────────────────────────────────────────────────
export const SimulationScheduleGridTabs: React.FC<SimulationDayGridProps> = ({
    matches,
    fixedDay,
    fillEmptySlots = true,
    onUpdateMatch,
}) => {
    const [day, setDay] = useState<MuskizScheduleDayLabel>(fixedDay ?? 'Sábado');
    const viewDay = fixedDay ?? day;

    const [editingMatch, setEditingMatch] = useState<Match | null>(null);
    const dragMatchId = useRef<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{ time: string; court: string } | null>(null);

    React.useEffect(() => {
        if (fixedDay) setDay(fixedDay);
    }, [fixedDay]);

    const { courts, times, grid } = groupMatchesForDayGrid(matches, viewDay, { fillEmptySlots });
    const slotTimesForEdit = fillEmptySlots ? buildFullDayTimeSlots(viewDay) : [];

    // Detect which division codes are present for the legend
    const presentCodes = [...new Set(
        matches
            .filter(m => (m.scheduleDay ?? '').startsWith(viewDay.slice(0, 3)) || m.scheduleDay === viewDay)
            .map(m => getDivisionCodeFromRound(m.round))
            .filter(Boolean)
    )] as string[];

    // All possible times + courts for the edit modal dropdowns
    const allTimes = fillEmptySlots && slotTimesForEdit.length
        ? slotTimesForEdit
        : [...new Set(matches.map((m) => m.time))].sort();
    const allCourts = [...new Set(matches.map(m => m.court))].sort();

    return (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            {/* Tabs de día */}
            {!fixedDay && (
                <div className="flex flex-wrap gap-1 border-b border-slate-100 bg-slate-50 px-2 py-2">
                    <span className="text-[10px] font-black uppercase text-slate-400 self-center mr-2">Vista cuadrícula</span>
                    {DAY_LABELS.map((d) => (
                        <button key={d} type="button" onClick={() => setDay(d)}
                            className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition-colors ${day === d ? 'bg-teal-700 text-white shadow' : 'bg-white text-slate-600 border border-slate-200 hover:border-teal-300'}`}>
                            {d}
                        </button>
                    ))}
                </div>
            )}
            {fixedDay && (
                <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-teal-800">Cuadrícula · {fixedDay}</span>
                    {onUpdateMatch && (
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">drag_indicator</span>
                            Arrastra o haz clic para editar
                        </span>
                    )}
                </div>
            )}

            {/* Leyenda de categorías */}
            {presentCodes.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-slate-100 bg-white">
                    {presentCodes.map(code => {
                        const c = DIV_COLORS[code] ?? FALLBACK_COLORS;
                        return (
                            <span key={code} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.badge}`}>
                                {code} · {DIV_LABELS[code] ?? code}
                            </span>
                        );
                    })}
                </div>
            )}

            {!times.length || !courts.length ? (
                <div className="p-6 text-center text-sm text-slate-400">No hay partidos para este día en el borrador.</div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-[10px] min-w-[480px]">
                        <thead>
                            <tr className="bg-slate-800 text-white">
                                <th className="border border-slate-600 px-1 py-1.5 text-left font-bold whitespace-nowrap w-[54px]">Hora</th>
                                {courts.map((c) => (
                                    <th key={c} className="border border-slate-600 px-1 py-1.5 font-bold text-center">{c}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {times.map((t) => (
                                <tr key={t} className={t === 'PENDIENTE' ? 'bg-amber-50/80' : 'hover:bg-teal-50/20'}>
                                    <td className={`border border-slate-200 font-mono font-bold px-1 py-1 text-center whitespace-nowrap ${t === 'PENDIENTE' ? 'bg-amber-100 text-amber-900' : 'bg-slate-50'}`}>
                                        {t}
                                    </td>
                                    {courts.map((c) => {
                                        const m = grid[t]?.[c] ?? null;
                                        const isDropTarget = dropTarget?.time === t && dropTarget?.court === c;
                                        const colors = divColors(m?.round);
                                        return (
                                            <td
                                                key={c}
                                                className={`border border-slate-200 align-top p-0.5 min-h-[44px] max-w-[140px] transition-colors ${isDropTarget ? 'bg-teal-100 border-2 border-teal-400' : m ? colors.cell : ''}`}
                                                onDragOver={(e) => {
                                                    if (!onUpdateMatch) return;
                                                    e.preventDefault();
                                                    setDropTarget({ time: t, court: c });
                                                }}
                                                onDragLeave={() => setDropTarget(null)}
                                                onDrop={(e) => {
                                                    e.preventDefault();
                                                    setDropTarget(null);
                                                    const draggedId = dragMatchId.current;
                                                    if (!onUpdateMatch || !draggedId) return;
                                                    onUpdateMatch(draggedId, { time: t, court: c });
                                                    dragMatchId.current = null;
                                                }}
                                            >
                                                {m ? (
                                                    <div
                                                        draggable={!!onUpdateMatch}
                                                        onDragStart={() => {
                                                            dragMatchId.current = m.id;
                                                        }}
                                                        onDragEnd={() => {
                                                            dragMatchId.current = null;
                                                            setDropTarget(null);
                                                        }}
                                                        onClick={() => onUpdateMatch && setEditingMatch(m)}
                                                        className={`rounded leading-tight p-1 h-full min-h-[40px] cursor-${onUpdateMatch ? 'grab active:cursor-grabbing' : 'default'} ${colors.cell} border ${colors.drag} select-none`}
                                                    >
                                                        <div className="text-[9px] font-semibold text-slate-800 line-clamp-2">
                                                            {m.teamA} <span className="text-slate-400">vs</span> {m.teamB}
                                                        </div>
                                                        <div className="mt-0.5 text-[8px] text-slate-500 truncate" title={m.round}>
                                                            {(m.round ?? '').split('·').slice(2).join('·').trim()}
                                                        </div>
                                                        {onUpdateMatch && (
                                                            <div className="mt-0.5 text-[7px] text-slate-400 flex items-center gap-0.5">
                                                                <span className="material-symbols-outlined" style={{ fontSize: 9 }}>edit</span> editar
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    onUpdateMatch && (
                                                        <div
                                                            className="min-h-[40px] h-full rounded border border-dashed border-slate-200/80 bg-slate-50/50"
                                                            title="Hueco libre — arrastra un partido aquí"
                                                        />
                                                    )
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal edición */}
            {editingMatch && onUpdateMatch && (
                <EditMatchModal
                    match={editingMatch}
                    availableTimes={allTimes}
                    availableCourts={allCourts}
                    onSave={(patch) => onUpdateMatch(editingMatch.id, patch)}
                    onClose={() => setEditingMatch(null)}
                />
            )}
        </div>
    );
};
