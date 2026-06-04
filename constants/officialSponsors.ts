import type { Sponsor } from '../types';
import { SPONSOR_LOGO_BY_NAME } from './sponsorLogos';

/** Patrocinadores oficiales II Torneo Muskiz (edición actual). */
export const OFFICIAL_SPONSOR_NAMES = [
    'Ayuntamiento de Muskiz',
    'Petronor',
    'DELCOI S.A.',
    'Itxas Mendi (Montemar) Bar',
    'XbotGo',
    'Baratza',
] as const;

const TIER_ORDER: Record<Sponsor['tier'], number> = {
    Platinum: 0,
    Gold: 1,
    Silver: 2,
    Collaborator: 3,
};

/** Lista canónica para web, canvas Instagram y fallbacks. */
export const OFFICIAL_SPONSORS_2026: Sponsor[] = [
    {
        id: 's-muskiz',
        name: 'Ayuntamiento de Muskiz',
        logoUrl: SPONSOR_LOGO_BY_NAME['Ayuntamiento de Muskiz'],
        tier: 'Platinum',
        websiteUrl: 'https://www.muskiz.eus/',
    },
    {
        id: 's-petronor',
        name: 'Petronor',
        logoUrl: SPONSOR_LOGO_BY_NAME.Petronor,
        tier: 'Platinum',
        websiteUrl: 'https://www.petronor.eus/',
    },
    {
        id: 's-delcoi',
        name: 'DELCOI S.A.',
        logoUrl: SPONSOR_LOGO_BY_NAME['DELCOI S.A.'],
        tier: 'Gold',
        websiteUrl: 'https://www.delcoi.biz/',
    },
    {
        id: 's-itxas',
        name: 'Itxas Mendi (Montemar) Bar',
        logoUrl: SPONSOR_LOGO_BY_NAME['Itxas Mendi (Montemar) Bar'],
        tier: 'Gold',
        websiteUrl: 'https://www.disfrutabizkaia.com/establecimiento/itxas-mendi-montemar-bar/',
    },
    {
        id: 's-xbotgo',
        name: 'XbotGo',
        logoUrl: SPONSOR_LOGO_BY_NAME.XbotGo,
        tier: 'Gold',
        websiteUrl: 'https://www.xbotgo.com/',
    },
    {
        id: 's-baratza',
        name: 'Baratza',
        logoUrl: SPONSOR_LOGO_BY_NAME.Baratza,
        tier: 'Gold',
    },
];

export function isOfficialSponsorName(name: string): boolean {
    return (OFFICIAL_SPONSOR_NAMES as readonly string[]).includes(name.trim());
}

export function sortSponsorsByTier<T extends { tier: string }>(rows: T[]): T[] {
    return [...rows].sort(
        (a, b) => (TIER_ORDER[a.tier as Sponsor['tier']] ?? 9) - (TIER_ORDER[b.tier as Sponsor['tier']] ?? 9),
    );
}

export function getOfficialSponsorsSorted(): Sponsor[] {
    return sortSponsorsByTier(OFFICIAL_SPONSORS_2026);
}

/** Logos para franja inferior del canvas (publicaciones). */
export function getOfficialSponsorLogos(): { name: string; logoUrl: string }[] {
    return getOfficialSponsorsSorted()
        .filter((s) => Boolean(s.logoUrl))
        .map((s) => ({ name: s.name, logoUrl: s.logoUrl }));
}
