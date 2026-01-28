import React, { useState } from 'react';
import { VideoGenerator } from '../components/VideoGenerator';
import { SiteContent } from '../types';

interface MediaProps {
    content: SiteContent;
}

export const Media: React.FC<MediaProps> = ({ content }) => {
  const [showGenerator, setShowGenerator] = useState(false);
  const [selectedYear, setSelectedYear] = useState(2025);

  const galleryImages = content.gallery.filter(item => item.year === selectedYear);

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark py-12 px-4 sm:px-6 lg:px-8 animate-in fade-in">
        <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-6">
                <div>
                    <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Multimedia</h2>
                    <p className="text-slate-500">Revive los mejores momentos de ediciones anteriores.</p>
                </div>
                <div className="flex gap-2 bg-slate-100 dark:bg-white/5 p-1 rounded-lg">
                    {[2025, 2024, 2023].map(year => (
                        <button 
                            key={year}
                            onClick={() => setSelectedYear(year)}
                            className={`px-4 py-2 rounded-md font-bold text-sm transition-all ${selectedYear === year ? 'bg-white dark:bg-surface-dark shadow text-primary' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                        >
                            {year}
                        </button>
                    ))}
                </div>
            </div>

            {/* Video Section */}
            <div className="mb-16">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-secondary">movie</span> Video Resumen {selectedYear}
                    </h3>
                    <button 
                        onClick={() => setShowGenerator(true)}
                        className="text-primary text-sm font-bold flex items-center gap-1 hover:underline"
                    >
                        <span className="material-symbols-outlined">auto_awesome</span> Crear Highlight IA
                    </button>
                </div>
                <div className="relative aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl group cursor-pointer">
                    <img src={`https://picsum.photos/1200/675?random=${selectedYear}`} className="w-full h-full object-cover opacity-80 group-hover:opacity-60 transition-opacity" alt="Video cover" />
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="size-20 bg-primary/90 rounded-full flex items-center justify-center text-background-dark shadow-xl group-hover:scale-110 transition-transform">
                            <span className="material-symbols-outlined text-4xl filled-icon">play_arrow</span>
                        </div>
                    </div>
                    <div className="absolute bottom-0 left-0 w-full p-8 bg-gradient-to-t from-black/80 to-transparent">
                        <h4 className="text-white font-bold text-xl">Aftermovie Oficial {selectedYear}</h4>
                        <p className="text-slate-300 text-sm">Los mejores momentos del fin de semana en 2 minutos.</p>
                    </div>
                </div>
            </div>

            {/* Photo Gallery */}
            <div>
                 <h3 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-6">
                    <span className="material-symbols-outlined text-secondary">photo_library</span> Galería de Fotos
                </h3>
                {galleryImages.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                        {galleryImages.map(img => (
                            <div key={img.id} className="relative group overflow-hidden rounded-xl aspect-[4/3] cursor-pointer">
                                <img src={img.url} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt={img.title} />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                                    <span className="text-white font-bold text-sm">{img.title}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-12 border-2 border-dashed border-slate-200 dark:border-white/5 rounded-xl">
                        <p className="text-slate-500">No hay fotos para este año.</p>
                    </div>
                )}
            </div>
        </div>

        {showGenerator && <VideoGenerator onClose={() => setShowGenerator(false)} />}
    </div>
  );
};