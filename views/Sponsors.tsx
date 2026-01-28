import React from 'react';
import { SiteContent } from '../types';

interface SponsorsProps {
    content: SiteContent;
}

export const Sponsors: React.FC<SponsorsProps> = ({ content }) => {
  const platinumSponsors = content.sponsors.filter(s => s.tier === 'Platinum');
  const goldSponsors = content.sponsors.filter(s => s.tier === 'Gold');
  const silverSponsors = content.sponsors.filter(s => s.tier === 'Silver');
  const collaborators = content.sponsors.filter(s => s.tier === 'Collaborator');

  const renderLogo = (logoUrl: string, sizeClass: string) => {
      // Check if it's a material icon name (simple check: no slashes or dots usually)
      if (!logoUrl.includes('/') && !logoUrl.includes('.')) {
          return <span className={`material-symbols-outlined ${sizeClass} text-current mb-4`}>{logoUrl}</span>;
      }
      return <img src={logoUrl} alt="Logo" className="max-h-20 max-w-full object-contain mb-4 filter grayscale group-hover:grayscale-0 transition-all" />;
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark py-12 px-4 sm:px-6 lg:px-8 animate-in fade-in">
        <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
                <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-4">Nuestros Patrocinadores</h2>
                <p className="text-slate-500 max-w-2xl mx-auto">Gracias a estas organizaciones, el Torneo Muskizko Udala 2026 es una realidad. Su apoyo impulsa el deporte en nuestra comunidad.</p>
            </div>

            {/* Platinum Tier */}
            {platinumSponsors.length > 0 && (
                <div className="mb-20">
                    <div className="flex items-center gap-4 mb-8 justify-center">
                        <div className="h-[1px] bg-gradient-to-r from-transparent via-primary to-transparent w-full max-w-xs"></div>
                        <span className="text-primary font-black uppercase tracking-widest text-sm">Patrocinadores Platinum</span>
                        <div className="h-[1px] bg-gradient-to-r from-transparent via-primary to-transparent w-full max-w-xs"></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
                        {platinumSponsors.map(sponsor => (
                            <div key={sponsor.id} className="bg-white dark:bg-surface-dark p-12 rounded-2xl border border-primary/20 shadow-[0_0_30px_rgba(13,242,242,0.1)] flex flex-col items-center text-center hover:scale-105 transition-transform duration-300 group">
                                {renderLogo(sponsor.logoUrl, "text-8xl")}
                                <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">{sponsor.name}</h3>
                                <p className="text-slate-500 text-sm">Patrocinador Principal</p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Gold Tier */}
            {goldSponsors.length > 0 && (
                <div className="mb-16">
                    <div className="text-center mb-8">
                        <span className="text-secondary font-bold uppercase tracking-widest text-xs">Patrocinadores Oro</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                        {goldSponsors.map(sponsor => (
                            <div key={sponsor.id} className="bg-white dark:bg-surface-dark p-8 rounded-xl border border-slate-200 dark:border-white/5 flex flex-col items-center justify-center grayscale hover:grayscale-0 transition-all group">
                                {renderLogo(sponsor.logoUrl, "text-6xl")}
                                <h4 className="font-bold text-lg text-slate-800 dark:text-white">{sponsor.name}</h4>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Silver Tier */}
            {silverSponsors.length > 0 && (
                <div>
                    <div className="text-center mb-8">
                        <span className="text-slate-400 font-bold uppercase tracking-widest text-xs">Colaboradores Oficiales</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-4">
                        {silverSponsors.map(sponsor => (
                            <div key={sponsor.id} className="bg-slate-50 dark:bg-white/5 p-4 rounded-lg flex flex-col items-center justify-center opacity-70 hover:opacity-100 transition-opacity group">
                                {renderLogo(sponsor.logoUrl, "text-3xl")}
                                <span className="text-xs font-bold mt-2 text-center">{sponsor.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

             {/* Collaborator Tier (Small icons) */}
             {collaborators.length > 0 && (
                <div className="mt-12">
                     <div className="text-center mb-6">
                        <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px]">Agradecimientos</span>
                    </div>
                    <div className="flex flex-wrap justify-center gap-4">
                        {collaborators.map(sponsor => (
                             <div key={sponsor.id} className="bg-white/5 px-4 py-2 rounded text-xs font-bold text-slate-400 border border-white/5">
                                 {sponsor.name}
                             </div>
                        ))}
                    </div>
                </div>
             )}

            {/* Call to Action */}
            <div className="mt-24 bg-primary rounded-2xl p-8 md:p-12 text-center relative overflow-hidden">
                <div className="relative z-10 text-background-dark">
                    <h3 className="text-2xl md:text-3xl font-black uppercase mb-4">¿Quieres patrocinar el evento?</h3>
                    <p className="max-w-xl mx-auto mb-6 font-medium">Únete al Torneo Muskizko Udala 2026 y da visibilidad a tu marca ante miles de aficionados al deporte.</p>
                    <button className="bg-background-dark text-white px-8 py-3 rounded-lg font-bold hover:bg-slate-800 transition-colors">
                        Descargar Dossier
                    </button>
                </div>
                <div className="absolute top-0 left-0 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
            </div>
        </div>
    </div>
  );
};