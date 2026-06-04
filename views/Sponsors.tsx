import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { isOfficialSponsorName, sortSponsorsByTier } from '../constants/officialSponsors';
import { normalizeSponsor } from '../utils/sponsorDisplay';

export const Sponsors: React.FC = () => {
  const [sponsors, setSponsors] = useState<ReturnType<typeof normalizeSponsor>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSponsors = async () => {
      const { data } = await supabase.from('sponsors').select('*');
      if (data) {
        setSponsors(sortSponsorsByTier(data.map(normalizeSponsor).filter((s) => isOfficialSponsorName(s.name))));
      }
      setLoading(false);
    };
    fetchSponsors();
  }, []);

  const platinumSponsors = useMemo(() => sponsors.filter((s) => s.tier === 'Platinum'), [sponsors]);
  const goldSponsors = useMemo(() => sponsors.filter((s) => s.tier === 'Gold'), [sponsors]);
  const silverSponsors = useMemo(() => sponsors.filter((s) => s.tier === 'Silver'), [sponsors]);
  const collaborators = useMemo(() => sponsors.filter((s) => s.tier === 'Collaborator'), [sponsors]);

  const renderLogo = (logoUrl: string) => {
    if (!logoUrl) {
      return (
        <div className="h-24 w-full flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-6xl text-slate-300">image</span>
        </div>
      );
    }
    if (!logoUrl.includes('/') && !logoUrl.includes('.')) {
      return (
        <div className="h-24 w-full flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-6xl text-current">{logoUrl}</span>
        </div>
      );
    }
    return (
      <div className="h-24 w-full flex items-center justify-center mb-4">
        <img
          src={logoUrl}
          alt=""
          className="max-h-24 max-w-full object-contain"
        />
      </div>
    );
  };

  const SponsorCard: React.FC<{
    sponsor: ReturnType<typeof normalizeSponsor>;
    className: string;
    children: React.ReactNode;
  }> = ({ sponsor, className, children }) => {
    const inner = (
      <div className={`${className} group`}>
        {children}
      </div>
    );
    if (sponsor.websiteUrl) {
      return (
        <a
          href={sponsor.websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
          title={`Visitar ${sponsor.name}`}
        >
          {inner}
        </a>
      );
    }
    return inner;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark py-12 px-4 sm:px-6 lg:px-8 animate-in fade-in">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-4">
            Nuestros Patrocinadores
          </h2>
          <p className="text-slate-500 max-w-2xl mx-auto">
            Gracias a estas organizaciones, el Torneo Muskizko Udala 2026 es una realidad. Su apoyo impulsa el deporte en
            nuestra comunidad.
          </p>
        </div>

        {platinumSponsors.length > 0 && (
          <div className="mb-20">
            <div className="flex items-center gap-4 mb-8 justify-center">
              <div className="h-[1px] bg-gradient-to-r from-transparent via-primary to-transparent w-full max-w-xs" />
              <span className="text-primary font-black uppercase tracking-widest text-sm">Patrocinadores Platinum</span>
              <div className="h-[1px] bg-gradient-to-r from-transparent via-primary to-transparent w-full max-w-xs" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {platinumSponsors.map((sponsor) => (
                <SponsorCard
                  key={sponsor.id}
                  sponsor={sponsor}
                  className="bg-white dark:bg-surface-dark p-12 rounded-2xl border border-primary/20 shadow-[0_0_30px_rgba(13,242,242,0.1)] flex flex-col items-center text-center hover:scale-105 transition-transform duration-300"
                >
                  {renderLogo(sponsor.logoUrl)}
                  <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{sponsor.name}</h3>
                  <p className="text-slate-500 text-sm">Patrocinador Principal</p>
                </SponsorCard>
              ))}
            </div>
          </div>
        )}

        {goldSponsors.length > 0 && (
          <div className="mb-16">
            <div className="text-center mb-8">
              <span className="text-secondary font-bold uppercase tracking-widest text-xs">Patrocinadores Oro</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {goldSponsors.map((sponsor) => (
                <SponsorCard
                  key={sponsor.id}
                  sponsor={sponsor}
                  className="bg-white dark:bg-surface-dark p-8 rounded-xl border border-amber-200/60 dark:border-amber-500/20 flex flex-col items-center justify-center grayscale hover:grayscale-0 transition-all min-h-[180px]"
                >
                  {renderLogo(sponsor.logoUrl)}
                  <h4 className="font-bold text-lg text-slate-800 dark:text-white text-center">{sponsor.name}</h4>
                  {sponsor.websiteUrl && (
                    <span className="text-[10px] text-primary font-bold mt-2 uppercase tracking-wide">
                      {sponsor.websiteUrl.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                    </span>
                  )}
                </SponsorCard>
              ))}
            </div>
          </div>
        )}

        {silverSponsors.length > 0 && (
          <div>
            <div className="text-center mb-8">
              <span className="text-slate-400 font-bold uppercase tracking-widest text-xs">Colaboradores Oficiales</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4">
              {silverSponsors.map((sponsor) => (
                <SponsorCard
                  key={sponsor.id}
                  sponsor={sponsor}
                  className="bg-slate-50 dark:bg-white/5 p-4 rounded-lg flex flex-col items-center justify-center opacity-70 hover:opacity-100 transition-opacity min-h-[100px]"
                >
                  {renderLogo(sponsor.logoUrl)}
                  <span className="text-xs font-bold mt-2 text-center">{sponsor.name}</span>
                </SponsorCard>
              ))}
            </div>
          </div>
        )}

        {collaborators.length > 0 && (
          <div className="mt-12">
            <div className="text-center mb-6">
              <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Agradecimientos</span>
            </div>
            <div className="flex flex-wrap justify-center gap-4">
              {collaborators.map((sponsor) => (
                <SponsorCard key={sponsor.id} sponsor={sponsor} className="">
                  <div className="bg-white/5 px-4 py-2 rounded text-xs font-bold text-slate-400 border border-white/5 hover:border-primary/30 transition-colors">
                    {sponsor.name}
                  </div>
                </SponsorCard>
              ))}
            </div>
          </div>
        )}

        <div className="mt-24 bg-primary rounded-2xl p-8 md:p-12 text-center relative overflow-hidden">
          <div className="relative z-10">
            <h3 className="text-2xl md:text-3xl font-black text-background-dark mb-4 uppercase">¿Quieres patrocinar?</h3>
            <p className="text-background-dark/80 mb-6 max-w-lg mx-auto">
              Únete a nosotros y lleva tu marca al corazón del balonmano playa en Muskiz.
            </p>
            <a
              href="mailto:torneo@muskiz.com"
              className="inline-block bg-background-dark text-white font-bold px-8 py-3 rounded-xl hover:opacity-90 transition-opacity"
            >
              Contactar
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
