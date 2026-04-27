import React, { useState, useMemo, useEffect } from 'react';
import { Team, Match, CategoryLimits, MatchReport, PlayerStat } from '../types';
import { generateBracketAI, generateSocialMediaPost } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';
import { resizeAndCompressImage } from '../utils/imageProcessor';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

interface AdminProps {
    teams: Team[];
    onUpdateTeam: (team: Team) => void;
    matches: Match[];
    onUpdateMatches: (matches: Match[]) => void;
    categoryLimits: CategoryLimits;
    onUpdateLimits: (limits: CategoryLimits) => void;
    onGenerateBrackets: () => void;
}

export const Admin: React.FC<AdminProps> = ({ teams, onUpdateTeam, matches, onUpdateMatches, categoryLimits, onUpdateLimits, onGenerateBrackets }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [adminEmail, setAdminEmail] = useState('');
    const [passwordInput, setPasswordInput] = useState('');
    const [authLoading, setAuthLoading] = useState(true);

    // Restore session on mount
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setIsAuthenticated(!!session?.user);
            setAuthLoading(false);
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
            setIsAuthenticated(!!session?.user);
        });
        return () => subscription.unsubscribe();
    }, []);

    // Generator State
    const [generatingBracket, setGeneratingBracket] = useState(false);
    const [genConfig, setGenConfig] = useState({
        startTime: '09:00',
        endTime: '21:00',
        intervalMins: 30,
        courtsInput: 'Pista Central, Pista 2, Pista 3',
        lunchBreak: true,
        customPrompt: 'Crea 2 grupos de 4 equipos para la fase de grupos Cadete y una liguilla única para Senior.'
    });

    // Acta Management State
    const [selectedMatchForReport, setSelectedMatchForReport] = useState<Match | null>(null);
    const [reportMode, setReportMode] = useState<'DIGITAL' | 'IMAGE'>('DIGITAL');

    // Social Media Post State
    const [socialPostModal, setSocialPostModal] = useState<{ show: boolean, content: string, generating: boolean }>({ show: false, content: '', generating: false });

    const handleGenerateSocialPost = async (match: Match) => {
        setSocialPostModal({ show: true, content: '', generating: true });
        const postContent = await generateSocialMediaPost(match);
        setSocialPostModal({ show: true, content: postContent, generating: false });
    };

    const handleExcelImport = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);

                const newMatches: Match[] = data.map((row: any, i) => ({
                    id: `m-excel-${Date.now()}-${i}`,
                    time: row['Hora'] || row['Time'] || '00:00',
                    court: row['Pista'] || row['Court'] || 'Pista Central',
                    teamA: row['Equipo A'] || row['Team A'] || 'TBD',
                    teamB: row['Equipo B'] || row['Team B'] || 'TBD',
                    scoreA: null,
                    scoreB: null,
                    status: 'SCHEDULED',
                    round: row['Ronda'] || row['Fase'] || row['Round'] || ''
                }));

                onUpdateMatches([...matches, ...newMatches]);
                toast.success(`${newMatches.length} partidos importados correctamente`);
            } catch (error) {
                console.error("Error importando Excel:", error);
                toast.error("Error al procesar el archivo Excel. Verifica el formato.");
            }
        };
        reader.readAsBinaryString(file);
    };

    // Main Navigation Tabs
    const [activeTab, setActiveTab] = useState<'verification' | 'competition' | 'teams'>('verification');
    // Competition Sub-tabs
    const [compSubTab, setCompSubTab] = useState<'calendar' | 'results' | 'standings'>('calendar');

    // --- Team Filters ---
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [filterSex, setFilterSex] = useState<string>('all');
    const [filterPayment, setFilterPayment] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterTeam, setFilterTeam] = useState<string>('');

    const filteredTeams = useMemo(() => {
        return teams.filter(team => {
            const matchCategory = filterCategory === 'all' || team.division.includes(filterCategory);
            const matchSex = filterSex === 'all' || team.division.includes(filterSex);
            const matchPayment = filterPayment === 'all' || team.paymentStatus === filterPayment;
            const matchStatus = filterStatus === 'all' || team.status === filterStatus;
            return matchCategory && matchSex && matchPayment && matchStatus;
        });
    }, [teams, filterCategory, filterSex, filterPayment, filterStatus]);

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
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setAuthLoading(true);
        const { data: authData, error } = await supabase.auth.signInWithPassword({ email: adminEmail, password: passwordInput });
        
        if (error) {
            toast.error('Credenciales incorrectas. Acceso denegado.');
        } else if (authData.user) {
            // Role Validation
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', authData.user.id)
                .single();

            if (profile?.role !== 'staff') {
                await supabase.auth.signOut();
                toast.error('Acceso denegado: Esta cuenta no tiene permisos de Staff.');
                setIsAuthenticated(false);
            } else {
                setIsAuthenticated(true);
                toast.success('Bienvenido al panel de administración.');
            }
        }
        setAuthLoading(false);
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        localStorage.clear();
        sessionStorage.clear();
        setIsAuthenticated(false);
        toast.success('Sesión cerrada correctamente');
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
        if (confirm(`¿Confirmar validación de pago para ${team.name}?`)) {
            onUpdateTeam({ ...team, paymentStatus: 'PAID', paymentFeedback: '' });
            toast.success('Pago validado correctamente');
        }
    };

    const handleRejectPayment = (team: Team) => {
        const reason = window.prompt(`Motivo del rechazo para ${team.name}:`, 'El justificante no es válido o no se ve bien.');
        if (reason) {
            onUpdateTeam({ ...team, paymentStatus: 'PENDING', paymentFeedback: reason, status: 'rejected' });
            toast.info('Pago rechazado con feedback enviado al responsable.');
        }
    };

    const handleApproveTeam = (team: Team) => {
        if (confirm(`¿Aprobar definitivamente al equipo ${team.name}? Esto creará su cuenta de acceso y enviará el email de bienvenida.`)) {
            onUpdateTeam({ ...team, status: 'approved', paymentStatus: 'PAID', paymentFeedback: '' });
            toast.success('Equipo aprobado. Iniciando alta de usuario y envío de email.');
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
            toast.success(`¡Calendario Generado! ${newMatches.length} partidos creados siguiendo tus instrucciones.`);
        } else {
            toast.error("Error generando el cuadro. Intenta simplificar el prompt.");
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

    const handleReportImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && selectedMatchForReport) {
            try {
                const compressedBlob = await resizeAndCompressImage(file);
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
                reader.readAsDataURL(compressedBlob);
            } catch (error) {
                console.error("Error comprimiendo acta:", error);
                toast.error("Hubo un error procesando el acta. Asegúrate de que es una imagen.");
            }
        }
    };

    const allPlayers = teams.flatMap(t => t.players.map(p => ({ ...p, teamName: t.name, teamId: t.id, division: t.division })));
    const pendingCount = allPlayers.filter(p => p.dniStatus === 'PENDING' || p.insuranceStatus === 'PENDING').length;
    const totalTeams = teams.length;
    const paidTeams = teams.filter(t => t.paymentStatus === 'PAID').length;
    const pendingPaymentTeams = teams.filter(t => t.paymentStatus === 'PENDING').length;
    const totalRevenue = teams.filter(t => t.paymentStatus === 'PAID').reduce((sum, t) => sum + t.fee, 0);

    if (authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
            </div>
        );
    }

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
                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Email</label>
                            <input
                                type="email"
                                value={adminEmail}
                                onChange={(e) => setAdminEmail(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-background-dark dark:text-white focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                                placeholder="admin@torneo.com"
                                autoFocus
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Contraseña</label>
                            <input
                                type="password"
                                value={passwordInput}
                                onChange={(e) => setPasswordInput(e.target.value)}
                                className="w-full px-4 py-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-background-dark dark:text-white focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={authLoading}
                            className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity shadow-lg flex items-center justify-center gap-2"
                        >
                            {authLoading
                                ? <span className="material-symbols-outlined animate-spin">progress_activity</span>
                                : 'Entrar al Panel'
                            }
                        </button>
                    </form>
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
                        onClick={handleLogout}
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
                            <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <div>
                                    <h3 className="font-bold text-lg text-slate-800">Verificación de Documentos</h3>
                                    <p className="text-xs text-slate-500 mt-1">Valida la identidad y el seguro de los jugadores.</p>
                                </div>
                                
                                {/* Filter Bar for Verification */}
                                <div className="flex flex-wrap gap-2">
                                    <input 
                                        type="text"
                                        placeholder="Buscar equipo..."
                                        value={filterTeam}
                                        onChange={(e) => setFilterTeam(e.target.value)}
                                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 outline-none focus:ring-1 focus:ring-primary min-w-[120px]"
                                    />
                                    <select 
                                        value={filterCategory} 
                                        onChange={(e) => setFilterCategory(e.target.value)}
                                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 outline-none focus:ring-1 focus:ring-primary"
                                    >
                                        <option value="all">Categorías</option>
                                        <option value="Senior">Senior</option>
                                        <option value="Juvenil">Juvenil</option>
                                        <option value="Cadete">Cadete</option>
                                        <option value="Infantil">Infantil</option>
                                    </select>

                                    <select 
                                        value={filterSex} 
                                        onChange={(e) => setFilterSex(e.target.value)}
                                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 outline-none focus:ring-1 focus:ring-primary"
                                    >
                                        <option value="all">Sexos</option>
                                        <option value="Masculino">Masculino</option>
                                        <option value="Femenino">Femenino</option>
                                    </select>

                                    <select 
                                        value={filterStatus} 
                                        onChange={(e) => setFilterStatus(e.target.value)}
                                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 outline-none focus:ring-1 focus:ring-primary"
                                    >
                                        <option value="all">Estado (Todos)</option>
                                        <option value="empty">Falta subir</option>
                                        <option value="pending">Solo Pendientes</option>
                                        <option value="approved">Solo Aprobados</option>
                                    </select>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-medium uppercase text-xs">
                                        <tr>
                                            <th className="px-6 py-4">Jugador</th>
                                            <th className="px-6 py-4">Equipo</th>
                                            <th className="px-6 py-4">DNI</th>
                                            <th className="px-6 py-4">Seguro</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {allPlayers
                                            .filter(p => {
                                                const matchTeam = filterTeam === '' || p.teamName.toLowerCase().includes(filterTeam.toLowerCase());
                                                const matchCat = filterCategory === 'all' || p.division?.includes(filterCategory);
                                                const matchSex = filterSex === 'all' || p.division?.includes(filterSex);
                                                const matchStat = filterStatus === 'all' || 
                                                    (filterStatus === 'empty' && (p.dniStatus === 'EMPTY' || p.insuranceStatus === 'EMPTY')) ||
                                                    (filterStatus === 'pending' && (p.dniStatus === 'PENDING' || p.insuranceStatus === 'PENDING')) ||
                                                    (filterStatus === 'approved' && (p.dniStatus === 'APPROVED' && p.insuranceStatus === 'APPROVED'));
                                                return matchTeam && matchCat && matchSex && matchStat;
                                            })
                                            .map(player => (
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
                                                    <div className="flex items-center gap-2">
                                                        {player.dniUrl && (
                                                            <a href={player.dniUrl} target="_blank" rel="noopener noreferrer" className="size-6 bg-slate-100 rounded flex items-center justify-center text-slate-500 hover:bg-primary/20 hover:text-primary transition-all">
                                                                <span className="material-symbols-outlined text-xs">visibility</span>
                                                            </a>
                                                        )}
                                                        {player.dniStatus === 'PENDING' ? (
                                                            <div className="flex gap-1">
                                                                <button onClick={() => handleVerify(player.teamId, player.id, 'dni', 'APPROVED')} className="text-green-500 hover:bg-green-50 p-1 rounded transition-colors"><span className="material-symbols-outlined text-xs">check</span></button>
                                                                <button onClick={() => handleVerify(player.teamId, player.id, 'dni', 'REJECTED')} className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors"><span className="material-symbols-outlined text-xs">close</span></button>
                                                            </div>
                                                        ) : (
                                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                                                                player.dniStatus === 'APPROVED' ? 'bg-green-100 text-green-700' : 
                                                                player.dniStatus === 'REJECTED' ? 'bg-red-100 text-red-700' : 
                                                                player.dniStatus === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                                                                'bg-slate-100 text-slate-400'
                                                            }`}>
                                                                {player.dniStatus === 'EMPTY' || !player.dniStatus ? 'Falta subir' : player.dniStatus}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        {player.insuranceUrl && (
                                                            <a href={player.insuranceUrl} target="_blank" rel="noopener noreferrer" className="size-6 bg-slate-100 rounded flex items-center justify-center text-slate-500 hover:bg-primary/20 hover:text-primary transition-all">
                                                                <span className="material-symbols-outlined text-xs">visibility</span>
                                                            </a>
                                                        )}
                                                        {player.insuranceStatus === 'PENDING' ? (
                                                            <div className="flex gap-1">
                                                                <button onClick={() => handleVerify(player.teamId, player.id, 'insurance', 'APPROVED')} className="text-green-500 hover:bg-green-50 p-1 rounded transition-colors"><span className="material-symbols-outlined text-xs">check</span></button>
                                                                <button onClick={() => handleVerify(player.teamId, player.id, 'insurance', 'REJECTED')} className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors"><span className="material-symbols-outlined text-xs">close</span></button>
                                                            </div>
                                                        ) : (
                                                            <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                                                                player.insuranceStatus === 'APPROVED' ? 'bg-green-100 text-green-700' : 
                                                                player.insuranceStatus === 'REJECTED' ? 'bg-red-100 text-red-700' : 
                                                                player.insuranceStatus === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                                                                'bg-slate-100 text-slate-400'
                                                            }`}>
                                                                {player.insuranceStatus === 'EMPTY' || !player.insuranceStatus ? 'Falta subir' : player.insuranceStatus}
                                                            </span>
                                                        )}
                                                    </div>
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
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                    {Object.entries(categoryLimits).map(([cat, limit]) => (
                                        <div key={cat}>
                                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">{cat}</label>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    value={limit}
                                                    onChange={(e) => onUpdateLimits({ ...categoryLimits, [cat]: parseInt(e.target.value) || 0 })}
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
                                <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <h3 className="font-bold text-lg text-slate-800">Estado de Pagos e Inscripciones</h3>
                                    
                                    {/* Filter Bar */}
                                    <div className="flex flex-wrap gap-2">
                                        <select 
                                            value={filterCategory} 
                                            onChange={(e) => setFilterCategory(e.target.value)}
                                            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 outline-none focus:ring-1 focus:ring-primary"
                                        >
                                            <option value="all">Todas las Categorías</option>
                                            <option value="Senior">Senior</option>
                                            <option value="Juvenil">Juvenil</option>
                                            <option value="Cadete">Cadete</option>
                                            <option value="Infantil">Infantil</option>
                                        </select>

                                        <select 
                                            value={filterSex} 
                                            onChange={(e) => setFilterSex(e.target.value)}
                                            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 outline-none focus:ring-1 focus:ring-primary"
                                        >
                                            <option value="all">Todos los Sexos</option>
                                            <option value="Masculino">Masculino</option>
                                            <option value="Femenino">Femenino</option>
                                        </select>

                                        <select 
                                            value={filterPayment} 
                                            onChange={(e) => setFilterPayment(e.target.value)}
                                            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 outline-none focus:ring-1 focus:ring-primary"
                                        >
                                            <option value="all">Estado Pago (Todos)</option>
                                            <option value="PAID">Pagado</option>
                                            <option value="PENDING">Pendiente</option>
                                        </select>

                                        <select 
                                            value={filterStatus} 
                                            onChange={(e) => setFilterStatus(e.target.value)}
                                            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 outline-none focus:ring-1 focus:ring-primary"
                                        >
                                            <option value="all">Estado Registro (Todos)</option>
                                            <option value="approved">Aprobado</option>
                                            <option value="pending">Pendiente</option>
                                        </select>
                                    </div>
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
                                        {filteredTeams.map(team => (
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
                                                    <div className="flex flex-col gap-1">
                                                        {team.paymentStatus === 'PAID' ? (
                                                            <span className="text-[10px] font-black bg-green-100 text-green-700 px-2 py-0.5 rounded w-fit">PAGADO</span>
                                                        ) : (
                                                            <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded w-fit uppercase">Pendiente Validación</span>
                                                        )}
                                                        <span className="text-[10px] text-slate-500 font-medium">
                                                            {team.paymentMethod === 'TRANSFER' ? 'Transferencia' : (team.paymentMethod === 'CARD' ? 'Tarjeta (Stripe)' : (team.paymentMethod || 'Manual'))}
                                                        </span>
                                                        <div className="mt-1">
                                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${team.status === 'approved' ? 'bg-blue-100 text-blue-700' : team.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-500'}`}>
                                                                {team.status || 'pendiente'}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {team.receiptUrl ? (
                                                            <a
                                                                href={team.receiptUrl}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="size-8 flex items-center justify-center rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition-colors"
                                                                title="Ver justificante"
                                                            >
                                                                <span className="material-symbols-outlined text-sm">description</span>
                                                            </a>
                                                        ) : (
                                                            <div 
                                                                className="size-8 flex items-center justify-center rounded-lg bg-slate-50 text-slate-300 cursor-not-allowed"
                                                                title="Sin justificante subido"
                                                            >
                                                                <span className="material-symbols-outlined text-sm">block</span>
                                                            </div>
                                                        )}
                                                        {team.paymentStatus === 'PENDING' && (
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={() => handleRejectPayment(team)}
                                                                    className="bg-red-50 text-red-500 hover:bg-red-100 text-[10px] font-black px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                                                >
                                                                    <span className="material-symbols-outlined text-xs">close</span>
                                                                    RECHAZAR
                                                                </button>
                                                                <button
                                                                    onClick={() => handleManualPayment(team)}
                                                                    className="bg-green-50 text-green-600 hover:bg-green-100 text-[10px] font-black px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                                                                >
                                                                    <span className="material-symbols-outlined text-xs">payments</span>
                                                                    PAGADO
                                                                </button>
                                                            </div>
                                                        )}
                                                        {team.status !== 'approved' && team.paymentStatus === 'PAID' && (
                                                            <button
                                                                onClick={() => handleApproveTeam(team)}
                                                                className="bg-blue-600 text-white hover:bg-blue-700 text-[10px] font-black px-4 py-1.5 rounded-lg transition-all shadow-lg flex items-center gap-1 animate-pulse-subtle"
                                                            >
                                                                <span className="material-symbols-outlined text-xs">how_to_reg</span>
                                                                APROBAR
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
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
                                            <div className="flex justify-between items-center mb-4">
                                                <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                                    <span className="material-symbols-outlined text-purple-600">psychology</span>
                                                    Configuración de Generación IA
                                                </h4>
                                                <div className="flex gap-2">
                                                    <input
                                                        type="file"
                                                        id="excel-upload"
                                                        className="hidden"
                                                        accept=".xlsx, .xls, .csv"
                                                        onChange={handleExcelImport}
                                                    />
                                                    <label
                                                        htmlFor="excel-upload"
                                                        className="cursor-pointer bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">upload_file</span>
                                                        Importar Excel
                                                    </label>
                                                    {matches.length > 0 && (
                                                        <button
                                                            onClick={() => onUpdateMatches([])}
                                                            className="bg-red-50 text-red-500 hover:bg-red-100 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors border border-red-100"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">delete_sweep</span>
                                                            Limpiar Calendario
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                                                <div>
                                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Horario</label>
                                                    <div className="flex items-center gap-2">
                                                        <input type="time" value={genConfig.startTime} onChange={e => setGenConfig({ ...genConfig, startTime: e.target.value })} className="border rounded px-2 py-1 text-sm w-full" />
                                                        <span>a</span>
                                                        <input type="time" value={genConfig.endTime} onChange={e => setGenConfig({ ...genConfig, endTime: e.target.value })} className="border rounded px-2 py-1 text-sm w-full" />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Intervalo (mins)</label>
                                                    <input type="number" value={genConfig.intervalMins} onChange={e => setGenConfig({ ...genConfig, intervalMins: parseInt(e.target.value) })} className="border rounded px-2 py-1 text-sm w-full" step="5" />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Parada Comida</label>
                                                    <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                                                        <input type="checkbox" checked={genConfig.lunchBreak} onChange={e => setGenConfig({ ...genConfig, lunchBreak: e.target.checked })} className="rounded text-primary focus:ring-primary" />
                                                        Respetar 13:00 - 14:00
                                                    </label>
                                                </div>
                                            </div>
                                            <div className="mb-4">
                                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Pistas Disponibles (separar por comas)</label>
                                                <input type="text" value={genConfig.courtsInput} onChange={e => setGenConfig({ ...genConfig, courtsInput: e.target.value })} className="border rounded px-3 py-2 text-sm w-full" />
                                            </div>
                                            <div className="mb-4">
                                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Instrucciones para la IA (Prompt)</label>
                                                <textarea
                                                    value={genConfig.customPrompt}
                                                    onChange={e => setGenConfig({ ...genConfig, customPrompt: e.target.value })}
                                                    className="w-full border rounded px-3 py-2 text-sm h-20 resize-none"
                                                    placeholder="Ej: Crea una liguilla de todos contra todos. Haz que los equipos Cadete jueguen por la mañana."
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
                                                    {match.status === 'FINISHED' && (
                                                        <button
                                                            onClick={() => handleGenerateSocialPost(match)}
                                                            className="px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 border border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100 transition-colors"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">auto_awesome</span>
                                                            Post IG
                                                        </button>
                                                    )}
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
                                            <button onClick={() => setSelectedMatchForReport({ ...selectedMatchForReport, report: { ...selectedMatchForReport.report!, imageUri: '' } })} className="absolute top-4 right-4 bg-red-500 text-white p-2 rounded-full shadow-lg"><span className="material-symbols-outlined">delete</span></button>
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

            {/* --- SOCIAL POST MODAL --- */}
            {socialPostModal.show && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
                            <h3 className="font-bold text-lg flex items-center gap-2"><span className="material-symbols-outlined">campaign</span> Post para Instagram</h3>
                            <button onClick={() => setSocialPostModal({ show: false, content: '', generating: false })} className="p-2 hover:bg-white/20 rounded-full"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="p-6">
                            {socialPostModal.generating ? (
                                <div className="flex flex-col items-center justify-center py-8">
                                    <span className="material-symbols-outlined animate-spin text-4xl text-purple-600 mb-4">progress_activity</span>
                                    <p className="text-slate-500 font-medium">Buscando inspiración en la arena...</p>
                                </div>
                            ) : (
                                <div>
                                    <textarea className="w-full h-40 p-4 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-purple-500" readOnly value={socialPostModal.content}></textarea>
                                    <button
                                        onClick={() => { navigator.clipboard.writeText(socialPostModal.content); toast.success('¡Copiado!'); }}
                                        className="mt-4 w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 rounded-xl transition-colors flex justify-center items-center gap-2"
                                    >
                                        <span className="material-symbols-outlined">content_copy</span> Copiar Portapapeles
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};