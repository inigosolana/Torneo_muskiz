import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { Match, Team } from '../types';
import {
    exportSocialPayload,
    generateInstagramCaption,
    sendDraftToTelegramReview,
    sendPayloadToN8n,
    triggerAllGroupStoriesToN8n,
} from '../services/socialContentService';

const DIVISIONS: Team['division'][] = [
    'Infantil Femenino',
    'Infantil Masculino',
    'Cadete Femenino',
    'Cadete Masculino',
    'Juvenil Femenino',
    'Juvenil Masculino',
    'Senior Femenino',
    'Senior Masculino',
];

const DAYS = ['Viernes', 'Sábado', 'Domingo'] as const;

interface AdminSocialContentPanelProps {
    teams: Team[];
    matches: Match[];
}

export const AdminSocialContentPanel: React.FC<AdminSocialContentPanelProps> = ({ teams, matches }) => {
    const [division, setDivision] = useState<Team['division']>('Senior Masculino');
    const [groupKey, setGroupKey] = useState('A');
    const [scheduleDay, setScheduleDay] = useState<(typeof DAYS)[number]>('Sábado');
    const [matchId, setMatchId] = useState('');
    const [payloadJson, setPayloadJson] = useState('');
    const [caption, setCaption] = useState('');
    const [busy, setBusy] = useState(false);

    const groups = useMemo(() => {
        const set = new Set<string>();
        for (const t of teams) {
            if (t.division !== division || t.paymentStatus !== 'PAID') continue;
            const g = (t.competitionGroup ?? '').trim();
            if (g) set.add(g);
        }
        return [...set].sort((a, b) => a.localeCompare(b, 'es'));
    }, [teams, division]);

    const finishedMatches = useMemo(
        () =>
            [...matches]
                .filter((m) => m.status === 'FINISHED' && m.isPublic !== false)
                .slice(0, 40),
        [matches]
    );

    const runExport = async (
        contentType: 'standings_group' | 'results_day' | 'match_result' | 'live_digest',
        extra?: Partial<{ matchId: string }>
    ) => {
        setBusy(true);
        try {
            const payload = await exportSocialPayload({
                contentType,
                division,
                groupKey: groups.includes(groupKey) ? groupKey : groups[0] ?? 'A',
                scheduleDay,
                matchId: extra?.matchId ?? matchId,
            });
            setPayloadJson(JSON.stringify(payload, null, 2));
            setCaption(String(payload.captionDraft ?? ''));
            toast.success('Payload generado (Stitch / n8n)');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al exportar');
        } finally {
            setBusy(false);
        }
    };

    const runGeminiCaption = async () => {
        if (!payloadJson) {
            toast.error('Genera un payload antes');
            return;
        }
        setBusy(true);
        try {
            const payload = JSON.parse(payloadJson) as Record<string, unknown>;
            const post = await generateInstagramCaption(payload);
            setCaption(post);
            toast.success('Texto Instagram (Gemini)');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error Gemini');
        } finally {
            setBusy(false);
        }
    };

    const runTelegramReview = async () => {
        if (!payloadJson) {
            toast.error('Genera un payload antes');
            return;
        }
        setBusy(true);
        try {
            const payload = JSON.parse(payloadJson) as Record<string, unknown>;
            const res = await sendDraftToTelegramReview(payload, caption || undefined);
            if (res.sent) {
                toast.success(`Enviado al bot de revisión (borrador ${res.draftId ?? ''})`);
            } else {
                toast.error(res.error ?? 'No se pudo enviar a Telegram');
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error Telegram');
        } finally {
            setBusy(false);
        }
    };

    const runN8n = async (mode?: 'all_groups' | 'day') => {
        setBusy(true);
        try {
            if (mode === 'all_groups') {
                const res = await triggerAllGroupStoriesToN8n();
                const ok = res.sent.filter((s) => s.ok).length;
                toast.success(`Enviado a n8n: ${ok}/${res.sent.length} grupos`);
                return;
            }
            const payload = payloadJson ? JSON.parse(payloadJson) : await exportSocialPayload({
                contentType: mode === 'day' ? 'results_day' : 'standings_group',
                division,
                groupKey,
                scheduleDay,
            });
            const res = await sendPayloadToN8n(
                mode === 'day' ? { mode: 'day_results', scheduleDay } : (payload as Record<string, unknown>)
            );
            if (!res.n8nConfigured) {
                toast.error('Falta N8N_SOCIAL_WH_URL en secrets de Supabase');
                return;
            }
            toast.success(res.ok ? 'Enviado a n8n' : 'n8n respondió con error');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error n8n');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/20 dark:border-purple-800/40 p-5">
                <h2 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-purple-600">campaign</span>
                    Contenido Instagram + n8n + Stitch
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 max-w-3xl">
                    Genera JSON con clasificaciones, resultados del día y partidos. Úsalo en{' '}
                    <strong>Stitch</strong> (campos en <code className="text-xs">stitch.*</code>) o en{' '}
                    <strong>n8n</strong> (webhook <code className="text-xs">N8N_SOCIAL_WH_URL</code>) y
                    <strong> bot Telegram de revisión</strong> (aprobar / pedir cambios).
                    Plantillas HTML: <code className="text-xs">/social-templates/</code>
                </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
                <label className="block text-sm">
                    <span className="font-bold text-slate-600">Categoría</span>
                    <select
                        value={division}
                        onChange={(e) => {
                            setDivision(e.target.value as Team['division']);
                            setGroupKey('A');
                        }}
                        className="mt-1 w-full border rounded-lg px-3 py-2"
                    >
                        {DIVISIONS.map((d) => (
                            <option key={d} value={d}>
                                {d}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="block text-sm">
                    <span className="font-bold text-slate-600">Grupo</span>
                    <select value={groupKey} onChange={(e) => setGroupKey(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2">
                        {groups.length === 0 ? <option value="A">A</option> : groups.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                </label>
                <label className="block text-sm">
                    <span className="font-bold text-slate-600">Día torneo</span>
                    <select
                        value={scheduleDay}
                        onChange={(e) => setScheduleDay(e.target.value as (typeof DAYS)[number])}
                        className="mt-1 w-full border rounded-lg px-3 py-2"
                    >
                        {DAYS.map((d) => (
                            <option key={d} value={d}>
                                {d}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runExport('standings_group')}
                    className="px-4 py-2 rounded-lg bg-purple-600 text-white font-bold text-sm hover:bg-purple-700 disabled:opacity-50"
                >
                    Clasificación grupo (feed/story)
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runExport('results_day')}
                    className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 disabled:opacity-50"
                >
                    Resultados del día
                </button>
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runExport('live_digest')}
                    className="px-4 py-2 rounded-lg border border-slate-300 font-bold text-sm"
                >
                    Resumen grupos (JSON)
                </button>
                <button type="button" disabled={busy} onClick={() => void runN8n('all_groups')} className="px-4 py-2 rounded-lg bg-slate-800 text-white font-bold text-sm">
                    n8n: todos los grupos
                </button>
                <button type="button" disabled={busy} onClick={() => void runN8n('day')} className="px-4 py-2 rounded-lg bg-slate-700 text-white font-bold text-sm">
                    n8n: resultados día
                </button>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
                <label className="block text-sm">
                    <span className="font-bold text-slate-600">Partido (resultado IG)</span>
                    <select value={matchId} onChange={(e) => setMatchId(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm">
                        <option value="">— Elegir —</option>
                        {finishedMatches.map((m) => (
                            <option key={m.id} value={m.id}>
                                {m.teamA} vs {m.teamB} ({m.time})
                            </option>
                        ))}
                    </select>
                </label>
                <div className="flex items-end gap-2">
                    <button
                        type="button"
                        disabled={busy || !matchId}
                        onClick={() => void runExport('match_result', { matchId })}
                        className="px-4 py-2 rounded-lg bg-teal-600 text-white font-bold text-sm disabled:opacity-50"
                    >
                        Payload partido
                    </button>
                    <button type="button" disabled={busy} onClick={() => void runN8n()} className="px-4 py-2 rounded-lg border font-bold text-sm">
                        Enviar payload a n8n
                    </button>
                    <button
                        type="button"
                        disabled={busy || !payloadJson}
                        onClick={() => void runTelegramReview()}
                        className="px-4 py-2 rounded-lg bg-sky-600 text-white font-bold text-sm disabled:opacity-50"
                    >
                        Enviar a Telegram (revisar)
                    </button>
                </div>
            </div>

            <div className="grid lg:grid-cols-2 gap-4">
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold uppercase text-slate-500">Payload JSON (Stitch / n8n)</span>
                        <button
                            type="button"
                            className="text-xs text-purple-600 font-bold"
                            onClick={() => {
                                if (payloadJson) {
                                    navigator.clipboard.writeText(payloadJson);
                                    toast.success('JSON copiado');
                                }
                            }}
                        >
                            Copiar
                        </button>
                    </div>
                    <textarea
                        readOnly
                        value={payloadJson}
                        className="w-full h-64 font-mono text-xs border rounded-lg p-3 bg-slate-50"
                        placeholder="Pulsa un botón de generar…"
                    />
                </div>
                <div>
                    <div className="flex justify-between items-center mb-2 gap-2">
                        <span className="text-xs font-bold uppercase text-slate-500">Texto Instagram</span>
                        <button type="button" disabled={busy} onClick={() => void runGeminiCaption()} className="text-xs text-purple-600 font-bold">
                            Mejorar con Gemini
                        </button>
                    </div>
                    <textarea
                        value={caption}
                        onChange={(e) => setCaption(e.target.value)}
                        className="w-full h-64 text-sm border rounded-lg p-3"
                    />
                    <button
                        type="button"
                        className="mt-2 w-full py-2 rounded-lg bg-purple-100 text-purple-800 font-bold text-sm"
                        onClick={() => {
                            navigator.clipboard.writeText(caption);
                            toast.success('Texto copiado');
                        }}
                    >
                        Copiar texto IG
                    </button>
                </div>
            </div>
        </div>
    );
};
