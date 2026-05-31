import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getRegistrationTimeLeft,
  isPastDeadline,
  REGISTRATION_IMMINENT_MS,
  TEAM_REGISTRATION_CLOSE_AT,
  TEAM_REGISTRATION_LAST_DAY,
} from '../constants/registrationDeadlines';
import { useTournamentData } from '../context/TournamentDataContext';
import { supabase } from '../services/supabaseClient';
import { Team } from '../types';
import {
  capacityUrgencyMessage,
  summarizeRegistrationCapacity,
} from '../utils/registrationCapacity';

type Variant = 'hero' | 'inline' | 'strip';

interface RegistrationUrgencyBannerProps {
  variant?: Variant;
  className?: string;
  /** Enlace CTA; por defecto /registration */
  ctaHref?: string;
  teamsOverride?: Team[];
}

function formatCountdownLabel(
  hours: number,
  minutes: number,
  seconds: number,
): string {
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const h = hours % 24;
    return `${days} día${days === 1 ? '' : 's'} y ${h} h`;
  }
  if (hours > 0) {
    return `${hours} h ${minutes.toString().padStart(2, '0')} min`;
  }
  return `${minutes} min ${seconds.toString().padStart(2, '0')} s`;
}

export const RegistrationUrgencyBanner: React.FC<RegistrationUrgencyBannerProps> = ({
  variant = 'inline',
  className = '',
  ctaHref = '/registration',
  teamsOverride,
}) => {
  const { teams: contextTeams } = useTournamentData();
  const teams = teamsOverride ?? contextTeams;

  const [tick, setTick] = useState(0);
  const [categories, setCategories] = useState<{ name: string; max_teams: number }[]>([]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('categories').select('name, max_teams').order('name');
      if (data) setCategories(data);
    })();
  }, []);

  useEffect(() => {
    if (isPastDeadline(TEAM_REGISTRATION_CLOSE_AT)) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const timeLeft = useMemo(
    () => getRegistrationTimeLeft(TEAM_REGISTRATION_CLOSE_AT),
    [tick],
  );

  const capacity = useMemo(
    () => summarizeRegistrationCapacity(teams, categories),
    [teams, categories],
  );

  if (timeLeft.isClosed || isPastDeadline(TEAM_REGISTRATION_CLOSE_AT)) {
    return null;
  }

  const isImminent = timeLeft.ms <= REGISTRATION_IMMINENT_MS;
  const countdownText = formatCountdownLabel(
    timeLeft.hours,
    timeLeft.minutes,
    timeLeft.seconds,
  );
  const spotsMessage = capacityUrgencyMessage(capacity);

  if (variant === 'strip') {
    return (
      <div
        className={`bg-gradient-to-r from-amber-600 via-red-600 to-amber-600 text-white text-xs sm:text-sm ${className}`}
        role="status"
        aria-live="polite"
      >
        <div className="max-w-[1440px] mx-auto px-4 py-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center font-medium">
          {isImminent && (
            <span className="inline-flex items-center gap-1 font-black uppercase tracking-wide animate-pulse">
              <span className="material-symbols-outlined text-base">warning</span>
              Cierre inminente
            </span>
          )}
          <span>
            <strong>{countdownText}</strong> para cerrar inscripciones ({TEAM_REGISTRATION_LAST_DAY})
          </span>
          <span className="opacity-95">· {spotsMessage}</span>
          <Link to={ctaHref} className="underline font-bold hover:text-amber-100">
            Inscribir equipo
          </Link>
        </div>
      </div>
    );
  }

  if (variant === 'hero') {
    return (
      <div className={`flex flex-col gap-4 w-full text-left ${className}`}>
        {isImminent && (
          <div className="inline-flex items-center gap-2 self-center px-4 py-1.5 rounded-full bg-red-500/90 text-white text-xs font-black uppercase tracking-wider animate-pulse shadow-lg">
            <span className="material-symbols-outlined text-base">bolt</span>
            ¡Cierre inminente!
          </div>
        )}

        <div className="rounded-xl border border-primary/30 bg-primary/10 p-4 w-full">
          <div className="flex items-center gap-2 text-primary mb-1">
            <span className="material-symbols-outlined">schedule</span>
            <span className="text-[10px] font-black uppercase tracking-widest">Cuenta atrás</span>
          </div>
          <p className="text-2xl sm:text-3xl font-black text-white tabular-nums tracking-tight">
            {countdownText}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Hasta el cierre de inscripción · último día <strong className="text-white">{TEAM_REGISTRATION_LAST_DAY}</strong>
          </p>
        </div>

        <div className="rounded-xl border border-amber-500/40 bg-amber-500/15 p-4 w-full">
          <div className="flex items-center gap-2 text-amber-300 mb-1">
            <span className="material-symbols-outlined">stadium</span>
            <span className="text-[10px] font-black uppercase tracking-widest">Disponibilidad</span>
          </div>
          <p className="text-sm font-bold text-amber-50 leading-snug">{spotsMessage}</p>
          {capacity.scarceCategories.length > 0 && (
            <p className="text-[11px] text-amber-200/80 mt-2">
              Casi llenas:{' '}
              {capacity.scarceCategories
                .slice(0, 3)
                .map((c) => `${c.name} (${c.remaining})`)
                .join(' · ')}
            </p>
          )}
        </div>
      </div>
    );
  }

  // inline — página de inscripción
  return (
    <div
      className={`rounded-xl border overflow-hidden shadow-lg ${isImminent ? 'border-red-400/60' : 'border-amber-500/40'} ${className}`}
      role="status"
      aria-live="polite"
    >
      <div
        className={`px-4 py-3 flex flex-wrap items-center gap-3 ${
          isImminent
            ? 'bg-gradient-to-r from-red-600 to-amber-600 text-white'
            : 'bg-gradient-to-r from-amber-500 to-orange-600 text-white'
        }`}
      >
        {isImminent && (
          <span className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-wide bg-white/20 px-2.5 py-1 rounded-full animate-pulse">
            <span className="material-symbols-outlined text-sm">warning</span>
            Cierre inminente
          </span>
        )}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="material-symbols-outlined shrink-0">timer</span>
          <div>
            <p className="text-[10px] font-bold uppercase opacity-90">Tiempo restante</p>
            <p className="text-lg font-black tabular-nums leading-none">{countdownText}</p>
          </div>
        </div>
        <p className="text-xs sm:text-sm font-medium opacity-95">
          Cierre el <strong>{TEAM_REGISTRATION_LAST_DAY}</strong> a las 23:59
        </p>
      </div>
      <div className="px-4 py-3 bg-amber-50 dark:bg-amber-950/40 border-t border-amber-200/50 dark:border-amber-800/50 flex flex-wrap items-start gap-2">
        <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 shrink-0">group_off</span>
        <div>
          <p className="text-sm font-bold text-amber-900 dark:text-amber-100">{spotsMessage}</p>
          <p className="text-xs text-amber-800/80 dark:text-amber-200/70 mt-0.5">
            No esperes al último momento: las plazas se asignan por orden de inscripción validada.
          </p>
        </div>
      </div>
    </div>
  );
};
