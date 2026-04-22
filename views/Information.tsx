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
                <div className="text-center space-y-4 mb-12">
                    <h2 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">
                        Historia del Torneo y del Club
                    </h2>
                    <div className="h-1 w-24 bg-primary mx-auto rounded-full"></div>
                </div>

                {/* Section 1: History & Evolution */}
                <div className="grid md:grid-cols-2 gap-12 items-center mb-16">
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




                {/* Section 3: Social Media & Community */}
                <div className="text-center space-y-8">
                    <h3 className="text-2xl font-bold text-slate-900 dark:text-white">Únete a la Comunidad</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                        {/* Instagram Kolosaurios */}
                        <a href={content.socials.instagramKolosaurios.url} target="_blank" rel="noopener noreferrer" className="group bg-[#E1306C]/10 hover:bg-[#E1306C] p-6 rounded-xl transition-all duration-300 flex flex-col items-center gap-3 border border-[#E1306C]/20">
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-[#E1306C] group-hover:text-white transition-colors">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                            </svg>
                            <div className="text-[#E1306C] group-hover:text-white font-bold text-center">
                                <span className="block text-sm uppercase tracking-wider">Ig Kolosaurios</span>
                                <span className="text-sm">{content.socials.instagramKolosaurios.handle}</span>
                            </div>
                        </a>
                        {/* Instagram Muskiz */}
                        <a href={content.socials.instagramMuskiz.url} target="_blank" rel="noopener noreferrer" className="group bg-[#E1306C]/10 hover:bg-[#E1306C] p-6 rounded-xl transition-all duration-300 flex flex-col items-center gap-3 border border-[#E1306C]/20">
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-[#E1306C] group-hover:text-white transition-colors">
                                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
                            </svg>
                            <div className="text-[#E1306C] group-hover:text-white font-bold text-center">
                                <span className="block text-sm uppercase tracking-wider">Ig Muskiz</span>
                                <span className="text-sm">{content.socials.instagramMuskiz.handle}</span>
                            </div>
                        </a>
                        {/* TikTok Kolosaurios */}
                        <a href={content.socials.tiktok.url} target="_blank" rel="noopener noreferrer" className="group bg-[#000000]/10 hover:bg-[#000000] dark:bg-white/5 dark:hover:bg-white p-6 rounded-xl transition-all duration-300 flex flex-col items-center gap-3 border border-slate-400/20">
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-slate-900 dark:text-white group-hover:text-white dark:group-hover:text-black transition-colors">
                                <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1.04-.1z"/>
                            </svg>
                            <div className="text-slate-900 dark:text-white group-hover:text-white dark:group-hover:text-black font-bold text-center">
                                <span className="block text-sm uppercase tracking-wider">TikTok Kolos</span>
                                <span className="text-sm">{content.socials.tiktok.handle}</span>
                            </div>
                        </a>
                        {/* YouTube */}
                        <a href={content.socials.youtube.url} target="_blank" rel="noopener noreferrer" className="group bg-[#FF0000]/10 hover:bg-[#FF0000] p-6 rounded-xl transition-all duration-300 flex flex-col items-center gap-3 border border-[#FF0000]/20">
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-[#FF0000] group-hover:text-white transition-colors">
                                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.5 12 3.5 12 3.5s-7.505 0-9.377.55a3.016 3.016 0 0 0-2.122 2.136C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.55 9.376.55 9.376.55s7.505 0 9.377-.55a3.016 3.016 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                            </svg>
                            <div className="text-[#FF0000] group-hover:text-white font-bold text-center">
                                <span className="block text-sm uppercase tracking-wider">YouTube</span>
                                <span className="text-sm">{content.socials.youtube.handle}</span>
                            </div>
                        </a>
                        {/* Website Muskiz */}
                        <a href={content.socials.website.url} target="_blank" rel="noopener noreferrer" className="group bg-primary/10 hover:bg-primary p-6 rounded-xl transition-all duration-300 flex flex-col items-center gap-3 border border-primary/20">
                            <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 text-primary group-hover:text-background-dark transition-colors">
                                <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm6.989 7H15.65c-.24-1.425-.623-2.766-1.12-3.96C16.592 3.824 18.257 5.215 18.989 7zM12 2.067c.758.852 1.411 2.08 1.905 3.49H10.095C10.589 4.148 11.242 2.919 12 2.067zm-2.53.973c-.497 1.194-.88 2.535-1.12 3.96H5.011C5.743 5.215 7.408 3.824 9.47 3.04zM2.511 10h3.692c-.08.64-.123 1.309-.123 2s.043 1.36.123 2H2.511C2.176 12.723 2 12.373 2 12s.176-.723.511-1h3.692zm.501 5H6.35c.24 1.425.623 2.766 1.12 3.96C5.408 18.176 3.743 16.785 3.011 15zm6.459 5.96c-.494-1.41-.88-2.638-1.12-3.96h5.301c-.24 1.322-.626 2.55-1.12 3.96-.913-.815-1.748-2.008-2.148-3.96H10.51c-.4-1.952-1.235-3.145-2.148-3.96zm1.625-5.96c-.1-1.282-.161-2.613-.161-4s.061-2.718.161-4h3.668c.1 1.282.161 2.613.161 4s-.061 2.718-.161 4h-3.668zm3.626 5.96c1.194-.497 2.535-.88 3.96-1.12.784-2.062 2.175-3.727 3.04-5.789H17.65c.24 1.322.623 2.535 1.12 3.96zM21.489 14h-3.692c.08-.64.123-1.309.123-2s-.043-1.36-.123-2h3.692c.335.639.511.989.511 1.36s-.176.723-.511 1z"/>
                            </svg>
                            <div className="text-primary group-hover:text-background-dark font-bold text-center">
                                <span className="block text-sm uppercase tracking-wider">Web Muskiz</span>
                                <span className="text-sm">{content.socials.website.handle}</span>
                            </div>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};