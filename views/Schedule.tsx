import React, { useState, useMemo } from 'react';
import { searchRules } from '../services/geminiService';
import { Match, Team } from '../types';

interface ScheduleProps {
    matches: Match[];
    teams: Team[];
}

export const Schedule: React.FC<ScheduleProps> = ({ matches, teams }) => {
  const [activeTab, setActiveTab] = useState<'info' | 'calendar' | 'results' | 'standings'>('info');
  const [infoSubTab, setInfoSubTab] = useState<'general' | 'rules'>('general');
  
  const [showMapModal, setShowMapModal] = useState(false);
  const [mapQuery, setMapQuery] = useState('');
  const [mapResult, setMapResult] = useState<{text: string, links: any[]} | null>(null);

  const handleSearchVenue = async () => {
      setMapResult(null);
      const res = await searchRules(`¿Dónde está la cancha ${mapQuery || 'más cercana'}?`);
      setMapResult(res);
  };

  // --- Calculated Standings (Client Side View) ---
  const standings = useMemo(() => {
      const stats: Record<string, { name: string, played: number, won: number, lost: number, gf: number, ga: number, points: number, logoUrl?: string }> = {};
      
      teams.forEach(t => {
          stats[t.name] = { name: t.name, logoUrl: t.logoUrl, played: 0, won: 0, lost: 0, gf: 0, ga: 0, points: 0 };
      });
      matches.forEach(m => {
          if (!stats[m.teamA]) stats[m.teamA] = { name: m.teamA, played: 0, won: 0, lost: 0, gf: 0, ga: 0, points: 0 };
          if (!stats[m.teamB]) stats[m.teamB] = { name: m.teamB, played: 0, won: 0, lost: 0, gf: 0, ga: 0, points: 0 };
      });

      matches.forEach(m => {
          if (m.status === 'FINISHED' && m.scoreA !== null && m.scoreB !== null) {
              stats[m.teamA].played += 1;
              stats[m.teamA].gf += m.scoreA;
              stats[m.teamA].ga += m.scoreB;
              
              stats[m.teamB].played += 1;
              stats[m.teamB].gf += m.scoreB;
              stats[m.teamB].ga += m.scoreA;

              if (m.scoreA > m.scoreB) {
                  stats[m.teamA].won += 1;
                  stats[m.teamA].points += 3;
                  stats[m.teamB].lost += 1;
              } else if (m.scoreB > m.scoreA) {
                  stats[m.teamB].won += 1;
                  stats[m.teamB].points += 3;
                  stats[m.teamA].lost += 1;
              } else {
                  stats[m.teamA].points += 1;
                  stats[m.teamB].points += 1;
              }
          }
      });

      return Object.values(stats).sort((a, b) => b.points - a.points || (b.gf - b.ga) - (a.gf - a.ga));
  }, [matches, teams]);

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark py-12 px-4 sm:px-6 lg:px-8 animate-in fade-in">
        <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
                <div>
                    <h2 className="text-4xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Competición</h2>
                    <p className="text-slate-500 mt-2">Toda la información, resultados y normativas del torneo.</p>
                </div>
                
                {/* Find Court Button */}
                <button 
                    onClick={() => setShowMapModal(true)}
                    className="bg-white dark:bg-surface-dark text-slate-900 dark:text-white px-6 py-3 rounded-xl font-bold shadow-sm border border-slate-200 dark:border-white/10 flex items-center gap-2 hover:border-primary transition-colors"
                >
                    <span className="material-symbols-outlined text-primary">map</span>
                    Mapa Canchas
                </button>
            </div>

            {/* Main Tabs */}
            <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 overflow-hidden">
                 <div className="flex border-b border-slate-200 dark:border-white/10 overflow-x-auto no-scrollbar">
                    <button 
                        onClick={() => setActiveTab('info')}
                        className={`px-8 py-4 font-bold text-sm uppercase tracking-wide whitespace-nowrap transition-colors border-b-2 ${activeTab === 'info' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        Información
                    </button>
                    <button 
                        onClick={() => setActiveTab('calendar')}
                        className={`px-8 py-4 font-bold text-sm uppercase tracking-wide whitespace-nowrap transition-colors border-b-2 ${activeTab === 'calendar' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        Calendario
                    </button>
                    <button 
                        onClick={() => setActiveTab('results')}
                        className={`px-8 py-4 font-bold text-sm uppercase tracking-wide whitespace-nowrap transition-colors border-b-2 ${activeTab === 'results' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        Resultados
                    </button>
                    <button 
                        onClick={() => setActiveTab('standings')}
                        className={`px-8 py-4 font-bold text-sm uppercase tracking-wide whitespace-nowrap transition-colors border-b-2 ${activeTab === 'standings' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        Clasificación
                    </button>
                </div>

                <div className="p-6 md:p-8 min-h-[400px]">
                    
                    {/* --- TAB: INFO (With Sub-tabs) --- */}
                    {activeTab === 'info' && (
                        <div className="space-y-8 animate-in fade-in">
                            {/* Sub-tabs Pills */}
                            <div className="flex justify-center mb-8">
                                <div className="bg-slate-100 dark:bg-white/5 p-1 rounded-full flex gap-1">
                                    <button 
                                        onClick={() => setInfoSubTab('general')}
                                        className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${infoSubTab === 'general' ? 'bg-white dark:bg-surface-dark shadow text-primary' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        General
                                    </button>
                                    <button 
                                        onClick={() => setInfoSubTab('rules')}
                                        className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${infoSubTab === 'rules' ? 'bg-white dark:bg-surface-dark shadow text-primary' : 'text-slate-500 hover:text-slate-700'}`}
                                    >
                                        Reglamento
                                    </button>
                                </div>
                            </div>

                            {infoSubTab === 'general' ? (
                                <div className="animate-in slide-in-from-left-4 fade-in duration-300 space-y-8">
                                    <div className="bg-primary/5 border-l-4 border-primary p-6 rounded-r-lg">
                                        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Bienvenidos al Torneo Muskizko Udala 2026</h3>
                                        <p className="text-slate-600 dark:text-slate-300">
                                            Celebramos una nueva edición del mejor balonmano playa de la costa. Este año contamos con más de 30 equipos en tres categorías diferentes.
                                            La competición se desarrollará en la Arena de Muskiz del 25 al 27 de Julio.
                                        </p>
                                    </div>
                                    
                                    <div className="grid md:grid-cols-2 gap-6">
                                        <div className="bg-slate-50 dark:bg-white/5 p-6 rounded-xl border border-slate-200 dark:border-white/10">
                                            <h4 className="font-bold flex items-center gap-2 mb-4 text-slate-900 dark:text-white">
                                                <span className="material-symbols-outlined text-primary">schedule</span> Horarios Generales
                                            </h4>
                                            <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
                                                <li className="flex justify-between border-b border-slate-200 dark:border-white/10 pb-2">
                                                    <span>Viernes 25</span> <span className="font-bold">16:00 - 21:00</span>
                                                </li>
                                                <li className="flex justify-between border-b border-slate-200 dark:border-white/10 pb-2">
                                                    <span>Sábado 26</span> <span className="font-bold">09:00 - 21:00</span>
                                                </li>
                                                <li className="flex justify-between pb-2">
                                                    <span>Domingo 27</span> <span className="font-bold">09:00 - 15:00 (Finales)</span>
                                                </li>
                                            </ul>
                                        </div>
                                        <div className="bg-slate-50 dark:bg-white/5 p-6 rounded-xl border border-slate-200 dark:border-white/10">
                                            <h4 className="font-bold flex items-center gap-2 mb-4 text-slate-900 dark:text-white">
                                                <span className="material-symbols-outlined text-secondary">location_on</span> Localización
                                            </h4>
                                            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                                                Playa de la Arena, Muskiz. Zona deportiva habilitada junto al aparcamiento principal.
                                            </p>
                                            <button onClick={() => setShowMapModal(true)} className="text-primary text-sm font-bold underline">Ver en el mapa</button>
                                        </div>
                                    </div>

                                    {/* --- SOCIAL MEDIA SECTION --- */}
                                    <div className="bg-white dark:bg-surface-dark p-6 rounded-xl border border-slate-200 dark:border-white/10 shadow-sm">
                                        <h4 className="font-bold flex items-center gap-2 mb-6 text-slate-900 dark:text-white border-b border-slate-100 dark:border-white/5 pb-4">
                                            <span className="material-symbols-outlined text-pink-500">favorite</span> Sigue el torneo en Redes
                                        </h4>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <a href="#" className="flex flex-col items-center p-4 bg-slate-50 dark:bg-white/5 rounded-xl hover:bg-pink-50 dark:hover:bg-pink-900/10 transition-colors group border border-transparent hover:border-pink-200">
                                                <div className="size-10 rounded-full bg-pink-100 text-pink-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                                    <span className="material-symbols-outlined">photo_camera</span>
                                                </div>
                                                <span className="font-bold text-sm text-slate-700 dark:text-slate-300">Instagram</span>
                                                <span className="text-xs text-slate-400">@muskizbeach</span>
                                            </a>
                                            <a href="#" className="flex flex-col items-center p-4 bg-slate-50 dark:bg-white/5 rounded-xl hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors group border border-transparent hover:border-blue-200">
                                                <div className="size-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                                    <span className="material-symbols-outlined">alternate_email</span>
                                                </div>
                                                <span className="font-bold text-sm text-slate-700 dark:text-slate-300">Twitter / X</span>
                                                <span className="text-xs text-slate-400">@MuskizTorneo</span>
                                            </a>
                                            <a href="#" className="flex flex-col items-center p-4 bg-slate-50 dark:bg-white/5 rounded-xl hover:bg-slate-200 dark:hover:bg-white/10 transition-colors group border border-transparent hover:border-slate-300">
                                                <div className="size-10 rounded-full bg-slate-900 text-white flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                                    <span className="material-symbols-outlined">music_note</span>
                                                </div>
                                                <span className="font-bold text-sm text-slate-700 dark:text-slate-300">TikTok</span>
                                                <span className="text-xs text-slate-400">@handball_muskiz</span>
                                            </a>
                                            <a href="#" className="flex flex-col items-center p-4 bg-slate-50 dark:bg-white/5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors group border border-transparent hover:border-red-200">
                                                <div className="size-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                                                    <span className="material-symbols-outlined">play_circle</span>
                                                </div>
                                                <span className="font-bold text-sm text-slate-700 dark:text-slate-300">YouTube</span>
                                                <span className="text-xs text-slate-400">Canal Oficial</span>
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="max-w-4xl mx-auto space-y-6 animate-in slide-in-from-right-4 fade-in duration-300">
                                    <h3 className="text-2xl font-black text-slate-900 dark:text-white border-b border-slate-200 dark:border-white/10 pb-4">
                                        Reglamento Oficial del Torneo
                                    </h3>
                                    
                                    <div className="space-y-8">
                                        <section>
                                            <h4 className="text-lg font-bold text-primary mb-3">1. Composición de Equipos</h4>
                                            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                                                Cada equipo podrá inscribir un máximo de 12 jugadores y un mínimo de 6. 
                                                En pista deberá haber siempre 4 jugadores (3 de campo + 1 portero/peto).
                                                Es obligatorio que todos los jugadores estén debidamente inscritos y con el seguro tramitado antes del primer partido.
                                            </p>
                                        </section>

                                        <section>
                                            <h4 className="text-lg font-bold text-primary mb-3">2. Puntuación y Partidos</h4>
                                            <ul className="list-disc pl-5 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                                                <li>Los partidos se dividen en 2 sets de 10 minutos.</li>
                                                <li>Si un equipo gana ambos sets, gana el partido 2-0.</li>
                                                <li>Si hay empate (1-1 en sets), se jugará una tanda de "Shoot-out" (contraataques) al mejor de 5 lanzamientos.</li>
                                                <li>Goles espectaculares (giro 360º, fly, portero) valen 2 puntos. Gol normal vale 1 punto.</li>
                                            </ul>
                                        </section>

                                        <section>
                                            <h4 className="text-lg font-bold text-primary mb-3">3. Fair Play y Sanciones</h4>
                                            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                                                Se aplicará el reglamento oficial de la IHF. La organización se reserva el derecho de expulsar del torneo a cualquier jugador o equipo que muestre actitudes violentas, antideportivas o irrespetuosas hacia árbitros, rivales o público.
                                            </p>
                                        </section>

                                        <section>
                                            <h4 className="text-lg font-bold text-primary mb-3">4. Equipación</h4>
                                            <p className="text-slate-600 dark:text-slate-300 text-sm leading-relaxed">
                                                Todos los jugadores del mismo equipo deben llevar camisetas del mismo color. Se recomienda el uso de calcetines de arena, aunque se permite jugar descalzo.
                                            </p>
                                        </section>

                                        <div className="bg-slate-100 dark:bg-white/5 p-4 rounded-lg text-xs text-slate-500 italic text-center mt-8">
                                            Para cualquier duda no contemplada en este resumen, se consultará con el comité de competición disponible en la mesa central.
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- TAB: CALENDAR --- */}
                    {activeTab === 'calendar' && (
                        <div className="space-y-6">
                            {matches.filter(m => m.status !== 'FINISHED').length === 0 ? (
                                <div className="text-center py-12">
                                    <span className="material-symbols-outlined text-6xl text-slate-200 mb-4">event_available</span>
                                    <p className="text-slate-500 font-medium">No hay partidos pendientes programados.</p>
                                </div>
                            ) : (
                                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                    {matches.filter(m => m.status !== 'FINISHED').map(match => (
                                        <div key={match.id} className="bg-slate-50 dark:bg-white/5 rounded-xl p-4 border border-slate-200 dark:border-white/5 relative overflow-hidden group hover:border-primary/50 transition-colors">
                                            {match.status === 'LIVE' && <div className="absolute top-0 right-0 bg-red-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg animate-pulse">EN JUEGO</div>}
                                            <div className="flex items-center gap-2 mb-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                                <span className="material-symbols-outlined text-sm">schedule</span> {match.time}
                                                <span className="w-1 h-1 bg-slate-400 rounded-full"></span>
                                                <span>{match.court}</span>
                                            </div>
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <span className="font-bold text-slate-900 dark:text-white text-lg">{match.teamA}</span>
                                                </div>
                                                <div className="w-full h-px bg-slate-200 dark:bg-white/10"></div>
                                                <div className="flex justify-between items-center">
                                                    <span className="font-bold text-slate-900 dark:text-white text-lg">{match.teamB}</span>
                                                </div>
                                            </div>
                                            <div className="mt-3 pt-2 border-t border-slate-200 dark:border-white/10 text-xs text-slate-400 font-mono text-center">
                                                {match.round || 'Fase Regular'}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- TAB: RESULTS --- */}
                    {activeTab === 'results' && (
                        <div className="space-y-4">
                             {matches.filter(m => m.status === 'FINISHED').length === 0 ? (
                                <div className="text-center py-12">
                                    <span className="material-symbols-outlined text-6xl text-slate-200 mb-4">scoreboard</span>
                                    <p className="text-slate-500 font-medium">Aún no hay resultados registrados.</p>
                                </div>
                            ) : (
                                <div className="grid gap-4 md:grid-cols-2">
                                    {matches.filter(m => m.status === 'FINISHED').map(match => (
                                        <div key={match.id} className="bg-white dark:bg-surface-dark rounded-xl border border-slate-200 dark:border-white/10 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                                            <div className="flex flex-col sm:items-start text-center sm:text-left">
                                                <span className="text-xs font-bold text-slate-400 uppercase mb-1">{match.round}</span>
                                                <span className="text-xs text-slate-500">{match.time} | {match.court}</span>
                                            </div>
                                            <div className="flex items-center gap-6 flex-1 justify-center">
                                                <span className={`font-bold text-lg ${match.scoreA! > match.scoreB! ? 'text-slate-900 dark:text-white' : 'text-slate-500'}`}>{match.teamA}</span>
                                                <div className="bg-slate-100 dark:bg-white/10 px-4 py-2 rounded-lg font-mono text-xl font-black text-slate-900 dark:text-white tracking-widest border border-slate-200 dark:border-white/5">
                                                    {match.scoreA}-{match.scoreB}
                                                </div>
                                                <span className={`font-bold text-lg ${match.scoreB! > match.scoreA! ? 'text-slate-900 dark:text-white' : 'text-slate-500'}`}>{match.teamB}</span>
                                            </div>
                                            {match.report && (
                                                <button className="text-primary text-xs font-bold uppercase flex items-center gap-1 hover:underline">
                                                    <span className="material-symbols-outlined text-sm">description</span> Ver Acta
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- TAB: STANDINGS --- */}
                    {activeTab === 'standings' && (
                        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-white/10">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 dark:bg-white/5 text-slate-500 font-bold uppercase text-xs">
                                    <tr>
                                        <th className="px-6 py-4 w-10">Pos</th>
                                        <th className="px-6 py-4">Equipo</th>
                                        <th className="px-4 py-4 text-center">PJ</th>
                                        <th className="px-4 py-4 text-center">PG</th>
                                        <th className="px-4 py-4 text-center">PP</th>
                                        <th className="px-4 py-4 text-center hidden sm:table-cell">GF</th>
                                        <th className="px-4 py-4 text-center hidden sm:table-cell">GC</th>
                                        <th className="px-4 py-4 text-center">DG</th>
                                        <th className="px-6 py-4 text-right font-black">PTS</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-slate-800 dark:text-slate-200">
                                    {standings.map((team, index) => (
                                        <tr key={team.name} className={`hover:bg-slate-50/50 dark:hover:bg-white/5 transition-colors ${index < 4 ? 'bg-green-50/30 dark:bg-green-900/10' : ''}`}>
                                            <td className="px-6 py-4 font-mono text-slate-400 font-bold">{index + 1}</td>
                                            <td className="px-6 py-4 font-bold flex items-center gap-3">
                                                {team.logoUrl ? (
                                                    <img src={team.logoUrl} alt={team.name} className="size-8 rounded-full object-cover bg-white" />
                                                ) : (
                                                    <div className="size-8 rounded-full bg-slate-200 dark:bg-white/10 flex items-center justify-center text-xs font-bold">{team.name.substring(0,2).toUpperCase()}</div>
                                                )}
                                                {team.name}
                                            </td>
                                            <td className="px-4 py-4 text-center">{team.played}</td>
                                            <td className="px-4 py-4 text-center font-bold text-green-600 dark:text-green-400">{team.won}</td>
                                            <td className="px-4 py-4 text-center text-red-500 dark:text-red-400">{team.lost}</td>
                                            <td className="px-4 py-4 text-center text-slate-500 hidden sm:table-cell">{team.gf}</td>
                                            <td className="px-4 py-4 text-center text-slate-500 hidden sm:table-cell">{team.ga}</td>
                                            <td className="px-4 py-4 text-center font-mono">{team.gf - team.ga}</td>
                                            <td className="px-6 py-4 text-right font-black text-xl">{team.points}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="p-4 bg-slate-50 dark:bg-white/5 text-center text-xs text-slate-500 border-t border-slate-200 dark:border-white/10">
                                * Sistema de puntuación: 3 Puntos por Victoria, 1 por Empate, 0 por Derrota.
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>

        {/* Map Modal */}
        {showMapModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                <div className="bg-white dark:bg-surface-dark w-full max-w-lg rounded-2xl p-6 shadow-2xl">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-slate-900 dark:text-white">Búsqueda de Canchas</h3>
                        <button onClick={() => setShowMapModal(false)}><span className="material-symbols-outlined text-slate-400 hover:text-white">close</span></button>
                    </div>
                    <div className="mb-4">
                        <div className="flex gap-2">
                             <input 
                                type="text" 
                                value={mapQuery}
                                onChange={(e) => setMapQuery(e.target.value)}
                                placeholder="ej. ¿Dónde está la Cancha 2?"
                                className="flex-1 bg-slate-100 dark:bg-background-dark border-none rounded-lg px-4 py-2 text-slate-900 dark:text-white"
                             />
                             <button onClick={handleSearchVenue} className="bg-primary text-background-dark px-4 rounded-lg font-bold">Buscar</button>
                        </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-background-dark p-4 rounded-lg min-h-[100px]">
                        {mapResult ? (
                            <div>
                                <p className="text-sm text-slate-700 dark:text-slate-300 mb-2">{mapResult.text}</p>
                                {mapResult.links.length > 0 && (
                                    <ul className="space-y-1">
                                        {mapResult.links.map((link, i) => (
                                            <li key={i}>
                                                <a href={link.uri} target="_blank" rel="noreferrer" className="text-xs text-primary underline flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-[10px]">open_in_new</span>
                                                    {link.title}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ) : (
                            <p className="text-slate-400 text-sm text-center pt-8">Pregunta sobre localizaciones o instalaciones cercanas.</p>
                        )}
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};