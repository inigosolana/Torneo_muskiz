import React, { useEffect, useState } from 'react';
import {
    getTournamentLiveStreamForNow,
    type TournamentLiveStreamNow,
} from '../constants/tournamentLiveStreams';

type Variant = 'hero' | 'panel' | 'banner';

interface TournamentLiveStreamLinkProps {
    variant?: Variant;
    className?: string;
}

function formatStreamTime(fromTime?: string): string {
    if (!fromTime) return '';
    return fromTime;
}

function buttonLabel(stream: TournamentLiveStreamNow, variant: Variant): string {
    if (stream.isChannelFallback) {
        return variant === 'hero' ? 'YouTube en directo' : 'Canal YouTube';
    }
    if (stream.status === 'live') {
        return variant === 'hero' ? 'Ver directo en YouTube' : 'Ver directo';
    }
    const at = formatStreamTime(stream.fromTime);
    if (variant === 'hero') return at ? `Directo a las ${at}` : 'Próximo directo';
    return at ? `Directo ${at}` : 'Próximo directo';
}

export const TournamentLiveStreamLink: React.FC<TournamentLiveStreamLinkProps> = ({
    variant = 'hero',
    className = '',
}) => {
    const [stream, setStream] = useState<TournamentLiveStreamNow | null>(() => getTournamentLiveStreamForNow());

    useEffect(() => {
        const refresh = () => setStream(getTournamentLiveStreamForNow());
        refresh();
        const id = window.setInterval(refresh, 30_000);
        return () => window.clearInterval(id);
    }, []);

    if (!stream) return null;

    const isLive = stream.status === 'live' && !stream.isChannelFallback;

    const base =
        variant === 'hero'
            ? 'inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white px-8 py-3 rounded-lg font-bold text-base transition-colors min-w-[160px] shadow-lg shadow-red-900/30'
            : variant === 'panel'
              ? 'inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-500 px-4 py-2 text-sm font-bold text-white transition-colors shadow-md shadow-red-900/20'
              : 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4';

    if (variant === 'banner') {
        const statusText = isLive
            ? `Ahora en directo: ${stream.label}.`
            : stream.fromTime
              ? `Próximo directo a las ${stream.fromTime}: ${stream.label}.`
              : `Sigue el torneo en YouTube: ${stream.label}.`;

        return (
            <div className={`${base} ${className}`}>
                <div className="flex items-start gap-3 min-w-0">
                    <span className="material-symbols-outlined text-red-500 shrink-0">live_tv</span>
                    <div>
                        <p className="text-xs font-black uppercase tracking-widest text-red-500 mb-1">
                            {isLive ? 'En directo ahora' : 'Torneo en directo'}
                        </p>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{statusText}</p>
                    </div>
                </div>
                <a
                    href={stream.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 hover:bg-red-500 px-5 py-2.5 text-sm font-bold text-white transition-colors shrink-0"
                >
                    {isLive && <span className="size-2 rounded-full bg-white animate-pulse" aria-hidden />}
                    {isLive ? 'Abrir directo' : stream.fromTime ? `Directo ${stream.fromTime}` : 'Abrir YouTube'}
                    <span className="material-symbols-outlined text-base">open_in_new</span>
                </a>
            </div>
        );
    }

    return (
        <a
            href={stream.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`${base} ${className}`}
            title={stream.label}
        >
            {isLive && <span className="size-2 rounded-full bg-white animate-pulse" aria-hidden />}
            {buttonLabel(stream, variant)}
            <span className="material-symbols-outlined text-base">live_tv</span>
        </a>
    );
};
