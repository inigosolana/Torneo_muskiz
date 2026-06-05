import React, { useEffect, useMemo, useState } from 'react';
import {
    getTournamentLiveStreamForNow,
    youtubeEmbedUrlFromStream,
    type TournamentLiveStreamNow,
} from '../constants/tournamentLiveStreams';

type Variant = 'panel' | 'banner';

interface TournamentLiveStreamPlayerProps {
    variant?: Variant;
    className?: string;
}

export const TournamentLiveStreamPlayer: React.FC<TournamentLiveStreamPlayerProps> = ({
    variant = 'panel',
    className = '',
}) => {
    const [stream, setStream] = useState<TournamentLiveStreamNow | null>(() => getTournamentLiveStreamForNow());

    useEffect(() => {
        const refresh = () => setStream(getTournamentLiveStreamForNow());
        refresh();
        const id = window.setInterval(refresh, 30_000);
        return () => window.clearInterval(id);
    }, []);

    const embedUrl = useMemo(() => (stream ? youtubeEmbedUrlFromStream(stream.url) : null), [stream]);

    if (!stream) return null;

    const isLive = stream.status === 'live' && !stream.isChannelFallback;
    const isCompact = variant === 'panel';

    const statusLine = isLive
        ? 'En directo ahora'
        : stream.fromTime
          ? `Directo a las ${stream.fromTime}`
          : 'Próxima retransmisión';

    return (
        <div
            className={`overflow-hidden rounded-xl border ${
                isCompact
                    ? 'border-white/10 bg-black/30'
                    : 'border-red-500/25 bg-red-500/5 dark:bg-red-500/10'
            } ${className}`}
        >
            <div
                className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${
                    isCompact ? 'bg-red-600/20' : 'bg-red-600/10'
                }`}
            >
                <div className="flex items-center gap-2 min-w-0">
                    {isLive && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                            <span className="size-1.5 rounded-full bg-white animate-pulse" aria-hidden />
                            Live
                        </span>
                    )}
                    <span
                        className={`text-xs font-bold truncate ${
                            isCompact ? 'text-white' : 'text-slate-800 dark:text-slate-200'
                        }`}
                    >
                        {statusLine}
                    </span>
                </div>
                <span
                    className={`text-[10px] font-semibold truncate ${
                        isCompact ? 'text-slate-300' : 'text-slate-600 dark:text-slate-400'
                    }`}
                >
                    {stream.label}
                </span>
            </div>

            {embedUrl ? (
                <div className={`relative w-full ${isCompact ? 'aspect-video max-h-44 sm:max-h-52' : 'aspect-video'}`}>
                    <iframe
                        key={embedUrl}
                        src={embedUrl}
                        title={stream.label}
                        className="absolute inset-0 h-full w-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                        loading="lazy"
                        referrerPolicy="strict-origin-when-cross-origin"
                    />
                </div>
            ) : (
                <div className={`px-4 py-6 text-center ${isCompact ? 'text-slate-300' : 'text-slate-600 dark:text-slate-400'}`}>
                    <p className="text-sm font-semibold mb-3">Retransmisión en el canal de YouTube</p>
                    <a
                        href={stream.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg bg-red-600 hover:bg-red-500 px-4 py-2 text-sm font-bold text-white transition-colors"
                    >
                        <span className="material-symbols-outlined text-base">live_tv</span>
                        Abrir YouTube
                    </a>
                </div>
            )}
        </div>
    );
};
