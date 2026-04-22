import React, { useState } from 'react';
import { View, SiteContent, Team } from '../types';

interface HomeProps {
  onNavigate: (view: View) => void;
  content: SiteContent;
  teams: Team[];
}

export const Home: React.FC<HomeProps> = ({ onNavigate, content, teams }) => {
  const [isUploading, setIsUploading] = useState(false);

  const handleUploadClick = () => {
    setIsUploading(true);
    setTimeout(() => {
      setIsUploading(false);
      alert("¡Gracias! Tu foto se ha subido a la moderación y aparecerá pronto.");
    }, 1500);
  };

  const topSponsors = content.sponsors.filter(s => s.tier === 'Platinum' || s.tier === 'Gold').slice(0, 5);

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
                {content.heroTitle}
              </h1>
              <div className="flex flex-col lg:flex-row gap-8 items-start lg:items-center">
                <p className="text-lg sm:text-xl text-slate-300 max-w-xl font-light border-l-4 border-primary pl-4">
                  {content.heroSubtitle}
                </p>
              </div>

              <div className="flex flex-wrap gap-4 mt-4">
                <button
                  onClick={() => onNavigate(View.SCHEDULE)}
                  className="flex items-center justify-center gap-2 bg-white text-slate-900 hover:bg-slate-100 px-8 py-3 rounded-lg font-bold text-base transition-colors min-w-[160px]"
                >
                  Ver Calendario
                </button>
                <button
                  onClick={() => onNavigate(View.REGISTRATION)}
                  className="flex items-center justify-center gap-2 bg-primary text-background-dark hover:bg-primary/90 px-8 py-3 rounded-lg font-bold text-base transition-colors min-w-[160px]"
                >
                  Inscribir Equipo
                </button>
              </div>
            </div>

            {/* Inscription Widget */}
            <div className="xl:col-span-5 w-full">
              <div className="bg-surface-dark/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col items-center justify-center text-center h-full min-h-[300px]">
                <div className="size-20 rounded-full bg-primary/20 flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined text-primary text-5xl">how_to_reg</span>
                </div>
                <h3 className="text-3xl font-black text-white uppercase tracking-tight mb-2">
                  Inscripciones Abiertas
                </h3>
                <p className="text-slate-400 mb-8 max-w-sm">
                  Asegura la plaza de tu equipo para la segunda edición del torneo antes de que se agoten.
                </p>
                <button
                  onClick={() => onNavigate(View.REGISTRATION)}
                  className="bg-primary hover:bg-primary-dark text-background-dark px-10 py-4 rounded-xl font-bold text-lg transition-all transform hover:scale-105 shadow-[0_0_20px_rgba(13,242,242,0.3)] w-full sm:w-auto"
                >
                  ¡Inscribirse Ahora!
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

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
            {topSponsors.map(sponsor => (
              <div key={sponsor.id} className="flex items-center gap-2 text-xl font-black text-slate-800 dark:text-white">
                {!sponsor.logoUrl.includes('/') && !sponsor.logoUrl.includes('.') ? (
                  <span className="material-symbols-outlined text-4xl text-slate-600">{sponsor.logoUrl}</span>
                ) : (
                  <img src={sponsor.logoUrl} alt={sponsor.name} className="h-10 object-contain" />
                )}
                {sponsor.name}
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <button onClick={() => onNavigate(View.SPONSORS)} className="text-primary text-sm font-bold hover:underline">Ver todos los patrocinadores</button>
          </div>
        </div>
      </section>
    </div>
  );
};