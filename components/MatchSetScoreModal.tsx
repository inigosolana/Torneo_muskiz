import React, { useEffect, useMemo, useState } from 'react';
import type { BeachSetScores, Match } from '../types';
import {
    computeSetsResultFromDetail,
    emptyBeachSetScores,
    formatSetsDisplay,
    getMatchSetScores,
    VALID_SETS_DISPLAY,
} from '../utils/beachSetScoring';

interface MatchSetScoreModalProps {
    match: Match;
    onClose: () => void;
    onSave: (setScores: BeachSetScores) => void;
}

function numVal(v: number | null): string {
    return v === null ? '' : String(v);
}

function parseInput(raw: string): number | null {
    const t = raw.trim();
    if (t === '') return null;
    const n = parseInt(t, 10);
    return Number.isNaN(n) ? null : Math.max(0, n);
}

export const MatchSetScoreModal: React.FC<MatchSetScoreModalProps> = ({ match, onClose, onSave }) => {
    const [scores, setScores] = useState<BeachSetScores>(() => getMatchSetScores(match));

    useEffect(() => {
        setScores(getMatchSetScores(match));
    }, [match.id]);

    const computed = useMemo(() => computeSetsResultFromDetail(scores), [scores]);

    const patch = (field: keyof BeachSetScores, raw: string) => {
        setScores((prev) => ({ ...prev, [field]: parseInput(raw) }));
    };

    const handleSave = () => {
        if (!computed?.finished || !computed.validDisplay) {
            return;
        }
        onSave(scores);
        onClose();
    };

    const preview =
        computed?.finished && computed.validDisplay
            ? formatSetsDisplay(computed.setsA, computed.setsB)
            : computed?.needsShootout
              ? '1:1 — falta shootout'
              : '—';

    return (
        <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
                    <h3 className="font-bold text-slate-900">Resultado por sets</h3>
                    <p className="text-xs text-slate-500 mt-1 truncate">
                        {match.teamA} <span className="text-slate-400">vs</span> {match.teamB}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1">
                        En la tabla solo se muestra sets ganados: {VALID_SETS_DISPLAY.join(', ')}
                    </p>
                </div>

                <div className="p-5 space-y-4">
                    <SetRow label="1.er set" teamA={match.teamA} teamB={match.teamB} a={scores.set1A} b={scores.set1B} onA={(v) => patch('set1A', v)} onB={(v) => patch('set1B', v)} />
                    <SetRow label="2.º set" teamA={match.teamA} teamB={match.teamB} a={scores.set2A} b={scores.set2B} onA={(v) => patch('set2A', v)} onB={(v) => patch('set2B', v)} />

                    {computed?.needsShootout && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                            <p className="text-xs font-bold text-amber-900 uppercase">Shoot out (1:1 en sets)</p>
                            <SetRow
                                label="Shootout"
                                teamA={match.teamA}
                                teamB={match.teamB}
                                a={scores.shootoutA}
                                b={scores.shootoutB}
                                onA={(v) => patch('shootoutA', v)}
                                onB={(v) => patch('shootoutB', v)}
                            />
                        </div>
                    )}

                    <div className="flex items-center justify-center gap-3 py-3 rounded-xl bg-teal-50 border border-teal-100">
                        <span className="text-xs font-bold text-teal-800 uppercase">Marcador (sets)</span>
                        <span className="text-3xl font-black text-teal-900 tabular-nums">{preview}</span>
                    </div>
                </div>

                <div className="px-5 py-4 border-t border-slate-100 flex justify-between gap-2">
                    <button
                        type="button"
                        onClick={() => {
                            setScores(emptyBeachSetScores());
                        }}
                        className="px-3 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 rounded-lg"
                    >
                        Borrar
                    </button>
                    <div className="flex gap-2">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-lg">
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={!computed?.finished || !computed.validDisplay}
                            className="px-5 py-2 text-sm font-bold bg-teal-700 text-white rounded-lg hover:bg-teal-800 disabled:opacity-40"
                        >
                            Guardar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

function SetRow({
    label,
    teamA,
    teamB,
    a,
    b,
    onA,
    onB,
}: {
    label: string;
    teamA: string;
    teamB: string;
    a: number | null;
    b: number | null;
    onA: (v: string) => void;
    onB: (v: string) => void;
}) {
    return (
        <div>
            <p className="text-[10px] font-black uppercase text-slate-500 mb-2">{label}</p>
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                <div>
                    <p className="text-[10px] text-slate-500 truncate mb-1" title={teamA}>
                        {teamA}
                    </p>
                    <input
                        type="number"
                        min={0}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-center font-bold"
                        value={numVal(a)}
                        onChange={(e) => onA(e.target.value)}
                        placeholder="0"
                    />
                </div>
                <span className="text-slate-400 font-bold pt-5">:</span>
                <div>
                    <p className="text-[10px] text-slate-500 truncate mb-1 text-right" title={teamB}>
                        {teamB}
                    </p>
                    <input
                        type="number"
                        min={0}
                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-center font-bold"
                        value={numVal(b)}
                        onChange={(e) => onB(e.target.value)}
                        placeholder="0"
                    />
                </div>
            </div>
        </div>
    );
}
