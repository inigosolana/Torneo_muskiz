import React, { useState } from 'react';
import { View, Team, Match, Player, CategoryLimits, SiteContent } from './types';
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
import { VideoGenerator } from './components/VideoGenerator';
import { teamService, matchService } from './services/teamService';
import { generateBracketAI } from './services/geminiService';
import { PlayerSelfRegistration } from './views/PlayerSelfRegistration';
import { supabase } from './services/supabaseClient';


const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.HOME);

  // --- Dynamic Site Content (CMS) ---
  const [siteContent, setSiteContent] = useState<SiteContent>({
    heroTitle: "Torneo Muskizko Udala 2026",
    heroSubtitle: "El evento principal de balonmano playa en Muskiz. Vive la adrenalina, la arena y la gloria en nuestra costa.",

    // History
    aboutTitle: "Historia y Evolución",
    aboutText: "El Torneo Muskizko Udala nació en el verano de 2015 como una pequeña iniciativa local para fomentar el deporte en la playa de La Arena. Lo que comenzó con apenas 8 equipos y una sola cancha marcada con cintas improvisadas, se ha transformado en un referente de la costa cantábrica.\n\nA lo largo de esta década, hemos crecido exponencialmente. De ser un torneo de un solo día, hemos pasado a un festival de fin de semana completo, atrayendo a equipos de nivel nacional e internacional.\n\nNuestra evolución no ha sido solo en números, sino en calidad: arbitrajes federados, streaming en directo, marcadores electrónicos y una experiencia para el jugador que prioriza el espectáculo y el juego limpio.",
    aboutImageUrl: "https://picsum.photos/800/800?grayscale",
    aboutStats: [
      { value: "2015", label: "Año Fundación" },
      { value: "+300", label: "Jugadores/año" },
      { value: "10ª", label: "Edición" }
    ],

    // Venue
    venue: {
      title: "La Sede: Playa de La Arena",
      description: "Situada en un entorno natural privilegiado, la Playa de La Arena ofrece las condiciones perfectas para la práctica del balonmano playa. Su arena fina y compacta permite un juego rápido y espectacular.",
      imageUrl: "https://picsum.photos/800/600?nature",
      features: [
        "Orientación perfecta para el sol",
        "Más de 2000 plazas de aparcamiento",
        "Amplia oferta gastronómica local"
      ]
    },

    // Socials
    socials: {
      instagram: { handle: "@muskizbeach", url: "#" },
      twitter: { handle: "@MuskizTorneo", url: "#" },
      tiktok: { handle: "@handball_muskiz", url: "#" },
      youtube: { handle: "Canal Oficial", url: "#" }
    },

    contactEmail: "torneo@muskiz.com",

    // Sponsors
    sponsors: [
      { id: 's1', name: 'Ayuntamiento de Muskiz', logoUrl: 'apartment', tier: 'Platinum' },
      { id: 's2', name: 'Petronor', logoUrl: 'energy_savings_leaf', tier: 'Platinum' },
      { id: 's3', name: 'Caja Rural', logoUrl: 'account_balance', tier: 'Gold' },
      { id: 's4', name: 'Euskaltel', logoUrl: 'wifi', tier: 'Gold' },
      { id: 's5', name: 'Coca Cola', logoUrl: 'local_drink', tier: 'Gold' },
      { id: 's6', name: 'Deportes Base', logoUrl: 'sports_soccer', tier: 'Silver' },
      { id: 's7', name: 'Bar La Playa', logoUrl: 'restaurant', tier: 'Silver' },
    ],

    // Gallery
    gallery: [
      { id: 'g1', url: 'https://picsum.photos/600/400?random=1', title: 'Final Masculina', year: 2025 },
      { id: 'g2', url: 'https://picsum.photos/600/400?random=2', title: 'Entrega de Trofeos', year: 2025 },
      { id: 'g3', url: 'https://picsum.photos/600/400?random=3', title: 'Ambiente en la grada', year: 2024 },
      { id: 'g4', url: 'https://picsum.photos/600/400?random=4', title: 'Gol aéreo espectacular', year: 2024 },
    ]
  });

  // Category Limits (Admin controlled)
  // NOTE: Registration view checks these limits to block signup when full.
  const [categoryLimits, setCategoryLimits] = useState<CategoryLimits>({
    'Infantil Femenino': 4,
    'Infantil Masculino': 4,
    'Cadete Femenino': 4,
    'Cadete Masculino': 4,
    'Juvenil Femenino': 4,
    'Juvenil Masculino': 4,
    'Senior Femenino': 8,
    'Senior Masculino': 8
  });

  // Teams Data (Includes Players)
  const [teams, setTeams] = useState<Team[]>([]);

  // Matches Data
  const [matches, setMatches] = useState<Match[]>([]);

  // Load initial data
  React.useEffect(() => {
    const loadData = async () => {
      const dbTeams = await teamService.getTeams();
      const dbMatches = await matchService.getMatches();
      if (dbTeams.length > 0) setTeams(dbTeams);
      if (dbMatches.length > 0) setMatches(dbMatches);

      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'slfreg') {
        setCurrentView(View.PLAYER_SELF_REGISTRATION);
      }
    };
    loadData();

    // Realtime Events from Supabase
    const matchSubscription = supabase
      .channel('public:matches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, (payload) => {
        console.log('Match change received!', payload);
        matchService.getMatches().then(dbMatches => setMatches(dbMatches));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(matchSubscription);
    };
  }, []);

  // --- Automatic Bracket Generation ---
  // When all categories are full and no matches exist, generate automatically
  React.useEffect(() => {
    const autoGenerate = async () => {
      const counts = {
        'Infantil Femenino': teams.filter(t => t.division === 'Infantil Femenino').length,
        'Infantil Masculino': teams.filter(t => t.division === 'Infantil Masculino').length,
        'Cadete Femenino': teams.filter(t => t.division === 'Cadete Femenino').length,
        'Cadete Masculino': teams.filter(t => t.division === 'Cadete Masculino').length,
        'Juvenil Femenino': teams.filter(t => t.division === 'Juvenil Femenino').length,
        'Juvenil Masculino': teams.filter(t => t.division === 'Juvenil Masculino').length,
        'Senior Femenino': teams.filter(t => t.division === 'Senior Femenino').length,
        'Senior Masculino': teams.filter(t => t.division === 'Senior Masculino').length
      };

      const isAllFull = Object.keys(categoryLimits).every(key => counts[key as keyof CategoryLimits] >= categoryLimits[key as keyof CategoryLimits]);

      if (isAllFull && matches.length === 0 && teams.length > 0) {
        console.log("Automatic Generation Triggered: All categories full!");
        const newMatches = await generateBracketAI(teams, {
          startTime: '09:00',
          endTime: '21:00',
          intervalMins: 30,
          courts: ['Pista Central', 'Pista 2', 'Pista 3'],
          lunchBreak: true,
          customPrompt: 'Generar fase de grupos y eliminatorias para todas las categorías.'
        });
        if (newMatches.length > 0) {
          setMatches(newMatches);
          await matchService.saveMatches(newMatches);
        }
      }
    };
    autoGenerate();
  }, [teams, matches.length, categoryLimits]);

  // Functions to modify state
  const addTeam = async (team: Team) => {
    const savedTeam = await teamService.registerTeam(team);
    if (savedTeam) {
      setTeams([...teams, savedTeam]);
      setCurrentView(View.TEAM);
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

  const renderView = () => {
    switch (currentView) {
      case View.HOME: return <Home onNavigate={setCurrentView} content={siteContent} />;
      case View.INFO: return <Information content={siteContent} />;
      case View.SCHEDULE: return <Schedule matches={matches} teams={teams} />;
      case View.ADMIN: return (
        <Admin
          teams={teams}
          onUpdateTeam={updateTeam}
          matches={matches}
          onUpdateMatches={updateMatches}
          categoryLimits={categoryLimits}
          onUpdateLimits={setCategoryLimits}
          content={siteContent}
          onUpdateContent={setSiteContent}
        />
      );
      case View.TEAM: return <TeamManager teams={teams} onUpdateTeam={updateTeam} onNavigate={setCurrentView} />;
      case View.REGISTRATION: return <Registration onRegister={addTeam} teams={teams} categoryLimits={categoryLimits} />;
      case View.SPONSORS: return <Sponsors content={siteContent} />;
      case View.MEDIA: return <Media content={siteContent} />;
      case View.PLAYER_SELF_REGISTRATION: return <PlayerSelfRegistration teams={teams} onUpdateTeam={updateTeam} onNavigate={setCurrentView} />;
      default: return <Home onNavigate={setCurrentView} content={siteContent} />;
    }
  };

  return (
    <Layout currentView={currentView} onNavigate={setCurrentView}>
      {renderView()}
      <ChatBot />
      {/* Video Generator can be accessed from Media view now mostly, but keeping component available if needed */}
    </Layout>
  );
};

export default App;