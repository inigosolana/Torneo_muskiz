/** Normaliza filas de Supabase (snake_case) para la UI de patrocinadores. */
export interface SponsorRow {
    id: string;
    name: string;
    tier: string;
    logo_url?: string | null;
    logoUrl?: string | null;
    website_url?: string | null;
    websiteUrl?: string | null;
}

export function normalizeSponsor(s: SponsorRow) {
    const logo = s.logo_url ?? s.logoUrl ?? '';
    const website = (s.website_url ?? s.websiteUrl ?? '').trim();
    return {
        id: s.id,
        name: s.name,
        tier: s.tier,
        logoUrl: logo,
        websiteUrl: website || undefined,
    };
}
