import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { Team } from '../types';
import { getOfficialSponsorLogos } from '../constants/officialSponsors';
import type { SponsorRow } from '../utils/sponsorDisplay';
import { sendSocialPostImageToTelegram } from '../services/socialPostTelegramService';
import { buildPaidGroupsForDivision, captionForGroupPost } from '../utils/socialPostGroups';
import {
    canvasSizeForFormat,
    paletteForCategory,
    renderGroupsCanvas,
    type GroupBlock,
    type SocialCanvasFormat,
    type SponsorLogo,
} from '../utils/renderGroupsCanvas';

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

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`No se pudo cargar: ${url}`));
        img.src = url;
    });
}

function absUrl(url: string): string {
    return url.startsWith('http') ? url : `${window.location.origin}${url}`;
}

export interface RenderAssets {
    shieldImages: Map<string, HTMLImageElement>;
    sponsorImages: Map<string, HTMLImageElement>;
    logoImage: HTMLImageElement | null;
}

interface SocialPostGeneratorProps {
    onClose: () => void;
    teams: Team[];
    sponsors?: SponsorRow[];
}

export const SocialPostGenerator: React.FC<SocialPostGeneratorProps> = ({
    onClose,
    teams,
    sponsors: _sponsorsFromAdmin = [],
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [division, setDivision] = useState<Team['division']>('Senior Masculino');
    const [selectedGroupKey, setSelectedGroupKey] = useState('');
    const [format, setFormat] = useState<SocialCanvasFormat>('square');
    const [tournamentName, setTournamentName] = useState('II TORNEO MUSKIZ');
    const [caption, setCaption] = useState('');
    const [customLogoUrl, setCustomLogoUrl] = useState<string | null>(null);
    const [rendering, setRendering] = useState(false);
    const [sending, setSending] = useState(false);
    const [batchBusy, setBatchBusy] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const assetsRef = useRef<RenderAssets | null>(null);

    const palette = useMemo(() => paletteForCategory(division), [division]);

    const groups = useMemo(() => buildPaidGroupsForDivision(teams, division), [teams, division]);

    const activeGroup = useMemo(
        () => groups.find((g) => g.key === selectedGroupKey) ?? groups[0] ?? null,
        [groups, selectedGroupKey],
    );

    useEffect(() => {
        if (groups.length && !groups.some((g) => g.key === selectedGroupKey)) {
            setSelectedGroupKey(groups[0]!.key);
        }
    }, [groups, selectedGroupKey]);

    /** Siempre patrocinadores oficiales de esta edición (no mezclar con BD antigua). */
    const sponsorLogos: SponsorLogo[] = useMemo(() => getOfficialSponsorLogos(), []);

    useEffect(() => {
        if (activeGroup) {
            setCaption(captionForGroupPost(tournamentName, division, activeGroup));
        }
    }, [activeGroup, division, tournamentName]);

    const loadRenderAssets = useCallback(async (): Promise<RenderAssets> => {
        const shieldUrls = new Set<string>();
        for (const div of DIVISIONS) {
            for (const g of buildPaidGroupsForDivision(teams, div)) {
                for (const t of g.teams) {
                    if (t.shieldUrl) shieldUrls.add(t.shieldUrl);
                }
            }
        }

        const shieldImages = new Map<string, HTMLImageElement>();
        await Promise.all(
            [...shieldUrls].map(async (url) => {
                try {
                    shieldImages.set(url, await loadImage(absUrl(url)));
                } catch {
                    /* iniciales */
                }
            }),
        );

        const sponsorImages = new Map<string, HTMLImageElement>();
        await Promise.all(
            sponsorLogos.map(async (s) => {
                try {
                    sponsorImages.set(s.logoUrl, await loadImage(absUrl(s.logoUrl)));
                } catch {
                    /* omit */
                }
            }),
        );

        let logoImage: HTMLImageElement | null = null;
        const logoSrc = customLogoUrl ?? '/logo_kolosaurios.png';
        try {
            logoImage = await loadImage(absUrl(logoSrc));
        } catch {
            logoImage = null;
        }

        const assets = { shieldImages, sponsorImages, logoImage };
        assetsRef.current = assets;
        return assets;
    }, [teams, sponsorLogos, customLogoUrl]);

    const renderGroupToCanvas = useCallback(
        (
            group: GroupBlock,
            divisionLabel: Team['division'],
            assets: RenderAssets,
            targetCanvas: HTMLCanvasElement,
        ): void => {
            const { width, height } = canvasSizeForFormat(format);
            renderGroupsCanvas(targetCanvas, {
                width,
                height,
                tournamentName,
                categoryLabel: divisionLabel,
                groupTitle: `GRUPO ${group.key}`,
                groups: [group],
                sponsors: sponsorLogos,
                logoImage: assets.logoImage,
                shieldImages: assets.shieldImages,
                sponsorImages: assets.sponsorImages,
                palette: paletteForCategory(divisionLabel),
            });
        },
        [format, tournamentName, sponsorLogos],
    );

    const renderGroupDataUrl = useCallback(
        async (group: GroupBlock, divisionLabel: Team['division']): Promise<string> => {
            const assets = assetsRef.current ?? (await loadRenderAssets());
            const canvas = document.createElement('canvas');
            renderGroupToCanvas(group, divisionLabel, assets, canvas);
            return canvas.toDataURL('image/png', 0.92);
        },
        [loadRenderAssets, renderGroupToCanvas],
    );

    const renderPreview = useCallback(async () => {
        const canvas = canvasRef.current;
        if (!canvas || !activeGroup) return;

        setRendering(true);
        try {
            const assets = await loadRenderAssets();
            renderGroupToCanvas(activeGroup, division, assets, canvas);
            setPreviewUrl(canvas.toDataURL('image/png', 0.92));
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error al renderizar');
        } finally {
            setRendering(false);
        }
    }, [activeGroup, division, loadRenderAssets, renderGroupToCanvas]);

    useEffect(() => {
        const t = window.setTimeout(() => void renderPreview(), 120);
        return () => window.clearTimeout(t);
    }, [renderPreview]);

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setCustomLogoUrl(URL.createObjectURL(file));
        assetsRef.current = null;
    };

    const slug = (s: string) => s.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');

    const handleDownload = () => {
        if (!previewUrl || !activeGroup) return;
        const a = document.createElement('a');
        a.href = previewUrl;
        a.download = `torneo-${slug(division)}-grupo-${activeGroup.key}.png`;
        a.click();
    };

    const handleSendTelegram = async () => {
        if (!previewUrl || !activeGroup) return;
        setSending(true);
        try {
            const base64 = previewUrl.replace(/^data:image\/\w+;base64,/, '');
            const res = await sendSocialPostImageToTelegram(
                base64,
                caption || captionForGroupPost(tournamentName, division, activeGroup),
            );
            if (res.ok) toast.success(`Grupo ${activeGroup.key} enviado a Telegram`);
            else toast.error(res.error ?? 'No se pudo enviar');
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error Telegram');
        } finally {
            setSending(false);
        }
    };

    const runBatch = async (
        items: { division: Team['division']; group: GroupBlock }[],
        mode: 'download' | 'telegram',
    ) => {
        if (!items.length) {
            toast.error('No hay grupos con equipos asignados');
            return;
        }
        if (
            mode === 'telegram' &&
            !window.confirm(`¿Enviar ${items.length} imágenes a Telegram (una por grupo)?`)
        ) {
            return;
        }

        setBatchBusy(true);
        assetsRef.current = null;
        let ok = 0;
        try {
            await loadRenderAssets();
            for (let i = 0; i < items.length; i++) {
                const { division: div, group } = items[i]!;
                const dataUrl = await renderGroupDataUrl(group, div);
                const cap = captionForGroupPost(tournamentName, div, group);
                if (mode === 'download') {
                    const a = document.createElement('a');
                    a.href = dataUrl;
                    a.download = `torneo-${slug(div)}-grupo-${group.key}.png`;
                    a.click();
                    await new Promise((r) => setTimeout(r, 280));
                } else {
                    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
                    const res = await sendSocialPostImageToTelegram(base64, cap);
                    if (res.ok) ok++;
                    await new Promise((r) => setTimeout(r, 600));
                }
            }
            if (mode === 'download') {
                toast.success(`${items.length} imágenes descargadas (una por grupo)`);
            } else {
                toast.success(`Telegram: ${ok}/${items.length} enviadas`);
            }
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Error en lote');
        } finally {
            setBatchBusy(false);
        }
    };

    const itemsForCategory = useMemo(
        () => groups.map((g) => ({ division, group: g })),
        [groups, division],
    );

    const itemsForAllTournament = useMemo(() => {
        const out: { division: Team['division']; group: GroupBlock }[] = [];
        for (const div of DIVISIONS) {
            for (const g of buildPaidGroupsForDivision(teams, div)) {
                out.push({ division: div, group: g });
            }
        }
        return out;
    }, [teams]);

    const aspectClass = format === 'story' ? 'aspect-[9/16] max-h-[min(70vh,640px)]' : 'aspect-square max-h-[min(70vh,520px)]';

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in">
            <div className="bg-background-dark border border-white/10 w-full max-w-6xl max-h-[95vh] overflow-y-auto rounded-2xl shadow-2xl relative">
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 text-slate-400 hover:text-white"
                    aria-label="Cerrar"
                >
                    <span className="material-symbols-outlined">close</span>
                </button>

                <div className="p-6 md:p-8 grid lg:grid-cols-[1fr_340px] gap-8">
                    <div>
                        <div className="flex items-center gap-3 mb-6">
                            <span className="material-symbols-outlined text-primary text-3xl">photo_camera</span>
                            <div>
                                <h2 className="text-2xl font-black text-white uppercase tracking-tight">
                                    Crear publicación
                                </h2>
                                <p className="text-sm text-slate-400">
                                    Una imagen por grupo y categoría (estilo Lacanau)
                                </p>
                            </div>
                        </div>

                        <div className="grid sm:grid-cols-2 gap-4 mb-4">
                            <label className="block text-sm">
                                <span className="font-bold text-slate-300">Categoría</span>
                                <select
                                    value={division}
                                    onChange={(e) => setDivision(e.target.value as Team['division'])}
                                    className="mt-1 w-full bg-surface-dark border border-white/10 rounded-lg px-3 py-2 text-white"
                                >
                                    {DIVISIONS.map((d) => (
                                        <option key={d} value={d}>
                                            {d}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="block text-sm">
                                <span className="font-bold text-slate-300">Formato</span>
                                <select
                                    value={format}
                                    onChange={(e) => setFormat(e.target.value as SocialCanvasFormat)}
                                    className="mt-1 w-full bg-surface-dark border border-white/10 rounded-lg px-3 py-2 text-white"
                                >
                                    <option value="square">Cuadrado 1080×1080 (feed)</option>
                                    <option value="story">Story 1080×1920</option>
                                </select>
                            </label>
                            <label className="block text-sm sm:col-span-2">
                                <span className="font-bold text-slate-300">Título del torneo</span>
                                <input
                                    value={tournamentName}
                                    onChange={(e) => setTournamentName(e.target.value)}
                                    className="mt-1 w-full bg-surface-dark border border-white/10 rounded-lg px-3 py-2 text-white uppercase"
                                />
                            </label>
                            <label className="block text-sm sm:col-span-2">
                                <span className="font-bold text-slate-300">Logo (opcional)</span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleLogoUpload}
                                    className="mt-1 w-full text-sm text-slate-400"
                                />
                            </label>
                        </div>

                        {groups.length > 0 && (
                            <div className="mb-4">
                                <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">
                                    Grupo (1 publicación)
                                </span>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {groups.map((g) => (
                                        <button
                                            key={g.key}
                                            type="button"
                                            onClick={() => setSelectedGroupKey(g.key)}
                                            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all ${
                                                activeGroup?.key === g.key
                                                    ? 'bg-primary text-background-dark'
                                                    : 'bg-white/10 text-white hover:bg-white/15'
                                            }`}
                                        >
                                            Grupo {g.key}
                                            <span className="ml-1 opacity-70 text-xs">({g.teams.length})</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {!activeGroup ? (
                            <p className="text-amber-400 text-sm py-8 text-center border border-amber-500/30 rounded-xl">
                                No hay equipos pagados con grupo en esta categoría. Asigna grupos en Competición →
                                Estructura.
                            </p>
                        ) : (
                            <div
                                className={`relative mx-auto w-full ${aspectClass} rounded-xl overflow-hidden shadow-2xl border border-white/10`}
                                style={{
                                    background: `linear-gradient(135deg, ${palette.secondary} 0%, ${palette.primary} 55%, #020617 100%)`,
                                }}
                            >
                                {previewUrl ? (
                                    <img src={previewUrl} alt={`Grupo ${activeGroup.key}`} className="w-full h-full object-contain" />
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                                        {rendering ? 'Renderizando…' : 'Vista previa'}
                                    </div>
                                )}
                                {rendering && (
                                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                        <span className="material-symbols-outlined animate-spin text-primary text-4xl">
                                            progress_activity
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}

                        <canvas ref={canvasRef} className="hidden" aria-hidden />
                    </div>

                    <div className="flex flex-col gap-3">
                        <label className="block text-sm flex-1">
                            <span className="font-bold text-slate-300">Texto / caption</span>
                            <textarea
                                value={caption}
                                onChange={(e) => setCaption(e.target.value)}
                                className="mt-1 w-full h-36 bg-surface-dark border border-white/10 rounded-lg p-3 text-white text-sm resize-none"
                            />
                        </label>

                        <button
                            type="button"
                            onClick={() => void renderPreview()}
                            disabled={rendering || !activeGroup}
                            className="w-full py-2 rounded-lg border border-white/15 text-white font-bold text-sm hover:bg-white/5 disabled:opacity-50"
                        >
                            Actualizar vista previa
                        </button>

                        <button
                            type="button"
                            onClick={handleDownload}
                            disabled={!previewUrl || !activeGroup}
                            className="w-full py-3 rounded-lg bg-white text-background-dark font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <span className="material-symbols-outlined">download</span>
                            Descargar este grupo
                        </button>

                        <button
                            type="button"
                            onClick={() => void handleSendTelegram()}
                            disabled={sending || !previewUrl}
                            className="w-full py-3 rounded-lg bg-primary text-background-dark font-bold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50"
                        >
                            {sending ? 'Enviando…' : 'Enviar este grupo a Telegram'}
                        </button>

                        <div className="border-t border-white/10 pt-3 space-y-2">
                            <p className="text-xs font-bold uppercase text-slate-500">Lote · categoría actual</p>
                            <button
                                type="button"
                                disabled={batchBusy || itemsForCategory.length === 0}
                                onClick={() => void runBatch(itemsForCategory, 'download')}
                                className="w-full py-2 rounded-lg bg-slate-700 text-white font-bold text-sm disabled:opacity-50"
                            >
                                Descargar todos los grupos ({itemsForCategory.length})
                            </button>
                            <button
                                type="button"
                                disabled={batchBusy || itemsForCategory.length === 0}
                                onClick={() => void runBatch(itemsForCategory, 'telegram')}
                                className="w-full py-2 rounded-lg bg-sky-700 text-white font-bold text-sm disabled:opacity-50"
                            >
                                Telegram: todos los grupos ({itemsForCategory.length})
                            </button>
                        </div>

                        <div className="border-t border-white/10 pt-3 space-y-2">
                            <p className="text-xs font-bold uppercase text-slate-500">Lote · todo el torneo</p>
                            <button
                                type="button"
                                disabled={batchBusy || itemsForAllTournament.length === 0}
                                onClick={() => void runBatch(itemsForAllTournament, 'download')}
                                className="w-full py-2 rounded-lg border border-white/20 text-white font-bold text-sm disabled:opacity-50"
                            >
                                Descargar todas las categorías ({itemsForAllTournament.length})
                            </button>
                            <button
                                type="button"
                                disabled={batchBusy || itemsForAllTournament.length === 0}
                                onClick={() => void runBatch(itemsForAllTournament, 'telegram')}
                                className="w-full py-2 rounded-lg border border-sky-500/50 text-sky-300 font-bold text-sm disabled:opacity-50"
                            >
                                Telegram: todo el torneo ({itemsForAllTournament.length})
                            </button>
                        </div>

                        <p className="text-xs text-slate-500">
                            Patrocinadores en imagen: Muskiz, Petronor, DELCOI, Itxas Mendi, XbotGo, Baratza (edición
                            2026).
                            <br />
                            {itemsForAllTournament.length} publicaciones (1 por grupo y categoría con equipos asignados).
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};
