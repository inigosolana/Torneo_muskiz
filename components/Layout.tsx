import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { siteContent } from '../constants/siteContent';
import { isTeamRegistrationClosed } from '../constants/registrationDeadlines';
import { RegistrationUrgencyBanner } from './RegistrationUrgencyBanner';
import { RotatingSponsorSpotlight } from './RotatingSponsorSpotlight';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const location = useLocation();
  const registrationClosed = isTeamRegistrationClosed();

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme);
      document.documentElement.classList.toggle('dark', savedTheme === 'dark');
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const initialTheme: 'light' | 'dark' = prefersDark ? 'dark' : 'light';
      setTheme(initialTheme);
      document.documentElement.classList.toggle('dark', initialTheme === 'dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.toggle('dark', newTheme === 'dark');
  };

  const isAdminRoute =
    location.pathname === '/admin' || location.pathname.startsWith('/admin/');

  const navItems = [
    { label: 'Inicio', path: '/' },
    { label: 'Información', path: '/info' },
    { label: registrationClosed ? 'Inscripciones (cerradas)' : 'Registro', path: '/registration' },
    { label: 'Mi Equipo', path: '/team-manager' },
    { label: 'Competición', path: '/schedule' },
    { label: 'Multimedia', path: '/media' },
    { label: 'Patrocinadores', path: '/sponsors' },
  ];

  const socials = Object.entries(siteContent.socials).map(([key, value]) => ({
    key,
    url: value.url
  }));

  return (
    <div className="flex flex-col min-h-screen bg-background-light dark:bg-background-dark transition-colors duration-300">
      <header className="sticky top-0 z-50 w-full border-b border-slate-200 dark:border-white/10 bg-white/95 dark:bg-background-dark/95 backdrop-blur-md text-slate-900 dark:text-white shadow-lg transition-colors duration-300">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className={`flex items-center justify-between ${
              isAdminRoute ? 'h-14 sm:h-16 lg:h-20' : 'h-20'
            }`}
          >
            {/* Logo */}
            <Link
              to="/"
              className="flex items-center gap-4 cursor-pointer group min-w-0"
            >
              <div className="flex items-center gap-2 shrink-0">
                <img src="/logo_torneo.png" alt="Muskiz Beach Cup" className={`${isAdminRoute ? 'h-8 sm:h-10' : 'h-10'} w-auto object-contain transition-transform group-hover:scale-105`} />
                <img src="/logo_muskiz.png" alt="Muskiz Eskubaloia" className={`${isAdminRoute ? 'hidden sm:block h-10' : 'h-10'} w-auto object-contain transition-transform group-hover:scale-105`} />
                <img src="/logo_kolosaurios.png" alt="Kolosaurios" className={`${isAdminRoute ? 'hidden sm:block h-10' : 'h-10'} w-auto object-contain transition-transform group-hover:scale-105`} />
              </div>
              <div className={isAdminRoute ? 'min-w-0' : 'hidden sm:block'}>
                <h1 className={`font-bold tracking-tight uppercase leading-none text-slate-900 dark:text-white truncate ${isAdminRoute ? 'text-sm sm:text-xl' : 'text-xl'}`}>
                  {isAdminRoute ? 'Panel Admin' : 'II Torneo'}
                </h1>
                <span className={`font-medium text-slate-500 dark:text-slate-400 uppercase tracking-widest group-hover:text-primary transition-colors ${isAdminRoute ? 'text-[10px] sm:text-xs hidden sm:block' : 'text-xs'}`}>
                  {isAdminRoute ? 'Organización' : 'Muskizko Udala'}
                </span>
              </div>
            </Link>

            {/* Desktop Nav */}
            <nav className="hidden lg:flex items-center gap-6">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`text-sm font-medium transition-colors uppercase tracking-wide ${location.pathname === item.path
                      ? 'text-primary border-b-2 border-primary'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* CTA */}
            <div className="flex items-center gap-4">
              <button
                onClick={toggleTheme}
                className="p-2 rounded-full border border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/20 text-amber-600 dark:text-yellow-400 transition-colors"
                title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
              >
                <span className="material-symbols-outlined">{theme === 'dark' ? 'light_mode' : 'dark_mode'}</span>
              </button>

              {!registrationClosed ? (
                <Link
                  to="/registration"
                  className="hidden sm:flex items-center gap-2 bg-primary hover:bg-primary-dark text-background-dark px-5 py-2.5 rounded-lg font-bold text-sm transition-all transform active:scale-95 shadow-[0_0_15px_rgba(13,242,242,0.3)] hover:shadow-[0_0_20px_rgba(13,242,242,0.5)]"
                >
                  <span>Inscribirse</span>
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </Link>
              ) : (
                <div className="hidden sm:flex items-center justify-center min-w-[140px]">
                  <RotatingSponsorSpotlight variant="compact" />
                </div>
              )}

              {!isAdminRoute ? (
                <button
                  type="button"
                  className="lg:hidden p-2 text-slate-600 dark:text-slate-300 hover:text-primary"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  aria-label="Menú del torneo"
                >
                  <span className="material-symbols-outlined">menu</span>
                </button>
              ) : (
                <Link
                  to="/schedule"
                  className="lg:hidden text-[10px] font-bold uppercase text-primary px-2 py-1.5 rounded-lg border border-primary/40 hover:bg-primary/10"
                >
                  Web
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Menu (no en /admin: el panel tiene su propia barra inferior) */}
        {mobileMenuOpen && !isAdminRoute && (
          <div className="lg:hidden bg-white dark:bg-background-dark border-t border-slate-200 dark:border-white/10">
            <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block w-full text-left px-3 py-2 rounded-md text-base font-medium ${location.pathname === item.path
                      ? 'bg-primary/10 text-primary'
                      : 'text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
                    }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>

      {!isAdminRoute &&
        (registrationClosed ? (
          <RotatingSponsorSpotlight variant="strip" />
        ) : (
          <RegistrationUrgencyBanner variant="strip" />
        ))}

      <main className="flex-grow">
        {children}
      </main>

      <footer className="bg-slate-100 dark:bg-background-dark border-t border-slate-200 dark:border-white/10 pt-16 pb-8 text-slate-600 dark:text-slate-400 transition-colors duration-300">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            {/* Column 1: Brand */}
            <div className="col-span-1 md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary text-3xl">sports_handball</span>
                <span className="text-xl font-bold uppercase tracking-tight text-slate-900 dark:text-white">Muskizko Udala</span>
              </div>
              <p className="text-sm leading-relaxed mb-6">
                La experiencia definitiva de balonmano playa en Muskiz. Reuniendo a atletas de todo el mundo.
              </p>
              <div className="flex gap-4">
                {socials.map((social) => {
                  const isInstagram = social.key.includes('instagram');
                  const isTikTok = social.key === 'tiktok';
                  const isYouTube = social.key === 'youtube';
                  const hoverClass = isInstagram
                    ? 'hover:text-[#E1306C]'
                    : isYouTube
                      ? 'hover:text-[#FF0000]'
                      : 'hover:text-white';

                  return (
                    <a
                      key={social.key}
                      href={social.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`text-slate-400 transition-colors ${hoverClass}`}
                    >
                      {isInstagram && (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                        </svg>
                      )}
                      {isTikTok && (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                          <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-5.2 1.74 2.89 2.89 0 012.31-4.64 2.93 2.93 0 01.88.13V9.4a6.84 6.84 0 00-1-.05A6.33 6.33 0 005 20.1a6.34 6.34 0 0010.86-4.43v-7a8.16 8.16 0 004.77 1.52v-3.4a4.85 4.85 0 01-1.04-.1z" />
                        </svg>
                      )}
                      {isYouTube && (
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.5 12 3.5 12 3.5s-7.505 0-9.377.55a3.016 3.016 0 0 0-2.122 2.136C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.55 9.376.55 9.376.55s7.505 0 9.377-.55a3.016 3.016 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
                        </svg>
                      )}
                      {!isInstagram && !isTikTok && !isYouTube && (
                        <span className="material-symbols-outlined text-[22px]">language</span>
                      )}
                    </a>
                  );
                })}
              </div>
            </div>

            {/* Column 2: Tournament */}
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-6 text-sm">Competición</h4>
              <ul className="space-y-3 text-sm">
                <li><Link to="/schedule?tab=calendar" className="hover:text-primary text-left">Calendario y Resultados</Link></li>
                <li><Link to="/team-manager" className="hover:text-primary text-left">Inscripción Equipos</Link></li>
                <li><Link to="/media" className="hover:text-primary text-left">Galería Multimedia</Link></li>
              </ul>
            </div>

            {/* Column 3: Legal */}
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-6 text-sm">Legal</h4>
              <ul className="space-y-3 text-sm">
                <li><button className="hover:text-primary text-left">Aviso Legal</button></li>
                <li><button className="hover:text-primary text-left">Política de Privacidad</button></li>
                <li><button className="hover:text-primary text-left">Reglamento Oficial</button></li>
              </ul>
            </div>

            {/* Column 4: Admin Access (Prominent) */}
            <div>
              <h4 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider mb-6 text-sm">Organización</h4>
              <Link
                to="/admin"
                className="w-full group flex items-center gap-3 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white px-4 py-4 rounded-xl border border-slate-200 dark:border-white/10 hover:border-primary/50 transition-all text-left"
              >
                <div className="size-10 rounded-lg bg-slate-200 dark:bg-black/40 flex items-center justify-center group-hover:bg-primary group-hover:text-background-dark transition-colors border border-slate-300 dark:border-white/5">
                  <span className="material-symbols-outlined">admin_panel_settings</span>
                </div>
                <div>
                  <span className="block text-xs font-bold uppercase text-slate-900 dark:text-white group-hover:text-primary">Acceso Staff</span>
                  <span className="block text-[10px] text-slate-500 dark:text-slate-500">Solo personal autorizado</span>
                </div>
              </Link>
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs">
            <span>&copy; 2026 Torneo Muskizko Udala. Todos los derechos reservados.</span>
            <div className="flex items-center gap-6">
              <Link to="/sponsors" className="hover:text-primary">Patrocinadores</Link>
              <span className="text-slate-700">|</span>
              <Link to="/admin" className="text-slate-600 hover:text-primary flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">lock</span> Admin
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};