import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Team, Match, CategoryLimits, MatchReport, PlayerStat, Player, CalendarDraft } from '../types';
import { generateBracketAI, generateSocialMediaPost } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';
import { resizeAndCompressImage } from '../utils/imageProcessor';
import { toast } from 'sonner';
import { teamService, matchService } from '../services/teamService';
import * as XLSX from 'xlsx';
import { useTournamentData } from '../context/TournamentDataContext';
import {
    createDefaultCalendarSimulations,
    ensureStableDraftMatchIds,
    fetchCalendarSimulations,
    finalizeMatchesForDatabase,
    saveCalendarSimulations,
    duplicateDraft,
    normalizeCalendarSimulations,
    mergeWeekendDraftMatches,
    WEEKEND_SCHEDULE_DAYS,
} from '../services/tournamentScheduleService';
import { competitionGroupsForDivision, computeStandings } from '../utils/computeStandings';
import {
    buildMuskizDayDraftMatches,
    buildMuskizWeekendDraftsByDay,
    divisionBelongsToScheduleDay,
    getMuskizDayGenDefaults,
    MIN_REAL_MATCHES_PER_TEAM,
} from '../services/muskizScheduleSimulator';
import { SimulationScheduleGridTabs } from '../components/SimulationDayGrid';
import {
    isPlayerRole,
    isPlayerEligibleForMatch,
    memberDocsComplete,
    memberDocsMissing,
    memberDocsPending,
    playerRoleLabel,
    playersEligibleForMatch,
} from '../utils/squadLimits';

/** Plantilla de jugadores para equipos ficticios (stress test / IA). */
function buildFakePlayersForTeam(teamId: string): Player[] {
    const squadSize = 10 + Math.floor(Math.random() * 3);
    const players: Player[] = [];
    for (let i = 1; i <= squadSize; i++) {
        players.push({
            id: `fake-pl-${teamId}-${i}`,
            teamId,
            name: `Jugador ${i}`,
            surnames: `Apellido Ficticio ${i}`,
            number: i,
            verified: true,
            role: 'PLAYER',
            dniStatus: 'APPROVED',
            insuranceStatus: 'APPROVED',
        });
    }
    return players;
}

interface AdminProps {
    onUpdateTeam: (team: Team) => void;
    onUpdateMatches: (matches: Match[]) => void;
    onUpdateLimits: (limits: CategoryLimits) => void;
}

