import React, { useState } from 'react';
import { View } from '../types';

interface LayoutProps {
  currentView: View;
  onNavigate: (view: View) => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ currentView, onNavigate, children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Added Info right after Home
  const navItems = [
    { label: 'Inicio', view: View.HOME },
    { label: 'Información', view: View.INFO },
    { label: 'Registro', view: View.REGISTRATION },
    { label: 'Mi Equipo', view: View.TEAM },
    { label: 'Competición', view: View.SCHEDULE },
    { label: 'Multimedia', view: View.MEDIA },
    { label: 'Patrocinadores', view: View.SPONSORS },
  ];

  return (
    <div className="flex flex-col min-h-screen">
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-background-dark/95 backdrop-blur-md text-white shadow-lg">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            {/* Logo */}
            <div 
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => onNavigate(View.HOME)}
            >
              <div className="flex items-center justify-center size-10 rounded-lg bg-primary text-background-dark group-hover:bg-white transition-colors">
                <span className="material-symbols-outlined text-2xl">sports_handball</span>
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight uppercase leading-none">Muskizko Udala</h1>
                <span className="text-xs font-medium text-slate-400 uppercase tracking-widest group-hover:text-primary transition-colors">Torneo 2026</span>
              </div>
            </div>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-6">
              {navItems.map((item) => (
                <button
                  key={item.view}
                  onClick={() => onNavigate(item.view)}
                  className={`text-sm font-medium transition-colors uppercase tracking-wide ${
                    currentView === item.view 
                      ? 'text-primary border-b-2 border-primary' 
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            {/* CTA */}
            <div className="flex items-center gap-4">
              <button 
                onClick={() => onNavigate(View.REGISTRATION)}
                className="hidden sm:flex items-center gap-2 bg-primary hover:bg-primary-dark text-background-dark px-5 py-2.5 rounded-lg font-bold text-sm transition-all transform active:scale-95 shadow-[0_0_15px_rgba(13,242,242,0.3)] hover:shadow-[0_0_20px_rgba(13,242,242,0.5)]"
              >
                <span>Inscribirse</span>
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </button>
              
              <button 
                className="lg:hidden p-2 text-slate-300 hover:text-primary"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                <span className="material-symbols-outlined">menu</span>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-background-dark border-t border-white/10">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
              {navItems.map((item) => (
                <button
                  key={item.view}
                  onClick={() => {
                    onNavigate(item.view);
                    setMobileMenuOpen(false);
                  }}
                  className={`block w-full text-left px-3 py-2 rounded-md text-base font-medium ${
                    currentView === item.view 
                    ? 'bg-primary/10 text-primary' 
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>

      <main className="flex-grow">
        {children}
      </main>

      <footer className="bg-background-dark border-t border-white/10 pt-16 pb-8 text-slate-400">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
           <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            {/* Column 1: Brand */}
            <div className="col-span-1 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary text-3xl">sports_handball</span>
                <span className="text-xl font-bold uppercase tracking-tight text-white">Muskizko Udala</span>
              </div>
              <p className="text-sm leading-relaxed mb-6">
                La experiencia definitiva de balonmano playa en Muskiz. Reuniendo a atletas de todo el mundo.
              </p>
              <div className="flex gap-4">
                  <a href="#" className="text-slate-400 hover:text-primary"><span className="material-symbols-outlined">public</span></a>
                  <a href="#" className="text-slate-400 hover:text-primary"><span className="material-symbols-outlined">alternate_email</span></a>
              </div>
            </div>

            {/* Column 2: Tournament */}
            <div>
               <h4 className="font-bold text-white uppercase tracking-wider mb-6 text-sm">Competición</h4>
               <ul className="space-y-3 text-sm">
                 <li><button onClick={() => onNavigate(View.SCHEDULE)} className="hover:text-primary text-left">Calendario y Resultados</button></li>
                 <li><button onClick={() => onNavigate(View.TEAM)} className="hover:text-primary text-left">Inscripción Equipos</button></li>
                 <li><button onClick={() => onNavigate(View.MEDIA)} className="hover:text-primary text-left">Galería Multimedia</button></li>
               </ul>
            </div>

            {/* Column 3: Legal */}
            <div>
               <h4 className="font-bold text-white uppercase tracking-wider mb-6 text-sm">Legal</h4>
               <ul className="space-y-3 text-sm">
                 <li><button className="hover:text-primary text-left">Aviso Legal</button></li>
                 <li><button className="hover:text-primary text-left">Política de Privacidad</button></li>
                 <li><button className="hover:text-primary text-left">Reglamento Oficial</button></li>
               </ul>
            </div>

            {/* Column 4: Admin Access (Prominent) */}
            <div>
               <h4 className="font-bold text-white uppercase tracking-wider mb-6 text-sm">Organización</h4>
               <button 
                  onClick={() => onNavigate(View.ADMIN)}
                  className="w-full group flex items-center gap-3 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white px-4 py-4 rounded-xl border border-white/10 hover:border-primary/50 transition-all text-left"
               >
                  <div className="size-10 rounded-lg bg-black/40 flex items-center justify-center group-hover:bg-primary group-hover:text-background-dark transition-colors border border-white/5">
                      <span className="material-symbols-outlined">admin_panel_settings</span>
                  </div>
                  <div>
                      <span className="block text-xs font-bold uppercase text-white group-hover:text-primary">Acceso Staff</span>
                      <span className="block text-[10px] text-slate-500">Solo personal autorizado</span>
                  </div>
               </button>
            </div>
          </div>

          <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
             <span>&copy; 2026 Torneo Muskizko Udala. Todos los derechos reservados.</span>
             <div className="flex items-center gap-6">
                <button onClick={() => onNavigate(View.SPONSORS)} className="hover:text-primary">Patrocinadores</button>
                <span className="text-slate-700">|</span>
                <button onClick={() => onNavigate(View.ADMIN)} className="text-slate-600 hover:text-primary flex items-center gap-1">
                   <span className="material-symbols-outlined text-xs">lock</span> Admin
                </button>
             </div>
          </div>
        </div>
      </footer>
    </div>
  );
};