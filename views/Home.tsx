import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { siteContent } from '../constants/siteContent';
import { isTeamRegistrationClosed } from '../constants/registrationDeadlines';
import { useTournamentData } from '../context/TournamentDataContext';
import { supabase } from '../services/supabaseClient';
import { getOfficialSponsorsSorted, isOfficialSponsorName, sortSponsorsByTier } from '../constants/officialSponsors';
import { normalizeSponsor } from '../utils/sponsorDisplay';
import { HomeTournamentLivePanel } from '../components/HomeTournamentLivePanel';
import { RotatingSponsorSpotlight } from '../components/RotatingSponsorSpotlight';
import { RotatingTeamSpotlight } from '../components/RotatingTeamSpotlight';

export const Home: React.FC = () => {
  const { teams, publicDisplayMatches, publicMatchesVisible } = useTournamentData();
  const navigate = useNavigate();
  const [isUploading, setIsUploading] = useState(false);

  const handleUploadClick = () => {
    setIsUploading(true);
    setTimeout(() => {
      setIsUploading(false);
      alert("¡Gracias! Tu foto se ha subido a la moderación y aparecerá pronto.");
    }, 1500);
  };

  const [homeSponsors, setHomeSponsors] = useState(() =>
    getOfficialSponsorsSorted().filter((s) => s.tier === 'Platinum' || s.tier === 'Gold'),
  );

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('sponsors').select('*');
      if (!data?.length) return;
      const sorted = sortSponsorsByTier(
        data
          .map(normalizeSponsor)
          .filter((s) => isOfficialSponsorName(s.name) && (s.tier === 'Platinum' || s.tier === 'Gold')),
      );
      if (sorted.length > 0) setHomeSponsors(sorted);
    })();
  }, []);

  const topSponsors = useMemo(() => homeSponsors, [homeSponsors]);
  const registrationClosed = isTeamRegistrationClosed();

  return (
    <div className="animate-in fade-in duration-500">
      {/* Hero Section */}
      <section className="relative min-h-[85vh] flex flex-col justify-end pb-12 overflow-hidden bg-background-dark">
        {/* Background Video */}
        <div className="absolute inset-0 z-0">
          <video
            autoPlay
            muted
            loop
            playsInline
            poster="/campos.jpg"
            className="absolute inset-0 w-full h-full object-cover opacity-60"
          >
            <source src="/promo.mp4" type="video/mp4" />
          </video>
          {/* Gradients */}
          <div className="absolute inset-0 bg-gradient-to-t from-background-dark via-background-dark/60 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-background-dark/90 via-background-dark/40 to-transparent"></div>
        </div>

        <div className="relative z-10 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-20">
          <div className="grid lg:grid-cols-12 gap-8 items-end">
            {/* Hero Text */}
            <div className="lg:col-span-12 xl:col-span-7 flex flex-col gap-6 mb-8 lg:mb-0">
              <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black text-white leading-[0.9] tracking-tighter uppercase drop-shadow-lg">
                {siteContent.heroTitle}
              </h1>
              <div className="flex flex-col lg:flex-row gap-8 items-center lg:items-center">
                <div className="flex-1">
                  <p className="text-lg sm:text-xl text-slate-300 max-w-xl font-light border-l-4 border-primary pl-4">
                    {siteContent.heroSubtitle}
                  </p>
                </div>
                <div className="w-48 h-48 flex items-center justify-center bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 p-4 shrink-0">
                  <img 
                    src="/logo_kolosaurios.png" 
                    alt="Logo Kolosaurios" 
                    className="max-w-full max-h-full object-contain animate-float"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-4 mt-4">
                <button
                  onClick={() => navigate('/schedule')}
                  className="flex items-center justify-center gap-2 bg-white text-slate-900 hover:bg-slate-100 px-8 py-3 rounded-lg font-bold text-base transition-colors min-w-[160px]"
                >
                  Ver Calendario
                </button>
                {!registrationClosed && (
                  <button
                    onClick={() => navigate('/registration')}
                    className="flex items-center justify-center gap-2 bg-primary text-background-dark hover:bg-primary/90 px-8 py-3 rounded-lg font-bold text-base transition-colors min-w-[160px]"
                  >
                    Inscribir Equipo
                  </button>
                )}
              </div>
            </div>

            {/* Patrocinadores + equipos participantes */}
            <div className="xl:col-span-5 w-full">
              <div className="bg-surface-dark/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col h-full min-h-[320px] overflow-hidden">
                <div className="border-b border-white/10 bg-white/5 px-6 py-5 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary mb-3">
                    Patrocinadores oficiales
                  </p>
                  <RotatingSponsorSpotlight variant="hero" />
                </div>

                <div className="flex-1 flex flex-col items-center justify-center px-6 py-6 text-center">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-4">
                    Equipos participantes
                  </p>
                  <RotatingTeamSpotlight teams={teams} className="flex-1" />
                </div>

                <div className="border-t border-white/10 px-6 py-4 flex flex-col sm:flex-row gap-3 justify-center">
                  {!registrationClosed && (
                    <button
                      onClick={() => navigate('/registration')}
                      className="bg-primary hover:bg-primary/90 text-background-dark px-6 py-3 rounded-xl font-bold text-sm transition-all w-full sm:w-auto"
                    >
                      Inscribir equipo
                    </button>
                  )}
                  <button
                    onClick={() => navigate('/team-manager')}
                    className="bg-white/10 hover:bg-white/20 text-white px-6 py-3 rounded-xl font-bold text-sm transition-all w-full sm:w-auto"
                  >
                    Acceder a mi equipo
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <HomeTournamentLivePanel
        matches={publicDisplayMatches}
        teams={teams}
        publicMatchesVisible={publicMatchesVisible}
      />

      {/* Campos Section */}
      <section className="py-12 bg-white dark:bg-surface-dark border-b border-slate-200 dark:border-white/5">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl overflow-hidden shadow-xl border border-slate-200 dark:border-white/10">
            <img 
              src="/campos.jpg" 
              alt="Campos del Torneo" 
              className="w-full h-auto object-cover max-h-[600px]"
            />
          </div>
        </div>
      </section>

      {/* Promotion Section */}
      <section className="py-16 bg-background-light dark:bg-background-dark">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-10">Promoción del Torneo</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Highlight Video */}
            <div
              className="md:col-span-2 relative h-[400px] rounded-2xl overflow-hidden shadow-2xl border border-white/10"
            >
              <video 
                src="/promo.mp4" 
                className="absolute inset-0 w-full h-full object-cover" 
                controls
                preload="metadata"
              />
              {/* Removed overlay to allow video controls to be clickable easily, but we can add a subtle gradient at the top if needed */}
            </div>

            {/* Stats */}
            <div className="bg-primary/10 dark:bg-primary/5 rounded-2xl p-8 border border-primary/20 flex flex-col items-center justify-center text-center gap-4">
              <div className="size-20 rounded-full bg-surface-light dark:bg-surface-dark flex items-center justify-center text-primary shadow-lg mb-2">
                <span className="material-symbols-outlined text-4xl">trophy</span>
              </div>
              <h4 className="text-5xl font-black text-slate-900 dark:text-white">{teams.filter(t => t.paymentStatus === 'PAID').length}</h4>
              <p className="text-slate-500 dark:text-slate-400 text-sm font-medium uppercase tracking-wider">Equipos Inscritos</p>
            </div>
          </div>
        </div>
      </section>

      {/* Sponsors Strip */}
      <section className="py-12 bg-white dark:bg-surface-dark border-t border-slate-200 dark:border-white/5">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <h3 className="text-center text-slate-400 uppercase tracking-widest text-xs font-bold mb-8">Patrocinadores Oficiales</h3>
          <div className="flex flex-wrap justify-center items-center gap-12 opacity-70 grayscale hover:grayscale-0 transition-all duration-500">
            {topSponsors.map((sponsor) => {
              const content = (
                <div className="flex items-center gap-3 text-xl font-black text-slate-800 dark:text-white">
                  {!sponsor.logoUrl.includes('/') && !sponsor.logoUrl.includes('.') ? (
                    <span className="material-symbols-outlined text-4xl text-slate-600">{sponsor.logoUrl}</span>
                  ) : (
                    <img src={sponsor.logoUrl} alt={sponsor.name} className="h-12 w-auto max-w-[160px] object-contain" />
                  )}
                  <span className="hidden sm:inline">{sponsor.name}</span>
                </div>
              );
              return sponsor.websiteUrl ? (
                <a
                  key={sponsor.id}
                  href={sponsor.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:opacity-100 transition-opacity"
                  title={sponsor.name}
                >
                  {content}
                </a>
              ) : (
                <div key={sponsor.id}>{content}</div>
              );
            })}
          </div>
          <div className="text-center mt-8">
            <button onClick={() => navigate('/sponsors')} className="text-primary text-sm font-bold hover:underline">Ver todos los patrocinadores</button>
          </div>
        </div>
      </section>
    </div>
  );
};