import React, { useState, useRef, useMemo } from 'react';
import type { Match } from '../types';
import {
    buildFullDayTimeSlots,
    getDayScheduleConfig,
    groupMatchesForDayGrid,
} from '../services/muskizScheduleSimulator';
import type { MuskizScheduleDayLabel } from '../services/muskizScheduleSimulator';
import {
    collectGridLegendEntries,
    getMatchGridColors,
} from '../utils/matchGridColors';

const DAY_LABELS: MuskizScheduleDayLabel[] = ['Viernes', 'Sábado', 'Domingo'];
const MATCH_DRAG_MIME = 'application/x-torneo-match-id';

function isDragLeaveEvent(current: EventTarget, related: EventTarget | null): boolean {
    if (!related || !(related instanceof Node)) return true;
    return !(current instanceof Node && current.contains(related));
}

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
    const SLOT_MINS = 35;
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
    const dayCfg = getDayScheduleConfig(viewDay);
    const lunch = dayCfg.lunch;

    // Leyenda: categoría + tono de grupo / fase
    const legendEntries = useMemo(
        () =>
            collectGridLegendEntries(
                matches
                    .filter(
                        (m) =>
                            (m.scheduleDay ?? '').startsWith(viewDay.slice(0, 3)) || m.scheduleDay === viewDay
                    )
                    .map((m) => m.round)
            ),
        [matches, viewDay]
    );

    // All possible times + courts for the edit modal dropdowns
    const allTimes = fillEmptySlots && slotTimesForEdit.length
        ? slotTimesForEdit
        : [...new Set(matches.map((m) => m.time))].sort();
    const allCourts = [...new Set(matches.map(m => m.court))].sort();
    const timesToRender = useMemo(() => {
        if (!(fillEmptySlots && viewDay === 'Viernes')) return times;
        return times.filter((t) => {
            if (t === 'PENDIENTE') return true;
            return courts.some((c) => Boolean(grid[t]?.[c]));
        });
    }, [fillEmptySlots, viewDay, times, courts, grid]);
    const toMinutes = (time: string): number | null => {
        if (!/^\d{2}:\d{2}$/.test(time)) return null;
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    };
    const toTime = (mins: number): string => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

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
                        <span className="text-[10px] text-slate-400 flex items-center gap-1 max-w-md text-right">
                            <span className="material-symbols-outlined text-sm">drag_indicator</span>
                            Arrastra o edita. No se permite el mismo equipo a la misma hora.
                        </span>
                    )}
                </div>
            )}

            {/* Leyenda de categorías y grupos */}
            {legendEntries.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-slate-100 bg-white">
                    {legendEntries.map((entry) => (
                        <span key={entry.key} className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${entry.colors.badge}`}>
                            {entry.label}
                        </span>
                    ))}
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
                            {timesToRender.map((t, idx) => (
                                <React.Fragment key={t}>
                                    {idx > 0 && (() => {
                                        const prev = timesToRender[idx - 1]!;
                                        const prevMin = toMinutes(prev);
                                        const currMin = toMinutes(t);
                                        if (prevMin == null || currMin == null) return null;
                                        const gap = currMin - prevMin - SLOT_MINS;
                                        if (gap <= 0) return null;
                                        const gapStart = prevMin + SLOT_MINS;
                                        const gapEnd = currMin;
                                        return (
                                            <tr className="bg-amber-100/80">
                                                <td className="border border-amber-300 bg-amber-200 text-amber-950 font-black text-center px-1 py-1 whitespace-nowrap">
                                                    PAUSA
                                                </td>
                                                <td
                                                    colSpan={courts.length}
                                                    className="border border-amber-300 text-amber-950 px-2 py-1 text-[10px] font-black uppercase tracking-wide"
                                                >
                                                    Pausa {gap} min: {toTime(gapStart)} - {toTime(gapEnd)}
                                                </td>
                                            </tr>
                                        );
                                    })()}
                                    {lunch && t === lunch.end && (
                                        <tr className="bg-lime-200">
                                            <td className="border border-lime-500 bg-lime-400 text-lime-950 font-black text-center px-1 py-1 whitespace-nowrap">
                                                PAUSA
                                            </td>
                                            <td
                                                colSpan={courts.length}
                                                className="border border-lime-500 bg-lime-300 text-lime-950 px-2 py-1 text-[10px] font-black uppercase tracking-wide"
                                            >
                                                {viewDay === 'Domingo'
                                                    ? `Descanso: ${lunch.start} - ${lunch.end}`
                                                    : `Pausa comida: ${lunch.start} - ${lunch.end}`}
                                            </td>
                                        </tr>
                                    )}
                                    <tr className={t === 'PENDIENTE' ? 'bg-amber-50/80' : 'hover:bg-teal-50/20'}>
                                        <td className={`border border-slate-200 font-mono font-bold px-1 py-1 text-center whitespace-nowrap ${t === 'PENDIENTE' ? 'bg-amber-100 text-amber-900' : 'bg-slate-50'}`}>
                                            {t}
                                        </td>
                                        {courts.map((c) => {
                                            const m = grid[t]?.[c] ?? null;
                                            const isDropTarget = dropTarget?.time === t && dropTarget?.court === c;
                                            const colors = getMatchGridColors(m?.round);
                                            return (
                                                <td
                                                    key={c}
                                                    className={`border border-slate-200 align-top p-0.5 min-h-[48px] h-[48px] max-w-[140px] transition-colors ${isDropTarget ? 'bg-teal-100 border-2 border-teal-400' : m ? colors.cell : onUpdateMatch ? 'bg-slate-50/80' : ''}`}
                                                    onDragEnter={(e) => {
                                                        if (!onUpdateMatch) return;
                                                        e.preventDefault();
                                                        setDropTarget({ time: t, court: c });
                                                    }}
                                                    onDragOver={(e) => {
                                                        if (!onUpdateMatch) return;
                                                        e.preventDefault();
                                                        e.dataTransfer.dropEffect = 'move';
                                                        setDropTarget({ time: t, court: c });
                                                    }}
                                                    onDragLeave={(e) => {
                                                        if (isDragLeaveEvent(e.currentTarget, e.relatedTarget)) {
                                                            setDropTarget((prev) =>
                                                                prev?.time === t && prev?.court === c ? null : prev
                                                            );
                                                        }
                                                    }}
                                                    onDrop={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setDropTarget(null);
                                                        const draggedId =
                                                            e.dataTransfer.getData(MATCH_DRAG_MIME) ||
                                                            dragMatchId.current;
                                                        if (!onUpdateMatch || !draggedId) return;
                                                        onUpdateMatch(draggedId, { time: t, court: c });
                                                        dragMatchId.current = null;
                                                    }}
                                                >
                                                    {m ? (
                                                        <div
                                                            draggable={!!onUpdateMatch}
                                                            onDragStart={(e) => {
                                                                dragMatchId.current = m.id;
                                                                e.dataTransfer.setData(MATCH_DRAG_MIME, m.id);
                                                                e.dataTransfer.effectAllowed = 'move';
                                                            }}
                                                            onDragEnd={() => {
                                                                dragMatchId.current = null;
                                                                setDropTarget(null);
                                                            }}
                                                            onClick={() => onUpdateMatch && setEditingMatch(m)}
                                                            className={`rounded leading-tight p-1 h-full min-h-[44px] ${onUpdateMatch ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'} ${colors.cell} border ${colors.drag} select-none`}
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
                                                                className="min-h-[44px] h-full w-full rounded border border-dashed border-slate-300/80 bg-transparent pointer-events-none"
                                                                aria-hidden
                                                            />
                                                        )
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                </React.Fragment>
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