export const Admin: React.FC<AdminProps> = ({ onUpdateTeam, onUpdateMatches, onUpdateLimits }) => {
    const navigate = useNavigate();
    const { teams, matches, categoryLimits, publicMatchesVisible, persistPublicMatchesVisible } = useTournamentData();
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
    const [generatingMuskiz, setGeneratingMuskiz] = useState(false);
    const [muskizLunchEnd, setMuskizLunchEnd] = useState<'14:30' | '15:00'>('14:30');
    const [genConfig, setGenConfig] = useState({
        startTime: '09:00',
        endTime: '21:00',
        intervalMins: 30,
        courtsInput: 'Pista Central, Pista 2, Pista 3',
        lunchBreak: true,
        customPrompt: 'Fase de grupos por categoría y solo la gran final (sin cuartos ni semifinales). Reparte horarios y pistas sin solapes.'
    });

    const [simDrafts, setSimDrafts] = useState<CalendarDraft[]>([]);
    const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
    const [simulationsLoaded, setSimulationsLoaded] = useState(false);
    const [simulationsSaving, setSimulationsSaving] = useState(false);
    const [simulationMode, setSimulationMode] = useState<'REAL' | 'FAKE'>('REAL');
    const [fakeTeamCounts, setFakeCounts] = useState<Record<Team['division'], number>>({
        'Infantil Femenino': 0,
        'Infantil Masculino': 0,
        'Cadete Femenino': 0,
        'Cadete Masculino': 0,
        'Juvenil Femenino': 0,
        'Juvenil Masculino': 0,
        'Senior Femenino': 0,
        'Senior Masculino': 0,
    });

    const [publishDraftAsPublic, setPublishDraftAsPublic] = useState(false);

    const [structureDivision, setStructureDivision] = useState<Team['division']>('Senior Masculino');
    const [standingsDivision, setStandingsDivision] = useState<Team['division']>('Senior Masculino');
    const [standingsGroupFilter, setStandingsGroupFilter] = useState<string>('all');

    // Acta Management State
    const [selectedMatchForReport, setSelectedMatchForReport] = useState<Match | null>(null);
    const [reportMode, setReportMode] = useState<'DIGITAL' | 'IMAGE'>('DIGITAL');

    // Social Media Post State
    const [socialPostModal, setSocialPostModal] = useState<{ show: boolean, content: string, generating: boolean }>({ show: false, content: '', generating: false });

    // Edit Team Modal
    const [editingTeam, setEditingTeam] = useState<Team | null>(null);
    const [editForm, setEditForm] = useState<{
        name: string; city: string; division: string;
        managerName: string; managerEmail: string;
        paymentStatus: string; status: string; fee: number;
    }>({ name: '', city: '', division: '', managerName: '', managerEmail: '', paymentStatus: '', status: '', fee: 0 });

    // Sponsors Management
    const [sponsors, setSponsors] = useState<any[]>([]);
    const [sponsorsLoading, setSponsorsLoading] = useState(false);
    const [newSponsor, setNewSponsor] = useState<{ name: string, tier: string, website_url: string, logo_url?: string }>({ name: '', tier: 'Gold', website_url: '' });
    const [isUploadingLogo, setIsUploadingLogo] = useState(false);

    // Categories Management
    const [categories, setCategories] = useState<any[]>([]);

    const fetchCategories = async () => {
        const { data } = await supabase.from('categories').select('*').order('name');
        if (data) setCategories(data);
    };

    const fetchSponsors = async () => {
        setSponsorsLoading(true);
        const { data, error } = await supabase.from('sponsors').select('*').order('created_at', { ascending: false });
        if (data) setSponsors(data);
        setSponsorsLoading(false);
    };

    useEffect(() => {
        if (isAuthenticated) {
            fetchSponsors();
            fetchCategories();
        }
    }, [isAuthenticated]);

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploadingLogo(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `logos/${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('public-assets')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('public-assets')
                .getPublicUrl(filePath);

            setNewSponsor(prev => ({ ...prev, logo_url: publicUrl }));
            toast.success('Logo subido correctamente');
        } catch (error: any) {
            toast.error('Error al subir logo: ' + error.message);
        } finally {
            setIsUploadingLogo(false);
        }
    };

    const handleAddSponsor = async () => {
        if (!newSponsor.name) {
            toast.error('El nombre es obligatorio');
            return;
        }

        try {
            const { error } = await supabase.from('sponsors').insert([newSponsor]);
            if (error) throw error;
            toast.success('Patrocinador añadido');
            setNewSponsor({ name: '', tier: 'Gold', website_url: '' });
            fetchSponsors();
        } catch (error: any) {
            toast.error('Error al añadir patrocinador: ' + error.message);
        }
    };

    const handleDeleteSponsor = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar este patrocinador?')) return;

        try {
            const { error } = await supabase.from('sponsors').delete().eq('id', id);
            if (error) throw error;
            toast.success('Patrocinador eliminado');
            fetchSponsors();
        } catch (error: any) {
            toast.error('Error al eliminar: ' + error.message);
        }
    };

    const handleGenerateSocialPost = async (match: Match) => {
        setSocialPostModal({ show: true, content: '', generating: true });
        const postContent = await generateSocialMediaPost(match);
        setSocialPostModal({ show: true, content: postContent, generating: false });
    };

    const handleAdminLogoUpload = (e: React.ChangeEvent<HTMLInputElement>, team: Team) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const result = event.target?.result as string;
            onUpdateTeam({ ...team, logoUrl: result });
            toast.success('Escudo actualizado');
        };
        reader.readAsDataURL(file);
    };

    const handleDeleteTeam = async (team: Team) => {
        if (window.confirm(`¿ESTÁS SEGURO? Esta acción es irreversible. Se eliminará al equipo "${team.name}" y a todos sus jugadores.`)) {
            try {
                await teamService.deleteTeam(team.id);
                // Force a re-fetch of teams to update state
                const updatedTeams = await teamService.getTeams();
                // We call onUpdateTeam with a dummy to trigger parent re-render,
                // but actually we need the parent to refresh. Safest approach:
                toast.success(`Equipo "${team.name}" eliminado correctamente.`);
                // Refresh the page data without full reload
                setTimeout(() => window.location.reload(), 500);
            } catch (error: any) {
                toast.error('Error al eliminar equipo: ' + error.message);
            }
        }
    };

    const handleEditTeam = (team: Team) => {
        setEditingTeam(team);
        setEditForm({
            name: team.name,
            city: team.city,
            division: team.division,
            managerName: team.managerName,
            managerEmail: team.managerEmail,
            paymentStatus: team.paymentStatus,
            status: team.status,
            fee: team.fee,
        });
    };

    const handleSaveEdit = async () => {
        if (!editingTeam) return;
        try {
            const updatedTeam: Team = {
                ...editingTeam,
                name: editForm.name,
                city: editForm.city,
                division: editForm.division as Team['division'],
                managerName: editForm.managerName,
                managerEmail: editForm.managerEmail,
                paymentStatus: editForm.paymentStatus as Team['paymentStatus'],
                status: editForm.status as Team['status'],
                fee: editForm.fee,
            };
            onUpdateTeam(updatedTeam);
            setEditingTeam(null);
            toast.success(`Equipo "${editForm.name}" actualizado correctamente.`);
        } catch (error: any) {
            toast.error('Error al actualizar equipo: ' + error.message);
        }
    };

    const handleManualAddTeam = async () => {
        const name = window.prompt('Nombre del equipo:');
        if (!name) return;
        
        const city = window.prompt('Ciudad:', 'Muskiz');
        if (!city) return;

        const division = window.prompt('Categoría (Ej: Senior Masculino):', 'Senior Masculino');
        if (!division) return;

        const managerName = window.prompt('Nombre del Responsable:', 'Admin Manual');
        const managerEmail = window.prompt('Email del Responsable:', 'admin@torneomuskizbmplaya.es');

        const newTeam: Partial<Team> = {
            name,
            city,
            division: division as any,
            managerName: managerName || 'Admin',
            managerEmail: managerEmail || 'admin@torneomuskizbmplaya.es',
            paymentStatus: 'PAID',
            status: 'approved',
            paymentMethod: 'MANUAL',
            fee: 0
        };

        try {
            await teamService.registerTeam(newTeam);
            toast.success('Equipo añadido manualmente');
            window.location.reload();
        } catch (error: any) {
            toast.error('Error al añadir equipo: ' + error.message);
        }
    };

    // Main Navigation Tabs
    const [activeTab, setActiveTab] = useState<'verification' | 'teamRoster' | 'competition' | 'teams' | 'sponsors' | 'categories'>('verification');
    const [rosterSelectedTeamId, setRosterSelectedTeamId] = useState<string | null>(null);
    const [rosterSearch, setRosterSearch] = useState('');
    const [editingPlayerContext, setEditingPlayerContext] = useState<{ team: Team; player: Player } | null>(null);

    useEffect(() => {
        if (activeTab !== 'teamRoster') {
            setRosterSelectedTeamId(null);
        }
    }, [activeTab]);

    // Competition Sub-tabs
    const [compSubTab, setCompSubTab] = useState<'structure' | 'simulations' | 'published' | 'results' | 'standings'>('structure');

    // --- Team Filters ---
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [filterSex, setFilterSex] = useState<string>('all');
    const [filterPayment, setFilterPayment] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterTeam, setFilterTeam] = useState<string>('');
    const [filterVerificationRole, setFilterVerificationRole] = useState<'all' | Player['role']>('all');

    const filteredTeams = useMemo(() => {
        return teams.filter(team => {
            const matchCategory = filterCategory === 'all' || team.division.includes(filterCategory);
            const matchSex = filterSex === 'all' || team.division.includes(filterSex);
            const matchPayment = filterPayment === 'all' || team.paymentStatus === filterPayment;
            const matchStatus = filterStatus === 'all' || team.status === filterStatus;
            return matchCategory && matchSex && matchPayment && matchStatus;
        });
    }, [teams, filterCategory, filterSex, filterPayment, filterStatus]);

    const rosterTeamsFiltered = useMemo(() => {
        let list = teams;
        if (rosterSearch.trim()) {
            const q = rosterSearch.toLowerCase();
            list = list.filter(t =>
                t.name.toLowerCase().includes(q) ||
                t.division.toLowerCase().includes(q)
            );
        }
        return list;
    }, [teams, rosterSearch]);

    const rosterDivisionOrder = useMemo(() => {
        const fromDb = categories.map((c: { name: string }) => c.name);
        const present = new Set(rosterTeamsFiltered.map(t => t.division));
        const ordered = fromDb.filter((n: string) => present.has(n));
        const extras = [...present].filter(d => !fromDb.includes(d)).sort();
        return [...ordered, ...extras];
    }, [categories, rosterTeamsFiltered]);

    const standingsGroupsAvailable = useMemo(
        () => competitionGroupsForDivision(teams, standingsDivision, false),
        [teams, standingsDivision]
    );

    const standings = useMemo(
        () =>
            computeStandings(teams, matches, {
                division: standingsDivision,
                group: standingsGroupFilter,
                onlyPaidTeams: true,
            }),
        [matches, teams, standingsDivision, standingsGroupFilter]
    );

    const officialCalendarStatus = useMemo(() => {
        if (matches.length === 0) {
            return {
                headline: 'Sin partidos en la tabla oficial',
                sub: 'Importa o genera en Simulaciones y usa «Guardar calendario oficial».',
                variant: 'neutral' as const,
            };
        }
        const publicCount = matches.filter((m) => m.isPublic).length;
        const privateCount = matches.length - publicCount;
        if (privateCount === 0) {
            return {
                headline: 'CALENDARIO OFICIAL',
                sub: `Todos los partidos (${publicCount}) están marcados como públicos para la web.`,
                variant: 'official' as const,
            };
        }
        if (publicCount === 0) {
            return {
                headline: 'BORRADOR PRIVADO',
                sub: `Hay ${privateCount} partido${privateCount === 1 ? '' : 's'} en base de datos, todos ocultos al público hasta que los publiques.`,
                variant: 'draft' as const,
            };
        }
        return {
            headline: 'Calendario mixto',
            sub: `${publicCount} público${publicCount === 1 ? '' : 's'} · ${privateCount} privado${privateCount === 1 ? '' : 's'} (revisa cada partido).`,
            variant: 'mixed' as const,
        };
    }, [matches]);

    useEffect(() => {
        if (activeTab !== 'competition' || !isAuthenticated || authLoading) return;
        let cancelled = false;
        setSimulationsLoaded(false);
        void (async () => {
            try {
                const data = await fetchCalendarSimulations();
                if (cancelled) return;
                if (data?.drafts?.length) {
                    const normalized = normalizeCalendarSimulations(data);
                    setSimDrafts(
                        normalized.drafts.map((d) => ({
                            ...d,
                            matches: ensureStableDraftMatchIds(d.matches),
                        }))
                    );
                    setActiveDraftId(normalized.activeDraftId);
                    if (JSON.stringify(normalized) !== JSON.stringify(data)) {
                        await saveCalendarSimulations(normalized);
                    }
                } else {
                    const def = createDefaultCalendarSimulations();
                    setSimDrafts(def.drafts);
                    setActiveDraftId(def.activeDraftId);
                    await saveCalendarSimulations(def);
                }
            } catch (e) {
                console.error(e);
                toast.error('No se pudieron cargar las simulaciones de calendario.');
            } finally {
                if (!cancelled) setSimulationsLoaded(true);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [activeTab, isAuthenticated, authLoading]);

    const persistSimDraftsAsync = async (next: CalendarDraft[], nextActiveId: string | null) => {
        setSimulationsSaving(true);
        try {
            await saveCalendarSimulations({ drafts: next, activeDraftId: nextActiveId });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Error guardando borradores';
            toast.error(msg);
        } finally {
            setSimulationsSaving(false);
        }
    };

    const handleExcelImport = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file || !activeDraftId) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const bstr = evt.target?.result;
                    const wb = XLSX.read(bstr, { type: 'binary' });
                    const wsname = wb.SheetNames[0];
                    const ws = wb.Sheets[wsname];
                    const data = XLSX.utils.sheet_to_json(ws);

                    const newMatches: Match[] = data.map((row: unknown, i) => {
                        const r = row as Record<string, string>;
                        return {
                            id: `excel-${Date.now()}-${i}`,
                            time: r['Hora'] || r['Time'] || '00:00',
                            court: r['Pista'] || r['Court'] || 'Pista Central',
                            teamA: r['Equipo A'] || r['Team A'] || 'TBD',
                            teamB: r['Equipo B'] || r['Team B'] || 'TBD',
                            scoreA: null,
                            scoreB: null,
                            status: 'SCHEDULED' as const,
                            round: r['Ronda'] || r['Fase'] || r['Round'] || '',
                            isPublic: true,
                        };
                    });

                    const normalized = ensureStableDraftMatchIds(newMatches);

                    setSimDrafts((prev) => {
                        const next = prev.map((d) =>
                            d.id === activeDraftId ? { ...d, matches: [...d.matches, ...normalized] } : d
                        );
                        void persistSimDraftsAsync(next, activeDraftId);
                        return next;
                    });
                    toast.success(`${newMatches.length} partidos importados al borrador`);
                } catch (error) {
                    console.error('Error importando Excel:', error);
                    toast.error('Error al procesar el archivo Excel. Verifica el formato.');
                }
            };
            reader.readAsBinaryString(file);
            e.target.value = '';
        },
        [activeDraftId]
    );

    const activeDraft = useMemo(() => simDrafts.find((d) => d.id === activeDraftId) ?? null, [simDrafts, activeDraftId]);

    const DIVISIONS_LIST: Team['division'][] = [
        'Infantil Femenino',
        'Infantil Masculino',
        'Cadete Femenino',
        'Cadete Masculino',
        'Juvenil Femenino',
        'Juvenil Masculino',
        'Senior Femenino',
        'Senior Masculino',
    ];

    const simulationDivisions = useMemo(() => {
        if (!activeDraft?.scheduleDay) return DIVISIONS_LIST;
        return DIVISIONS_LIST.filter((d) => divisionBelongsToScheduleDay(d, activeDraft.scheduleDay!));
    }, [activeDraft?.scheduleDay]);

    const paidTeamsForSimulation = useMemo(() => {
        const paid = teams.filter((t) => t.paymentStatus === 'PAID');
        if (!activeDraft?.scheduleDay) return paid;
        return paid.filter((t) => divisionBelongsToScheduleDay(t.division, activeDraft.scheduleDay!));
    }, [teams, activeDraft?.scheduleDay]);

    useEffect(() => {
        if (!activeDraft?.scheduleDay) return;
        const defs = getMuskizDayGenDefaults(activeDraft.scheduleDay);
        setGenConfig((prev) => ({ ...prev, ...defs }));
        const dayDivs = DIVISIONS_LIST.filter((d) => divisionBelongsToScheduleDay(d, activeDraft.scheduleDay!));
        setFakeCounts((prev) => {
            const next = { ...prev };
            for (const d of DIVISIONS_LIST) {
                if (!dayDivs.includes(d)) next[d] = 0;
            }
            const dayTotal = dayDivs.reduce((sum, d) => sum + (prev[d] || 0), 0);
            if (dayTotal === 0) {
                for (const d of dayDivs) next[d] = 12;
            }
            return next;
        });
    }, [activeDraftId, activeDraft?.scheduleDay]);

    const weekendDrafts = useMemo(
        () => WEEKEND_SCHEDULE_DAYS.map((day) => simDrafts.find((d) => d.scheduleDay === day)).filter(Boolean) as CalendarDraft[],
        [simDrafts]
    );
    const weekendMatchCount = useMemo(
        () => weekendDrafts.reduce((n, d) => n + d.matches.length, 0),
        [weekendDrafts]
    );

    const groupLetterOptions = ['', 'A', 'B', 'C', 'D', 'E', 'F'];

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

    const handleUpdateCategory = async (id: string, updates: any) => {
        try {
            const { error } = await supabase.from('categories').update(updates).eq('id', id);
            if (error) throw error;
            toast.success('Categoría actualizada');
            fetchCategories();
        } catch (error: any) {
            toast.error('Error al actualizar: ' + error.message);
        }
    };

    const handleLogout = async () => {
        await supabase.auth.signOut();
        localStorage.clear();
        sessionStorage.clear();
        setIsAuthenticated(false);
        toast.success('Sesión cerrada correctamente');
    };

    const handleVerify = async (teamId: string, playerId: string, type: 'dni' | 'insurance', status: 'APPROVED' | 'REJECTED') => {
        const team = teams.find(t => t.id === teamId);
        if (!team) return;
        const playerToUpdate = team.players.find(p => p.id === playerId);
        if (!playerToUpdate) return;

        let rejectionReason: string | undefined;
        if (status === 'REJECTED') {
            const entered = window.prompt(
                'Motivo del rechazo (lo recibirá el responsable por correo). Puedes dejarlo en blanco para usar el texto estándar:',
                ''
            );
            if (entered === null) return;
            rejectionReason = entered.trim() || undefined;
        }

        const updatedPlayer = {
            ...playerToUpdate,
            [type === 'dni' ? 'dniStatus' : 'insuranceStatus']: status,
        };

        try {
            await teamService.updatePlayer(updatedPlayer);
            const updatedPlayers = team.players.map(p => p.id === playerId ? updatedPlayer : p);
            onUpdateTeam({ ...team, players: updatedPlayers });

            const { error: fnError } = await supabase.functions.invoke('notify-player-doc-manager-email', {
                body: {
                    playerId,
                    docType: type,
                    approved: status === 'APPROVED',
                    rejectionReason: status === 'REJECTED' ? (rejectionReason ?? null) : null,
                },
            });
            if (fnError) throw fnError;

            toast.success(
                status === 'APPROVED'
                    ? 'Documento aprobado. Se ha notificado al responsable por correo.'
                    : 'Documento rechazado. Se ha notificado al responsable por correo.'
            );
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Error al guardar o al enviar el correo';
            toast.error(msg);
        }
    };

    const handleDeletePlayerAdmin = async (teamId: string, playerId: string) => {
        const team = teams.find(t => t.id === teamId);
        if (!team) return;
        
        if (!confirm('¿Estás seguro de que quieres eliminar a este jugador permanentemente?')) return;
        
        try {
            await teamService.deletePlayer(playerId);
            const updatedPlayers = team.players.filter(p => p.id !== playerId);
            onUpdateTeam({ ...team, players: updatedPlayers });
            toast.success('Jugador eliminado correctamente');
        } catch (error) {
            toast.error('Error al eliminar el jugador');
        }
    };

    const handleSavePlayerEdit = async () => {
        if (!editingPlayerContext) return;
        const { team, player } = editingPlayerContext;
        try {
            await teamService.updatePlayer(player);
            const updatedPlayers = team.players.map(p => (p.id === player.id ? player : p));
            onUpdateTeam({ ...team, players: updatedPlayers });
            setEditingPlayerContext(null);
            toast.success('Jugador actualizado');
        } catch (e: any) {
            toast.error(e?.message || 'Error al guardar jugador');
        }
    };

    const handleManualPayment = (team: Team) => {
        if (confirm(`¿Confirmar validación de pago para ${team.name}?`)) {
            onUpdateTeam({ ...team, paymentStatus: 'PAID', paymentFeedback: '' });
            toast.success('Pago validado correctamente');
        }
    };

    const handleRejectPayment = async (team: Team) => {
        const reason = window.prompt(`Motivo del rechazo para ${team.name}:`, 'El justificante no es válido o no se ve bien.');
        if (reason) {
            onUpdateTeam({ ...team, paymentStatus: 'EXPIRED', paymentFeedback: reason, status: 'rejected' });
            toast.info('Pago rechazado. La plaza ha sido liberada y el equipo marcado como EXPIRADO.');
        }
    };

    const handleApproveTeam = async (team: Team) => {
        if (!confirm(`¿Aprobar definitivamente al equipo ${team.name}? Esto activará el acceso y enviará el email de bienvenida.`)) {
            return;
        }
        try {
            const updated = { ...team, status: 'approved' as const, paymentStatus: 'PAID' as const, paymentFeedback: '' };
            await onUpdateTeam(updated);
            const { data, error } = await supabase.functions.invoke('handle-approval', {
                body: {
                    teamName: team.name,
                    managerName: team.managerName,
                    managerEmail: team.managerEmail,
                    division: team.division,
                },
            });
            if (error) {
                toast.error('Equipo guardado como aprobado, pero falló el envío del correo. Invoca handle-approval o revisa alertas.');
                console.error('handle-approval invoke:', error);
                return;
            }
            if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
                toast.error(`Correo de aprobación: ${(data as { error: string }).error}`);
                return;
            }
            toast.success('Equipo aprobado e email de bienvenida enviado.');
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Error al aprobar';
            toast.error(msg);
        }
    };

    // --- Generator Logic ---
    const handleGenerateBracket = async () => {
        if (!activeDraftId) {
            toast.error('Selecciona o crea una simulación primero.');
            return;
        }
        let teamsToSimulate: Team[] = [];

        if (simulationMode === 'REAL') {
            teamsToSimulate = teams.filter((t) => t.paymentStatus === 'PAID');
        } else {
            simulationDivisions.forEach((division) => {
                const count = fakeTeamCounts[division] || 0;
                for (let i = 1; i <= count; i++) {
                    const tid = `fake-${division}-${i}`;
                    teamsToSimulate.push({
                        id: tid,
                        name: `Ficticio ${division} ${i}`,
                        city: 'Prueba',
                        division,
                        paymentStatus: 'PAID',
                        status: 'approved',
                        fee: 0,
                        managerEmail: '',
                        managerName: '',
                        players: buildFakePlayersForTeam(tid),
                    });
                }
            });
            if (teamsToSimulate.length === 0) {
                toast.error('Indica al menos un equipo ficticio en alguna categoría.');
                return;
            }
        }

        const draftDay = activeDraft?.scheduleDay;
        if (draftDay) {
            teamsToSimulate = teamsToSimulate.filter((t) => divisionBelongsToScheduleDay(t.division, draftDay));
            if (teamsToSimulate.length < 2) {
                toast.error(`No hay suficientes equipos para ${draftDay} (categorías de ese día).`);
                return;
            }
        }

        setGeneratingBracket(true);
        const courts = genConfig.courtsInput.split(',').map((s) => s.trim());

        const { matches: newMatches, error: bracketError } = await generateBracketAI(teamsToSimulate, {
            startTime: genConfig.startTime,
            endTime: genConfig.endTime,
            intervalMins: genConfig.intervalMins,
            courts,
            lunchBreak: genConfig.lunchBreak,
            customPrompt: genConfig.customPrompt,
        });

        if (bracketError) {
            toast.error(bracketError);
        } else if (newMatches.length > 0) {
            const normalized = ensureStableDraftMatchIds(newMatches).map((m) => ({
                ...m,
                scheduleDay: draftDay ?? m.scheduleDay,
            }));
            const nextDrafts = simDrafts.map((d) =>
                d.id === activeDraftId ? { ...d, matches: normalized } : d
            );
            setSimDrafts(nextDrafts);
            await persistSimDraftsAsync(nextDrafts, activeDraftId);
            toast.success(
                `Simulación actualizada: ${newMatches.length} partidos generados en el borrador activo (no público hasta publicar).`
            );
        } else if (!bracketError) {
            toast.error('No se generaron partidos. Prueba el simulador determinístico o simplifica el prompt.');
        }
        setGeneratingBracket(false);
    };

    const handleGenerateMuskizActiveDay = async () => {
        if (!activeDraftId || !activeDraft) {
            toast.error('Selecciona o crea una simulación primero.');
            return;
        }
        const day = activeDraft.scheduleDay;
        if (!day) {
            toast.error('Este borrador no tiene día asignado. Usa Viernes, Sábado o Domingo, o «Generar los 3 días».');
            return;
        }
        setGeneratingMuskiz(true);
        try {
            const { matches: newMatches, error: muskizError, warning: muskizWarning } = buildMuskizDayDraftMatches(teams, day, { lunchEnd: muskizLunchEnd });
            if (muskizError) {
                toast.error(muskizError);
                return;
            }
            if (newMatches.length === 0) {
                toast.error(`No se generaron partidos para ${day}: hace falta al menos 2 equipos pagados en una categoría de ese día.`);
                return;
            }
            const normalized = ensureStableDraftMatchIds(newMatches);
            const nextDrafts = simDrafts.map((d) =>
                d.id === activeDraftId ? { ...d, matches: normalized } : d
            );
            setSimDrafts(nextDrafts);
            await persistSimDraftsAsync(nextDrafts, activeDraftId);
            if (muskizWarning) {
                toast.warning(`${day}: borrador generado con avisos — ${muskizWarning}`, { duration: 12000 });
            }
            toast.success(
                `${day}: ${normalized.length} partidos${muskizWarning ? ' (revisa los marcados PENDIENTE)' : ` (mín. ${MIN_REAL_MATCHES_PER_TEAM} reales por equipo)`}.`
            );
        } finally {
            setGeneratingMuskiz(false);
        }
    };

    const handleGenerateMuskizAllDays = async () => {
        if (weekendDrafts.length < 3) {
            toast.error('Faltan borradores de Viernes, Sábado o Domingo.');
            return;
        }
        setGeneratingMuskiz(true);
        try {
            const { byDay, error: muskizError, warning: muskizWarning } = buildMuskizWeekendDraftsByDay(teams, { lunchEnd: muskizLunchEnd });
            if (muskizError) {
                toast.error(muskizError);
                return;
            }
            const total = WEEKEND_SCHEDULE_DAYS.reduce((n, day) => n + byDay[day].length, 0);
            if (total === 0) {
                toast.error('No se generaron partidos: hace falta al menos 2 equipos pagados en una misma categoría.');
                return;
            }
            const nextDrafts = simDrafts.map((d) => {
                if (!d.scheduleDay || !WEEKEND_SCHEDULE_DAYS.includes(d.scheduleDay)) return d;
                return { ...d, matches: ensureStableDraftMatchIds(byDay[d.scheduleDay]) };
            });
            setSimDrafts(nextDrafts);
            await persistSimDraftsAsync(nextDrafts, activeDraftId);
            if (muskizWarning) {
                toast.warning(`Borradores generados con avisos — ${muskizWarning}`, { duration: 12000 });
            }
            toast.success(
                `3 calendarios generados: Viernes ${byDay.Viernes.length}, Sábado ${byDay.Sábado.length}, Domingo ${byDay.Domingo.length} partidos${muskizWarning ? ' (revisa PENDIENTE)' : ''}.`
            );
        } finally {
            setGeneratingMuskiz(false);
        }
    };

    const handlePublishActiveDraft = async () => {
        if (!activeDraft) return;
        if (
            !window.confirm(
                '¿Volcar esta simulación al calendario oficial en la base de datos? Sustituirá todos los partidos actuales.\n\n' +
                    (publishDraftAsPublic
                        ? 'Has elegido PUBLICAR ahora: los partidos serán visibles en Competición para visitantes (si además el interruptor global de visibilidad está activo).'
                        : 'Has elegido NO publicar ahora: los partidos se guardarán como PRIVADOS hasta que uses «Hacer público el calendario actual».')
            )
        )
            return;
        const finalized = finalizeMatchesForDatabase(activeDraft.matches, { isPublic: publishDraftAsPublic });
        await onUpdateMatches(finalized);
        toast.success(
            `Calendario oficial actualizado (${finalized.length} partidos). ${publishDraftAsPublic ? 'Visibilidad: público.' : 'Visibilidad: privado (borrador en sombra).'}`,
        );
    };

    const handlePublishAllWeekendDrafts = async () => {
        const merged = mergeWeekendDraftMatches(simDrafts);
        if (!merged.length) {
            toast.error('No hay partidos en los borradores Viernes / Sábado / Domingo.');
            return;
        }
        if (
            !window.confirm(
                `¿Volcar los 3 calendarios (Viernes + Sábado + Domingo = ${merged.length} partidos) al calendario oficial?\n\n` +
                    'Sustituirá todos los partidos actuales en la base de datos.\n\n' +
                    (publishDraftAsPublic
                        ? 'Has elegido PUBLICAR ahora: visibles para visitantes (si el interruptor global también está activo).'
                        : 'Has elegido NO publicar ahora: partidos privados hasta «Hacer público el calendario actual».')
            )
        ) {
            return;
        }
        const finalized = finalizeMatchesForDatabase(merged, { isPublic: publishDraftAsPublic });
        await onUpdateMatches(finalized);
        toast.success(
            `Calendario oficial: ${finalized.length} partidos de los 3 días. ${publishDraftAsPublic ? 'Visibilidad: público.' : 'Visibilidad: privado.'}`
        );
    };

    const handleMakeAllMatchesPublic = async () => {
        if (
            !window.confirm(
                '¿Marcar TODOS los partidos del calendario oficial como visibles para el público (is_public = true)? Los visitantes los verán en Competición si el interruptor global también está activo.'
            )
        ) {
            return;
        }
        try {
            await matchService.makeAllMatchesPublic();
            const fresh = await matchService.getMatches();
            await onUpdateMatches(fresh);
            toast.success('Todos los partidos del calendario oficial son ahora públicos.');
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'No se pudo actualizar la visibilidad.');
        }
    };

    const handleAddSimulation = async () => {
        const nm = window.prompt('Nombre de la nueva simulación', `Simulación ${simDrafts.length + 1}`);
        if (!nm?.trim()) return;
        const id = crypto.randomUUID();
        const draft: CalendarDraft = {
            id,
            name: nm.trim(),
            createdAt: new Date().toISOString(),
            matches: [],
            formatDescription: '',
        };
        const next = [...simDrafts, draft];
        setSimDrafts(next);
        setActiveDraftId(id);
        await persistSimDraftsAsync(next, id);
    };

    const handleDuplicateActiveSimulation = async () => {
        if (!activeDraft) return;
        const clone = duplicateDraft(activeDraft);
        const next = [...simDrafts, clone];
        setSimDrafts(next);
        setActiveDraftId(clone.id);
        await persistSimDraftsAsync(next, clone.id);
        toast.success('Copia del borrador creada.');
    };

    /**
     * Elimina sólo datos de borradores en site_content (`calendar_simulations`).
     * Nunca llama a onUpdateTeams, delete de equipos/jugadores ni toca tabla `matches`.
     */
    const handleDeleteSimulationById = async (draftId: string, draftNameForConfirm: string) => {
        if (
            !window.confirm(
                `¿Eliminar la simulación «${draftNameForConfirm}»?\n\n` +
                    'Sólo borra este borrador de pruebas (staff). Los equipos y jugadores inscritos por responsables no se modifican. ' +
                    'El calendario oficial (BD / pestaña «Oficial») no cambia.\n\n¿Continuar?'
            )
        ) {
            return;
        }

        let next = simDrafts.filter((d) => d.id !== draftId);
        let nextActive: string | null = activeDraftId === draftId ? null : activeDraftId;

        if (next.length === 0) {
            const fresh = createDefaultCalendarSimulations();
            next = fresh.drafts;
            nextActive = fresh.activeDraftId;
        } else if (!nextActive || !next.some((d) => d.id === nextActive)) {
            nextActive = next[0].id;
        }

        setSimDrafts(next);
        setActiveDraftId(nextActive);
        await persistSimDraftsAsync(next, nextActive);
        toast.success('Borrador eliminado (equipos, jugadores y calendario oficial intactos).');
    };

    const handleDeleteActiveSimulation = async () => {
        if (!activeDraft) return;
        await handleDeleteSimulationById(activeDraft.id, activeDraft.name);
    };

    const handleResetAllSimulationsToFresh = async () => {
        if (
            !window.confirm(
                '¿Eliminar TODAS las simulaciones y crear una nueva vacía?\n\n' +
                    'Igual que arriba: sólo datos de borradores staff. Equipos, jugadores y partidos publicados en BD no se tocan.\n\n¿Continuar?'
            )
        ) {
            return;
        }
        const fresh = createDefaultCalendarSimulations();
        setSimDrafts(fresh.drafts);
        setActiveDraftId(fresh.activeDraftId);
        await persistSimDraftsAsync(fresh.drafts, fresh.activeDraftId);
        toast.success('Simulaciones reseteadas: un borrador nuevo vacío.');
    };

    const handleUpdateDraftMatch = async (
        matchId: string,
        patch: Partial<Pick<Match, 'time' | 'court' | 'teamA' | 'teamB'>>
    ) => {
        if (!activeDraftId) return;
        const next = simDrafts.map((d) =>
            d.id !== activeDraftId
                ? d
                : {
                      ...d,
                      matches: d.matches.map((m) =>
                          m.id === matchId
                              ? {
                                    ...m,
                                    ...patch,
                                    round: patch.time && patch.time !== m.time
                                        ? m.round?.replace(/\d{2}:\d{2}/, patch.time) ?? m.round
                                        : m.round,
                                }
                              : m
                      ),
                  }
        );
        setSimDrafts(next);
        await persistSimDraftsAsync(next, activeDraftId);
    };

    const handleClearActiveDraftMatches = async () => {
        if (!activeDraftId) return;
        if (!window.confirm('¿Vaciar partidos sólo del borrador activo?')) return;
        const next = simDrafts.map((d) =>
            d.id === activeDraftId ? { ...d, matches: [] as Match[] } : d
        );
        setSimDrafts(next);
        await persistSimDraftsAsync(next, activeDraftId);
    };

    const handleDraftMetadataChange = async (patch: Partial<Pick<CalendarDraft, 'name' | 'formatDescription'>>) => {
        if (!activeDraftId) return;
        const next = simDrafts.map((d) =>
            d.id === activeDraftId ? { ...d, ...patch } : d
        );
        setSimDrafts(next);
        await persistSimDraftsAsync(next, activeDraftId);
    };

    const handleChangeTeamGroup = async (team: Team, groupLetter: string) => {
        const nextGroup = groupLetter.trim() || null;
        try {
            await onUpdateTeam({ ...team, competitionGroup: nextGroup });
            toast.success('Grupo guardado.');
        } catch {
            /* toast + reportOps en App.tsx (updateTeam) */
        }
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
            teamAObj?.players.filter(isPlayerEligibleForMatch).forEach(p => initialStats.push({ playerId: p.id, goals: 0, yellowCards: 0, redCards: 0 }));
            teamBObj?.players.filter(isPlayerEligibleForMatch).forEach(p => initialStats.push({ playerId: p.id, goals: 0, yellowCards: 0, redCards: 0 }));

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
            const teamAObj = teams.find(t => t.name === match.teamA);
            const teamBObj = teams.find(t => t.name === match.teamB);
            const eligibleIds = new Set([
                ...(teamAObj ? playersEligibleForMatch(teamAObj.players) : []),
                ...(teamBObj ? playersEligibleForMatch(teamBObj.players) : []),
            ].map((p) => p.id));
            const filteredStats = match.report?.playerStats?.filter((s) => eligibleIds.has(s.playerId)) ?? [];
            setSelectedMatchForReport({
                ...match,
                report: match.report ? { ...match.report, playerStats: filteredStats } : match.report,
            });
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
    const pendingCount = allPlayers.filter((p) => memberDocsPending(p)).length;
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
                        onClick={() => setActiveTab('teamRoster')}
                        className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors ${activeTab === 'teamRoster' ? 'bg-primary/10 text-primary-dark border border-primary/20' : 'text-slate-500 hover:bg-white border border-transparent'}`}
                    >
                        <span className="material-symbols-outlined text-lg">shield_person</span> Equipos
                    </button>
                    <button
                        onClick={() => setActiveTab('teams')}
                        className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors ${activeTab === 'teams' ? 'bg-primary/10 text-primary-dark border border-primary/20' : 'text-slate-500 hover:bg-white border border-transparent'}`}
                    >
                        <span className="material-symbols-outlined text-lg">payments</span> Pagos e inscripciones
                    </button>
                    <button
                        onClick={() => setActiveTab('competition')}
                        className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors ${activeTab === 'competition' ? 'bg-primary/10 text-primary-dark border border-primary/20' : 'text-slate-500 hover:bg-white border border-transparent'}`}
                    >
                        <span className="material-symbols-outlined text-lg">trophy</span> Competición
                    </button>
                    <button
                        onClick={() => setActiveTab('sponsors')}
                        className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors ${activeTab === 'sponsors' ? 'bg-primary/10 text-primary-dark border border-primary/20' : 'text-slate-500 hover:bg-white border border-transparent'}`}
                    >
                        <span className="material-symbols-outlined text-lg">handshake</span> Patrocinadores
                    </button>
                    <button
                        onClick={() => setActiveTab('categories')}
                        className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors ${activeTab === 'categories' ? 'bg-primary/10 text-primary-dark border border-primary/20' : 'text-slate-500 hover:bg-white border border-transparent'}`}
                    >
                        <span className="material-symbols-outlined text-lg">settings_suggest</span> Configuración
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
                                    <p className="text-xs text-slate-500 mt-1">Valida DNI de todos y seguro solo de jugadores (entrenadores/oficiales no llevan seguro).</p>
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
                                        value={filterVerificationRole}
                                        onChange={(e) => setFilterVerificationRole(e.target.value as typeof filterVerificationRole)}
                                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-slate-50 outline-none focus:ring-1 focus:ring-primary"
                                    >
                                        <option value="all">Roles (todos)</option>
                                        <option value="PLAYER">Jugadores</option>
                                        <option value="COACH">Entrenadores</option>
                                        <option value="OFFICIAL">Oficiales</option>
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
                                            <th className="px-6 py-4">Persona</th>
                                            <th className="px-6 py-4">Rol</th>
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
                                                const matchRole =
                                                    filterVerificationRole === 'all' ||
                                                    (p.role ?? 'PLAYER') === filterVerificationRole;
                                                const matchStat = filterStatus === 'all' || 
                                                    (filterStatus === 'empty' && memberDocsMissing(p)) ||
                                                    (filterStatus === 'pending' && memberDocsPending(p)) ||
                                                    (filterStatus === 'approved' && memberDocsComplete(p));
                                                return matchTeam && matchCat && matchSex && matchRole && matchStat;
                                            })
                                            .map(player => (
                                            <tr
                                                key={`${player.teamId}-${player.id}`}
                                                className={`group border-b border-slate-50 hover:bg-slate-50/50 transition-colors ${
                                                    isPlayerRole(player.role) && !isPlayerEligibleForMatch(player)
                                                        ? 'bg-amber-50/40'
                                                        : ''
                                                }`}
                                            >
                                                <td className="px-6 py-4 font-bold text-slate-800">
                                                    <div className="flex items-center gap-3">
                                                        <div className="size-8 rounded-full bg-slate-200 overflow-hidden shrink-0">
                                                            {player.avatarUrl && (
                                                                <img
                                                                    src={player.avatarUrl}
                                                                    className="w-full h-full object-cover"
                                                                    alt=""
                                                                />
                                                            )}
                                                        </div>
                                                        <div>
                                                            <div>{player.name}</div>
                                                            {isPlayerRole(player.role) && !isPlayerEligibleForMatch(player) && (
                                                                <span className="block text-[9px] font-bold text-amber-700 mt-0.5">
                                                                    No puede jugar ni salir en acta hasta aprobar DNI y seguro
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span
                                                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                                                            isPlayerRole(player.role)
                                                                ? 'bg-blue-50 text-blue-800'
                                                                : 'bg-violet-50 text-violet-800'
                                                        }`}
                                                    >
                                                        {playerRoleLabel(player.role)}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-slate-600">
                                                    {player.teamName}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        {player.dniNumber ? (
                                                            <span className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                                                {player.dniNumber}
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] text-slate-400">Sin número</span>
                                                        )}
                                                        {player.dniStatus !== 'EMPTY' && player.dniStatus ? (
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                                                                    player.dniStatus === 'APPROVED' ? 'bg-green-100 text-green-700' : 
                                                                    player.dniStatus === 'REJECTED' ? 'bg-red-100 text-red-700' : 
                                                                    'bg-amber-100 text-amber-700'
                                                                }`}>
                                                                    {player.dniStatus}
                                                                </span>
                                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <button onClick={() => handleVerify(player.teamId, player.id, 'dni', 'APPROVED')} className="text-green-500 hover:bg-green-50 p-1 rounded transition-colors" title="Aprobar"><span className="material-symbols-outlined text-xs">check</span></button>
                                                                    <button onClick={() => handleVerify(player.teamId, player.id, 'dni', 'REJECTED')} className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors" title="Rechazar"><span className="material-symbols-outlined text-xs">close</span></button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-400">
                                                                Falta indicar
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {!isPlayerRole(player.role) ? (
                                                        <span className="text-[10px] font-bold uppercase text-slate-400">No aplica</span>
                                                    ) : (
                                                    <div className="flex items-center gap-2">
                                                        {player.insuranceUrl ? (
                                                            <a href={player.insuranceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 text-primary rounded-lg text-[10px] font-bold hover:bg-primary/10 transition-all border border-primary/10 group/btn">
                                                                <span className="material-symbols-outlined text-sm transition-transform group-hover/btn:scale-110">visibility</span> Ver Documento
                                                            </a>
                                                        ) : (
                                                            <div className="size-8 bg-slate-100 rounded flex items-center justify-center text-slate-300" title="No hay documento">
                                                                <span className="material-symbols-outlined text-lg">block</span>
                                                            </div>
                                                        )}
                                                        {player.insuranceStatus !== 'EMPTY' && player.insuranceStatus ? (
                                                            <div className="flex items-center gap-2">
                                                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                                                                    player.insuranceStatus === 'APPROVED' ? 'bg-green-100 text-green-700' : 
                                                                    player.insuranceStatus === 'REJECTED' ? 'bg-red-100 text-red-700' : 
                                                                    'bg-amber-100 text-amber-700'
                                                                }`}>
                                                                    {player.insuranceStatus}
                                                                </span>
                                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <button onClick={() => handleVerify(player.teamId, player.id, 'insurance', 'APPROVED')} className="text-green-500 hover:bg-green-50 p-1 rounded transition-colors" title="Aprobar"><span className="material-symbols-outlined text-xs">check</span></button>
                                                                    <button onClick={() => handleVerify(player.teamId, player.id, 'insurance', 'REJECTED')} className="text-red-500 hover:bg-red-50 p-1 rounded transition-colors" title="Rechazar"><span className="material-symbols-outlined text-xs">close</span></button>
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-400">
                                                                Falta subir
                                                            </span>
                                                        )}
                                                    </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button 
                                                        onClick={() => handleDeletePlayerAdmin(player.teamId, player.id)}
                                                        className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                                                        title="Eliminar jugador"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">delete</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* --- EQUIPOS (PLANTILLAS) TAB --- */}
                    {activeTab === 'teamRoster' && (() => {
                        const rosterTeam = rosterSelectedTeamId
                            ? teams.find(t => t.id === rosterSelectedTeamId)
                            : null;
                        return (
                            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                                <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div>
                                        <h3 className="font-bold text-lg text-slate-800">
                                            {rosterTeam ? rosterTeam.name : 'Equipos por categoría'}
                                        </h3>
                                        <p className="text-xs text-slate-500 mt-1">
                                            {rosterTeam
                                                ? `${rosterTeam.division} · ${rosterTeam.players.length} jugador(es) inscritos`
                                                : 'Elige un equipo para ver la plantilla y gestionar documentación.'}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {rosterTeam && (
                                            <button
                                                type="button"
                                                onClick={() => setRosterSelectedTeamId(null)}
                                                className="text-xs font-bold px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 flex items-center gap-1"
                                            >
                                                <span className="material-symbols-outlined text-sm">arrow_back</span>
                                                Volver
                                            </button>
                                        )}
                                        {!rosterTeam && (
                                            <input
                                                type="text"
                                                placeholder="Buscar equipo o categoría..."
                                                value={rosterSearch}
                                                onChange={e => setRosterSearch(e.target.value)}
                                                className="text-xs border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 outline-none focus:ring-1 focus:ring-primary min-w-[200px]"
                                            />
                                        )}
                                    </div>
                                </div>

                                {rosterTeam ? (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-slate-50 text-slate-500 font-medium uppercase text-xs">
                                                <tr>
                                                    <th className="px-6 py-4">Jugador</th>
                                                    <th className="px-6 py-4">Rol</th>
                                                    <th className="px-6 py-4">DNI</th>
                                                    <th className="px-6 py-4">Seguro</th>
                                                    <th className="px-6 py-4 text-right">Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {rosterTeam.players.map(player => (
                                                    <tr
                                                        key={player.id}
                                                        className="group border-b border-slate-50 hover:bg-slate-50/50 transition-colors"
                                                    >
                                                        <td className="px-6 py-4 font-bold text-slate-800">
                                                            <div className="flex items-center gap-3">
                                                                <div className="size-8 rounded-full bg-slate-200 overflow-hidden shrink-0">
                                                                    {player.avatarUrl && (
                                                                        <img
                                                                            src={player.avatarUrl}
                                                                            alt=""
                                                                            className="w-full h-full object-cover"
                                                                        />
                                                                    )}
                                                                </div>
                                                                <div>
                                                                    <div>{player.name}</div>
                                                                    {player.surnames && (
                                                                        <div className="text-xs font-normal text-slate-500">
                                                                            {player.surnames}
                                                                        </div>
                                                                    )}
                                                                    <div className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                                                                        #{player.number}
                                                                        {player.position ? ` · ${player.position}` : ''}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-slate-600">
                                                            <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                                                                {playerRoleLabel(player.role)}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                {player.dniNumber ? (
                                                                    <span className="px-3 py-1.5 rounded-lg text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                                                        {player.dniNumber}
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-[10px] text-slate-400">Sin número</span>
                                                                )}
                                                                {player.dniStatus !== 'EMPTY' && player.dniStatus ? (
                                                                    <div className="flex items-center gap-2">
                                                                        <span
                                                                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                                                                                player.dniStatus === 'APPROVED'
                                                                                    ? 'bg-green-100 text-green-700'
                                                                                    : player.dniStatus === 'REJECTED'
                                                                                      ? 'bg-red-100 text-red-700'
                                                                                      : 'bg-amber-100 text-amber-700'
                                                                            }`}
                                                                        >
                                                                            {player.dniStatus}
                                                                        </span>
                                                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    handleVerify(
                                                                                        rosterTeam.id,
                                                                                        player.id,
                                                                                        'dni',
                                                                                        'APPROVED'
                                                                                    )
                                                                                }
                                                                                className="text-green-500 hover:bg-green-50 p-1 rounded"
                                                                                title="Aprobar DNI"
                                                                            >
                                                                                <span className="material-symbols-outlined text-xs">
                                                                                    check
                                                                                </span>
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    handleVerify(
                                                                                        rosterTeam.id,
                                                                                        player.id,
                                                                                        'dni',
                                                                                        'REJECTED'
                                                                                    )
                                                                                }
                                                                                className="text-red-500 hover:bg-red-50 p-1 rounded"
                                                                                title="Rechazar DNI"
                                                                            >
                                                                                <span className="material-symbols-outlined text-xs">
                                                                                    close
                                                                                </span>
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-400">
                                                                        Falta indicar
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                {player.insuranceUrl ? (
                                                                    <a
                                                                        href={player.insuranceUrl}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 text-primary rounded-lg text-[10px] font-bold hover:bg-primary/10 border border-primary/10"
                                                                    >
                                                                        <span className="material-symbols-outlined text-sm">
                                                                            visibility
                                                                        </span>{' '}
                                                                        Ver
                                                                    </a>
                                                                ) : (
                                                                    <span className="text-[10px] text-slate-400">Sin archivo</span>
                                                                )}
                                                                {player.insuranceStatus !== 'EMPTY' && player.insuranceStatus ? (
                                                                    <div className="flex items-center gap-2">
                                                                        <span
                                                                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                                                                                player.insuranceStatus === 'APPROVED'
                                                                                    ? 'bg-green-100 text-green-700'
                                                                                    : player.insuranceStatus === 'REJECTED'
                                                                                      ? 'bg-red-100 text-red-700'
                                                                                      : 'bg-amber-100 text-amber-700'
                                                                            }`}
                                                                        >
                                                                            {player.insuranceStatus}
                                                                        </span>
                                                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    handleVerify(
                                                                                        rosterTeam.id,
                                                                                        player.id,
                                                                                        'insurance',
                                                                                        'APPROVED'
                                                                                    )
                                                                                }
                                                                                className="text-green-500 hover:bg-green-50 p-1 rounded"
                                                                                title="Aprobar seguro"
                                                                            >
                                                                                <span className="material-symbols-outlined text-xs">
                                                                                    check
                                                                                </span>
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() =>
                                                                                    handleVerify(
                                                                                        rosterTeam.id,
                                                                                        player.id,
                                                                                        'insurance',
                                                                                        'REJECTED'
                                                                                    )
                                                                                }
                                                                                className="text-red-500 hover:bg-red-50 p-1 rounded"
                                                                                title="Rechazar seguro"
                                                                            >
                                                                                <span className="material-symbols-outlined text-xs">
                                                                                    close
                                                                                </span>
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-400">
                                                                        Falta subir
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 text-right whitespace-nowrap">
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setEditingPlayerContext({
                                                                        team: rosterTeam,
                                                                        player: { ...player },
                                                                    })
                                                                }
                                                                className="p-2 text-slate-400 hover:text-primary transition-colors"
                                                                title="Editar jugador"
                                                            >
                                                                <span className="material-symbols-outlined text-sm">edit</span>
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    handleDeletePlayerAdmin(rosterTeam.id, player.id)
                                                                }
                                                                className="p-2 text-slate-400 hover:text-red-500 transition-colors"
                                                                title="Eliminar jugador"
                                                            >
                                                                <span className="material-symbols-outlined text-sm">delete</span>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                                {rosterTeam.players.length === 0 && (
                                                    <tr>
                                                        <td
                                                            colSpan={5}
                                                            className="px-6 py-12 text-center text-slate-500 text-sm"
                                                        >
                                                            Este equipo aún no tiene jugadores inscritos.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <div className="p-6 space-y-8 max-h-[70vh] overflow-y-auto">
                                        {rosterDivisionOrder.map(div => {
                                            const divTeams = rosterTeamsFiltered.filter(t => t.division === div);
                                            if (divTeams.length === 0) return null;
                                            return (
                                                <div key={div}>
                                                    <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider mb-3">
                                                        {div}
                                                    </h4>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                                        {divTeams.map(team => (
                                                            <button
                                                                key={team.id}
                                                                type="button"
                                                                onClick={() => setRosterSelectedTeamId(team.id)}
                                                                className="text-left p-4 rounded-xl border border-slate-200 hover:border-primary/40 hover:bg-primary/5 transition-all"
                                                            >
                                                                <p className="font-bold text-slate-800">{team.name}</p>
                                                                <p className="text-xs text-slate-500 mt-1">
                                                                    {team.city} · {team.players.length} jugador(es)
                                                                </p>
                                                                <p className="text-[10px] font-bold uppercase mt-2 text-slate-400">
                                                                    {team.status === 'approved'
                                                                        ? 'Aprobado'
                                                                        : team.status === 'pending'
                                                                          ? 'Pendiente'
                                                                          : 'Rechazado'}
                                                                </p>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {rosterTeamsFiltered.length === 0 && (
                                            <p className="text-center text-slate-500 py-12 text-sm">
                                                No hay equipos que coincidan con la búsqueda.
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })()}

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

                            {/* Categories Config */}
                            <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="font-bold text-lg text-slate-800">Gestión de Categorías y Precios</h3>
                                    <div className="text-xs text-slate-400 font-medium bg-slate-100 px-2 py-1 rounded-full uppercase">Configuración Global</div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                                    {categories.map(cat => (
                                        <div key={cat.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-primary/30 transition-colors">
                                            <label className="block text-xs font-black uppercase text-slate-500 mb-3 truncate" title={cat.name}>{cat.name}</label>
                                            <div className="space-y-3">
                                                <div>
                                                    <label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Precio Inscripción</label>
                                                    <div className="relative">
                                                        <input
                                                            type="number"
                                                            value={cat.price}
                                                            onChange={(e) => handleUpdateCategory(cat.id, { price: parseFloat(e.target.value) || 0 })}
                                                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none pr-8"
                                                        />
                                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">€</span>
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Límite Equipos</label>
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="number"
                                                            value={cat.max_teams}
                                                            onChange={(e) => handleUpdateCategory(cat.id, { max_teams: parseInt(e.target.value) || 0 })}
                                                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                                                        />
                                                        <span className="text-[10px] text-slate-400 whitespace-nowrap">
                                                            Inscritos: {teams.filter(t => t.division === cat.name && t.paymentStatus !== 'EXPIRED').length}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Payments Table */}
                            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                                <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-center gap-4">
                                        <h3 className="font-bold text-lg text-slate-800">Estado de Pagos e Inscripciones</h3>
                                        <button 
                                            onClick={handleManualAddTeam}
                                            className="bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 hover:bg-slate-800 transition-colors shadow-sm"
                                        >
                                            <span className="material-symbols-outlined text-sm">add_circle</span>
                                            Añadir Equipo
                                        </button>
                                    </div>
                                    
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
                                            <option value="WAITING_VALIDATION">Pendiente Validar</option>
                                            <option value="EXPIRED">Expirado/Rechazado</option>
                                            <option value="PENDING">Pendiente Subir</option>
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
                                                        ) : team.paymentStatus === 'WAITING_VALIDATION' ? (
                                                            <span className="text-[10px] font-black bg-amber-100 text-amber-700 px-2 py-0.5 rounded w-fit uppercase">A Validar</span>
                                                        ) : team.paymentStatus === 'EXPIRED' ? (
                                                            <span className="text-[10px] font-black bg-red-100 text-red-700 px-2 py-0.5 rounded w-fit uppercase">Expirado</span>
                                                        ) : (
                                                            <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-2 py-0.5 rounded w-fit uppercase">Pendiente</span>
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
                                                        {team.paymentStatus === 'WAITING_VALIDATION' && (
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
                                                                    VALIDAR
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
                                                        <button
                                                            onClick={() => handleEditTeam(team)}
                                                            className="bg-blue-50 text-blue-500 hover:bg-blue-500 hover:text-white text-[10px] font-black px-3 py-1.5 rounded-lg transition-all flex items-center gap-1"
                                                            title="Editar Equipo"
                                                        >
                                                            <span className="material-symbols-outlined text-xs">edit</span>
                                                            EDITAR
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteTeam(team)}
                                                            className="bg-red-50 text-red-500 hover:bg-red-500 hover:text-white text-[10px] font-black px-3 py-1.5 rounded-lg transition-all flex items-center gap-1"
                                                            title="Eliminar Equipo"
                                                        >
                                                            <span className="material-symbols-outlined text-xs">delete</span>
                                                            ELIMINAR
                                                        </button>
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
                            <div className="flex flex-wrap border-b border-slate-200 mb-6 gap-1">
                                <button
                                    type="button"
                                    onClick={() => setCompSubTab('structure')}
                                    className={`px-4 sm:px-6 py-3 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${compSubTab === 'structure' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                                >
                                    <span className="material-symbols-outlined text-lg">account_tree</span>
                                    Estructura
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCompSubTab('simulations')}
                                    className={`px-4 sm:px-6 py-3 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${compSubTab === 'simulations' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                                >
                                    <span className="material-symbols-outlined text-lg">science</span>
                                    Simulaciones
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCompSubTab('published')}
                                    className={`px-4 sm:px-6 py-3 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${compSubTab === 'published' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                                >
                                    <span className="material-symbols-outlined text-lg">calendar_month</span>
                                    Oficial
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCompSubTab('results')}
                                    className={`px-4 sm:px-6 py-3 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${compSubTab === 'results' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                                >
                                    <span className="material-symbols-outlined text-lg">scoreboard</span>
                                    Resultados y Actas
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCompSubTab('standings')}
                                    className={`px-4 sm:px-6 py-3 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${compSubTab === 'standings' ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                                >
                                    <span className="material-symbols-outlined text-lg">leaderboard</span>
                                    Clasificación
                                </button>
                            </div>

                            {/* SUB-TAB CONTENT */}
                            <div className="min-h-[400px]">

                                {/* 1. ESTRUCTURA — categorías y grupos */}
                                {compSubTab === 'structure' && (
                                    <div className="space-y-6">
                                        <div className="bg-amber-50 border border-amber-100 p-4 rounded-lg text-sm text-amber-900">
                                            <p className="font-bold mb-1">Asignación de grupos</p>
                                            <p>
                                                Cada equipo ya tiene una <strong>categoría</strong> (división). Aquí defines el <strong>grupo</strong> dentro de esa
                                                categoría (A, B, C…). Requiere la columna <code className="bg-white/80 px-1 rounded">competition_group</code> en
                                                Supabase — ejecuta el SQL en <code className="bg-white/80 px-1 rounded">supabase/sql/add_competition_group_to_teams.sql</code>.
                                            </p>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <label className="text-xs font-bold uppercase text-slate-500">Categoría</label>
                                            <select
                                                value={structureDivision}
                                                onChange={(e) => setStructureDivision(e.target.value as Team['division'])}
                                                className="border rounded-lg px-3 py-2 text-sm font-medium min-w-[200px]"
                                            >
                                                {DIVISIONS_LIST.map((d) => (
                                                    <option key={d} value={d}>
                                                        {d}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="overflow-x-auto rounded-lg border border-slate-200">
                                            <table className="w-full text-sm text-left">
                                                <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                                    <tr>
                                                        <th className="px-4 py-3">Equipo</th>
                                                        <th className="px-4 py-3">Ciudad</th>
                                                        <th className="px-4 py-3">Estado</th>
                                                        <th className="px-4 py-3">Grupo</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {teams
                                                        .filter((t) => t.division === structureDivision)
                                                        .sort((a, b) => a.name.localeCompare(b.name, 'es'))
                                                        .map((team) => (
                                                            <tr key={team.id} className="hover:bg-slate-50/80">
                                                                <td className="px-4 py-3 font-bold text-slate-800">{team.name}</td>
                                                                <td className="px-4 py-3 text-slate-600">{team.city}</td>
                                                                <td className="px-4 py-3">
                                                                    <span className="text-[10px] font-bold uppercase text-slate-500">{team.status}</span>{' '}
                                                                    <span className="text-[10px] text-slate-400">· {team.paymentStatus}</span>
                                                                </td>
                                                                <td className="px-4 py-3">
                                                                    <select
                                                                        value={team.competitionGroup ?? ''}
                                                                        onChange={(e) => void handleChangeTeamGroup(team, e.target.value)}
                                                                        className="border rounded-lg px-2 py-1.5 text-xs font-semibold bg-white min-w-[100px]"
                                                                    >
                                                                        <option value="">Sin grupo</option>
                                                                        {groupLetterOptions.filter((g) => g).map((g) => (
                                                                            <option key={g} value={g}>
                                                                                Grupo {g}
                                                                            </option>
                                                                        ))}
                                                                    </select>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* 2. SIMULACIONES — borradores IA / Excel */}
                                {compSubTab === 'simulations' && (
                                    <div className="space-y-8">
                                        {!simulationsLoaded ? (
                                            <div className="text-center text-slate-400 py-12">Cargando simulaciones…</div>
                                        ) : (
                                            <>
                                                <div className="flex flex-wrap items-start justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50/80">
                                                    <div>
                                                        <p className="font-bold text-slate-800 mb-1">Visibilidad pública</p>
                                                        <p className="text-xs text-slate-600 max-w-xl">
                                                            Mientras esté desactivado, los visitantes sólo ven la pestaña Información en Competición. Los borradores
                                                            nunca se muestran; sólo cuenta el calendario <strong>oficial</strong> publicado abajo después de dar a
                                                            &quot;Publicar&quot;.
                                                        </p>
                                                        <label className="mt-3 flex items-center gap-3 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={publicMatchesVisible}
                                                                onChange={(e) => void persistPublicMatchesVisible(e.target.checked)}
                                                                className="size-5 rounded border-slate-300 text-primary focus:ring-primary"
                                                            />
                                                            <span className="text-sm font-bold text-slate-800">
                                                                Mostrar Calendario, Resultados y Clasificación en la web
                                                            </span>
                                                        </label>
                                                    </div>
                                                    {simulationsSaving && (
                                                        <span className="flex items-center gap-2 text-xs font-bold text-slate-500">
                                                            <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                                                            Guardando…
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="rounded-lg border border-teal-100 bg-teal-50/80 px-4 py-3 text-xs text-teal-900">
                                                    <strong>Borradores = sólo staff.</strong> Al eliminar una simulación sólo se quita ese trozo del almacén de
                                                    borradores (<code className="bg-white/70 px-0.5 rounded">calendar_simulations</code>). Nunca borra equipos ni
                                                    jugadores. El calendario oficial en base de datos no cambia salvo que uses &quot;Publicar&quot; o
                                                    &quot;Limpiar calendario oficial&quot;.
                                                </div>

                                                <div className="rounded-lg border border-indigo-100 bg-indigo-50/80 px-4 py-3 text-xs text-indigo-950">
                                                    <strong>3 calendarios por día.</strong> Viernes (cadetes), Sábado (juvenil/senior) y Domingo
                                                    (infantil) son borradores independientes. Genera con IA o el simulador Muskiz en cada uno, o usa
                                                    «Generar los 3 días» para rellenarlos todos a la vez. Al publicar, puedes volcar solo el día activo o
                                                    los tres juntos ({weekendMatchCount} partidos en total entre los 3).
                                                </div>

                                                <div className="flex flex-wrap gap-3 items-end">
                                                    <div>
                                                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Simulación activa</label>
                                                        <select
                                                            value={activeDraftId ?? ''}
                                                            onChange={async (e) => {
                                                                const id = e.target.value;
                                                                setActiveDraftId(id);
                                                                setSimulationsSaving(true);
                                                                try {
                                                                    await saveCalendarSimulations({ drafts: simDrafts, activeDraftId: id });
                                                                } catch (err: unknown) {
                                                                    toast.error(err instanceof Error ? err.message : 'Error al guardar selección');
                                                                } finally {
                                                                    setSimulationsSaving(false);
                                                                }
                                                            }}
                                                            className="border rounded-lg px-3 py-2 text-sm font-semibold min-w-[220px]"
                                                        >
                                                            {simDrafts.map((d) => (
                                                                <option key={d.id} value={d.id}>
                                                                    {d.scheduleDay ? `${d.scheduleDay} · ` : ''}
                                                                    {d.name} ({d.matches.length})
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleAddSimulation()}
                                                        className="bg-primary text-background-dark px-4 py-2 rounded-lg text-xs font-bold uppercase"
                                                    >
                                                        + Nueva simulación
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleDuplicateActiveSimulation()}
                                                        disabled={!activeDraft}
                                                        className="border border-slate-200 bg-white px-4 py-2 rounded-lg text-xs font-bold uppercase disabled:opacity-50"
                                                    >
                                                        Duplicar
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleDeleteActiveSimulation()}
                                                        disabled={!activeDraft}
                                                        className="border border-red-100 text-red-600 bg-red-50 px-4 py-2 rounded-lg text-xs font-bold uppercase disabled:opacity-50"
                                                    >
                                                        Eliminar activa
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleResetAllSimulationsToFresh()}
                                                        className="border border-amber-200 text-amber-900 bg-amber-50 px-4 py-2 rounded-lg text-xs font-bold uppercase"
                                                    >
                                                        Borrar todas y empezar limpio
                                                    </button>
                                                </div>

                                                <div className="rounded-lg border border-slate-200 overflow-hidden">
                                                    <div className="bg-slate-50 px-3 py-2 text-[10px] font-black uppercase text-slate-500">
                                                        Todas las simulaciones (borrar una concreta)
                                                    </div>
                                                    <ul className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                                                        {simDrafts.map((d) => (
                                                            <li
                                                                key={d.id}
                                                                className="flex items-center justify-between gap-2 px-3 py-2 text-sm bg-white hover:bg-slate-50/80"
                                                            >
                                                                <div className="min-w-0">
                                                                    <span className="font-bold text-slate-800 truncate block">
                                                                        {d.scheduleDay ? (
                                                                            <span className="text-indigo-700">{d.scheduleDay} · </span>
                                                                        ) : null}
                                                                        {d.name}
                                                                    </span>
                                                                    <span className="text-[10px] text-slate-500">
                                                                        {d.matches.length} partido{d.matches.length === 1 ? '' : 's'} en borrador
                                                                    </span>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    title="Eliminar sólo este borrador"
                                                                    onClick={() => void handleDeleteSimulationById(d.id, d.name)}
                                                                    className="shrink-0 p-2 rounded-lg text-red-600 hover:bg-red-50 border border-transparent hover:border-red-100"
                                                                >
                                                                    <span className="material-symbols-outlined text-[20px]">delete</span>
                                                                </button>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>

                                                {activeDraft && (
                                                    <div className="grid md:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Nombre del borrador</label>
                                                            <input
                                                                value={activeDraft.name}
                                                                onChange={(e) => void handleDraftMetadataChange({ name: e.target.value })}
                                                                className="w-full border rounded-lg px-3 py-2 text-sm"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                                                                Formato del torneo (nota para ti)
                                                            </label>
                                                            <input
                                                                value={activeDraft.formatDescription ?? ''}
                                                                onChange={(e) => void handleDraftMetadataChange({ formatDescription: e.target.value })}
                                                                placeholder="Ej. 2 grupos de 4 + cruce 1º–2º..."
                                                                className="w-full border rounded-lg px-3 py-2 text-sm"
                                                            />
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="rounded-xl border border-teal-200 bg-teal-50/60 p-4 space-y-3">
                                                    <label className="flex items-start gap-3 cursor-pointer text-sm text-teal-950">
                                                        <input
                                                            type="checkbox"
                                                            checked={publishDraftAsPublic}
                                                            onChange={(e) => setPublishDraftAsPublic(e.target.checked)}
                                                            className="mt-1 size-4 rounded border-teal-300 text-teal-700 focus:ring-teal-600"
                                                        />
                                                        <span>
                                                            <strong>¿Publicar ahora?</strong> Si está marcado, cada partido se guarda como{' '}
                                                            <strong>público</strong> (visible en Competición para visitantes, además del interruptor global). Si
                                                            no, se guardan como <strong>privados</strong> (trabajo en sombra) hasta que pulses «Hacer público el
                                                            calendario actual» en la pestaña Oficial.
                                                        </span>
                                                    </label>
                                                    <div className="flex flex-wrap gap-2">
                                                        <button
                                                            type="button"
                                                            disabled={!activeDraft?.matches?.length}
                                                            onClick={() => void handlePublishActiveDraft()}
                                                            className="bg-teal-700 hover:bg-teal-800 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wide flex items-center gap-2"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">cloud_upload</span>
                                                            {activeDraft?.scheduleDay
                                                                ? `Publicar solo ${activeDraft.scheduleDay}`
                                                                : 'Guardar calendario oficial'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            disabled={weekendMatchCount === 0}
                                                            onClick={() => void handlePublishAllWeekendDrafts()}
                                                            className="bg-indigo-700 hover:bg-indigo-800 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wide flex items-center gap-2"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">calendar_month</span>
                                                            Publicar los 3 días ({weekendMatchCount})
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleClearActiveDraftMatches()}
                                                            disabled={!activeDraftId}
                                                            className="border border-slate-200 px-5 py-2.5 rounded-lg text-xs font-bold uppercase bg-white"
                                                        >
                                                            Vaciar borrador
                                                        </button>
                                                    </div>
                                                </div>

                                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                                                    <div className="flex justify-between items-center mb-4 flex-wrap gap-3">
                                                        <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                                            <span className="material-symbols-outlined text-purple-600">psychology</span>
                                                            Generación IA
                                                            {activeDraft?.scheduleDay ? ` (${activeDraft.scheduleDay})` : ' (borrador activo)'}
                                                        </h4>
                                                        <div className="flex gap-2 flex-wrap">
                                                            <input type="file" id="excel-upload" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleExcelImport} />
                                                            <label
                                                                htmlFor="excel-upload"
                                                                className={`cursor-pointer bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors ${!activeDraftId ? 'opacity-50 pointer-events-none' : ''}`}
                                                            >
                                                                <span className="material-symbols-outlined text-sm">upload_file</span>
                                                                Importar Excel al borrador
                                                            </label>
                                                        </div>
                                                    </div>

                                                    <div className="mb-4 rounded-lg border border-slate-200 bg-white/80 p-4">
                                                        <p className="text-[10px] font-black uppercase text-slate-500 mb-2">
                                                            Origen de equipos para la IA
                                                        </p>
                                                        <div className="flex flex-wrap gap-2 mb-3">
                                                            <button
                                                                type="button"
                                                                onClick={() => setSimulationMode('REAL')}
                                                                className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                                                                    simulationMode === 'REAL'
                                                                        ? 'bg-primary text-background-dark shadow-sm'
                                                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                                }`}
                                                            >
                                                                Equipos reales (pagados)
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => setSimulationMode('FAKE')}
                                                                className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                                                                    simulationMode === 'FAKE'
                                                                        ? 'bg-amber-600 text-white shadow-sm'
                                                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                                }`}
                                                            >
                                                                Equipos ficticios (pruebas)
                                                            </button>
                                                        </div>
                                                        {simulationMode === 'REAL' ? (
                                                            <p className="text-sm text-slate-700 leading-relaxed">
                                                                {activeDraft?.scheduleDay ? (
                                                                    <>
                                                                        Se simulará con{' '}
                                                                        <strong>{paidTeamsForSimulation.length}</strong> equipos reales pagados de{' '}
                                                                        <strong>{activeDraft.scheduleDay}</strong>
                                                                        {simulationDivisions.length > 0 && (
                                                                            <>
                                                                                {' '}
                                                                                (
                                                                                {simulationDivisions
                                                                                    .map((d) => d.replace(' Femenino', ' F').replace(' Masculino', ' M'))
                                                                                    .join(', ')}
                                                                                )
                                                                            </>
                                                                        )}
                                                                        .
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        Se simulará usando los{' '}
                                                                        <strong>{paidTeamsForSimulation.length}</strong> equipos reales que han pagado.
                                                                    </>
                                                                )}
                                                            </p>
                                                        ) : (
                                                            <div className="rounded-lg border border-amber-100 bg-amber-50/90 p-4">
                                                                <p className="text-xs text-amber-950 mb-3 leading-relaxed">
                                                                    {activeDraft?.scheduleDay ? (
                                                                        <>
                                                                            Equipos ficticios solo para categorías de{' '}
                                                                            <strong>{activeDraft.scheduleDay}</strong> (sugerencia: 12 por categoría). No se
                                                                            guardan en la base de datos.
                                                                        </>
                                                                    ) : (
                                                                        <>
                                                                            Ajusta cuántos equipos de prueba hay por categoría. No se guardan en la base de
                                                                            datos; sólo alimentan esta generación de borrador.
                                                                        </>
                                                                    )}
                                                                </p>
                                                                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                                                                    {simulationDivisions.map((division) => (
                                                                        <label
                                                                            key={division}
                                                                            className="flex flex-col gap-1 rounded-md border border-amber-200/80 bg-white/70 px-2 py-2"
                                                                        >
                                                                            <span className="text-[10px] font-bold uppercase text-amber-900/80 leading-tight">
                                                                                {division}
                                                                            </span>
                                                                            <input
                                                                                type="number"
                                                                                min={0}
                                                                                step={1}
                                                                                value={fakeTeamCounts[division]}
                                                                                onChange={(e) => {
                                                                                    const raw = parseInt(e.target.value, 10);
                                                                                    const next = Number.isFinite(raw) && raw >= 0 ? raw : 0;
                                                                                    setFakeCounts((prev) => ({ ...prev, [division]: next }));
                                                                                }}
                                                                                className="w-full border border-amber-100 rounded-md px-2 py-1.5 text-sm font-semibold text-slate-800"
                                                                            />
                                                                        </label>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-4">
                                                        <div>
                                                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Horario</label>
                                                            <div className="flex items-center gap-2">
                                                                <input type="time" value={genConfig.startTime} onChange={(e) => setGenConfig({ ...genConfig, startTime: e.target.value })} className="border rounded px-2 py-1 text-sm w-full" />
                                                                <span>a</span>
                                                                <input type="time" value={genConfig.endTime} onChange={(e) => setGenConfig({ ...genConfig, endTime: e.target.value })} className="border rounded px-2 py-1 text-sm w-full" />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Intervalo (mins)</label>
                                                            <input type="number" value={genConfig.intervalMins} onChange={(e) => setGenConfig({ ...genConfig, intervalMins: parseInt(e.target.value, 10) })} className="border rounded px-2 py-1 text-sm w-full" step="5" />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Parada comida</label>
                                                            <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer mt-6 md:mt-0">
                                                                <input type="checkbox" checked={genConfig.lunchBreak} onChange={(e) => setGenConfig({ ...genConfig, lunchBreak: e.target.checked })} className="rounded text-primary focus:ring-primary" />
                                                                13:00 – 14:00
                                                            </label>
                                                        </div>
                                                    </div>
                                                    <div className="mb-4">
                                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Pistas (separar por comas)</label>
                                                        <input type="text" value={genConfig.courtsInput} onChange={(e) => setGenConfig({ ...genConfig, courtsInput: e.target.value })} className="border rounded px-3 py-2 text-sm w-full" />
                                                    </div>
                                                    <div className="mb-4">
                                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Prompt IA</label>
                                                        <textarea
                                                            value={genConfig.customPrompt}
                                                            onChange={(e) => setGenConfig({ ...genConfig, customPrompt: e.target.value })}
                                                            className="w-full border rounded px-3 py-2 text-sm h-20 resize-none"
                                                            placeholder="Describe fases, grupos, horarios prioritarios..."
                                                        />
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleGenerateBracket()}
                                                        disabled={generatingBracket || !activeDraftId}
                                                        className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                                                    >
                                                        {generatingBracket ? (
                                                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                                                        ) : (
                                                            <span className="material-symbols-outlined">auto_awesome</span>
                                                        )}
                                                        {generatingBracket ? 'Generando…' : 'Generar en este borrador'}
                                                    </button>
                                                    <p className="mt-2 text-[11px] text-slate-500 leading-relaxed">
                                                        Requiere GEMINI_API_KEY válida en Supabase. Si falla, usa el simulador determinístico de abajo.
                                                    </p>
                                                </div>

                                                <div className="bg-teal-50 border border-teal-200 rounded-xl p-6 mt-6">
                                                    <div className="mb-3">
                                                        <h4 className="font-bold text-teal-900 flex items-center gap-2">
                                                            <span className="material-symbols-outlined text-teal-700">event_available</span>
                                                            Simulador fin de semana Muskiz (determinístico)
                                                        </h4>
                                                        <p className="text-xs text-teal-800 mt-2 leading-relaxed max-w-3xl">
                                                            <strong>Viernes:</strong> cadetes 17:00–21:00, 6 campos.{' '}
                                                            <strong>Sábado:</strong> juvenil/senior 9:00–21:00, comida 13:00–{muskizLunchEnd}, 6 campos.{' '}
                                                            <strong>Domingo:</strong> infantiles 9:00–15:00, 4 campos.{' '}
                                                            Huecos <strong>35 min</strong>. Objetivo <strong>4 partidos reales</strong> por equipo (mínimo {MIN_REAL_MATCHES_PER_TEAM}).{' '}
                                                            ≤5 equipos → liguilla + semis + final · 6–10 → 2 grupos + semis + final · ≥11 → 4 grupos + cuartos + semis + final.{' '}
                                                            Categorías mezcladas en el horario. Partidos sin hueco aparecen como <strong>PENDIENTE</strong>.
                                                        </p>
                                                        <div className="mt-3 flex items-center gap-3 flex-wrap">
                                                            <span className="text-[11px] font-bold text-teal-900">Descanso comida (sáb.):</span>
                                                            {(['14:30', '15:00'] as const).map((opt) => (
                                                                <button
                                                                    key={opt}
                                                                    type="button"
                                                                    onClick={() => setMuskizLunchEnd(opt)}
                                                                    className={`px-3 py-1 rounded-lg text-[11px] font-bold border transition-colors ${muskizLunchEnd === opt ? 'bg-teal-700 text-white border-teal-700' : 'bg-white text-teal-800 border-teal-300 hover:border-teal-500'}`}
                                                                >
                                                                    13:00 – {opt} ({opt === '14:30' ? '90 min' : '2 h'})
                                                                </button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleGenerateMuskizActiveDay()}
                                                            disabled={generatingMuskiz || !activeDraft?.scheduleDay}
                                                            className="flex-1 min-w-[200px] bg-teal-700 hover:bg-teal-800 text-white py-3 px-6 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                                                        >
                                                            {generatingMuskiz ? (
                                                                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                                                            ) : (
                                                                <span className="material-symbols-outlined">today</span>
                                                            )}
                                                            {generatingMuskiz
                                                                ? 'Generando…'
                                                                : activeDraft?.scheduleDay
                                                                  ? `Generar ${activeDraft.scheduleDay}`
                                                                  : 'Generar día activo'}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleGenerateMuskizAllDays()}
                                                            disabled={generatingMuskiz || weekendDrafts.length < 3}
                                                            className="flex-1 min-w-[200px] bg-indigo-700 hover:bg-indigo-800 text-white py-3 px-6 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
                                                        >
                                                            {generatingMuskiz ? (
                                                                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                                                            ) : (
                                                                <span className="material-symbols-outlined">calendar_month</span>
                                                            )}
                                                            {generatingMuskiz ? 'Generando…' : 'Generar los 3 días'}
                                                        </button>
                                                    </div>
                                                </div>

                                                {activeDraft && activeDraft.matches.length > 0 && (
                                                    <div className="mt-6">
                                                        <SimulationScheduleGridTabs
                                                            matches={activeDraft.matches}
                                                            fixedDay={activeDraft.scheduleDay}
                                                            onUpdateMatch={(id, patch) => void handleUpdateDraftMatch(id, patch)}
                                                        />
                                                    </div>
                                                )}

                                                <div>
                                                    <h4 className="text-sm font-black uppercase text-slate-500 mb-3">
                                                        Vista previa del borrador ({activeDraft?.matches.length ?? 0} partidos)
                                                    </h4>
                                                    <div className="grid gap-4">
                                                        {!activeDraft || activeDraft.matches.length === 0 ? (
                                                            <div className="text-center text-slate-400 py-8 border rounded-lg border-dashed">Sin partidos en este borrador</div>
                                                        ) : (
                                                            activeDraft.matches.map((match) => (
                                                                <div key={match.id} className={`flex flex-col lg:flex-row flex-wrap justify-between items-stretch lg:items-center gap-3 p-4 border rounded-lg ${
                                                                    match.time === 'PENDIENTE'
                                                                        ? 'border-amber-300 bg-amber-50/80'
                                                                        : 'border-teal-100 bg-teal-50/30'
                                                                }`}>
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        {match.scheduleDay && (
                                                                            <span className="bg-teal-200/80 text-teal-900 text-[10px] font-black px-2 py-0.5 rounded uppercase">
                                                                                {match.scheduleDay}
                                                                            </span>
                                                                        )}
                                                                        <span className="bg-primary/10 text-primary-dark text-[10px] font-bold px-2 py-0.5 rounded uppercase">{match.round || 'Partido'}</span>
                                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white text-teal-800">{match.time}</span>
                                                                    </div>
                                                                    <div className="flex items-center gap-6">
                                                                        <span className="font-bold text-slate-800">{match.teamA}</span>
                                                                        <span className="text-xs text-slate-400">vs</span>
                                                                        <span className="font-bold text-slate-800">{match.teamB}</span>
                                                                    </div>
                                                                    <div className="text-xs text-slate-500 flex items-center gap-1">
                                                                        <span className="material-symbols-outlined text-sm">location_on</span>
                                                                        {match.court}
                                                                    </div>
                                                                </div>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* 3. CALENDARIO OFICIAL (tabla matches) */}
                                {compSubTab === 'published' && (
                                    <div className="space-y-6">
                                        <div
                                            className={`rounded-xl border p-4 text-sm ${
                                                officialCalendarStatus.variant === 'official'
                                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                                                    : officialCalendarStatus.variant === 'draft'
                                                      ? 'border-amber-200 bg-amber-50 text-amber-950'
                                                      : officialCalendarStatus.variant === 'mixed'
                                                        ? 'border-violet-200 bg-violet-50 text-violet-950'
                                                        : 'border-slate-200 bg-slate-50 text-slate-700'
                                            }`}
                                        >
                                            <p className="text-xs font-black uppercase tracking-wide opacity-80 mb-1">Estado (tabla matches)</p>
                                            <p className="font-black text-base">{officialCalendarStatus.headline}</p>
                                            <p className="mt-1 leading-relaxed">{officialCalendarStatus.sub}</p>
                                            <p className="mt-2 text-xs opacity-90">
                                                El interruptor global sigue en <strong>Simulaciones</strong>; además, cada partido tiene su propio{' '}
                                                <code className="rounded bg-white/70 px-1">is_public</code>.
                                            </p>
                                        </div>

                                        <div className="bg-slate-100 border border-slate-200 p-4 rounded-lg text-sm text-slate-700">
                                            <p>
                                                <strong>Calendario oficial</strong>: lo que hay en la base de datos <code className="bg-white px-1 rounded">matches</code>.
                                                Aquí ves <strong>todos</strong> los partidos (públicos y privados). Los visitantes sólo ven los públicos.
                                            </p>
                                        </div>

                                        <div className="flex flex-wrap gap-2 items-center">
                                            {matches.length > 0 && (
                                                <>
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleMakeAllMatchesPublic()}
                                                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-xs font-black uppercase tracking-wide flex items-center gap-2 shadow-sm"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">visibility</span>
                                                        Hacer público el calendario actual
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (
                                                                window.confirm(
                                                                    '¿Borrar TODOS los partidos oficiales de la base de datos? Esta acción deja sin calendario publicado hasta que guardes otra vez.',
                                                                )
                                                            ) {
                                                                void onUpdateMatches([]);
                                                            }
                                                        }}
                                                        className="bg-red-50 text-red-600 border border-red-100 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">delete_sweep</span>
                                                        Limpiar calendario oficial
                                                    </button>
                                                </>
                                            )}
                                        </div>

                                        <div className="grid gap-4">
                                            {matches.length === 0 ? (
                                                <div className="text-center text-slate-400 py-8">No hay partidos en la tabla oficial.</div>
                                            ) : (
                                                matches.map((match) => (
                                                    <div
                                                        key={match.id}
                                                        className="flex flex-col lg:flex-row flex-wrap justify-between items-stretch lg:items-center gap-3 p-4 border border-slate-100 rounded-lg bg-slate-50/50"
                                                    >
                                                        <div className="flex flex-col mb-2 sm:mb-0 gap-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span
                                                                    className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                                                                        match.isPublic
                                                                            ? 'bg-emerald-100 text-emerald-800'
                                                                            : 'bg-amber-100 text-amber-900'
                                                                    }`}
                                                                >
                                                                    {match.isPublic ? 'Público' : 'Privado'}
                                                                </span>
                                                                <span className="bg-primary/10 text-primary-dark text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider">
                                                                    {match.round || 'Partido'}
                                                                </span>
                                                                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-green-100 text-green-700">
                                                                    {match.time}
                                                                </span>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-6">
                                                            <span className="font-bold text-slate-800">{match.teamA}</span>
                                                            <span className="text-xs text-slate-400">vs</span>
                                                            <span className="font-bold text-slate-800">{match.teamB}</span>
                                                        </div>
                                                        <div className="text-xs text-slate-500 flex items-center gap-1 lg:mr-auto">
                                                            <span className="material-symbols-outlined text-sm">location_on</span> {match.court}
                                                        </div>
                                                        {match.id && (
                                                            <button
                                                                type="button"
                                                                onClick={() => navigate(`/admin/match-report/${match.id}`)}
                                                                className="inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-sm hover:border-primary hover:text-primary"
                                                            >
                                                                <span className="material-symbols-outlined text-[16px]">print</span>
                                                                Generar Acta
                                                            </button>
                                                        )}
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

                                                <div className="w-full md:w-auto flex flex-wrap justify-end gap-2 mt-4 md:mt-0">
                                                    {match.id && (
                                                        <button
                                                            type="button"
                                                            onClick={() => navigate(`/admin/match-report/${match.id}`)}
                                                            className="px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 border border-teal-200 bg-teal-50 text-teal-900 hover:bg-teal-100 transition-colors"
                                                        >
                                                            <span className="material-symbols-outlined text-sm">print</span>
                                                            Generar Acta
                                                        </button>
                                                    )}
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

                                {/* 5. STANDINGS */}
                                {compSubTab === 'standings' && (
                                    <div className="space-y-4">
                                        <div className="flex flex-col gap-3">
                                            <div className="flex overflow-x-auto gap-2 pb-1">
                                                {DIVISIONS_LIST.map((cat) => (
                                                    <button
                                                        key={cat}
                                                        type="button"
                                                        onClick={() => {
                                                            setStandingsDivision(cat);
                                                            setStandingsGroupFilter('all');
                                                        }}
                                                        className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap shrink-0 ${
                                                            standingsDivision === cat
                                                                ? 'bg-primary text-background-dark shadow'
                                                                : 'bg-slate-100 text-slate-600'
                                                        }`}
                                                    >
                                                        {cat}
                                                    </button>
                                                ))}
                                            </div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-[10px] font-black uppercase text-slate-400">Grupo</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setStandingsGroupFilter('all')}
                                                    className={`px-3 py-1 rounded-full text-[10px] font-bold ${
                                                        standingsGroupFilter === 'all' ? 'bg-secondary text-background-dark' : 'bg-slate-100 text-slate-600'
                                                    }`}
                                                >
                                                    Todos
                                                </button>
                                                {standingsGroupsAvailable.map((g) => (
                                                    <button
                                                        key={g}
                                                        type="button"
                                                        onClick={() => setStandingsGroupFilter(g)}
                                                        className={`px-3 py-1 rounded-full text-[10px] font-bold ${
                                                            standingsGroupFilter === g ? 'bg-secondary text-background-dark' : 'bg-slate-100 text-slate-600'
                                                        }`}
                                                    >
                                                        {g}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
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
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'sponsors' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center">
                                <h2 className="text-2xl font-black text-slate-800">Gestión de Patrocinadores</h2>
                                <div className="text-xs text-slate-400 font-medium bg-slate-100 px-2 py-1 rounded-full uppercase tracking-wider">Base de Datos en Tiempo Real</div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Formulario */}
                                <div className="lg:col-span-1">
                                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm sticky top-6">
                                        <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                            <span className="material-symbols-outlined text-primary">add_circle</span>
                                            Añadir Patrocinador
                                        </h3>
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Nombre</label>
                                                <input
                                                    type="text"
                                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                                                    value={newSponsor.name}
                                                    onChange={e => setNewSponsor({ ...newSponsor, name: e.target.value })}
                                                    placeholder="Ej: Nike"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Categoría (Tier)</label>
                                                <select
                                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm"
                                                    value={newSponsor.tier}
                                                    onChange={e => setNewSponsor({ ...newSponsor, tier: e.target.value as any })}
                                                >
                                                    <option value="Platinum">Platinum (Main)</option>
                                                    <option value="Gold">Gold</option>
                                                    <option value="Silver">Silver</option>
                                                    <option value="Collaborator">Collaborator</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Website URL</label>
                                                <input
                                                    type="url"
                                                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all text-sm font-mono"
                                                    value={newSponsor.website_url}
                                                    onChange={e => setNewSponsor({ ...newSponsor, website_url: e.target.value })}
                                                    placeholder="https://..."
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Logo</label>
                                                <div className="flex flex-col gap-3">
                                                    {newSponsor.logo_url && (
                                                        <div className="relative size-20 bg-slate-50 rounded-xl border border-slate-200 overflow-hidden group">
                                                            <img src={newSponsor.logo_url} alt="Preview" className="w-full h-full object-contain" />
                                                            <button
                                                                onClick={() => setNewSponsor({ ...newSponsor, logo_url: '' })}
                                                                className="absolute inset-0 bg-red-500/80 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                            >
                                                                <span className="material-symbols-outlined">delete</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                    <div className="relative">
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            onChange={handleLogoUpload}
                                                            className="hidden"
                                                            id="logo-upload"
                                                            disabled={isUploadingLogo}
                                                        />
                                                        <label
                                                            htmlFor="logo-upload"
                                                            className={`w-full py-3 border-2 border-dashed rounded-xl flex flex-col items-center justify-center gap-1 cursor-pointer transition-colors ${isUploadingLogo ? 'bg-slate-50 border-slate-200' : 'border-slate-300 hover:border-primary hover:bg-primary/5'}`}
                                                        >
                                                            {isUploadingLogo ? (
                                                                <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
                                                            ) : (
                                                                <>
                                                                    <span className="material-symbols-outlined text-slate-400">upload</span>
                                                                    <span className="text-[10px] font-bold text-slate-500 uppercase">Subir Imagen</span>
                                                                </>
                                                            )}
                                                        </label>
                                                    </div>
                                                </div>
                                            </div>
                                            <button
                                                onClick={handleAddSponsor}
                                                className="w-full py-3 bg-primary text-background-dark font-black rounded-xl hover:opacity-90 shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2 mt-4"
                                            >
                                                <span className="material-symbols-outlined">save</span>
                                                Guardar Patrocinador
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Lista */}
                                <div className="lg:col-span-2">
                                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px] tracking-wider">
                                                <tr>
                                                    <th className="px-6 py-4">Patrocinador</th>
                                                    <th className="px-6 py-4">Nivel</th>
                                                    <th className="px-6 py-4">Website</th>
                                                    <th className="px-6 py-4 text-right">Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {sponsorsLoading ? (
                                                    <tr><td colSpan={4} className="p-10 text-center"><span className="material-symbols-outlined animate-spin text-4xl text-slate-200">progress_activity</span></td></tr>
                                                ) : sponsors.length === 0 ? (
                                                    <tr><td colSpan={4} className="p-10 text-center text-slate-400 italic">No hay patrocinadores registrados</td></tr>
                                                ) : (
                                                    sponsors.map(sponsor => (
                                                        <tr key={sponsor.id} className="hover:bg-slate-50/50 transition-colors">
                                                            <td className="px-6 py-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="size-10 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden border border-slate-200">
                                                                        {sponsor.logo_url ? <img src={sponsor.logo_url} className="w-full h-full object-contain" /> : <span className="material-symbols-outlined text-slate-300">image</span>}
                                                                    </div>
                                                                    <span className="font-bold text-slate-800">{sponsor.name}</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <span className={`px-2 py-1 rounded text-[10px] font-black uppercase tracking-tighter ${
                                                                    sponsor.tier === 'Platinum' ? 'bg-indigo-100 text-indigo-700' :
                                                                    sponsor.tier === 'Gold' ? 'bg-yellow-100 text-yellow-700' :
                                                                    sponsor.tier === 'Silver' ? 'bg-slate-200 text-slate-600' :
                                                                    'bg-orange-100 text-orange-700'
                                                                }`}>
                                                                    {sponsor.tier}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                {sponsor.website_url ? (
                                                                    <a href={sponsor.website_url} target="_blank" className="text-primary hover:underline font-mono text-xs truncate max-w-[150px] block">{sponsor.website_url}</a>
                                                                ) : (
                                                                    <span className="text-slate-300">-</span>
                                                                )}
                                                            </td>
                                                            <td className="px-6 py-4 text-right">
                                                                <button
                                                                    onClick={() => handleDeleteSponsor(sponsor.id)}
                                                                    className="size-8 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                                >
                                                                    <span className="material-symbols-outlined text-lg">delete</span>
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- CATEGORIES TAB --- */}
                    {activeTab === 'categories' && (
                        <div className="space-y-6">
                            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                                <div className="p-6 border-b border-slate-100">
                                    <h3 className="font-bold text-lg text-slate-800">Gestión de Categorías y Precios</h3>
                                    <p className="text-xs text-slate-500 mt-1">Configura los límites de equipos y los precios de inscripción.</p>
                                </div>
                                <div className="p-6">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead>
                                                <tr className="text-slate-500 border-b border-slate-100">
                                                    <th className="px-6 py-4 font-bold uppercase text-[10px]">Categoría</th>
                                                    <th className="px-6 py-4 font-bold uppercase text-[10px]">Precio (€)</th>
                                                    <th className="px-6 py-4 font-bold uppercase text-[10px]">Límite Equipos</th>
                                                    <th className="px-6 py-4 font-bold uppercase text-[10px] text-right">Acciones</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-50">
                                                {categories.map(cat => (
                                                    <tr key={cat.id} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-6 py-4 font-bold text-slate-800">{cat.name}</td>
                                                        <td className="px-6 py-4">
                                                            <input 
                                                                type="number" 
                                                                defaultValue={cat.price}
                                                                onBlur={(e) => handleUpdateCategory(cat.id, { price: Number(e.target.value) })}
                                                                className="w-20 border border-slate-200 rounded px-2 py-1 bg-slate-50 outline-none focus:ring-1 focus:ring-primary"
                                                            />
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <input 
                                                                type="number" 
                                                                defaultValue={cat.max_teams}
                                                                onBlur={(e) => handleUpdateCategory(cat.id, { max_teams: Number(e.target.value) })}
                                                                className="w-20 border border-slate-200 rounded px-2 py-1 bg-slate-50 outline-none focus:ring-1 focus:ring-primary"
                                                            />
                                                        </td>
                                                        <td className="px-6 py-4 text-right">
                                                            <span className="text-[10px] text-slate-400 font-mono">Autosave</span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
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
                                                    {playersEligibleForMatch(team.players).length === 0 && (
                                                        <p className="text-sm text-slate-400 text-center italic">
                                                            Ningún jugador con DNI y seguro aprobados.
                                                        </p>
                                                    )}
                                                    {playersEligibleForMatch(team.players).map(player => {
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

            {/* --- EDIT PLAYER MODAL --- */}
            {editingPlayerContext && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-800 to-slate-900 text-white">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                <span className="material-symbols-outlined">person_edit</span> Editar jugador
                            </h3>
                            <button
                                type="button"
                                onClick={() => setEditingPlayerContext(null)}
                                className="p-2 hover:bg-white/20 rounded-full transition-colors"
                            >
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>
                        <div className="p-6 space-y-4 overflow-y-auto max-h-[70vh]">
                            <p className="text-xs text-slate-500">
                                Equipo:{' '}
                                <span className="font-bold text-slate-700">{editingPlayerContext.team.name}</span>
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                                        Nombre
                                    </label>
                                    <input
                                        type="text"
                                        value={editingPlayerContext.player.name}
                                        onChange={e =>
                                            setEditingPlayerContext({
                                                ...editingPlayerContext,
                                                player: { ...editingPlayerContext.player, name: e.target.value },
                                            })
                                        }
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                                        Apellidos
                                    </label>
                                    <input
                                        type="text"
                                        value={editingPlayerContext.player.surnames ?? ''}
                                        onChange={e =>
                                            setEditingPlayerContext({
                                                ...editingPlayerContext,
                                                player: {
                                                    ...editingPlayerContext.player,
                                                    surnames: e.target.value,
                                                },
                                            })
                                        }
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                                        DNI / NIF
                                    </label>
                                    <input
                                        type="text"
                                        value={editingPlayerContext.player.dniNumber ?? ''}
                                        onChange={e =>
                                            setEditingPlayerContext({
                                                ...editingPlayerContext,
                                                player: {
                                                    ...editingPlayerContext.player,
                                                    dniNumber: e.target.value,
                                                },
                                            })
                                        }
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                                        Fecha nacimiento
                                    </label>
                                    <input
                                        type="date"
                                        value={editingPlayerContext.player.birthDate ?? ''}
                                        onChange={e =>
                                            setEditingPlayerContext({
                                                ...editingPlayerContext,
                                                player: {
                                                    ...editingPlayerContext.player,
                                                    birthDate: e.target.value,
                                                },
                                            })
                                        }
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                                        Dorsal
                                    </label>
                                    <input
                                        type="number"
                                        min={0}
                                        value={editingPlayerContext.player.number}
                                        onChange={e =>
                                            setEditingPlayerContext({
                                                ...editingPlayerContext,
                                                player: {
                                                    ...editingPlayerContext.player,
                                                    number: parseInt(e.target.value, 10) || 0,
                                                },
                                            })
                                        }
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                                        Posición
                                    </label>
                                    <input
                                        type="text"
                                        value={editingPlayerContext.player.position ?? ''}
                                        onChange={e =>
                                            setEditingPlayerContext({
                                                ...editingPlayerContext,
                                                player: {
                                                    ...editingPlayerContext.player,
                                                    position: e.target.value,
                                                },
                                            })
                                        }
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Rol</label>
                                    <select
                                        value={editingPlayerContext.player.role}
                                        onChange={e =>
                                            setEditingPlayerContext({
                                                ...editingPlayerContext,
                                                player: {
                                                    ...editingPlayerContext.player,
                                                    role: e.target.value as Player['role'],
                                                },
                                            })
                                        }
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 outline-none"
                                    >
                                        <option value="PLAYER">Jugador</option>
                                        <option value="COACH">Entrenador</option>
                                        <option value="OFFICIAL">Oficial</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-2 pt-6">
                                    <input
                                        id="player-verified"
                                        type="checkbox"
                                        checked={editingPlayerContext.player.verified}
                                        onChange={e =>
                                            setEditingPlayerContext({
                                                ...editingPlayerContext,
                                                player: {
                                                    ...editingPlayerContext.player,
                                                    verified: e.target.checked,
                                                },
                                            })
                                        }
                                        className="rounded border-slate-300"
                                    />
                                    <label htmlFor="player-verified" className="text-sm text-slate-700">
                                        Jugador verificado (general)
                                    </label>
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setEditingPlayerContext(null)}
                                className="px-6 py-2.5 rounded-lg font-bold text-slate-500 hover:bg-slate-200 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleSavePlayerEdit}
                                className="px-6 py-2.5 rounded-lg font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-lg flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined text-sm">save</span>
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* --- EDIT TEAM MODAL --- */}
            {editingTeam && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-800 to-slate-900 text-white">
                            <h3 className="font-bold text-lg flex items-center gap-2">
                                <span className="material-symbols-outlined">edit_note</span> Editar Equipo
                            </h3>
                            <button onClick={() => setEditingTeam(null)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                                <span className="material-symbols-outlined">close</span>
                            </button>
                        </div>

                        {/* Form */}
                        <div className="p-6 space-y-5 overflow-y-auto max-h-[70vh]">
                            {/* Team Info */}
                            <div>
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">groups</span> Datos del Equipo
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Nombre del Equipo</label>
                                        <input
                                            type="text"
                                            value={editForm.name}
                                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Ciudad</label>
                                        <input
                                            type="text"
                                            value={editForm.city}
                                            onChange={e => setEditForm({ ...editForm, city: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                        />
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Categoría</label>
                                        <select
                                            value={editForm.division}
                                            onChange={e => setEditForm({ ...editForm, division: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                        >
                                            <option value="Infantil Femenino">Infantil Femenino</option>
                                            <option value="Infantil Masculino">Infantil Masculino</option>
                                            <option value="Cadete Femenino">Cadete Femenino</option>
                                            <option value="Cadete Masculino">Cadete Masculino</option>
                                            <option value="Juvenil Femenino">Juvenil Femenino</option>
                                            <option value="Juvenil Masculino">Juvenil Masculino</option>
                                            <option value="Senior Femenino">Senior Femenino</option>
                                            <option value="Senior Masculino">Senior Masculino</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Cuota (€)</label>
                                        <input
                                            type="number"
                                            value={editForm.fee}
                                            onChange={e => setEditForm({ ...editForm, fee: parseFloat(e.target.value) || 0 })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Manager Info */}
                            <div>
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">person</span> Datos del Responsable
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Nombre Responsable</label>
                                        <input
                                            type="text"
                                            value={editForm.managerName}
                                            onChange={e => setEditForm({ ...editForm, managerName: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Email Responsable</label>
                                        <input
                                            type="email"
                                            value={editForm.managerEmail}
                                            onChange={e => setEditForm({ ...editForm, managerEmail: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Status */}
                            <div>
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">tune</span> Estado
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Estado de Pago</label>
                                        <select
                                            value={editForm.paymentStatus}
                                            onChange={e => setEditForm({ ...editForm, paymentStatus: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                        >
                                            <option value="PENDING">Pendiente</option>
                                            <option value="WAITING_VALIDATION">Esperando Validación</option>
                                            <option value="PAID">Pagado</option>
                                            <option value="EXPIRED">Expirado / Rechazado</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Estado Inscripción</label>
                                        <select
                                            value={editForm.status}
                                            onChange={e => setEditForm({ ...editForm, status: e.target.value })}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
                                        >
                                            <option value="pending">Pendiente</option>
                                            <option value="approved">Aprobado</option>
                                            <option value="rejected">Rechazado</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Warning */}
                            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                                <span className="material-symbols-outlined text-amber-500 text-base mt-0.5">warning</span>
                                <p className="text-xs text-amber-800">
                                    <strong>Atención:</strong> Cambiar el estado a «Aprobado» o «Rechazado» disparará automáticamente el envío de un email al responsable del equipo.
                                </p>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                            <button
                                onClick={() => setEditingTeam(null)}
                                className="px-6 py-2.5 rounded-lg font-bold text-slate-500 hover:bg-slate-200 transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveEdit}
                                className="px-6 py-2.5 rounded-lg font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-lg flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined text-sm">save</span>
                                Guardar Cambios
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};