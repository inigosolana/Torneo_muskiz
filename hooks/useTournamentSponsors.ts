import { useEffect, useState } from 'react';
import { getOfficialSponsorsSorted, isOfficialSponsorName, sortSponsorsByTier } from '../constants/officialSponsors';
import { supabase } from '../services/supabaseClient';
import { normalizeSponsor } from '../utils/sponsorDisplay';

export type TournamentSponsor = ReturnType<typeof normalizeSponsor>;

export function useTournamentSponsors() {
    const [sponsors, setSponsors] = useState<TournamentSponsor[]>(() =>
        getOfficialSponsorsSorted().map((s) => ({
            id: s.id,
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
            const official = sortSponsorsByTier(
                data.map(normalizeSponsor).filter((s) => isOfficialSponsorName(s.name)),
            );
            if (official.length > 0) setSponsors(official);
        })();
    }, []);

    return sponsors;
}
