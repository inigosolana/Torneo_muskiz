import React, { useState } from 'react';
import { View, SiteContent } from '../types';

interface HomeProps {
  onNavigate: (view: View) => void;
  content: SiteContent;
}

export const Home: React.FC<HomeProps> = ({ onNavigate, content }) => {
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
        {/* Background Image */}
        <div className="absolute inset-0 z-0">
          <div 
            className="absolute inset-0 bg-cover bg-center opacity-60" 
            style={{ backgroundImage: 'url("https://picsum.photos/1600/900?grayscale&blur=2")' }}
          ></div>
          {/* Gradients */}
          <div className="absolute inset-0 bg-gradient-to-t from-background-dark via-background-dark/60 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-r from-background-dark/90 via-background-dark/40 to-transparent"></div>
        </div>

        <div className="relative z-10 w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 pt-20">
          <div className="grid lg:grid-cols-12 gap-8 items-end">
            {/* Hero Text */}
            <div className="lg:col-span-7 flex flex-col gap-6 mb-8 lg:mb-0">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 backdrop-blur-sm border border-primary/30 w-fit">
                <span className="animate-pulse size-2 rounded-full bg-primary"></span>
                <span className="text-primary text-xs font-bold uppercase tracking-wider">Torneo en Vivo</span>
              </div>
              <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black text-white leading-[0.9] tracking-tighter uppercase drop-shadow-lg">
                {content.heroTitle}
              </h1>
              <p className="text-lg sm:text-xl text-slate-300 max-w-xl font-light border-l-4 border-primary pl-4">
                {content.heroSubtitle}
              </p>
              <div className="flex flex-wrap gap-4 mt-4">
                <button 
                  onClick={() => onNavigate(View.SCHEDULE)}
                  className="flex items-center justify-center gap-2 bg-white text-slate-900 hover:bg-slate-100 px-8 py-3 rounded-lg font-bold text-base transition-colors min-w-[160px]"
                >
                  Ver Calendario
                </button>
                <button className="flex items-center justify-center gap-2 bg-transparent border-2 border-white/20 hover:border-primary text-white hover:text-primary px-8 py-3 rounded-lg font-bold text-base transition-all backdrop-blur-sm min-w-[160px]">
                  <span className="material-symbols-outlined">play_circle</span>
                  Ver en Vivo
                </button>
              </div>
            </div>

            {/* Live Dashboard Widget */}
            <div className="lg:col-span-5 w-full">
              <div className="bg-surface-dark/40 backdrop-blur-xl border border-white/10 rounded-2xl p-1 shadow-2xl">
                <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <h3 className="text-white font-bold uppercase tracking-wider text-sm flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-lg">analytics</span>
                    Estado del Torneo
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">ACTUALIZADO: AHORA</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 p-1">
                  {/* Live Match */}
                  <div className="col-span-1 sm:col-span-2 bg-surface-dark/60 rounded-xl p-4 border border-white/5 hover:border-primary/50 transition-colors group cursor-pointer" onClick={() => onNavigate(View.ADMIN)}>
                    <div className="flex justify-between items-start mb-2">
                      <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded animate-pulse">EN VIVO</span>
                      <span className="text-xs text-slate-400">Cuartos de Final (M)</span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex flex-col items-center">
                        <div className="size-10 rounded-full bg-slate-700 flex items-center justify-center text-white font-bold border border-slate-500 mb-1">MU</div>
                        <span className="text-xs font-bold text-slate-300">MUSKIZ</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-3xl font-black text-primary tracking-widest">18:14</span>
                        <span className="text-[10px] text-slate-400 uppercase tracking-widest">2do Periodo</span>
                      </div>
                      <div className="flex flex-col items-center">
                        <div className="size-10 rounded-full bg-white flex items-center justify-center text-slate-900 font-bold border border-slate-300 mb-1">BI</div>
                        <span className="text-xs font-bold text-slate-300">BILBAO</span>
                      </div>
                    </div>
                  </div>
                  {/* Weather */}
                  <div className="bg-surface-dark/60 rounded-xl p-4 border border-white/5 flex flex-col justify-between">
                    <div className="flex items-center gap-2 mb-2 text-primary">
                      <span className="material-symbols-outlined text-lg">wb_sunny</span>
                      <span className="text-xs font-bold uppercase">Playa</span>
                    </div>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-3xl font-bold text-white">24°C</p>
                        <p className="text-slate-400 text-xs">Despejado</p>
                      </div>
                    </div>
                  </div>
                   {/* Next */}
                   <div className="bg-surface-dark/60 rounded-xl p-4 border border-white/5 flex flex-col justify-between">
                    <div className="flex items-center gap-2 mb-2 text-secondary">
                      <span className="material-symbols-outlined text-lg">schedule</span>
                      <span className="text-xs font-bold uppercase">Siguiente</span>
                    </div>
                    <div>
                         <p className="text-white font-bold text-sm truncate">Semi-Finales: Femenino</p>
                         <div className="mt-2 text-xl font-mono text-white font-bold">16:30</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Past Memories Upload Section */}
      <section className="py-12 bg-white dark:bg-surface-dark border-b border-slate-200 dark:border-white/5">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row items-center gap-8 bg-slate-50 dark:bg-white/5 p-8 rounded-2xl border border-dashed border-slate-300 dark:border-white/10">
                <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="material-symbols-outlined text-3xl text-secondary">history_edu</span>
                        <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Muro de la Fama</h3>
                    </div>
                    <p className="text-slate-500 mb-4">
                        ¿Estuviste en la edición del año pasado? Sube tus mejores fotos y videos para aparecer en la pantalla gigante durante el torneo.
                    </p>
                    <div className="flex gap-2">
                        <div className="size-12 rounded-lg overflow-hidden"><img src="https://picsum.photos/100/100?random=10" alt="memory" className="w-full h-full object-cover" /></div>
                        <div className="size-12 rounded-lg overflow-hidden"><img src="https://picsum.photos/100/100?random=11" alt="memory" className="w-full h-full object-cover" /></div>
                        <div className="size-12 rounded-lg overflow-hidden"><img src="https://picsum.photos/100/100?random=12" alt="memory" className="w-full h-full object-cover" /></div>
                        <div className="size-12 rounded-lg bg-slate-200 dark:bg-white/10 flex items-center justify-center text-xs font-bold text-slate-500">+120</div>
                    </div>
                </div>
                <button 
                    onClick={handleUploadClick}
                    disabled={isUploading}
                    className="bg-secondary hover:bg-yellow-400 text-slate-900 px-8 py-4 rounded-xl font-bold shadow-lg flex items-center gap-2 transition-transform hover:scale-105"
                >
                    {isUploading ? (
                        <>
                            <span className="material-symbols-outlined animate-spin">sync</span>
                            Subiendo...
                        </>
                    ) : (
                        <>
                            <span className="material-symbols-outlined">cloud_upload</span>
                            Subir Recuerdo
                        </>
                    )}
                </button>
            </div>
        </div>
      </section>

      {/* News Grid */}
      <section className="py-16 bg-background-light dark:bg-background-dark">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-10">Últimos Resúmenes</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Highlight Video (Veo placeholder) */}
                <div 
                  className="md:col-span-2 relative h-[400px] rounded-2xl overflow-hidden group cursor-pointer"
                  onClick={() => onNavigate(View.MEDIA)}
                >
                     <img src="https://picsum.photos/800/600?random=1" className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="Match highlight" />
                     <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-8">
                        <span className="inline-block px-3 py-1 rounded-full bg-secondary text-slate-900 text-xs font-bold uppercase tracking-wider mb-3 w-fit">Noticia Destacada</span>
                        <h3 className="text-3xl font-bold text-white mb-2">Victoria épica en la arena de Muskiz</h3>
                        <p className="text-slate-200">Mira el resumen generado por IA de esta increíble final.</p>
                     </div>
                     <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                         <div className="bg-primary/90 rounded-full p-4 text-background-dark">
                             <span className="material-symbols-outlined text-4xl">play_arrow</span>
                         </div>
                     </div>
                </div>

                {/* Stats */}
                <div className="bg-primary/10 dark:bg-primary/5 rounded-2xl p-8 border border-primary/20 flex flex-col items-center justify-center text-center gap-4">
                    <div className="size-20 rounded-full bg-surface-light dark:bg-surface-dark flex items-center justify-center text-primary shadow-lg mb-2">
                        <span className="material-symbols-outlined text-4xl">trophy</span>
                    </div>
                    <h4 className="text-5xl font-black text-slate-900 dark:text-white">32</h4>
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