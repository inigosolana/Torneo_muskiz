import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Team, Match, CategoryLimits } from './types';
import { Layout } from './components/Layout';
import { ChatBot } from './components/ChatBot';
import { Home } from './views/Home';
import { Schedule } from './views/Schedule';
import { Admin } from './views/Admin';
import { TeamManager } from './views/TeamManager';
import { Registration } from './views/Registration';
import { Sponsors } from './views/Sponsors';
import { Media } from './views/Media';
import { Information } from './views/Information';
import { PlayerSelfRegistration } from './views/PlayerSelfRegistration';
import { ManagerLogin } from './views/ManagerLogin';
import { teamService, matchService } from './services/teamService';
import { generateBracketAI } from './services/geminiService';
import { supabase } from './services/supabaseClient';
import { Toaster, toast } from 'sonner';
import type { User } from '@supabase/supabase-js';

const App: React.FC = () => {
  // Category Limits (Admin controlled)
  const [categoryLimits, setCategoryLimits] = useState<CategoryLimits>({
    'Infantil Femenino': 8,
    'Infantil Masculino': 8,
    'Cadete Femenino': 12,
    'Cadete Masculino': 12,
    'Juvenil Femenino': 8,
    'Juvenil Masculino': 8,
    'Senior Femenino': 8,
    'Senior Masculino': 12
  });

  // Teams Data
  const [teams, setTeams] = useState<Team[]>([]);

  // Matches Data
  const [matches, setMatches] = useState<Match[]>([]);

  // Auth Manager
  const [managerUser, setManagerUser] = useState<User | null>(null);

  // Restore session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setManagerUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setManagerUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      const dbTeams = await teamService.getTeams();
      const dbMatches = await matchService.getMatches();
      if (dbTeams.length > 0) setTeams(dbTeams);
      if (dbMatches.length > 0) setMatches(dbMatches);
    };
    loadData();

    // Realtime Events from Supabase (Optimized)
    const matchSubscription = supabase
      .channel('public:matches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setMatches(prev => {
            if (prev.some(m => m.id === payload.new.id)) return prev;
            return [...prev, payload.new as Match];
          });
        } else if (payload.eventType === 'UPDATE') {
          setMatches(prev => prev.map(m => m.id === payload.new.id ? payload.new as Match : m));
        } else if (payload.eventType === 'DELETE') {
          setMatches(prev => prev.filter(m => m.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(matchSubscription);
    };
  }, []);

  const addTeams = async (newTeams: Team[], receiptFile?: File) => {
    try {
      const savedTeams = await teamService.registerTeams(newTeams, receiptFile);
      if (savedTeams.length > 0) {
        setTeams(prev => [...prev, ...savedTeams]);
        toast.success('Equipos registrados correctamente');
      }
    } catch (error: any) {
      console.error('Error registrando equipos:', error);
      toast.error(error.message || 'Error al registrar los equipos. Revisa los permisos.');
    }
  };

  const updateTeam = async (updatedTeam: Team) => {
    await teamService.updateTeam(updatedTeam);
    setTeams(prev => prev.map(t => t.id === updatedTeam.id ? updatedTeam : t));
  };

  const updateMatches = async (newMatches: Match[]) => {
    setMatches(newMatches);
    await matchService.saveMatches(newMatches);
  }

  const handleGenerateBrackets = async () => {
    try {
      toast.info("Generando cuadro del torneo mediante IA...");
      const newMatches = await generateBracketAI(teams, {
        startTime: '09:00',
        endTime: '21:00',
        intervalMins: 30,
        courts: ['Pista Central', 'Pista 2', 'Pista 3'],
        lunchBreak: true,
        customPrompt: 'Generar fase de grupos y eliminatorias para todas las categorías.'
      });
      if (newMatches.length > 0) {
        updateMatches(newMatches);
        toast.success("Cuadro generado con éxito");
      }
    } catch (error) {
      console.error(error);
      toast.error("Error al generar los partidos");
    }
  };

  return (
    <Router>
      <Layout>
        <Toaster richColors position="bottom-right" />
        <Routes>
          <Route path="/" element={<Home teams={teams} />} />
          <Route path="/info" element={<Information />} />
          <Route path="/schedule" element={<Schedule matches={matches} teams={teams} />} />
          <Route path="/registration" element={<Registration onRegister={addTeams} teams={teams} categoryLimits={categoryLimits} />} />
          <Route path="/sponsors" element={<Sponsors />} />
          <Route path="/media" element={<Media />} />
          <Route path="/self-registration" element={<PlayerSelfRegistration teams={teams} onUpdateTeam={updateTeam} />} />
          
          <Route path="/admin" element={
            <Admin
              teams={teams}
              onUpdateTeam={updateTeam}
              matches={matches}
              onUpdateMatches={updateMatches}
              categoryLimits={categoryLimits}
              onUpdateLimits={setCategoryLimits}
              onGenerateBrackets={handleGenerateBrackets}
            />
          } />

          <Route path="/team-manager" element={
            !managerUser ? (
              <ManagerLogin />
            ) : (
              <div className="relative">
                <div className="absolute top-4 right-4 z-50">
                  <button onClick={async () => { await supabase.auth.signOut(); }} className="bg-red-500/10 text-red-500 px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-500/20 transition-colors flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">logout</span> Cerrar Sesión
                  </button>
                </div>
                <TeamManager
                  teams={teams.filter(t => t.managerEmail === managerUser.email)}
                  onUpdateTeam={updateTeam}
                />
              </div>
            )
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <ChatBot matches={matches} />
      </Layout>
    </Router>
  );
};

export default App;