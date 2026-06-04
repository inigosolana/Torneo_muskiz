import { useEffect, useState } from 'react';
import { siteContent } from '../constants/siteContent';
import { supabase } from '../services/supabaseClient';
import { normalizeSponsor } from '../utils/sponsorDisplay';

const TIER_ORDER: Record<string, number> = {
    Platinum: 0,
    Gold: 1,
    Silver: 2,
    Collaborator: 3,
};

export type TournamentSponsor = ReturnType<typeof normalizeSponsor>;

export function useTournamentSponsors() {
    const [sponsors, setSponsors] = useState<TournamentSponsor[]>(() =>
        siteContent.sponsors.map((s, i) => ({
            id: s.id ?? `static-${i}`,
            name: s.name,
            tier: s.tier,
            logoUrl: s.logoUrl,
            websiteUrl: s.websiteUrl,
        })),
    );

    useEffect(() => {
        void (async () => {
            const { data } = await supabase.from('sponsors').select('*').order('created_at', { ascending: true });
            if (!data?.length) return;
            const sorted = data
                .map(normalizeSponsor)
                .sort((a, b) => (TIER_ORDER[a.tier] ?? 9) - (TIER_ORDER[b.tier] ?? 9));
            setSponsors(sorted);
        })();
    }, []);

    return sponsors;
}
