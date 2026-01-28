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
  const [categoryLimits, setCategoryLimits] = useState<CategoryLimits>({
      Elite: 8,
      Amateur: 16,
      Juvenil: 12
  });
  
  // Teams Data (Includes Players)
  const [teams, setTeams] = useState<Team[]>([
    {
      id: 't1',
      name: 'Sand Stormers',
      city: 'Muskiz',
      division: 'Amateur',
      paymentStatus: 'PENDING', // Changed to PENDING for testing purposes
      fee: 150,
      players: [
        { 
          id: 'p1', name: 'Marcus Johnson', number: 10, verified: true, 
          avatarUrl: 'https://i.pravatar.cc/150?u=1', dniStatus: 'APPROVED', insuranceStatus: 'EMPTY'
        }
      ]
    },
    {
      id: 't2',
      name: 'Beach Kings',
      city: 'Bilbao',
      division: 'Elite',
      paymentStatus: 'PENDING',
      fee: 250,
      players: []
    }
  ]);

  // Matches Data
  const [matches, setMatches] = useState<Match[]>([
     { id: 'm1', time: '10:00', court: 'Central', teamA: 'Sand Stormers', teamB: 'Dune Kings', scoreA: 2, scoreB: 0, status: 'FINISHED', round: 'Quarter Final' },
  ]);

  // Functions to modify state
  const addTeam = (team: Team) => {
    setTeams([...teams, team]);
    setCurrentView(View.TEAM); // Redirect to manager after registration
  };

  const updateTeam = (updatedTeam: Team) => {
    setTeams(prev => prev.map(t => t.id === updatedTeam.id ? updatedTeam : t));
  };

  const updateMatches = (newMatches: Match[]) => {
      setMatches(newMatches);
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