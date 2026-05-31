import React, { useMemo, useState } from 'react';
import type { Team } from '../types';
import {
    getGroupDistributionForDivision,
    validateGroupDistribution,
    type GroupDistributionValidation,
} from '../utils/groupMatchSync';

const GROUP_COLORS = [
    'border-blue-200 bg-blue-50/80',
    'border-emerald-200 bg-emerald-50/80',
    'border-amber-200 bg-amber-50/80',
    'border-violet-200 bg-violet-50/80',
];

const DRAG_MIME = 'application/x-torneo-team-id';

interface CompetitionGroupManagerProps {
    division: Team['division'];
    teams: Team[];
    groupLetterOptions: string[];
    onMoveTeam: (team: Team, newGroup: string) => void;
    onSwapTeams?: (dragged: Team, target: Team) => void;
    onRequestRegenerateSimulation?: () => void;
    onlyPaid?: boolean;
    /** Desactiva arrastre y selectores (vista pública). */
    readOnly?: boolean;
    disabled?: boolean;
}

/** Distribución de grupos — solo admin: arrastrar equipos entre columnas o intercambiarlos. */
export const CompetitionGroupManager: React.FC<CompetitionGroupManagerProps> = ({
    division,
    teams,
    groupLetterOptions,
    onMoveTeam,
    onSwapTeams,
    onRequestRegenerateSimulation,
    onlyPaid = false,
    readOnly = false,
    disabled,
}) => {
    const editable = !readOnly && !disabled;
    const [draggingTeamId, setDraggingTeamId] = useState<string | null>(null);
    const [dropTargetGroup, setDropTargetGroup] = useState<string | null>(null);
    const [dropTargetTeamId, setDropTargetTeamId] = useState<string | null>(null);

    const groups = useMemo(
        () => getGroupDistributionForDivision(teams, division, onlyPaid),
        [teams, division, onlyPaid]
    );

    const validation: GroupDistributionValidation = useMemo(
        () => validateGroupDistribution(teams, division, onlyPaid),
        [teams, division, onlyPaid]
    );

    const namesInDisplayedGroups = useMemo(
        () => new Set(groups.flatMap((g) => g.teams.map((t) => t.id))),
        [groups]
    );

    const unassigned = useMemo(() => {
        return teams.filter((t) => {
            if (t.division !== division) return false;
            if (onlyPaid && t.paymentStatus !== 'PAID') return false;
            if ((t.competitionGroup ?? '').trim()) return false;
            return !namesInDisplayedGroups.has(t.id);
        });
    }, [teams, division, onlyPaid, namesInDisplayedGroups]);

    const allGroupKeys = useMemo(() => {
        const keys = new Set(groupLetterOptions.filter(Boolean));
        groups.forEach((g) => keys.add(g.key));
        return [...keys].sort((a, b) => a.localeCompare(b, 'es'));
    }, [groupLetterOptions, groups]);

    const findTeamById = (id: string) => teams.find((t) => t.id === id);

    const isDragLeaveEvent = (current: EventTarget, related: EventTarget | null): boolean => {
        if (!related || !(related instanceof Node)) return true;
        return !(current instanceof Node && current.contains(related));
    };

    const resolveDraggedTeam = (e: React.DragEvent): Team | undefined => {
        const teamId = e.dataTransfer.getData(DRAG_MIME) || draggingTeamId || '';
        return findTeamById(teamId);
    };

    const handleDragStart = (e: React.DragEvent, team: Team) => {
        if (!editable) return;
        e.dataTransfer.setData(DRAG_MIME, team.id);
        e.dataTransfer.effectAllowed = 'move';
        setDraggingTeamId(team.id);
    };

    const handleDragEnd = () => {
        setDraggingTeamId(null);
        setDropTargetGroup(null);
        setDropTargetTeamId(null);
    };

    const handleDragOverGroup = (e: React.DragEvent, groupKey: string) => {
        if (!editable || !draggingTeamId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDropTargetGroup(groupKey);
        setDropTargetTeamId(null);
    };

    const handleDragOverTeam = (e: React.DragEvent, targetTeam: Team, groupKey: string) => {
        if (!editable || !draggingTeamId) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        setDropTargetGroup(groupKey);
        setDropTargetTeamId(targetTeam.id);
    };

    const handleDragLeaveGroup = (e: React.DragEvent, groupKey: string) => {
        if (!isDragLeaveEvent(e.currentTarget, e.relatedTarget)) return;
        setDropTargetGroup((prev) => (prev === groupKey ? null : prev));
    };

    const handleDropOnGroup = (e: React.DragEvent, groupKey: string) => {
        if (!editable) return;
        e.preventDefault();
        const team = resolveDraggedTeam(e);
        if (team && groupKey) {
            const current = (team.competitionGroup ?? '').trim();
            if (current !== groupKey) {
                onMoveTeam(team, groupKey);
            }
        }
        handleDragEnd();
    };

    const handleDropOnTeam = (e: React.DragEvent, targetTeam: Team, groupKey: string) => {
        if (!editable) return;
        e.preventDefault();
        e.stopPropagation();
        const dragged = resolveDraggedTeam(e);
        if (!dragged || dragged.id === targetTeam.id) {
            handleDragEnd();
            return;
        }

        const draggedGroup = (dragged.competitionGroup ?? '').trim();
        const targetGroup = (targetTeam.competitionGroup ?? '').trim() || groupKey;

        if (draggedGroup && targetGroup && draggedGroup !== targetGroup && onSwapTeams) {
            onSwapTeams(dragged, targetTeam);
        } else if (groupKey && draggedGroup !== groupKey) {
            onMoveTeam(dragged, groupKey);
        }
        handleDragEnd();
    };

    if (groups.length === 0 && unassigned.length === 0) {
        return (
            <p className="text-sm text-slate-500 text-center py-6 border border-dashed rounded-lg">
                No hay equipos en esta categoría{onlyPaid ? ' con pago confirmado' : ''}.
            </p>
        );
    }

    const renderTeamCard = (team: Team, groupKey: string) => {
        const isDragging = draggingTeamId === team.id;
        const isSwapTarget = dropTargetTeamId === team.id && draggingTeamId && draggingTeamId !== team.id;
        return (
            <li
                key={team.id}
                draggable={editable}
                onDragStart={(e) => handleDragStart(e, team)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOverTeam(e, team, groupKey)}
                onDragLeave={(e) => {
                    if (!isDragLeaveEvent(e.currentTarget, e.relatedTarget)) return;
                    setDropTargetTeamId((prev) => (prev === team.id ? null : prev));
                }}
                onDrop={(e) => handleDropOnTeam(e, team, groupKey)}
                className={`flex items-center gap-2 bg-white rounded-lg border px-2 py-1.5 transition-all ${
                    isDragging ? 'opacity-40 scale-95 border-dashed border-slate-400' : 'border-slate-200/80'
                } ${isSwapTarget ? 'ring-2 ring-teal-500 border-teal-500 scale-[1.02]' : ''} ${
                    editable ? 'cursor-grab active:cursor-grabbing hover:border-teal-400 hover:shadow-sm' : ''
                }`}
            >
                {editable && (
                    <span
                        className="material-symbols-outlined text-slate-400 text-base shrink-0 select-none"
                        aria-hidden
                    >
                        drag_indicator
                    </span>
                )}
                <span className="text-xs font-semibold text-slate-800 truncate flex-1" title={team.name}>
                    {team.name}
                </span>
                {editable && (
                    <select
                        value={team.competitionGroup ?? groupKey}
                        onChange={(e) => {
                            const v = e.target.value;
                            if (v) onMoveTeam(team, v);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] font-bold border border-slate-200 rounded px-1 py-0.5 bg-slate-50 max-w-[3.5rem] shrink-0"
                        title="O cambiar con el desplegable"
                    >
                        {allGroupKeys.map((k) => (
                            <option key={k} value={k}>
                                {k}
                            </option>
                        ))}
                    </select>
                )}
            </li>
        );
    };

    return (
        <div className="space-y-3">
            {editable && (
                <p className="text-xs text-slate-600 flex items-center gap-2">
                    <span className="material-symbols-outlined text-base text-teal-700">touch_app</span>
                    Arrastra a otra columna para mover, o suelta encima de otro equipo para intercambiarlos. Los partidos de grupos se actualizan al soltar.
                </p>
            )}

            {validation.needsRegenerate && editable && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 flex flex-wrap items-start gap-3">
                    <div className="flex items-start gap-2 flex-1 min-w-[200px]">
                        <span className="material-symbols-outlined text-amber-600 text-lg shrink-0">warning</span>
                        <div>
                            <p className="text-xs font-bold text-amber-900">Reparto distinto al de la simulación</p>
                            <ul className="text-[11px] text-amber-800 mt-1 list-disc list-inside space-y-0.5">
                                {validation.issues.map((issue) => (
                                    <li key={issue}>{issue}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                    {onRequestRegenerateSimulation && (
                        <button
                            type="button"
                            onClick={onRequestRegenerateSimulation}
                            className="shrink-0 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm"
                        >
                            Regenerar simulación
                        </button>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {groups.map((g, idx) => {
                    const isDropTarget = dropTargetGroup === g.key && draggingTeamId && !dropTargetTeamId;
                    return (
                        <div
                            key={g.key}
                            onDragEnter={(e) => {
                                if (!editable || !draggingTeamId) return;
                                e.preventDefault();
                                setDropTargetGroup(g.key);
                            }}
                            onDragOver={(e) => handleDragOverGroup(e, g.key)}
                            onDragLeave={(e) => handleDragLeaveGroup(e, g.key)}
                            onDrop={(e) => handleDropOnGroup(e, g.key)}
                            className={`rounded-xl border-2 p-3 min-h-[120px] transition-colors ${GROUP_COLORS[idx % GROUP_COLORS.length]} ${
                                isDropTarget ? 'ring-2 ring-teal-500 ring-offset-2 border-teal-500' : ''
                            }`}
                        >
                            <h4 className="text-xs font-black uppercase text-slate-700 mb-2 flex items-center justify-between">
                                <span>Grupo {g.key}</span>
                                <span className="text-[10px] font-bold bg-white/80 px-2 py-0.5 rounded-full">
                                    {g.teams.length}
                                </span>
                            </h4>
                            <ul className="space-y-2 min-h-[2rem]">{g.teams.map((team) => renderTeamCard(team, g.key))}</ul>
                            {editable && g.teams.length === 0 && (
                                <p className="text-[10px] text-slate-500 text-center py-4 border border-dashed border-slate-300/80 rounded-lg">
                                    Suelta aquí
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>

            {unassigned.length > 0 && (
                <div
                    className={`rounded-xl border border-amber-200 bg-amber-50 p-3 ${
                        dropTargetGroup === '__unassigned__' && draggingTeamId ? 'ring-2 ring-amber-500' : ''
                    }`}
                    onDragEnter={(e) => {
                        if (!editable) return;
                        e.preventDefault();
                        setDropTargetGroup('__unassigned__');
                    }}
                    onDragOver={(e) => {
                        if (!editable) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setDropTargetGroup('__unassigned__');
                    }}
                    onDragLeave={(e) => handleDragLeaveGroup(e, '__unassigned__')}
                    onDrop={(e) => {
                        if (!editable) return;
                        e.preventDefault();
                        const team = resolveDraggedTeam(e);
                        if (team) onMoveTeam(team, '');
                        handleDragEnd();
                    }}
                >
                    <p className="text-xs font-bold text-amber-900 mb-2">Sin grupo asignado — arrastra a una columna</p>
                    <ul className="flex flex-wrap gap-2">
                        {unassigned.map((team) => (
                            <li key={team.id}>{renderTeamCard(team, '')}</li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};
