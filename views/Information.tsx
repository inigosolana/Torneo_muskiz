import React from 'react';
import { SiteContent } from '../types';

interface InformationProps {
    content: SiteContent;
}

export const Information: React.FC<InformationProps> = ({ content }) => {
  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark py-12 px-4 sm:px-6 lg:px-8 animate-in fade-in">
        <div className="max-w-5xl mx-auto space-y-16">
            
            {/* Header */}
            <div className="text-center space-y-4">
                <h2 className="text-4xl md:text-6xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">
                    Sobre El Torneo
                </h2>
                <div className="h-1 w-24 bg-primary mx-auto rounded-full"></div>
                <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
                    Conoce la historia, la evolución y el espíritu que mueve el balonmano playa en Muskiz.
                </p>
            </div>

            {/* Section 1: History & Evolution */}
            <div className="grid md:grid-cols-2 gap-12 items-center">
                <div className="relative group">
                    <div className="absolute -inset-2 bg-gradient-to-r from-primary to-secondary rounded-2xl opacity-75 blur-lg group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
                    <div className="relative aspect-square rounded-xl overflow-hidden shadow-2xl">
                        <img 
                            src={content.aboutImageUrl}
                            alt="Historia del torneo" 
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                        />
                        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
                            <span className="text-white font-bold text-lg">Nuestros Inicios</span>
                        </div>
                    </div>
                </div>
                <div className="space-y-6">
                    <h3 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <span className="material-symbols-outlined text-primary text-4xl">history_edu</span>
                        {content.aboutTitle}
                    </h3>
                    <div className="space-y-4 text-slate-600 dark:text-slate-300 leading-relaxed">
                        {/* Split text by newlines to create paragraphs */}
                        {content.aboutText.split('\n\n').map((paragraph, index) => (
                            <p key={index}>{paragraph}</p>
                        ))}
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 border-t border-slate-200 dark:border-white/10 pt-6">
                        {content.aboutStats.map((stat, idx) => (
                            <div key={idx}>
                                <span className="block text-3xl font-black text-slate-900 dark:text-white">{stat.value}</span>
                                <span className="text-xs uppercase font-bold text-slate-400">{stat.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Section 2: The Venue (La Sede) */}
            <div className="bg-white dark:bg-surface-dark rounded-2xl p-8 md:p-12 shadow-xl border border-slate-200 dark:border-white/5 relative overflow-hidden">
                <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
                     <span className="material-symbols-outlined text-9xl">waves</span>
                </div>
                
                <div className="grid md:grid-cols-2 gap-12">
                    <div className="space-y-6 order-2 md:order-1">
                        <h3 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                            <span className="material-symbols-outlined text-secondary text-4xl">location_on</span>
                            {content.venue.title}
                        </h3>
                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                            {content.venue.description}
                        </p>
                        <ul className="space-y-3">
                            {content.venue.features.map((feature, idx) => (
                                <li key={idx} className="flex items-center gap-3">
                                    <span className="size-8 rounded-full bg-primary/20 text-primary flex items-center justify-center">
                                        <span className="material-symbols-outlined text-sm">check</span>
                                    </span>
                                    <span className="text-slate-700 dark:text-slate-200 font-medium">{feature}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div className="order-1 md:order-2 h-full min-h-[300px] rounded-xl overflow-hidden relative">
                         <img 
                            src={content.venue.imageUrl} 
                            alt="Sede del torneo" 
                            className="absolute inset-0 w-full h-full object-cover" 
                        />
                        <div className="absolute inset-0 bg-black/20"></div>
                    </div>
                </div>
            </div>

            {/* Section 3: Social Media & Community */}
            <div className="text-center space-y-8">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Únete a la Comunidad</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Instagram */}
                    <a href={content.socials.instagram.url} className="group bg-[#E1306C]/10 hover:bg-[#E1306C] p-6 rounded-xl transition-all duration-300 flex flex-col items-center gap-3 border border-[#E1306C]/20">
                        <span className="material-symbols-outlined text-4xl text-[#E1306C] group-hover:text-white transition-colors">photo_camera</span>
                        <div className="text-[#E1306C] group-hover:text-white font-bold">
                            <span className="block text-sm uppercase tracking-wider">Instagram</span>
                            <span className="text-lg">{content.socials.instagram.handle}</span>
                        </div>
                    </a>
                    {/* Twitter */}
                    <a href={content.socials.twitter.url} className="group bg-[#1DA1F2]/10 hover:bg-[#1DA1F2] p-6 rounded-xl transition-all duration-300 flex flex-col items-center gap-3 border border-[#1DA1F2]/20">
                        <span className="material-symbols-outlined text-4xl text-[#1DA1F2] group-hover:text-white transition-colors">alternate_email</span>
                        <div className="text-[#1DA1F2] group-hover:text-white font-bold">
                            <span className="block text-sm uppercase tracking-wider">Twitter</span>
                            <span className="text-lg">{content.socials.twitter.handle}</span>
                        </div>
                    </a>
                    {/* TikTok */}
                    <a href={content.socials.tiktok.url} className="group bg-[#000000]/10 hover:bg-[#000000] dark:bg-white/5 dark:hover:bg-white p-6 rounded-xl transition-all duration-300 flex flex-col items-center gap-3 border border-slate-400/20">
                        <span className="material-symbols-outlined text-4xl text-slate-900 dark:text-white group-hover:text-white dark:group-hover:text-black transition-colors">music_note</span>
                        <div className="text-slate-900 dark:text-white group-hover:text-white dark:group-hover:text-black font-bold">
                            <span className="block text-sm uppercase tracking-wider">TikTok</span>
                            <span className="text-lg">{content.socials.tiktok.handle}</span>
                        </div>
                    </a>
                    {/* YouTube */}
                    <a href={content.socials.youtube.url} className="group bg-[#FF0000]/10 hover:bg-[#FF0000] p-6 rounded-xl transition-all duration-300 flex flex-col items-center gap-3 border border-[#FF0000]/20">
                        <span className="material-symbols-outlined text-4xl text-[#FF0000] group-hover:text-white transition-colors">smart_display</span>
                        <div className="text-[#FF0000] group-hover:text-white font-bold">
                            <span className="block text-sm uppercase tracking-wider">YouTube</span>
                            <span className="text-lg">{content.socials.youtube.handle}</span>
                        </div>
                    </a>
                </div>
            </div>
        </div>
    </div>
  );
};