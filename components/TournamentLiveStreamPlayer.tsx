import React, { useEffect, useMemo, useState } from 'react';
import {
    getTournamentLiveStreamForNow,
    youtubeThumbnailUrlFromStream,
    type TournamentLiveStreamNow,
} from '../constants/tournamentLiveStreams';

type Variant = 'hero' | 'panel' | 'banner';

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

    const thumbnailUrl = useMemo(
        () => (stream ? youtubeThumbnailUrlFromStream(stream.url) : null),
        [stream],
    );

    if (!stream) return null;

    const isLive = stream.status === 'live' && !stream.isChannelFallback;
    const isHero = variant === 'hero';
    const isCompact = variant === 'panel';

    const statusLine = isLive
        ? 'En directo ahora'
        : stream.fromTime
          ? `Directo a las ${stream.fromTime}`
          : 'Próxima retransmisión';

    const shellClass = isHero
        ? 'rounded-2xl border border-white/10 bg-surface-dark/40 backdrop-blur-xl shadow-2xl'
        : isCompact
          ? 'rounded-xl border border-white/10 bg-black/30'
          : 'rounded-xl border border-red-500/25 bg-red-500/5 dark:bg-red-500/10';

    const headerClass = isHero || isCompact ? 'bg-red-600/25' : 'bg-red-600/10';

    const bodyClass = isHero
        ? 'aspect-video min-h-[180px] sm:min-h-[200px]'
        : isCompact
          ? 'aspect-video max-h-44 sm:max-h-52'
          : 'aspect-video';

    const ctaLabel = isLive ? 'Ver directo en YouTube' : 'Abrir en YouTube';

    return (
        <div className={`overflow-hidden ${shellClass} ${className}`}>
            <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${headerClass}`}>
                <div className="flex items-center gap-2 min-w-0">
                    {isLive && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                            <span className="size-1.5 rounded-full bg-white animate-pulse" aria-hidden />
                            Live
                        </span>
                    )}
                    <span
                        className={`text-xs font-bold truncate ${
                            isHero || isCompact ? 'text-white' : 'text-slate-800 dark:text-slate-200'
                        }`}
                    >
                        {isHero ? 'Torneo en directo' : statusLine}
                    </span>
                </div>
                <span
                    className={`text-[10px] font-semibold truncate ${
                        isHero || isCompact ? 'text-slate-300' : 'text-slate-600 dark:text-slate-400'
                    }`}
                >
                    {isHero ? statusLine : stream.label}
                </span>
            </div>
            {isHero && (
                <p className="px-4 pb-2 text-[11px] text-slate-400 truncate">{stream.label}</p>
            )}

            <a
                href={stream.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`group relative block w-full overflow-hidden bg-black ${bodyClass}`}
                title={stream.label}
            >
                {thumbnailUrl ? (
                    <img
                        src={thumbnailUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover opacity-90 transition-transform duration-300 group-hover:scale-105"
                    />
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-red-900/80 to-slate-900" />
                )}
                <div className="absolute inset-0 bg-black/35 transition-colors group-hover:bg-black/25" />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
                    <span className="flex size-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-900/50 transition-transform group-hover:scale-110">
                        <span className="material-symbols-outlined text-3xl ml-0.5">play_arrow</span>
                    </span>
                    <span className="text-sm font-bold text-white drop-shadow">{ctaLabel}</span>
                </div>
            </a>
        </div>
    );
};
