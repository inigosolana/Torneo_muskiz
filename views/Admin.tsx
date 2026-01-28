import React, { useState, useMemo } from 'react';
import { Team, Match, CategoryLimits, MatchReport, PlayerStat, SiteContent, Sponsor, GalleryItem } from '../types';
import { generateBracketAI } from '../services/geminiService';

interface AdminProps {
    teams: Team[];
    onUpdateTeam: (team: Team) => void;
    matches: Match[];
    onUpdateMatches: (matches: Match[]) => void;
    categoryLimits: CategoryLimits;
    onUpdateLimits: (limits: CategoryLimits) => void;
    content: SiteContent;
    onUpdateContent: (content: SiteContent) => void;
}

export const Admin: React.FC<AdminProps> = ({ teams, onUpdateTeam, matches, onUpdateMatches, categoryLimits, onUpdateLimits, content, onUpdateContent }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  
  // Generator State
  const [generatingBracket, setGeneratingBracket] = useState(false);
  const [genConfig, setGenConfig] = useState({
      startTime: '09:00',
      endTime: '21:00',
      intervalMins: 30,
      courtsInput: 'Pista Central, Pista 2, Pista 3',
      lunchBreak: true,
      customPrompt: 'Crea 2 grupos de 4 equipos para la fase de grupos Amateur y una liguilla única para Elite.'
  });

  // Acta Management State
  const [selectedMatchForReport, setSelectedMatchForReport] = useState<Match | null>(null);
  const [reportMode, setReportMode] = useState<'DIGITAL' | 'IMAGE'>('DIGITAL');
  
  // Main Navigation Tabs
  const [activeTab, setActiveTab] = useState<'verification' | 'competition' | 'teams' | 'cms'>('verification');
  // Competition Sub-tabs
  const [compSubTab, setCompSubTab] = useState<'calendar' | 'results' | 'standings'>('calendar');

  // CMS Helper State
  const [newSponsor, setNewSponsor] = useState<Partial<Sponsor>>({ name: '', tier: 'Silver', logoUrl: 'star' });
  const [newGalleryItem, setNewGalleryItem] = useState<Partial<GalleryItem>>({ title: '', url: 'https://picsum.photos/600/400', year: 2026 });

  // --- Standings Calculation (Moved up) ---
  const standings = useMemo(() => {
      const stats: Record<string, { name: string, played: number, won: number, lost: number, gf: number, ga: number, points: number }> = {};
      
      teams.forEach(t => {
          stats[t.name] = { name: t.name, played: 0, won: 0, lost: 0, gf: 0, ga: 0, points: 0 };
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

  // --- Auth Logic ---
  const handleLogin = (e: React.FormEvent) => {
      e.preventDefault();
      if (passwordInput === 'admin123') {
          setIsAuthenticated(true);
      } else {
          alert("Contraseña incorrecta");
      }
  };

  const handleVerify = (teamId: string, playerId: string, type: 'dni' | 'insurance', status: 'APPROVED' | 'REJECTED') => {
      const team = teams.find(t => t.id === teamId);
      if (team) {
          const updatedPlayers = team.players.map(p => {
              if (p.id === playerId) {
                  return { ...p, [type === 'dni' ? 'dniStatus' : 'insuranceStatus']: status };
              }
              return p;
          });
          onUpdateTeam({ ...team, players: updatedPlayers });
      }
  };

  const handleManualPayment = (team: Team) => {
      if (confirm(`¿Marcar a ${team.name} como PAGADO (Efectivo/Transferencia)?`)) {
          onUpdateTeam({ ...team, paymentStatus: 'PAID', paymentMethod: 'MANUAL' });
      }
  };

  const handleAdminLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, team: Team) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = (ev) => {
              onUpdateTeam({ ...team, logoUrl: ev.target?.result as string });
          };
          reader.readAsDataURL(file);
      }
  };

  // --- CMS Logic Helpers ---
  const handleAddSponsor = () => {
      if (!newSponsor.name) return;
      onUpdateContent({
          ...content,
          sponsors: [...content.sponsors, { ...newSponsor, id: Date.now().toString() } as Sponsor]
      });
      setNewSponsor({ name: '', tier: 'Silver', logoUrl: 'star' });
  };

  const handleDeleteSponsor = (id: string) => {
      onUpdateContent({
          ...content,
          sponsors: content.sponsors.filter(s => s.id !== id)
      });
  };

  const handleAddGalleryItem = () => {
      if (!newGalleryItem.title) return;
      onUpdateContent({
          ...content,
          gallery: [...content.gallery, { ...newGalleryItem, id: Date.now().toString() } as GalleryItem]
      });
      setNewGalleryItem({ title: '', url: 'https://picsum.photos/600/400', year: 2026 });
  };

  const handleDeleteGalleryItem = (id: string) => {
      onUpdateContent({
          ...content,
          gallery: content.gallery.filter(g => g.id !== id)
      });
  };

  const handleVenueFeatureChange = (idx: number, val: string) => {
      const newFeatures = [...content.venue.features];
      newFeatures[idx] = val;
      onUpdateContent({
          ...content,
          venue: { ...content.venue, features: newFeatures }
      });
  };

  // --- Generator Logic ---
  const handleGenerateBracket = async () => {
      setGeneratingBracket(true);
      const courts = genConfig.courtsInput.split(',').map(s => s.trim());
      
      const newMatches = await generateBracketAI(teams, {
          startTime: genConfig.startTime,
          endTime: genConfig.endTime,
          intervalMins: genConfig.intervalMins,
          courts: courts,
          lunchBreak: genConfig.lunchBreak,
          customPrompt: genConfig.customPrompt
      });

      if (newMatches.length > 0) {
          onUpdateMatches(newMatches);
          alert(`¡Calendario Generado! ${newMatches.length} partidos creados siguiendo tus instrucciones.`);
      } else {
          alert("Error generando el cuadro. Intenta simplificar el prompt.");
      }
      setGeneratingBracket(false);
  };

  const updateMatchScore = (matchId: string, scoreA: string, scoreB: string) => {
      const updatedMatches = matches.map(m => {
          if (m.id === matchId) {
              return {
                  ...m,
                  scoreA: scoreA === '' ? null : parseInt(scoreA),
                  scoreB: scoreB === '' ? null : parseInt(scoreB),
                  status: (scoreA !== '' && scoreB !== '') ? 'FINISHED' as const : 'SCHEDULED' as const
              };
          }
          return m;
      });
      onUpdateMatches(updatedMatches);
  };

  // --- Report (Acta) Logic ---
  const openReportModal = (match: Match) => {
      if (!match.report) {
          const teamAObj = teams.find(t => t.name === match.teamA);
          const teamBObj = teams.find(t => t.name === match.teamB);
          
          const initialStats: PlayerStat[] = [];
          teamAObj?.players.forEach(p => initialStats.push({ playerId: p.id, goals: 0, yellowCards: 0, redCards: 0 }));
          teamBObj?.players.forEach(p => initialStats.push({ playerId: p.id, goals: 0, yellowCards: 0, redCards: 0 }));

          const tempMatch = {
              ...match,
              report: {
                  type: 'DIGITAL' as const,
                  playerStats: initialStats,
                  imageUri: ''
              }
          };
          setSelectedMatchForReport(tempMatch);
          setReportMode('DIGITAL');
      } else {
          setSelectedMatchForReport(match);
          setReportMode(match.report.type);
      }
  };

  const saveReport = () => {
      if (!selectedMatchForReport) return;
      const updatedMatches = matches.map(m => m.id === selectedMatchForReport.id ? selectedMatchForReport : m);
      onUpdateMatches(updatedMatches);
      setSelectedMatchForReport(null);
  };

  const updatePlayerStat = (playerId: string, field: Exclude<keyof PlayerStat, 'playerId'>, delta: number) => {
      if (!selectedMatchForReport?.report?.playerStats) return;

      const newStats = selectedMatchForReport.report.playerStats.map(stat => {
          if (stat.playerId === playerId) {
              return { ...stat, [field]: Math.max(0, stat[field] + delta) };
          }
          return stat;
      });

      const teamAObj = teams.find(t => t.name === selectedMatchForReport.teamA);
      const teamBObj = teams.find(t => t.name === selectedMatchForReport.teamB);

      let newScoreA = 0;
      let newScoreB = 0;

      newStats.forEach(stat => {
          const isTeamA = teamAObj?.players.some(p => p.id === stat.playerId);
          const isTeamB = teamBObj?.players.some(p => p.id === stat.playerId);
          if (isTeamA) newScoreA += stat.goals;
          if (isTeamB) newScoreB += stat.goals;
      });

      setSelectedMatchForReport({
          ...selectedMatchForReport,
          scoreA: newScoreA,
          scoreB: newScoreB,
          status: 'FINISHED',
          report: {
              ...selectedMatchForReport.report!,
              playerStats: newStats
          }
      });
  };

  const handleReportImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && selectedMatchForReport) {
          const reader = new FileReader();
          reader.onload = (ev) => {
              setSelectedMatchForReport({
                  ...selectedMatchForReport,
                  report: {
                      ...selectedMatchForReport.report!,
                      type: 'IMAGE',
                      imageUri: ev.target?.result as string
                  }
              });
              setReportMode('IMAGE');
          };
          reader.readAsDataURL(file);
      }
  };

  const allPlayers = teams.flatMap(t => t.players.map(p => ({ ...p, teamName: t.name, teamId: t.id })));
  const pendingCount = allPlayers.filter(p => p.dniStatus === 'PENDING' || p.insuranceStatus === 'PENDING').length;
  const totalTeams = teams.length;
  const paidTeams = teams.filter(t => t.paymentStatus === 'PAID').length;
  const pendingPaymentTeams = teams.filter(t => t.paymentStatus === 'PENDING').length;
  const totalRevenue = teams.filter(t => t.paymentStatus === 'PAID').reduce((sum, t) => sum + t.fee, 0);

  if (!isAuthenticated) {
      return (
          <div className="min-h-screen bg-slate-50 dark:bg-background-dark flex items-center justify-center p-4 animate-in zoom-in duration-300">
              <div className="bg-white dark:bg-surface-dark p-8 rounded-2xl shadow-2xl max-w-md w-full border border-slate-200 dark:border-white/10 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-purple-500 to-primary"></div>
                  <div className="text-center mb-8">
                      <div className="size-20 bg-slate-100 dark:bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400 border border-slate-200 dark:border-white/10">
                          <span className="material-symbols-outlined text-4xl">lock</span>
                      </div>
                      <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Acceso Organizador</h2>
                      <p className="text-slate-500 text-sm mt-2">Área restringida para la gestión del torneo.</p>
                  </div>
                  <form onSubmit={handleLogin} className="space-y-4">
                      <div>
                          <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Contraseña Maestra</label>
                          <input 
                              type="password" 
                              value={passwordInput}
                              onChange={(e) => setPasswordInput(e.target.value)}
                              className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-background-dark dark:text-white focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                              placeholder="••••••••"
                              autoFocus
                          />
                      </div>
                      <button type="submit" className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity shadow-lg">
                          Entrar al Panel
                      </button>
                  </form>
                  <div className="mt-6 text-center">
                      <p className="text-xs text-slate-400">Contraseña demo: <span className="font-mono font-bold">admin123</span></p>
                  </div>
              </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-background-light/5 p-6 animate-in fade-in">
        <div className="max-w-[1600px] mx-auto grid grid-cols-12 gap-6">
            {/* Sidebar */}
            <div className="col-span-2 hidden lg:block space-y-2">
                <div className="bg-white p-4 rounded-xl shadow-sm mb-6 flex items-center gap-3 border border-slate-100">
                    <div className="size-10 bg-primary rounded-full flex items-center justify-center text-background-dark font-bold">
                        <span className="material-symbols-outlined">admin_panel_settings</span>
                    </div>
                    <div>
                        <h3 className="font-bold text-sm">Organizador</h3>
                        <p className="text-xs text-slate-500">Panel de Control</p>
                    </div>
                </div>
                <button 
                    onClick={() => setActiveTab('verification')} 
                    className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors ${activeTab === 'verification' ? 'bg-primary/10 text-primary-dark border border-primary/20' : 'text-slate-500 hover:bg-white border border-transparent'}`}
                >
                    <span className="material-symbols-outlined text-lg">fact_check</span> Verificación
                </button>
                <button 
                    onClick={() => setActiveTab('teams')} 
                    className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors ${activeTab === 'teams' ? 'bg-primary/10 text-primary-dark border border-primary/20' : 'text-slate-500 hover:bg-white border border-transparent'}`}
                >
                    <span className="material-symbols-outlined text-lg">groups</span> Equipos y Pagos
                </button>
                <button 
                    onClick={() => setActiveTab('competition')} 
                    className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors ${activeTab === 'competition' ? 'bg-primary/10 text-primary-dark border border-primary/20' : 'text-slate-500 hover:bg-white border border-transparent'}`}
                >
                    <span className="material-symbols-outlined text-lg">trophy</span> Competición
                </button>
                 <button 
                    onClick={() => setActiveTab('cms')} 
                    className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors ${activeTab === 'cms' ? 'bg-primary/10 text-primary-dark border border-primary/20' : 'text-slate-500 hover:bg-white border border-transparent'}`}
                >
                    <span className="material-symbols-outlined text-lg">edit_note</span> Editor Web
                </button>
                <button 
                    onClick={() => setIsAuthenticated(false)}
                    className="w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 text-sm font-medium text-red-500 hover:bg-red-50 mt-12 transition-colors"
                >
                    <span className="material-symbols-outlined text-lg">logout</span> Salir
                </button>
            </div>

            {/* Main Content */}
            <div className="col-span-12 lg:col-span-10 space-y-6">
                
                {/* --- VERIFICATION TAB --- */}
                {activeTab === 'verification' && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-bold text-lg text-slate-800">Verificación de Documentos</h3>
                            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-1 rounded-full">Pendientes: {pendingCount}</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 font-medium uppercase text-xs">
                                    <tr>
                                        <th className="px-6 py-4">Jugador</th>
                                        <th className="px-6 py-4">Equipo</th>
                                        <th className="px-6 py-4">DNI</th>
                                        <th className="px-6 py-4">Seguro</th>
                                        <th className="px-6 py-4 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {allPlayers.map(player => (
                                        <tr key={player.id} className="hover:bg-slate-50/50">
                                            <td className="px-6 py-4 font-bold text-slate-800 flex items-center gap-3">
                                                <div className="size-8 rounded-full bg-slate-200 overflow-hidden">
                                                    {player.avatarUrl && <img src={player.avatarUrl} className="w-full h-full object-cover" />}
                                                </div>
                                                {player.name}
                                            </td>
                                            <td className="px-6 py-4 text-slate-600">
                                                {player.teamName}
                                            </td>
                                            <td className="px-6 py-4">
                                                {player.dniStatus === 'PENDING' ? (
                                                    <div className="flex gap-2">
                                                        <button onClick={() => handleVerify(player.teamId, player.id, 'dni', 'APPROVED')} className="text-green-500 hover:bg-green-50 p-1 rounded"><span className="material-symbols-outlined">check</span></button>
                                                        <button onClick={() => handleVerify(player.teamId, player.id, 'dni', 'REJECTED')} className="text-red-500 hover:bg-red-50 p-1 rounded"><span className="material-symbols-outlined">close</span></button>
                                                    </div>
                                                ) : (
                                                    <span className={`text-xs font-bold px-2 py-1 rounded ${player.dniStatus === 'APPROVED' ? 'bg-green-100 text-green-700' : player.dniStatus === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-400'}`}>
                                                        {player.dniStatus}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                {player.insuranceStatus === 'PENDING' ? (
                                                    <div className="flex gap-2">
                                                        <button onClick={() => handleVerify(player.teamId, player.id, 'insurance', 'APPROVED')} className="text-green-500 hover:bg-green-50 p-1 rounded"><span className="material-symbols-outlined">check</span></button>
                                                        <button onClick={() => handleVerify(player.teamId, player.id, 'insurance', 'REJECTED')} className="text-red-500 hover:bg-red-50 p-1 rounded"><span className="material-symbols-outlined">close</span></button>
                                                    </div>
                                                ) : (
                                                    <span className={`text-xs font-bold px-2 py-1 rounded ${player.insuranceStatus === 'APPROVED' ? 'bg-green-100 text-green-700' : player.insuranceStatus === 'REJECTED' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-400'}`}>
                                                        {player.insuranceStatus}
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {/* --- TEAMS TAB --- */}
                {activeTab === 'teams' && (
                     <div className="space-y-6">
                         {/* Stats Summary */}
                         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                             <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                 <p className="text-xs text-slate-500 uppercase font-bold mb-1">Total Equipos</p>
                                 <p className="text-2xl font-black text-slate-800">{totalTeams}</p>
                             </div>
                             <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                 <p className="text-xs text-slate-500 uppercase font-bold mb-1">Pagados</p>
                                 <p className="text-2xl font-black text-green-500">{paidTeams}</p>
                             </div>
                             <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                 <p className="text-xs text-slate-500 uppercase font-bold mb-1">Pendientes</p>
                                 <p className="text-2xl font-black text-amber-500">{pendingPaymentTeams}</p>
                             </div>
                             <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                 <p className="text-xs text-slate-500 uppercase font-bold mb-1">Recaudado</p>
                                 <p className="text-2xl font-black text-slate-800">{totalRevenue}€</p>
                             </div>
                         </div>

                         {/* Limits Config */}
                         <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                            <h3 className="font-bold text-lg text-slate-800 mb-4">Límites de Equipos por Categoría</h3>
                            <div className="grid grid-cols-3 gap-6">
                                {Object.entries(categoryLimits).map(([cat, limit]) => (
                                    <div key={cat}>
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">{cat}</label>
                                        <div className="flex items-center gap-2">
                                            <input 
                                                type="number" 
                                                value={limit}
                                                onChange={(e) => onUpdateLimits({...categoryLimits, [cat]: parseInt(e.target.value) || 0})}
                                                className="w-full border border-slate-200 rounded px-3 py-2"
                                            />
                                            <span className="text-xs text-slate-400 whitespace-nowrap">
                                                Actual: {teams.filter(t => t.division === cat).length}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                         </div>

                         {/* Payments Table */}
                         <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                            <div className="p-6 border-b border-slate-100">
                                <h3 className="font-bold text-lg text-slate-800">Estado de Pagos e Inscripciones</h3>
                            </div>
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-500 font-medium uppercase text-xs">
                                    <tr>
                                        <th className="px-6 py-4">Equipo</th>
                                        <th className="px-6 py-4">Categoría</th>
                                        <th className="px-6 py-4">Total</th>
                                        <th className="px-6 py-4">Estado Pago</th>
                                        <th className="px-6 py-4 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {teams.map(team => (
                                        <tr key={team.id} className="hover:bg-slate-50/50">
                                            <td className="px-6 py-4 font-bold text-slate-800">
                                                <div className="flex items-center gap-2">
                                                    <label className="cursor-pointer relative group size-8 rounded-full overflow-hidden border border-slate-200">
                                                        <input type="file" className="hidden" accept="image/*" onChange={(e) => handleAdminLogoUpload(e, team)} />
                                                        {team.logoUrl ? (
                                                            <img src={team.logoUrl} className="w-full h-full object-cover" alt="Logo" />
                                                        ) : (
                                                            <div className="w-full h-full bg-slate-100 flex items-center justify-center">
                                                                <span className="material-symbols-outlined text-xs text-slate-400">image</span>
                                                            </div>
                                                        )}
                                                        <div className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center">
                                                             <span className="material-symbols-outlined text-white text-xs">edit</span>
                                                        </div>
                                                    </label>
                                                    {team.name}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">{team.division}</td>
                                            <td className="px-6 py-4 font-mono">{team.fee}€</td>
                                            <td className="px-6 py-4">
                                                {team.paymentStatus === 'PAID' ? (
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded w-fit">PAGADO</span>
                                                        <span className="text-[10px] text-slate-400 mt-1">{team.paymentMethod || 'CARD'}</span>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded">PENDIENTE</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                {team.paymentStatus === 'PENDING' && (
                                                    <button 
                                                        onClick={() => handleManualPayment(team)}
                                                        className="text-blue-600 hover:text-blue-800 text-xs font-bold border border-blue-200 px-3 py-1 rounded hover:bg-blue-50 transition-colors"
                                                    >
                                                        Marcar Pagado (Manual)
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                         </div>
                     </div>
                )}

                {/* --- CMS TAB (NEW) --- */}
                {activeTab === 'cms' && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 space-y-6">
                        <div className="border-b border-slate-100 pb-4">
                            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">edit_note</span> Editor de Contenido Web
                            </h3>
                            <p className="text-slate-500 text-sm">Gestiona todos los textos, imágenes, patrocinadores y multimedia de la web.</p>
                        </div>
                        
                        <div className="grid gap-6">
                            {/* Hero Section */}
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                <h4 className="font-bold text-slate-700 mb-4 uppercase text-xs flex items-center gap-2">
                                    <span className="material-symbols-outlined text-base">home</span> Página de Inicio (Hero)
                                </h4>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Título Principal</label>
                                        <input 
                                            type="text" 
                                            value={content.heroTitle}
                                            onChange={(e) => onUpdateContent({...content, heroTitle: e.target.value})}
                                            className="w-full border border-slate-300 rounded-lg px-3 py-2"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Subtítulo</label>
                                        <textarea 
                                            value={content.heroSubtitle}
                                            onChange={(e) => onUpdateContent({...content, heroSubtitle: e.target.value})}
                                            className="w-full border border-slate-300 rounded-lg px-3 py-2 h-20"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Info Section */}
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                <h4 className="font-bold text-slate-700 mb-4 uppercase text-xs flex items-center gap-2">
                                    <span className="material-symbols-outlined text-base">info</span> Información e Historia
                                </h4>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Título Sección</label>
                                        <input 
                                            type="text" 
                                            value={content.aboutTitle}
                                            onChange={(e) => onUpdateContent({...content, aboutTitle: e.target.value})}
                                            className="w-full border border-slate-300 rounded-lg px-3 py-2"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Texto Historia</label>
                                        <textarea 
                                            value={content.aboutText}
                                            onChange={(e) => onUpdateContent({...content, aboutText: e.target.value})}
                                            className="w-full border border-slate-300 rounded-lg px-3 py-2 h-32"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">URL Imagen</label>
                                        <input 
                                            type="text" 
                                            value={content.aboutImageUrl}
                                            onChange={(e) => onUpdateContent({...content, aboutImageUrl: e.target.value})}
                                            className="w-full border border-slate-300 rounded-lg px-3 py-2"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Venue Section */}
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                <h4 className="font-bold text-slate-700 mb-4 uppercase text-xs flex items-center gap-2">
                                    <span className="material-symbols-outlined text-base">location_on</span> La Sede
                                </h4>
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Título Sede</label>
                                        <input 
                                            type="text" 
                                            value={content.venue.title}
                                            onChange={(e) => onUpdateContent({...content, venue: { ...content.venue, title: e.target.value }})}
                                            className="w-full border border-slate-300 rounded-lg px-3 py-2"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Descripción</label>
                                        <textarea 
                                            value={content.venue.description}
                                            onChange={(e) => onUpdateContent({...content, venue: { ...content.venue, description: e.target.value }})}
                                            className="w-full border border-slate-300 rounded-lg px-3 py-2 h-20"
                                        />
                                    </div>
                                     <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Características (Puntos clave)</label>
                                        {content.venue.features.map((feature, i) => (
                                            <input 
                                                key={i}
                                                type="text" 
                                                value={feature}
                                                onChange={(e) => handleVenueFeatureChange(i, e.target.value)}
                                                className="w-full border border-slate-300 rounded-lg px-3 py-2 mb-2"
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>

                             {/* Socials Section */}
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                <h4 className="font-bold text-slate-700 mb-4 uppercase text-xs flex items-center gap-2">
                                    <span className="material-symbols-outlined text-base">share</span> Redes Sociales
                                </h4>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Instagram Handle</label>
                                        <input type="text" value={content.socials.instagram.handle} onChange={(e) => onUpdateContent({...content, socials: { ...content.socials, instagram: { ...content.socials.instagram, handle: e.target.value } }})} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Twitter Handle</label>
                                        <input type="text" value={content.socials.twitter.handle} onChange={(e) => onUpdateContent({...content, socials: { ...content.socials, twitter: { ...content.socials.twitter, handle: e.target.value } }})} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">TikTok Handle</label>
                                        <input type="text" value={content.socials.tiktok.handle} onChange={(e) => onUpdateContent({...content, socials: { ...content.socials, tiktok: { ...content.socials.tiktok, handle: e.target.value } }})} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1">YouTube Name</label>
                                        <input type="text" value={content.socials.youtube.handle} onChange={(e) => onUpdateContent({...content, socials: { ...content.socials, youtube: { ...content.socials.youtube, handle: e.target.value } }})} className="w-full border border-slate-300 rounded-lg px-3 py-2" />
                                    </div>
                                </div>
                            </div>

                            {/* Sponsors Management */}
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                <h4 className="font-bold text-slate-700 mb-4 uppercase text-xs flex items-center gap-2">
                                    <span className="material-symbols-outlined text-base">handshake</span> Patrocinadores
                                </h4>
                                <div className="mb-4 flex gap-2 items-end">
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Nombre</label>
                                        <input type="text" value={newSponsor.name} onChange={(e) => setNewSponsor({...newSponsor, name: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Nuevo Patrocinador" />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Logo URL / Icono</label>
                                        <input type="text" value={newSponsor.logoUrl} onChange={(e) => setNewSponsor({...newSponsor, logoUrl: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="https://... o 'star'" />
                                    </div>
                                    <div className="w-32">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Nivel</label>
                                        <select value={newSponsor.tier} onChange={(e) => setNewSponsor({...newSponsor, tier: e.target.value as any})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm">
                                            <option value="Platinum">Platinum</option>
                                            <option value="Gold">Gold</option>
                                            <option value="Silver">Silver</option>
                                            <option value="Collaborator">Colab</option>
                                        </select>
                                    </div>
                                    <button onClick={handleAddSponsor} className="bg-primary text-background-dark px-4 py-2 rounded-lg font-bold hover:opacity-90">Añadir</button>
                                </div>
                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                    {content.sponsors.map(sponsor => (
                                        <div key={sponsor.id} className="flex items-center justify-between bg-white p-3 rounded border border-slate-100">
                                            <div className="flex items-center gap-3">
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${sponsor.tier === 'Platinum' ? 'bg-purple-100 text-purple-700' : sponsor.tier === 'Gold' ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-600'}`}>{sponsor.tier}</span>
                                                <span className="text-sm font-medium">{sponsor.name}</span>
                                            </div>
                                            <button onClick={() => handleDeleteSponsor(sponsor.id)} className="text-red-400 hover:text-red-600"><span className="material-symbols-outlined text-sm">delete</span></button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                             {/* Gallery Management */}
                             <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
                                <h4 className="font-bold text-slate-700 mb-4 uppercase text-xs flex items-center gap-2">
                                    <span className="material-symbols-outlined text-base">photo_library</span> Galería Multimedia
                                </h4>
                                <div className="mb-4 flex gap-2 items-end">
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Título Foto</label>
                                        <input type="text" value={newGalleryItem.title} onChange={(e) => setNewGalleryItem({...newGalleryItem, title: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="Título" />
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">URL Imagen</label>
                                        <input type="text" value={newGalleryItem.url} onChange={(e) => setNewGalleryItem({...newGalleryItem, url: e.target.value})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" placeholder="https://..." />
                                    </div>
                                    <div className="w-24">
                                        <label className="block text-xs font-bold text-slate-500 mb-1">Año</label>
                                        <input type="number" value={newGalleryItem.year} onChange={(e) => setNewGalleryItem({...newGalleryItem, year: parseInt(e.target.value)})} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
                                    </div>
                                    <button onClick={handleAddGalleryItem} className="bg-primary text-background-dark px-4 py-2 rounded-lg font-bold hover:opacity-90">Añadir</button>
                                </div>
                                <div className="space-y-2 max-h-60 overflow-y-auto">
                                    {content.gallery.map(item => (
                                        <div key={item.id} className="flex items-center justify-between bg-white p-3 rounded border border-slate-100">
                                            <div className="flex items-center gap-3">
                                                <img src={item.url} alt="" className="size-8 rounded object-cover bg-slate-100" />
                                                <span className="text-sm font-medium">{item.title}</span>
                                                <span className="text-xs text-slate-400">({item.year})</span>
                                            </div>
                                            <button onClick={() => handleDeleteGalleryItem(item.id)} className="text-red-400 hover:text-red-600"><span className="material-symbols-outlined text-sm">delete</span></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- COMPETITION DASHBOARD --- */}
                {activeTab === 'competition' && (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                        
                        {/* Sub-tabs */}
                        <div className="flex border-b border-slate-200 mb-6">
                            <button 
                                onClick={() => setCompSubTab('calendar')}
                                className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${compSubTab === 'calendar' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                            >
                                <span className="material-symbols-outlined text-lg">calendar_month</span> Calendario
                            </button>
                            <button 
                                onClick={() => setCompSubTab('results')}
                                className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${compSubTab === 'results' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                            >
                                <span className="material-symbols-outlined text-lg">scoreboard</span> Resultados y Actas
                            </button>
                            <button 
                                onClick={() => setCompSubTab('standings')}
                                className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${compSubTab === 'standings' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                            >
                                <span className="material-symbols-outlined text-lg">leaderboard</span> Clasificación
                            </button>
                        </div>

                        {/* SUB-TAB CONTENT */}
                        <div className="min-h-[400px]">
                            
                            {/* 1. CALENDAR VIEW (With Advanced AI Generator) */}
                            {compSubTab === 'calendar' && (
                                <div className="space-y-8">
                                    {/* AI Generator Control Panel */}
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                                        <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-purple-600">psychology</span>
                                            Configuración de Generación IA
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                                            <div>
                                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Horario</label>
                                                <div className="flex items-center gap-2">
                                                    <input type="time" value={genConfig.startTime} onChange={e => setGenConfig({...genConfig, startTime: e.target.value})} className="border rounded px-2 py-1 text-sm w-full"/>
                                                    <span>a</span>
                                                    <input type="time" value={genConfig.endTime} onChange={e => setGenConfig({...genConfig, endTime: e.target.value})} className="border rounded px-2 py-1 text-sm w-full"/>
                                                </div>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Intervalo (mins)</label>
                                                <input type="number" value={genConfig.intervalMins} onChange={e => setGenConfig({...genConfig, intervalMins: parseInt(e.target.value)})} className="border rounded px-2 py-1 text-sm w-full" step="5"/>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Parada Comida</label>
                                                <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                                    <input type="checkbox" checked={genConfig.lunchBreak} onChange={e => setGenConfig({...genConfig, lunchBreak: e.target.checked})} className="rounded text-primary focus:ring-primary"/>
                                                    Respetar 13:00 - 14:00
                                                </label>
                                            </div>
                                        </div>
                                        <div className="mb-4">
                                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Pistas Disponibles (separar por comas)</label>
                                            <input type="text" value={genConfig.courtsInput} onChange={e => setGenConfig({...genConfig, courtsInput: e.target.value})} className="border rounded px-3 py-2 text-sm w-full"/>
                                        </div>
                                        <div className="mb-4">
                                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Instrucciones para la IA (Prompt)</label>
                                            <textarea 
                                                value={genConfig.customPrompt} 
                                                onChange={e => setGenConfig({...genConfig, customPrompt: e.target.value})}
                                                className="w-full border rounded px-3 py-2 text-sm h-20 resize-none"
                                                placeholder="Ej: Crea una liguilla de todos contra todos. Haz que los equipos Amateur jueguen por la mañana."
                                            ></textarea>
                                        </div>
                                        <button 
                                            onClick={handleGenerateBracket}
                                            disabled={generatingBracket}
                                            className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                                        >
                                            {generatingBracket ? (
                                                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                                            ) : (
                                                <span className="material-symbols-outlined">auto_awesome</span>
                                            )}
                                            {generatingBracket ? 'Pensando y Organizando...' : 'Generar Calendario Inteligente'}
                                        </button>
                                    </div>

                                    {/* Matches List */}
                                    <div className="grid gap-4">
                                        {matches.length === 0 ? (
                                            <div className="text-center text-slate-400 py-8">No hay partidos. Usa el generador arriba.</div>
                                        ) : (
                                            matches.map(match => (
                                                <div key={match.id} className="flex flex-col sm:flex-row justify-between items-center p-4 border border-slate-100 rounded-lg bg-slate-50/50">
                                                    <div className="flex flex-col mb-2 sm:mb-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="bg-primary/10 text-primary-dark text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider">{match.round || 'Partido'}</span>
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-700">{match.time}</span>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-6">
                                                        <span className="font-bold text-slate-800">{match.teamA}</span>
                                                        <span className="text-xs text-slate-400">vs</span>
                                                        <span className="font-bold text-slate-800">{match.teamB}</span>
                                                    </div>
                                                    <div className="text-xs text-slate-500 flex items-center gap-1">
                                                        <span className="material-symbols-outlined text-sm">location_on</span> {match.court}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* 2. RESULTS VIEW (With Actas) */}
                            {compSubTab === 'results' && (
                                <div className="grid gap-4">
                                    <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg mb-4 flex items-start gap-3">
                                        <span className="material-symbols-outlined text-blue-500">info</span>
                                        <p className="text-sm text-blue-700">Edita el resultado rápido o pulsa en "Acta" para subir foto o gestionar goles por jugador.</p>
                                    </div>
                                    {matches.map(match => (
                                        <div key={match.id} className="flex flex-col md:flex-row justify-between items-center p-4 border border-slate-200 rounded-lg hover:shadow-sm transition-shadow bg-white">
                                            <div className="flex flex-col w-full md:w-auto mb-4 md:mb-0">
                                                <span className="text-xs text-slate-400 font-mono">{match.round} - {match.time}</span>
                                                <span className="text-[10px] text-slate-400">{match.court}</span>
                                            </div>
                                            
                                            <div className="flex items-center gap-4 justify-center flex-1">
                                                <span className="font-bold text-slate-800 w-32 text-right truncate">{match.teamA}</span>
                                                <div className="flex items-center gap-2">
                                                    <input 
                                                        type="number" 
                                                        className="w-14 text-center text-lg font-bold bg-slate-50 border border-slate-300 rounded-lg p-1"
                                                        value={match.scoreA ?? ''}
                                                        onChange={(e) => updateMatchScore(match.id, e.target.value, match.scoreB?.toString() || '')}
                                                        placeholder="-"
                                                    />
                                                    <span>:</span>
                                                    <input 
                                                        type="number" 
                                                        className="w-14 text-center text-lg font-bold bg-slate-50 border border-slate-300 rounded-lg p-1"
                                                        value={match.scoreB ?? ''}
                                                        onChange={(e) => updateMatchScore(match.id, match.scoreA?.toString() || '', e.target.value)}
                                                        placeholder="-"
                                                    />
                                                </div>
                                                <span className="font-bold text-slate-800 w-32 truncate">{match.teamB}</span>
                                            </div>

                                            <div className="w-full md:w-auto flex justify-end gap-2 mt-4 md:mt-0">
                                                <button 
                                                    onClick={() => openReportModal(match)}
                                                    className={`px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 border transition-colors ${match.report ? 'bg-green-50 text-green-700 border-green-200' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-primary hover:text-primary'}`}
                                                >
                                                    <span className="material-symbols-outlined text-sm">description</span>
                                                    {match.report ? 'Ver Acta' : 'Crear Acta'}
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* 3. STANDINGS VIEW */}
                            {compSubTab === 'standings' && (
                                <div className="overflow-hidden rounded-lg border border-slate-200">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                            <tr>
                                                <th className="px-6 py-4 w-10">Pos</th>
                                                <th className="px-6 py-4">Equipo</th>
                                                <th className="px-4 py-4 text-center">PJ</th>
                                                <th className="px-4 py-4 text-center">PG</th>
                                                <th className="px-4 py-4 text-center">GF</th>
                                                <th className="px-4 py-4 text-center">GC</th>
                                                <th className="px-4 py-4 text-center">DG</th>
                                                <th className="px-6 py-4 text-right font-black">PTS</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {standings.map((team, index) => (
                                                <tr key={team.name} className={`hover:bg-slate-50/50 ${index < 4 ? 'bg-green-50/30' : ''}`}>
                                                    <td className="px-6 py-4 font-mono text-slate-400">{index + 1}</td>
                                                    <td className="px-6 py-4 font-bold text-slate-800">{team.name}</td>
                                                    <td className="px-4 py-4 text-center">{team.played}</td>
                                                    <td className="px-4 py-4 text-center font-medium text-green-600">{team.won}</td>
                                                    <td className="px-4 py-4 text-center text-slate-500">{team.gf}</td>
                                                    <td className="px-4 py-4 text-center text-slate-500">{team.ga}</td>
                                                    <td className="px-4 py-4 text-center font-mono text-slate-500">{team.gf - team.ga}</td>
                                                    <td className="px-6 py-4 text-right font-black text-lg text-slate-900">{team.points}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>

        {/* --- ACTA MODAL --- */}
        {selectedMatchForReport && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                    <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                        <div>
                            <h3 className="font-bold text-lg text-slate-800">Acta del Partido</h3>
                            <p className="text-xs text-slate-500">{selectedMatchForReport.teamA} vs {selectedMatchForReport.teamB}</p>
                        </div>
                        <button onClick={() => setSelectedMatchForReport(null)} className="p-2 hover:bg-slate-200 rounded-full"><span className="material-symbols-outlined">close</span></button>
                    </div>
                    
                    <div className="flex border-b border-slate-200">
                        <button 
                            onClick={() => setReportMode('DIGITAL')}
                            className={`flex-1 py-3 text-sm font-bold border-b-2 ${reportMode === 'DIGITAL' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-500'}`}
                        >
                            Acta Digital (Online)
                        </button>
                        <button 
                            onClick={() => setReportMode('IMAGE')}
                            className={`flex-1 py-3 text-sm font-bold border-b-2 ${reportMode === 'IMAGE' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-500'}`}
                        >
                            Subir Foto Acta
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                        {reportMode === 'DIGITAL' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {[selectedMatchForReport.teamA, selectedMatchForReport.teamB].map((teamName, idx) => {
                                    const team = teams.find(t => t.name === teamName);
                                    if (!team) return <div key={idx} className="text-red-500">Equipo no encontrado</div>;

                                    return (
                                        <div key={team.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                            <h4 className="font-bold text-lg border-b border-slate-100 pb-2 mb-4 text-center">{team.name}</h4>
                                            <div className="space-y-3">
                                                {team.players.length === 0 && <p className="text-sm text-slate-400 text-center italic">Sin jugadores registrados.</p>}
                                                {team.players.map(player => {
                                                    const stat = selectedMatchForReport.report?.playerStats?.find(s => s.playerId === player.id) || { goals: 0 };
                                                    return (
                                                        <div key={player.id} className="flex justify-between items-center text-sm">
                                                            <div className="flex items-center gap-2">
                                                                <span className="bg-slate-100 text-slate-500 text-xs font-mono px-1.5 py-0.5 rounded">#{player.number}</span>
                                                                <span className="font-medium text-slate-700">{player.name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-3">
                                                                <button onClick={() => updatePlayerStat(player.id, 'goals', -1)} className="text-slate-400 hover:text-red-500"><span className="material-symbols-outlined text-lg">remove_circle</span></button>
                                                                <span className="font-bold w-4 text-center">{stat.goals}</span>
                                                                <button onClick={() => updatePlayerStat(player.id, 'goals', 1)} className="text-primary hover:text-primary-dark"><span className="material-symbols-outlined text-lg">add_circle</span></button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full min-h-[300px] border-2 border-dashed border-slate-300 rounded-xl bg-white">
                                {selectedMatchForReport.report?.imageUri ? (
                                    <div className="relative w-full h-full p-2">
                                        <img src={selectedMatchForReport.report.imageUri} alt="Acta" className="w-full h-full object-contain rounded-lg" />
                                        <button onClick={() => setSelectedMatchForReport({...selectedMatchForReport, report: {...selectedMatchForReport.report!, imageUri: ''}})} className="absolute top-4 right-4 bg-red-500 text-white p-2 rounded-full shadow-lg"><span className="material-symbols-outlined">delete</span></button>
                                    </div>
                                ) : (
                                    <>
                                        <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">add_a_photo</span>
                                        <p className="text-slate-500 font-medium mb-4">Sube una foto clara del acta arbitral</p>
                                        <input type="file" accept="image/*" onChange={handleReportImageUpload} className="text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-bold file:bg-primary file:text-background-dark hover:file:bg-primary-dark cursor-pointer" />
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                    
                    <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3">
                        <button onClick={() => setSelectedMatchForReport(null)} className="px-6 py-2 rounded-lg font-bold text-slate-500 hover:bg-slate-100">Cancelar</button>
                        <button onClick={saveReport} className="px-6 py-2 rounded-lg font-bold bg-primary text-background-dark hover:opacity-90 shadow-lg">Guardar Acta</button>
                    </div>
                </div>
            </div>
        )}
    </div>
  );
};