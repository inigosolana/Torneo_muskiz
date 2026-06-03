import React, { createContext, useContext } from 'react';
import { CategoryLimits, Match, Team } from '../types';

interface TournamentDataContextValue {
  teams: Team[];
  setTeams: React.Dispatch<React.SetStateAction<Team[]>>;
  matches: Match[];
  setMatches: React.Dispatch<React.SetStateAction<Match[]>>;
  categoryLimits: CategoryLimits;
  setCategoryLimits: React.Dispatch<React.SetStateAction<CategoryLimits>>;
  /** Calendario / resultados / clasificación visibles para cualquier visitante (no staff). */
  publicMatchesVisible: boolean;
  persistPublicMatchesVisible: (visible: boolean) => Promise<void>;
  /** Oficial publicado (`is_public`) sin datos de acta — web y panel responsable. */
  publicDisplayMatches: Match[];
}

const TournamentDataContext = createContext<TournamentDataContextValue | undefined>(undefined);

interface TournamentDataProviderProps {
  value: TournamentDataContextValue;
  children: React.ReactNode;
}

export const TournamentDataProvider: React.FC<TournamentDataProviderProps> = ({ value, children }) => {
  return (
    <TournamentDataContext.Provider value={value}>
      {children}
    </TournamentDataContext.Provider>
  );
};

export const useTournamentData = (): TournamentDataContextValue => {
  const context = useContext(TournamentDataContext);
  if (!context) {
    throw new Error('useTournamentData must be used within a TournamentDataProvider');
  }
  return context;
};
