import type { MuskizScheduleDayLabel } from '../services/muskizScheduleSimulator';
import { getCurrentTournamentDay, isTournamentWeekendDay, TOURNAMENT_WEEKEND_DATES } from './tournamentDates';
import { siteContent } from './siteContent';

export type TournamentLiveStream = {
    day: MuskizScheduleDayLabel;
    label: string;
    url: string;
    /** Hora local de inicio (HH:mm). */
    fromTime?: string;
    /** Hora local de fin inclusive (HH:mm). */
    toTime?: string;
};

export type TournamentLiveStreamNow = {
    url: string;
    label: string;
    isChannelFallback: boolean;
    status: 'live' | 'upcoming';
    fromTime?: string;
    toTime?: string;
};

/** Enlaces de YouTube Live por jornada y franja horaria. */
export const TOURNAMENT_LIVE_STREAMS: TournamentLiveStream[] = [
    {
        day: 'Viernes',
        label: 'Viernes tarde — Cadete',
        url: 'https://www.youtube.com/live/eh2MfsR5VzE',
        fromTime: '17:00',
        toTime: '21:00',
    },
    {
        day: 'Sábado',
        label: 'Sábado mañana — Juvenil y Senior',
        url: 'https://www.youtube.com/live/NZt3oiRX98Q',
        fromTime: '09:00',
        toTime: '14:30',
    },
    {
        day: 'Sábado',
        label: 'Sábado tarde — Juvenil y Senior',
        url: 'https://www.youtube.com/live/S-lVFolAj4o',
        fromTime: '15:30',
        toTime: '21:00',
    },
];

const DAY_ORDER: Record<MuskizScheduleDayLabel, number> = { Viernes: 0, Sábado: 1, Domingo: 2 };

function parseClockToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

function streamWindow(stream: TournamentLiveStream): { start: Date; end: Date } {
    const [y, mo, d] = TOURNAMENT_WEEKEND_DATES[stream.day].split('-').map(Number);
    const fromMin = stream.fromTime ? parseClockToMinutes(stream.fromTime) : 0;
    const toMin = stream.toTime ? parseClockToMinutes(stream.toTime) : 23 * 60 + 59;
    const start = new Date(y, mo - 1, d, Math.floor(fromMin / 60), fromMin % 60, 0, 0);
    const end = new Date(y, mo - 1, d, Math.floor(toMin / 60), toMin % 60, 59, 999);
    return { start, end };
}

function sortedStreams(): TournamentLiveStream[] {
    return [...TOURNAMENT_LIVE_STREAMS].sort((a, b) => {
        const da = DAY_ORDER[a.day] - DAY_ORDER[b.day];
        if (da !== 0) return da;
        const fa = a.fromTime ? parseClockToMinutes(a.fromTime) : 0;
        const fb = b.fromTime ? parseClockToMinutes(b.fromTime) : 0;
        return fa - fb;
    });
}

export function getTournamentLiveStreamsForDay(day: MuskizScheduleDayLabel): TournamentLiveStream[] {
    return TOURNAMENT_LIVE_STREAMS.filter((s) => s.day === day).sort((a, b) => {
        const fa = a.fromTime ? parseClockToMinutes(a.fromTime) : 0;
        const fb = b.fromTime ? parseClockToMinutes(b.fromTime) : 0;
        return fa - fb;
    });
}

/** @deprecated Usa getTournamentLiveStreamsForDay — primer directo del día. */
export function getTournamentLiveStreamForDay(day: MuskizScheduleDayLabel): TournamentLiveStream | undefined {
    return getTournamentLiveStreamsForDay(day)[0];
}

function toSlot(stream: TournamentLiveStream, status: 'live' | 'upcoming'): TournamentLiveStreamNow {
    return {
        url: stream.url,
        label: stream.label,
        isChannelFallback: false,
        status,
        fromTime: stream.fromTime,
        toTime: stream.toTime,
    };
}

/** ID de vídeo YouTube para iframe embed (live, watch o youtu.be). */
export function youtubeVideoIdFromUrl(url: string): string | null {
    try {
        const u = new URL(url);
        const liveMatch = u.pathname.match(/\/live\/([^/?]+)/);
        if (liveMatch?.[1]) return liveMatch[1];
        const watchId = u.searchParams.get('v');
        if (watchId) return watchId;
        if (u.hostname.includes('youtu.be')) {
            const id = u.pathname.replace(/^\//, '').split('/')[0];
            return id || null;
        }
    } catch {
        return null;
    }
    return null;
}

export function youtubeEmbedUrlFromStream(url: string): string | null {
    const id = youtubeVideoIdFromUrl(url);
    if (!id) return null;
    return `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1`;
}

export function youtubeThumbnailUrlFromStream(url: string): string | null {
    const id = youtubeVideoIdFromUrl(url);
    if (!id) return null;
    return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

/** Directo en curso o siguiente del fin de semana; rota solo según la hora. */
export function getTournamentLiveStreamForNow(now = new Date()): TournamentLiveStreamNow | null {
    if (!isTournamentWeekendDay(now)) return null;

    const streams = sortedStreams();

    for (const stream of streams) {
        const { start, end } = streamWindow(stream);
        if (now >= start && now <= end) {
            return toSlot(stream, 'live');
        }
    }

    for (const stream of streams) {
        const { start } = streamWindow(stream);
        if (now < start) {
            return toSlot(stream, 'upcoming');
        }
    }

    const day = getCurrentTournamentDay(now);
    return {
        url: siteContent.socials.youtube.url,
        label: day ? `${day} — YouTube Kolosaurios` : 'YouTube Kolosaurios',
        isChannelFallback: true,
        status: 'upcoming',
    };
}
