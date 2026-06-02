import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Team, Match, CategoryLimits, MatchReport, PlayerStat, Player, CalendarDraft, type BeachSetScores } from '../types';
import { applySetScoresToMatch } from '../utils/beachSetScoring';
import { generateSocialMediaPost } from '../services/geminiService';
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
    buildDivisionMinMatchesFromCategories,
    countDivisionMatchBreakdown,
    countMatchesPerTeamForDivision,
    divisionBelongsToScheduleDay,
    MIN_REAL_MATCHES_PER_TEAM,
    MIN_TEAMS_PER_GROUP,
    MUSKIZ_AI_MAX_CALLS_PER_DAY,
    MUSKIZ_AI_SLOT_ASSIST_MAX,
    resolveMatchDivision,
    resolveMinMatchesForDivision,
    resolveTeamForMatchSide,
    teamsEligibleForSchedule,
    type MuskizSimulatorOptions,
} from '../services/muskizScheduleSimulator';
import {
    buildMuskizDayDraftMatchesHybrid,
    buildMuskizWeekendDraftsByDayHybrid,
} from '../services/muskizScheduleHybrid';
import { CompetitionCalendarViews } from '../components/CompetitionCalendarViews';
import { CompetitionResultsTable } from '../components/CompetitionResultsTable';
import { CompetitionDraftPicker } from '../components/CompetitionDraftPicker';
import { saveBulkActasPayload } from '../utils/bulkActasSession';
import {
    isPlayerRole,
    isPlayerEligibleForMatch,
    memberDocsComplete,
    memberDocsMissing,
    memberDocsPending,
    playerRoleLabel,
    playersEligibleForMatch,
    playersListedOnActa,
} from '../utils/squadLimits';
import { buildInitialDigitalReportStats } from '../utils/actaBuildContext';
import { downloadActaDocx, downloadActasZip, printActaHtml } from '../services/actaExportService';
import { MatchReportSheet } from '../components/MatchReportSheet';
import { CompetitionGroupManager } from '../components/CompetitionGroupManager';
import {
    getGroupDistributionForDivision,
    getTeamsInDivisionGroup,
    remapMatchesAfterGroupChange,
    validateGroupDistribution,
} from '../utils/groupMatchSync';
import {
    loadAdminUiState,
    saveAdminUiState,
    type AdminCompSubTab,
    type AdminMainTab,
    type AdminPreviewMode,
} from '../utils/adminUiPersistence';
import { getTeamSquadReminderStatus } from '../utils/teamSquadReminder';
import { validateMatchSlotChange } from '../utils/matchScheduleValidation';

interface AdminProps {
    onUpdateTeam: (team: Team) => void;
    onUpdateMatches: (matches: Match[]) => void;
    onUpdateLimits: (limits: CategoryLimits) => void;
}

const ADMIN_MAIN_NAV: { id: AdminMainTab; label: string; shortLabel: string; icon: string }[] = [
    { id: 'verification', label: 'Verificación', shortLabel: 'Docs', icon: 'fact_check' },
    { id: 'teamRoster', label: 'Equipos', shortLabel: 'Equipos', icon: 'shield_person' },
    { id: 'managers', label: 'Responsables', shortLabel: 'Resp.', icon: 'contact_phone' },
    { id: 'teams', label: 'Pagos e inscripciones', shortLabel: 'Pagos', icon: 'payments' },
    { id: 'competition', label: 'Competición', shortLabel: 'Comp', icon: 'trophy' },
    { id: 'sponsors', label: 'Patrocinadores', shortLabel: 'Patroc', icon: 'handshake' },
    { id: 'categories', label: 'Configuración', shortLabel: 'Config', icon: 'settings_suggest' },
];

const DIVISION_OPTIONS: Team['division'][] = [
    'Infantil Femenino',
    'Infantil Masculino',
    'Cadete Femenino',
    'Cadete Masculino',
    'Juvenil Femenino',
    'Juvenil Masculino',
    'Senior Femenino',
    'Senior Masculino',
];

function phoneDigits(phone: string | undefined): string {
    if (!phone) return '';
    return phone.replace(/\D/g, '');
}

type ManagerEntry = {
    key: string;
    name: string;
    email: string;
    phone?: string;
    teams: Pick<Team, 'id' | 'name' | 'division' | 'status'>[];
};

function managerWhatsAppLine(entry: ManagerEntry): string {
    const phone = entry.phone?.trim() || 'Sin teléfono';
    const teams = entry.teams.map((t) => `${t.name} (${t.division})`).join(', ');
    return `${entry.name} — ${phone} — Equipos: ${teams}`;
}

function AdminNavButton({
    item,
    active,
    onClick,
    className = '',
}: {
    item: (typeof ADMIN_MAIN_NAV)[number];
    active: boolean;
    onClick: () => void;
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors ${
                active
                    ? 'bg-primary/10 text-primary-dark border border-primary/20'
                    : 'text-slate-500 hover:bg-white border border-transparent'
            } ${className}`}
        >
            <span className="material-symbols-outlined text-lg">{item.icon}</span>
            {item.label}
        </button>
    );
}

export const Admin: React.FC<AdminProps> = ({ onUpdateTeam, onUpdateMatches, onUpdateLimits }) => {
    const navigate = useNavigate();
    const { teams, matches, categoryLimits, publicMatchesVisible, persistPublicMatchesVisible } = useTournamentData();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [adminEmail, setAdminEmail] = useState('');
    const [passwordInput, setPasswordInput] = useState('');
    const [sessionReady, setSessionReady] = useState(false);

    // Restore session on mount (no volver a pantalla de carga al refrescar token)
    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setIsAuthenticated(!!session?.user);
            setSessionReady(true);
        });
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setIsAuthenticated(!!session?.user);
            if (event !== 'TOKEN_REFRESHED') setSessionReady(true);
        });
        return () => subscription.unsubscribe();
    }, []);

    // Generator State
    const [generatingMuskiz, setGeneratingMuskiz] = useState(false);
    const [muskizAiSlotAssist, setMuskizAiSlotAssist] = useState(true);
    const [remindingSquadTeamId, setRemindingSquadTeamId] = useState<string | null>(null);

    const [simDrafts, setSimDrafts] = useState<CalendarDraft[]>([]);
    const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
    const [simulationsLoaded, setSimulationsLoaded] = useState(false);
    const [simulationsSaving, setSimulationsSaving] = useState(false);

    const [publishDraftAsPublic, setPublishDraftAsPublic] = useState(false);

    const savedAdminUi = useMemo(() => loadAdminUiState(), []);

    const [structureDivision, setStructureDivision] = useState<Team['division']>(
        (savedAdminUi.structureDivision as Team['division']) || 'Senior Masculino'
    );
    const [standingsDivision, setStandingsDivision] = useState<Team['division']>(
        (savedAdminUi.standingsDivision as Team['division']) || 'Senior Masculino'
    );
    const [standingsGroupFilter, setStandingsGroupFilter] = useState<string>('A');
    const [resultsDivisionFilter, setResultsDivisionFilter] = useState<Team['division'] | 'all'>('all');
    /** Simulación vs Oficial (toda la sección Competición) */
    const [compArenaMode, setCompArenaMode] = useState<AdminPreviewMode>(
        savedAdminUi.compArenaMode ?? savedAdminUi.compPreviewMode ?? 'simulation'
    );
    /** Borrador para previsualizar en Calendario / Resultados / Clasificación (modo Simulación) */
    const [simulationViewDraftId, setSimulationViewDraftId] = useState<string | 'all'>(
        savedAdminUi.simulationViewDraftId ?? 'all'
    );
    const [loginSubmitting, setLoginSubmitting] = useState(false);

    // Acta Management State
    const [selectedMatchForReport, setSelectedMatchForReport] = useState<Match | null>(null);
    const [reportMode, setReportMode] = useState<'DIGITAL' | 'IMAGE'>('DIGITAL');

    // Social Media Post State
    const [socialPostModal, setSocialPostModal] = useState<{ show: boolean, content: string, generating: boolean }>({ show: false, content: '', generating: false });

    // Edit Team Modal
    const [editingTeam, setEditingTeam] = useState<Team | null>(null);
    const [editForm, setEditForm] = useState<{
        name: string; city: string; division: string;
        managerName: string; managerEmail: string; managerPhone: string;
        paymentStatus: string; status: string; fee: number;
    }>({ name: '', city: '', division: '', managerName: '', managerEmail: '', managerPhone: '', paymentStatus: '', status: '', fee: 0 });

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

    const muskizSimulatorOptions = useMemo((): MuskizSimulatorOptions => ({
        divisionMinMatches: buildDivisionMinMatchesFromCategories(categories),
        aiSlotAssist: muskizAiSlotAssist,
    }), [categories, muskizAiSlotAssist]);

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

    // Main Navigation Tabs (persistidos en sessionStorage al cambiar de pestaña/minimizar)
    const [activeTab, setActiveTab] = useState<AdminMainTab>(savedAdminUi.activeTab ?? 'verification');
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const [rosterSelectedTeamId, setRosterSelectedTeamId] = useState<string | null>(null);
    const [rosterSearch, setRosterSearch] = useState('');
    const [editingPlayerContext, setEditingPlayerContext] = useState<{ team: Team; player: Player } | null>(null);

    useEffect(() => {
        if (activeTab !== 'teamRoster') {
            setRosterSelectedTeamId(null);
        }
    }, [activeTab]);

    const selectAdminTab = (tab: AdminMainTab) => {
        setActiveTab(tab);
        setMobileNavOpen(false);
    };

    useEffect(() => {
        if (!mobileNavOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setMobileNavOpen(false);
        };
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = '';
            window.removeEventListener('keydown', onKey);
        };
    }, [mobileNavOpen]);

    const activeNavItem = ADMIN_MAIN_NAV.find((n) => n.id === activeTab);

    // Competition Sub-tabs
    const [compSubTab, setCompSubTab] = useState<AdminCompSubTab>(savedAdminUi.compSubTab ?? 'structure');

    useEffect(() => {
        saveAdminUiState({
            activeTab,
            compSubTab,
            compArenaMode,
            simulationViewDraftId,
            structureDivision,
            standingsDivision,
        });
    }, [activeTab, compSubTab, compArenaMode, simulationViewDraftId, structureDivision, standingsDivision]);

    // --- Team Filters ---
    const [filterCategory, setFilterCategory] = useState<string>('all');
    const [filterSex, setFilterSex] = useState<string>('all');
    const [filterPayment, setFilterPayment] = useState<string>('all');
    const [filterStatus, setFilterStatus] = useState<string>('all');
    const [filterTeam, setFilterTeam] = useState<string>('');
    const [filterVerificationRole, setFilterVerificationRole] = useState<'all' | Player['role']>('all');

    const [managersSearch, setManagersSearch] = useState('');
    const [managersDivision, setManagersDivision] = useState<Team['division'] | 'all'>('all');
    const [managersOnlyApproved, setManagersOnlyApproved] = useState(false);

    const managerEntries = useMemo<ManagerEntry[]>(() => {
        const grouped = new Map<string, ManagerEntry>();

        for (const t of teams) {
            if (managersDivision !== 'all' && t.division !== managersDivision) continue;
            if (managersOnlyApproved && t.status !== 'approved') continue;

            const name = t.managerName?.trim() || 'Responsable';
            const email = t.managerEmail?.trim().toLowerCase() || '';
            const phone = t.managerPhone?.trim() || undefined;
            const key = email || `${name.toLowerCase()}|${phoneDigits(phone)}`;

            if (!grouped.has(key)) {
                grouped.set(key, { key, name, email, phone, teams: [] });
            }
            const entry = grouped.get(key)!;
            if (!entry.phone && phone) entry.phone = phone;
            entry.teams.push({
                id: t.id,
                name: t.name,
                division: t.division,
                status: t.status,
            });
        }

        const q = managersSearch.trim().toLowerCase();
        return [...grouped.values()]
            .map((entry) => ({
                ...entry,
                teams: [...entry.teams].sort(
                    (a, b) =>
                        a.division.localeCompare(b.division, 'es') ||
                        a.name.localeCompare(b.name, 'es')
                ),
            }))
            .filter((entry) => {
                if (!q) return true;
                return (
                    entry.name.toLowerCase().includes(q) ||
                    entry.email.toLowerCase().includes(q) ||
                    (entry.phone ?? '').toLowerCase().includes(q) ||
                    entry.teams.some(
                        (team) =>
                            team.name.toLowerCase().includes(q) ||
                            team.division.toLowerCase().includes(q)
                    )
                );
            })
            .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    }, [teams, managersSearch, managersDivision, managersOnlyApproved]);

    const copyManagersText = async (mode: 'full' | 'phones') => {
        if (managerEntries.length === 0) {
            toast.error('No hay responsables que copiar con los filtros actuales.');
            return;
        }
        const text =
            mode === 'phones'
                ? managerEntries
                      .map((entry) => {
                          const digits = phoneDigits(entry.phone);
                          return digits || `${entry.name} (sin tel.)`;
                      })
                      .join('\n')
                : managerEntries.map(managerWhatsAppLine).join('\n');
        try {
            await navigator.clipboard.writeText(text);
            toast.success(
                mode === 'phones'
                    ? `${managerEntries.length} teléfono(s) copiados al portapapeles.`
                    : `Listado de ${managerEntries.length} responsable(s) copiado.`
            );
        } catch {
            toast.error('No se pudo copiar. Prueba a seleccionar el texto manualmente.');
        }
    };

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

    const allSimDraftMatches = useMemo(
        () => simDrafts.flatMap((d) => d.matches),
        [simDrafts]
    );

    const simulationViewMatches = useMemo(() => {
        if (simulationViewDraftId === 'all') return allSimDraftMatches;
        return simDrafts.find((d) => d.id === simulationViewDraftId)?.matches ?? [];
    }, [simulationViewDraftId, simDrafts, allSimDraftMatches]);

    const compDisplayMatches = useMemo(
        () => (compArenaMode === 'simulation' ? simulationViewMatches : matches),
        [compArenaMode, simulationViewMatches, matches]
    );

    const resultsMatchCountByDivision = useMemo(() => {
        const counts = new Map<Team['division'], number>();
        for (const m of compDisplayMatches) {
            const d = resolveMatchDivision(m, teams);
            if (!d) continue;
            counts.set(d, (counts.get(d) ?? 0) + 1);
        }
        return counts;
    }, [compDisplayMatches, teams]);

    const resultsFilteredMatches = useMemo(() => {
        if (resultsDivisionFilter === 'all') return compDisplayMatches;
        return compDisplayMatches.filter((m) => resolveMatchDivision(m, teams) === resultsDivisionFilter);
    }, [compDisplayMatches, resultsDivisionFilter, teams]);

    /** Grupos reales de la categoría (BD o distribución calculada). Sin «Todos». */
    const standingsGroupKeys = useMemo(() => {
        const fromDb = competitionGroupsForDivision(teams, standingsDivision, false);
        if (fromDb.length > 0) return fromDb;
        return getGroupDistributionForDivision(teams, standingsDivision, false)
            .map((g) => g.key)
            .filter((k) => k && k !== '—');
    }, [teams, standingsDivision]);

    useEffect(() => {
        if (standingsGroupKeys.length === 0) return;
        if (!standingsGroupKeys.includes(standingsGroupFilter)) {
            setStandingsGroupFilter(standingsGroupKeys[0]!);
        }
    }, [standingsDivision, standingsGroupKeys, standingsGroupFilter]);

    const standingsRoster = useMemo(
        () =>
            getTeamsInDivisionGroup(
                teams,
                standingsDivision,
                standingsGroupKeys.includes(standingsGroupFilter)
                    ? standingsGroupFilter
                    : standingsGroupKeys[0] ?? 'A',
                false
            ),
        [teams, standingsDivision, standingsGroupFilter, standingsGroupKeys]
    );

    const standings = useMemo(
        () =>
            computeStandings(teams, compArenaMode === 'simulation' ? simulationViewMatches : matches, {
                division: standingsDivision,
                group: 'all',
                onlyPaidTeams: false,
                rosterOverride: standingsRoster,
            }),
        [
            matches,
            simulationViewMatches,
            compArenaMode,
            teams,
            standingsDivision,
            standingsRoster,
        ]
    );

    const allCompSubTabs: { id: AdminCompSubTab; label: string; icon: string }[] = [
        { id: 'structure', label: 'Estructura', icon: 'account_tree' },
        { id: 'simulations', label: 'Simulaciones', icon: 'science' },
        { id: 'calendar', label: 'Calendario', icon: 'calendar_view_month' },
        { id: 'results', label: 'Resultados', icon: 'scoreboard' },
        { id: 'standings', label: 'Clasificación', icon: 'leaderboard' },
    ];
    const compSubTabs = useMemo(
        () =>
            compArenaMode === 'official'
                ? allCompSubTabs.filter(
                      (tab) => tab.id === 'calendar' || tab.id === 'results' || tab.id === 'standings'
                  )
                : allCompSubTabs,
        [compArenaMode]
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
        if (activeTab !== 'competition' || !isAuthenticated || !sessionReady) return;
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
    }, [activeTab, isAuthenticated, sessionReady]);

    useEffect(() => {
        if (compArenaMode !== 'official') return;
        if (compSubTab === 'structure' || compSubTab === 'simulations') {
            setCompSubTab('calendar');
        }
    }, [compArenaMode, compSubTab]);

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

    const weekendDrafts = useMemo(
        () => WEEKEND_SCHEDULE_DAYS.map((day) => simDrafts.find((d) => d.scheduleDay === day)).filter(Boolean) as CalendarDraft[],
        [simDrafts]
    );
    const weekendMatchCount = useMemo(
        () => weekendDrafts.reduce((n, d) => n + d.matches.length, 0),
        [weekendDrafts]
    );

    // --- Auth Logic ---
    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoginSubmitting(true);
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
        setLoginSubmitting(false);
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

    const handleRemindManagerSquad = async (team: Team) => {
        const reminder = getTeamSquadReminderStatus(team);
        if (!reminder.needsReminder) {
            toast.info('Este equipo no tiene pendientes de plantilla o seguro.');
            return;
        }
        if (
            !window.confirm(
                `¿Enviar correo de recordatorio a ${team.managerEmail}?\n\n` +
                    reminder.summaryLines.join('\n')
            )
        ) {
            return;
        }
        setRemindingSquadTeamId(team.id);
        try {
            const { data, error } = await supabase.functions.invoke('remind-manager-squad', {
                body: { teamId: team.id },
            });
            const payload = data as { error?: string; skipped?: boolean; message?: string; success?: boolean } | null;
            if (payload?.error) {
                toast.error(payload.error);
                return;
            }
            if (error) {
                toast.error(error.message ?? 'Error al enviar el recordatorio.');
                return;
            }
            if (payload?.skipped) {
                toast.info(payload.message ?? 'No se envió correo: plantilla completa.');
                return;
            }
            toast.success(`Recordatorio enviado a ${team.managerEmail}`);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Error al enviar recordatorio.');
        } finally {
            setRemindingSquadTeamId(null);
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
            const dayOptions: MuskizSimulatorOptions = {
                ...muskizSimulatorOptions,
                organizerNotes: activeDraft.formatDescription?.trim() || undefined,
            };
            const { matches: newMatches, error: muskizError, warning: muskizWarning, lunchUsed } =
                await buildMuskizDayDraftMatchesHybrid(teams, day, dayOptions);
            if (muskizError) {
                toast.error(muskizError);
                return;
            }
            if (newMatches.length === 0) {
                toast.error(`No se generaron partidos para ${day}: hace falta al menos 2 equipos pagados y aprobados en una categoría de ese día.`);
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
            const lunchNote =
                lunchUsed && day === 'Sábado' ? ` Comida ${lunchUsed.start}–${lunchUsed.end}.` : '';
            toast.success(
                `${day}: ${normalized.length} partidos${lunchNote}${muskizWarning ? ' (revisa PENDIENTE)' : ''}.`
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
            const notesByDay = Object.fromEntries(
                weekendDrafts
                    .filter((d) => d.scheduleDay && d.formatDescription?.trim())
                    .map((d) => [d.scheduleDay!, d.formatDescription!.trim()])
            ) as Partial<Record<'Viernes' | 'Sábado' | 'Domingo', string>>;
            const { byDay, error: muskizError, warning: muskizWarning } =
                await buildMuskizWeekendDraftsByDayHybrid(teams, muskizSimulatorOptions, notesByDay);
            if (muskizError) {
                toast.error(muskizError);
                return;
            }
            const total = WEEKEND_SCHEDULE_DAYS.reduce((n, day) => n + byDay[day].length, 0);
            if (total === 0) {
                toast.error('No se generaron partidos: hace falta al menos 2 equipos pagados y aprobados en una misma categoría.');
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
        const ownerDraft = simDrafts.find((d) => d.matches.some((m) => m.id === matchId));
        const moving = ownerDraft?.matches.find((m) => m.id === matchId);
        if (!moving || !ownerDraft) return;

        const ownerDraftId = ownerDraft.id;
        const newTime = patch.time ?? moving.time;
        const newCourt = patch.court ?? moving.court;
        const slotChange = patch.time !== undefined || patch.court !== undefined;

        const validation = validateMatchSlotChange(ownerDraft.matches, matchId, patch, teams);
        if (!validation.ok) {
            toast.error(validation.error, { duration: 8000 });
            return;
        }

        const occupant =
            slotChange && newTime !== 'PENDIENTE'
                ? ownerDraft.matches.find(
                      (m) => m.id !== matchId && m.time === newTime && m.court === newCourt
                  )
                : undefined;

        if (occupant) {
            const swapBack = validateMatchSlotChange(ownerDraft.matches, occupant.id, {
                time: moving.time,
                court: moving.court,
            }, teams);
            if (!swapBack.ok) {
                toast.error(
                    `No se puede intercambiar: ${swapBack.error}`,
                    { duration: 8000 }
                );
                return;
            }
        }

        const withTimeInRound = (m: Match, time: string): string | undefined => {
            if (!m.round) return m.round;
            return time !== m.time ? m.round.replace(/\d{2}:\d{2}/, time) : m.round;
        };

        const next = simDrafts.map((d) => {
            if (d.id !== ownerDraftId) return d;
            return {
                ...d,
                matches: d.matches.map((m) => {
                    if (m.id === matchId) {
                        return {
                            ...m,
                            ...patch,
                            time: newTime,
                            court: newCourt,
                            round: patch.time ? withTimeInRound(m, newTime) : m.round,
                        };
                    }
                    if (occupant && m.id === occupant.id) {
                        return {
                            ...m,
                            time: moving.time,
                            court: moving.court,
                            round: withTimeInRound(m, moving.time),
                        };
                    }
                    return m;
                }),
            };
        });
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

    const applyGroupMatchUpdates = async (
        updatedTeams: Team[],
        updater: (matches: Match[]) => Match[],
        successDetail: string
    ) => {
        if (compArenaMode === 'simulation') {
            const nextDrafts = simDrafts.map((d) => ({
                ...d,
                matches: updater(d.matches),
            }));
            setSimDrafts(nextDrafts);
            await persistSimDraftsAsync(nextDrafts, activeDraftId);
        } else {
            onUpdateMatches(updater(matches));
        }
        toast.success(successDetail);
    };

    const offerRegenerateSimulationIfNeeded = async (
        updatedTeams: Team[],
        division: Team['division']
    ) => {
        const validation = validateGroupDistribution(updatedTeams, division, false);
        if (!validation.needsRegenerate) return;
        toast.warning(`Reparto alterado: ${validation.issues.join(' · ')}`, { duration: 9000 });
        if (
            window.confirm(
                'La distribución de grupos ya no coincide con el formato de la simulación.\n\n' +
                    validation.issues.join('\n') +
                    '\n\n¿Regenerar los 3 calendarios del borrador (Viernes, Sábado y Domingo) con el reparto actual?'
            )
        ) {
            await handleGenerateMuskizAllDays();
        }
    };

    const ensureStrictGroupDistribution = (
        candidateTeams: Team[],
        division: Team['division']
    ): boolean => {
        const validation = validateGroupDistribution(candidateTeams, division, false);
        if (!validation.needsRegenerate) return true;
        toast.error(
            `Cambio no permitido: el reparto debe respetar el formato (${validation.issues.join(' · ')})`
        );
        return false;
    };

    const handleSwapTeamsInGroups = async (teamA: Team, teamB: Team) => {
        const resolveEffectiveGroup = (team: Team): string => {
            const explicit = (team.competitionGroup ?? '').trim();
            if (explicit) return explicit;
            const dist = getGroupDistributionForDivision(teams, team.division, false);
            const block = dist.find((g) => g.teams.some((t) => t.id === team.id));
            return block?.key ?? '';
        };

        const groupA = resolveEffectiveGroup(teamA);
        const groupB = resolveEffectiveGroup(teamB);
        if (!groupA || !groupB || groupA === groupB) return;

        const baseDist = getGroupDistributionForDivision(teams, teamA.division, false);
        const baseGroupByTeamId = new Map<string, string>();
        for (const g of baseDist) {
            for (const t of g.teams) baseGroupByTeamId.set(t.id, g.key);
        }

        const normalizedDivisionTeams = teams.map((t) => {
            if (t.division !== teamA.division) return t;
            const effective = (t.competitionGroup ?? '').trim() || baseGroupByTeamId.get(t.id) || '';
            return { ...t, competitionGroup: effective || null };
        });

        const persistedA = normalizedDivisionTeams.find((t) => t.id === teamA.id) ?? teamA;
        const persistedB = normalizedDivisionTeams.find((t) => t.id === teamB.id) ?? teamB;

        try {
            const seeds = normalizedDivisionTeams.filter(
                (t) =>
                    t.division === teamA.division &&
                    t.id !== teamA.id &&
                    t.id !== teamB.id &&
                    Boolean((t.competitionGroup ?? '').trim())
            );
            await Promise.all(
                seeds.map((t) => onUpdateTeam({ ...t, competitionGroup: (t.competitionGroup ?? '').trim() || null }))
            );
            await Promise.all([
                onUpdateTeam({ ...persistedA, competitionGroup: groupB }),
                onUpdateTeam({ ...persistedB, competitionGroup: groupA }),
            ]);
        } catch {
            toast.error('No se pudo intercambiar los grupos.');
            return;
        }

        const updatedTeams = normalizedDivisionTeams.map((t) => {
            if (t.id === teamA.id) return { ...t, competitionGroup: groupB };
            if (t.id === teamB.id) return { ...t, competitionGroup: groupA };
            return t;
        });

        if (!ensureStrictGroupDistribution(updatedTeams, teamA.division)) return;

        await applyGroupMatchUpdates(
            updatedTeams,
            (list) => {
                let next = list;
                next = remapMatchesAfterGroupChange(
                    next,
                    updatedTeams,
                    teamA.name,
                    groupA,
                    groupB,
                    teamA.division
                );
                next = remapMatchesAfterGroupChange(
                    next,
                    updatedTeams,
                    teamB.name,
                    groupB,
                    groupA,
                    teamB.division
                );
                return next;
            },
            `${teamA.name} ↔ ${teamB.name} (Grupo ${groupA} ↔ ${groupB}). Partidos actualizados.`
        );

        await offerRegenerateSimulationIfNeeded(updatedTeams, teamA.division);
    };

    const handleMoveTeamToGroup = async (team: Team, newGroup: string) => {
        const oldGroup = (team.competitionGroup ?? '').trim() || null;
        const nextGroup = newGroup.trim();
        if (oldGroup === nextGroup) return;

        const candidateTeams = teams.map((t) =>
            t.id === team.id ? { ...t, competitionGroup: nextGroup || null } : t
        );
        if (!ensureStrictGroupDistribution(candidateTeams, team.division)) return;

        try {
            await onUpdateTeam({ ...team, competitionGroup: nextGroup || null });
        } catch {
            toast.error('No se pudo guardar el grupo del equipo.');
            return;
        }

        const updatedTeams = candidateTeams;

        await applyGroupMatchUpdates(
            updatedTeams,
            (list) =>
                remapMatchesAfterGroupChange(
                    list,
                    updatedTeams,
                    team.name,
                    oldGroup,
                    nextGroup,
                    team.division
                ),
            nextGroup
                ? `${team.name} → Grupo ${nextGroup}. Partidos de grupos actualizados.`
                : `${team.name} sin grupo. Partidos de grupos actualizados.`
        );

        await offerRegenerateSimulationIfNeeded(updatedTeams, team.division);
    };

    const updateMatchSetScores = (matchId: string, setScores: BeachSetScores) => {
        const updatedMatches = matches.map((m) =>
            m.id === matchId ? applySetScoresToMatch(m, setScores) : m
        );
        onUpdateMatches(updatedMatches);
    };

    const isDraftMatchId = useCallback(
        (matchId: string) => simDrafts.some((d) => d.matches.some((m) => m.id === matchId)),
        [simDrafts]
    );

    const [actaExporting, setActaExporting] = useState(false);

    const handleDownloadCategoryActas = async (division: Team['division'], catMatches: Match[]) => {
        if (catMatches.length === 0) {
            toast.error('No hay partidos en esta categoría.');
            return;
        }
        setActaExporting(true);
        try {
            await downloadActasZip(division, catMatches, teams, 'docx');
            toast.success(`${catMatches.length} actas DOCX descargadas (ZIP).`);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Error al generar actas.');
        } finally {
            setActaExporting(false);
        }
    };

    const handleDownloadAllActasDocx = async () => {
        if (resultsFilteredMatches.length === 0) {
            toast.error('No hay partidos en la lista actual.');
            return;
        }
        setActaExporting(true);
        try {
            const label =
                compArenaMode === 'simulation'
                    ? simulationViewDraftId === 'all'
                        ? 'simulacion_todos'
                        : simDrafts.find((d) => d.id === simulationViewDraftId)?.name ?? 'simulacion'
                    : 'oficial';
            const cat =
                resultsDivisionFilter !== 'all' ? `_${resultsDivisionFilter.replace(/\s+/g, '_')}` : '';
            await downloadActasZip(`${label}${cat}`, resultsFilteredMatches, teams, 'docx');
            toast.success(`ZIP con ${resultsFilteredMatches.length} actas DOCX.`);
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'Error al generar actas.');
        } finally {
            setActaExporting(false);
        }
    };

    const handleOpenBulkActas = () => {
        if (resultsFilteredMatches.length === 0) {
            toast.error('No hay partidos en la lista actual.');
            return;
        }
        let label = compArenaMode === 'official' ? 'Calendario oficial' : 'Borrador simulación';
        if (compArenaMode === 'simulation') {
            if (simulationViewDraftId === 'all') {
                label = 'Todos los días (Viernes + Sábado + Domingo)';
            } else {
                const d = simDrafts.find((x) => x.id === simulationViewDraftId);
                label = d?.scheduleDay ? `${d.scheduleDay} · ${d.name}` : d?.name ?? label;
            }
        }
        if (resultsDivisionFilter !== 'all') {
            label = `${label} · ${resultsDivisionFilter}`;
        }
        try {
            saveBulkActasPayload({
                label,
                source: compArenaMode,
                matches: resultsFilteredMatches,
                savedAt: new Date().toISOString(),
            });
            window.open('/admin/match-reports-bulk', '_blank', 'noopener,noreferrer');
        } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : 'No se pudieron preparar las actas.');
        }
    };

    const updateDraftMatchSetScores = async (matchId: string, setScores: BeachSetScores) => {
        const next = simDrafts.map((d) => ({
            ...d,
            matches: d.matches.map((m) => (m.id === matchId ? applySetScoresToMatch(m, setScores) : m)),
        }));
        setSimDrafts(next);
        await persistSimDraftsAsync(next, activeDraftId);
    };

    // --- Report (Acta) Logic ---
    const openReportModal = (match: Match) => {
        const teamAObj = resolveTeamForMatchSide(match, match.teamA, teams);
        const teamBObj = resolveTeamForMatchSide(match, match.teamB, teams);

        if (!match.report) {
            const tempMatch = {
                ...match,
                report: {
                    type: 'DIGITAL' as const,
                    playerStats: buildInitialDigitalReportStats(teamAObj, teamBObj),
                    imageUri: '',
                },
            };
            setSelectedMatchForReport(tempMatch);
            setReportMode('DIGITAL');
        } else {
            const teamAObj = resolveTeamForMatchSide(match, match.teamA, teams);
            const teamBObj = resolveTeamForMatchSide(match, match.teamB, teams);
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

    const saveReport = async () => {
        if (!selectedMatchForReport) return;
        if (isDraftMatchId(selectedMatchForReport.id)) {
            const next = simDrafts.map((d) => ({
                ...d,
                matches: d.matches.map((m) =>
                    m.id === selectedMatchForReport.id ? selectedMatchForReport : m
                ),
            }));
            setSimDrafts(next);
            await persistSimDraftsAsync(next, activeDraftId);
            toast.success('Acta guardada en el borrador.');
        } else {
            const updatedMatches = matches.map((m) =>
                m.id === selectedMatchForReport.id ? selectedMatchForReport : m
            );
            onUpdateMatches(updatedMatches);
        }
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

    if (!sessionReady) {
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
                            disabled={loginSubmitting}
                            className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity shadow-lg flex items-center justify-center gap-2"
                        >
                            {loginSubmitting
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
        <div className="min-h-screen bg-slate-50 dark:bg-background-light/5 px-3 py-4 pb-28 sm:p-6 lg:pb-6 animate-in fade-in">
            <div className="max-w-[1600px] mx-auto grid grid-cols-12 gap-4 sm:gap-6">
                {/* Sidebar — escritorio */}
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
                    {ADMIN_MAIN_NAV.map((item) => (
                        <AdminNavButton
                            key={item.id}
                            item={item}
                            active={activeTab === item.id}
                            onClick={() => selectAdminTab(item.id)}
                        />
                    ))}
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 text-sm font-medium text-red-500 hover:bg-red-50 mt-12 transition-colors"
                    >
                        <span className="material-symbols-outlined text-lg">logout</span> Salir
                    </button>
                </div>

                {/* Main Content */}
                <div className="col-span-12 lg:col-span-10 space-y-4 sm:space-y-6">
                    {/* Navegación móvil (cabecera + aviso) */}
                    <div className="lg:hidden sticky top-14 sm:top-16 z-30 -mx-3 px-3 sm:-mx-6 sm:px-6 pt-1 pb-2 bg-white border-b-2 border-primary/40 shadow-sm space-y-2">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setMobileNavOpen(true)}
                                className="shrink-0 size-10 rounded-xl bg-primary/15 border border-primary/40 flex items-center justify-center text-primary-dark shadow-sm"
                                aria-label="Abrir menú del panel"
                            >
                                <span className="material-symbols-outlined">apps</span>
                            </button>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-primary-dark">
                                    Sección activa
                                </p>
                                <h2 className="font-bold text-sm text-slate-900 truncate">
                                    {activeNavItem?.label ?? 'Administración'}
                                </h2>
                            </div>
                            <button
                                type="button"
                                onClick={handleLogout}
                                className="shrink-0 size-10 rounded-xl border border-red-200 bg-red-50 text-red-600 flex items-center justify-center"
                                aria-label="Cerrar sesión"
                            >
                                <span className="material-symbols-outlined text-xl">logout</span>
                            </button>
                        </div>
                        <p className="text-[11px] text-slate-600 leading-snug bg-slate-50 rounded-lg px-2 py-1.5 border border-slate-200">
                            Usa la <strong>barra inferior</strong> para cambiar de sección (Comp, Pagos, Resp…).
                            El menú ☰ de arriba del torneo es la web pública, no el panel.
                        </p>
                    </div>

                    {mobileNavOpen && (
                        <>
                            <button
                                type="button"
                                className="fixed inset-0 bg-black/40 z-40 lg:hidden"
                                aria-label="Cerrar menú"
                                onClick={() => setMobileNavOpen(false)}
                            />
                            <nav className="fixed top-0 left-0 bottom-0 z-50 w-[min(100vw-2.5rem,300px)] bg-white shadow-2xl flex flex-col lg:hidden animate-in slide-in-from-left duration-200">
                                <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="size-10 bg-primary rounded-full flex items-center justify-center text-background-dark shrink-0">
                                            <span className="material-symbols-outlined">admin_panel_settings</span>
                                        </div>
                                        <div className="min-w-0">
                                            <h3 className="font-bold text-sm truncate">Organizador</h3>
                                            <p className="text-xs text-slate-500">Panel de Control</p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setMobileNavOpen(false)}
                                        className="size-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-600"
                                        aria-label="Cerrar"
                                    >
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-3 space-y-1">
                                    {ADMIN_MAIN_NAV.map((item) => (
                                        <AdminNavButton
                                            key={item.id}
                                            item={item}
                                            active={activeTab === item.id}
                                            onClick={() => selectAdminTab(item.id)}
                                        />
                                    ))}
                                </div>
                                <div className="p-3 border-t border-slate-100">
                                    <button
                                        type="button"
                                        onClick={handleLogout}
                                        className="w-full text-left px-4 py-3 rounded-lg flex items-center gap-3 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
                                    >
                                        <span className="material-symbols-outlined text-lg">logout</span> Salir
                                    </button>
                                </div>
                            </nav>
                        </>
                    )}

                    {/* --- VERIFICATION TAB --- */}
                    {activeTab === 'verification' && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                            <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
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
                            <div className="overflow-x-auto [&_th]:px-3 [&_td]:px-3 sm:[&_th]:px-6 sm:[&_td]:px-6 [&_th]:py-3 [&_td]:py-3 sm:[&_th]:py-4 sm:[&_td]:py-4">
                                <table className="w-full text-sm text-left min-w-[640px]">
                                    <thead className="bg-slate-50 text-slate-500 font-medium uppercase text-xs">
                                        <tr>
                                            <th>Persona</th>
                                            <th>Rol</th>
                                            <th>Equipo</th>
                                            <th>DNI</th>
                                            <th>Seguro</th>
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
                                                <td className="font-bold text-slate-800">
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
                                                <td>
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
                                                <td className="text-slate-600">
                                                    {player.teamName}
                                                </td>
                                                <td>
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
                        const rosterReminder = rosterTeam ? getTeamSquadReminderStatus(rosterTeam) : null;
                        return (
                            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                                <div className="p-4 sm:p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
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
                                        {rosterTeam && rosterReminder?.needsReminder && (
                                            <button
                                                type="button"
                                                disabled={remindingSquadTeamId === rosterTeam.id}
                                                onClick={() => void handleRemindManagerSquad(rosterTeam)}
                                                className="text-xs font-black px-3 py-2 rounded-lg bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1"
                                                title={rosterReminder.summaryLines.join('\n')}
                                            >
                                                {remindingSquadTeamId === rosterTeam.id ? (
                                                    <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                                                ) : (
                                                    <span className="material-symbols-outlined text-sm">mail</span>
                                                )}
                                                Recordar plantilla/seguro
                                            </button>
                                        )}
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
                                    <div className="overflow-x-auto [&_th]:px-3 [&_td]:px-3 sm:[&_th]:px-6 sm:[&_td]:px-6 [&_th]:py-3 [&_td]:py-3 sm:[&_th]:py-4 sm:[&_td]:py-4">
                                        <table className="w-full text-sm text-left min-w-[520px]">
                                            <thead className="bg-slate-50 text-slate-500 font-medium uppercase text-xs">
                                                <tr>
                                                    <th>Jugador</th>
                                                    <th>Rol</th>
                                                    <th>DNI</th>
                                                    <th>Seguro</th>
                                                    <th className="text-right">Acciones</th>
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

                    {/* --- RESPONSABLES (WhatsApp / contacto) --- */}
                    {activeTab === 'managers' && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                            <div className="p-4 sm:p-6 border-b border-slate-100 space-y-4">
                                <div>
                                    <h3 className="font-bold text-lg text-slate-800">Responsables de equipo</h3>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Un registro por responsable (sin duplicados). Si lleva varios equipos, se listan todos.
                                        Ideal para crear grupos de WhatsApp.
                                    </p>
                                </div>
                                <div className="flex flex-col sm:flex-row flex-wrap gap-2">
                                    <input
                                        type="search"
                                        placeholder="Buscar nombre, teléfono, equipo…"
                                        value={managersSearch}
                                        onChange={(e) => setManagersSearch(e.target.value)}
                                        className="flex-1 min-w-[200px] text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 outline-none focus:ring-1 focus:ring-primary"
                                    />
                                    <select
                                        value={managersDivision}
                                        onChange={(e) =>
                                            setManagersDivision(e.target.value as Team['division'] | 'all')
                                        }
                                        className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 outline-none focus:ring-1 focus:ring-primary"
                                    >
                                        <option value="all">Todas las categorías</option>
                                        {DIVISION_OPTIONS.map((d) => (
                                            <option key={d} value={d}>
                                                {d}
                                            </option>
                                        ))}
                                    </select>
                                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 px-2 py-2 rounded-lg border border-slate-200 bg-slate-50 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={managersOnlyApproved}
                                            onChange={(e) => setManagersOnlyApproved(e.target.checked)}
                                            className="rounded border-slate-300 text-primary focus:ring-primary"
                                        />
                                        Solo equipos aprobados
                                    </label>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void copyManagersText('full')}
                                        className="text-xs font-bold px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 flex items-center gap-1"
                                    >
                                        <span className="material-symbols-outlined text-sm">content_copy</span>
                                        Copiar listado completo
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => void copyManagersText('phones')}
                                        className="text-xs font-bold px-3 py-2 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200 hover:bg-emerald-100 flex items-center gap-1"
                                    >
                                        <span className="material-symbols-outlined text-sm">call</span>
                                        Copiar solo teléfonos
                                    </button>
                                    <span className="text-xs text-slate-500 self-center">
                                        {managerEntries.length} responsable(s)
                                        {managerEntries.filter((entry) => !entry.phone?.trim()).length > 0 && (
                                            <>
                                                {' '}
                                                ·{' '}
                                                <span className="text-amber-700 font-bold">
                                                    {managerEntries.filter((entry) => !entry.phone?.trim()).length} sin teléfono
                                                </span>
                                            </>
                                        )}
                                    </span>
                                </div>
                            </div>

                            {/* Móvil: tarjetas */}
                            <div className="lg:hidden divide-y divide-slate-100">
                                {managerEntries.map((entry) => {
                                    const digits = phoneDigits(entry.phone);
                                    const waHref = digits
                                        ? `https://wa.me/${digits.startsWith('34') ? digits : `34${digits}`}`
                                        : undefined;
                                    return (
                                        <div key={entry.key} className="p-4 space-y-2">
                                            <p className="font-bold text-slate-900">{entry.name}</p>
                                            <div className="flex flex-wrap items-center gap-2">
                                                {entry.phone?.trim() ? (
                                                    <>
                                                        <a
                                                            href={`tel:${digits}`}
                                                            className="text-sm font-mono text-teal-800 font-bold"
                                                        >
                                                            {entry.phone}
                                                        </a>
                                                        {waHref && (
                                                            <a
                                                                href={waHref}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-[10px] font-black uppercase px-2 py-1 rounded bg-green-100 text-green-800"
                                                            >
                                                                WhatsApp
                                                            </a>
                                                        )}
                                                    </>
                                                ) : (
                                                    <span className="text-xs text-amber-700 font-bold">Sin teléfono en inscripción</span>
                                                )}
                                            </div>
                                            <div className="text-sm text-slate-700">
                                                <span className="text-slate-400 font-bold text-[10px] uppercase">Equipos · </span>
                                                {entry.teams.map((t) => `${t.name} (${t.division})`).join(' · ')}
                                            </div>
                                            <p className="text-[10px] text-slate-400 truncate">{entry.email || 'Sin email'}</p>
                                        </div>
                                    );
                                })}
                                {managerEntries.length === 0 && (
                                    <p className="text-center text-slate-500 py-12 text-sm px-4">
                                        No hay responsables con estos filtros.
                                    </p>
                                )}
                            </div>

                            {/* Escritorio: tabla */}
                            <div className="hidden lg:block overflow-x-auto [&_th]:px-4 [&_td]:px-4 [&_th]:py-3 [&_td]:py-3">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-medium uppercase text-xs">
                                        <tr>
                                            <th>Responsable</th>
                                            <th>Teléfono</th>
                                            <th>Equipos</th>
                                            <th>Correo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {managerEntries.map((entry) => {
                                            const digits = phoneDigits(entry.phone);
                                            return (
                                                <tr key={entry.key} className="hover:bg-slate-50/80">
                                                    <td className="font-bold text-slate-800">{entry.name}</td>
                                                    <td>
                                                        {entry.phone?.trim() ? (
                                                            <a
                                                                href={`tel:${digits}`}
                                                                className="font-mono text-teal-800 hover:underline"
                                                            >
                                                                {entry.phone}
                                                            </a>
                                                        ) : (
                                                            <span className="text-amber-700 text-xs font-bold">Sin teléfono</span>
                                                        )}
                                                    </td>
                                                    <td className="text-slate-700 text-xs">
                                                        {entry.teams.map((t) => `${t.name} (${t.division})`).join(' · ')}
                                                    </td>
                                                    <td className="text-slate-500 text-xs">{entry.email || 'Sin email'}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                {managerEntries.length === 0 && (
                                    <p className="text-center text-slate-500 py-12 text-sm">
                                        No hay responsables con estos filtros.
                                    </p>
                                )}
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
                                        {filteredTeams.map(team => {
                                            const squadReminder = getTeamSquadReminderStatus(team);
                                            return (
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
                                                        <div>
                                                            <span>{team.name}</span>
                                                            {squadReminder.needsReminder && (
                                                                <p
                                                                    className="text-[10px] font-bold text-amber-700 mt-0.5 max-w-[220px] leading-snug"
                                                                    title={squadReminder.summaryLines.join(' ')}
                                                                >
                                                                    Plantilla/seguro pendiente
                                                                </p>
                                                            )}
                                                        </div>
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
                                                        {squadReminder.needsReminder && (
                                                            <button
                                                                type="button"
                                                                disabled={remindingSquadTeamId === team.id}
                                                                onClick={() => void handleRemindManagerSquad(team)}
                                                                className="bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 text-[10px] font-black px-3 py-1.5 rounded-lg transition-all flex items-center gap-1"
                                                                title={squadReminder.summaryLines.join('\n')}
                                                            >
                                                                {remindingSquadTeamId === team.id ? (
                                                                    <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span>
                                                                ) : (
                                                                    <span className="material-symbols-outlined text-xs">mail</span>
                                                                )}
                                                                RECORDAR
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
                                        );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* --- COMPETITION DASHBOARD --- */}
                    {activeTab === 'competition' && (
                        <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-4 sm:p-6">

                            {/* Simulación | Oficial */}
                            <div className="mb-5 space-y-2">
                                <div className="flex flex-col sm:inline-flex sm:flex-row w-full sm:w-auto rounded-xl border border-slate-200 bg-slate-50 p-1 gap-1 shadow-sm">
                                    <button
                                        type="button"
                                        onClick={() => setCompArenaMode('simulation')}
                                        className={`px-5 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors sm:flex-initial flex-1 ${
                                            compArenaMode === 'simulation'
                                                ? 'bg-purple-600 text-white shadow'
                                                : 'text-slate-600 hover:bg-white'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-lg">science</span>
                                        Simulación
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCompArenaMode('official')}
                                        className={`px-5 py-2.5 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors sm:flex-initial flex-1 ${
                                            compArenaMode === 'official'
                                                ? 'bg-teal-700 text-white shadow'
                                                : 'text-slate-600 hover:bg-white'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-lg">public</span>
                                        Oficial
                                    </button>
                                </div>
                                <p className="text-xs text-slate-500 max-w-3xl">
                                    {compArenaMode === 'simulation' ? (
                                        <>
                                            Borradores de prueba: genera, edita y previsualiza. El calendario público{' '}
                                            <strong>solo cambia</strong> al pulsar <strong>Publicar</strong> en Simulaciones.
                                        </>
                                    ) : (
                                        <>
                                            Lo que ven visitantes y equipos (tabla <code className="bg-slate-100 px-1 rounded">matches</code>
                                            ). No se modifica aquí: publica desde <strong>Simulación → Simulaciones</strong>.
                                        </>
                                    )}
                                </p>
                            </div>

                            {/* Sub-tabs (iguales en Simulación y Oficial) */}
                            <div className="flex overflow-x-auto no-scrollbar border-b border-slate-200 mb-6 gap-0 -mx-4 px-4 sm:mx-0 sm:px-0">
                                {compSubTabs.map((tab) => (
                                    <button
                                        key={tab.id}
                                        type="button"
                                        onClick={() => setCompSubTab(tab.id)}
                                        className={`shrink-0 whitespace-nowrap px-4 sm:px-6 py-3 text-xs sm:text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${
                                            compSubTab === tab.id
                                                ? compArenaMode === 'simulation'
                                                    ? 'border-purple-600 text-purple-700'
                                                    : 'border-teal-700 text-teal-800'
                                                : 'border-transparent text-slate-500 hover:text-slate-800'
                                        }`}
                                    >
                                        <span className="material-symbols-outlined text-lg">{tab.icon}</span>
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Selector de borrador (solo Simulación + calendario/resultados/clasificación) */}
                            {compArenaMode === 'simulation' &&
                                (compSubTab === 'calendar' || compSubTab === 'results' || compSubTab === 'standings') && (
                                    <CompetitionDraftPicker
                                        drafts={simDrafts}
                                        value={simulationViewDraftId}
                                        onChange={setSimulationViewDraftId}
                                        disabled={!simulationsLoaded}
                                    />
                                )}

                            {compArenaMode === 'official' &&
                                (compSubTab === 'calendar' || compSubTab === 'results' || compSubTab === 'standings') && (
                                    <div className="mb-4 p-3 rounded-xl bg-teal-50 border border-teal-200 text-sm text-teal-900 flex items-start gap-2">
                                        <span className="material-symbols-outlined shrink-0">info</span>
                                        <span>
                                            Vista <strong>oficial</strong> (solo lectura respecto a borradores). Para editar o
                                            publicar, cambia a <strong>Simulación</strong> y usa el botón{' '}
                                            <strong>Publicar</strong> en la pestaña Simulaciones.
                                        </span>
                                    </div>
                                )}

                            {/* SUB-TAB CONTENT */}
                            <div className="min-h-[400px]">

                                {/* 1. ESTRUCTURA — categorías y grupos */}
                                {compSubTab === 'structure' && (
                                    <div className="space-y-6">
                                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                                                <div>
                                                    <h4 className="font-bold text-slate-800 text-sm mb-1">Partidos por equipo</h4>
                                                    <p className="text-xs text-slate-500">
                                                        Previsto con el formato actual (grupos + eliminatorias). Mínimo {MIN_TEAMS_PER_GROUP} equipos por grupo.
                                                        Mín. partidos/equipo en esta categoría:{' '}
                                                        <strong>{resolveMinMatchesForDivision(structureDivision, muskizSimulatorOptions)}</strong>.
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
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
                                            </div>
                                            {(() => {
                                                const paidInDiv = teamsEligibleForSchedule(teams).filter(
                                                    (t) => t.division === structureDivision
                                                );
                                                if (paidInDiv.length < 2) {
                                                    return (
                                                        <p className="text-sm text-slate-400">
                                                            Hacen falta al menos 2 equipos pagados y aprobados en esta categoría.
                                                        </p>
                                                    );
                                                }
                                                const breakdown = countDivisionMatchBreakdown(
                                                    paidInDiv,
                                                    muskizSimulatorOptions
                                                );
                                                const totals = breakdown.withMinPerTeam;
                                                const rows = countMatchesPerTeamForDivision(paidInDiv, muskizSimulatorOptions);
                                                const minForDiv = resolveMinMatchesForDivision(structureDivision, muskizSimulatorOptions);
                                                return (
                                                    <>
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
                                                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
                                                                <p className="text-[10px] font-black uppercase text-slate-500">Total</p>
                                                                <p className="text-xl font-black text-slate-900">{totals.total}</p>
                                                            </div>
                                                            <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-center">
                                                                <p className="text-[10px] font-black uppercase text-teal-800">Grupos</p>
                                                                <p className="text-xl font-black text-teal-900">{totals.grupos}</p>
                                                            </div>
                                                            <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-center">
                                                                <p className="text-[10px] font-black uppercase text-indigo-800">Eliminatoria</p>
                                                                <p className="text-xl font-black text-indigo-900">{totals.eliminatoria}</p>
                                                            </div>
                                                            {totals.repesca > 0 && (
                                                                <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-center">
                                                                    <p className="text-[10px] font-black uppercase text-orange-800">Repesca / Consol.</p>
                                                                    <p className="text-xl font-black text-orange-900">{totals.repesca}</p>
                                                                </div>
                                                            )}
                                                            {totals.cuartos > 0 && (
                                                                <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-center">
                                                                    <p className="text-[10px] font-black uppercase text-violet-800">Cuartos</p>
                                                                    <p className="text-xl font-black text-violet-900">{totals.cuartos}</p>
                                                                </div>
                                                            )}
                                                            {totals.semis > 0 && (
                                                                <div className="rounded-lg border border-pink-200 bg-pink-50 px-3 py-2 text-center">
                                                                    <p className="text-[10px] font-black uppercase text-pink-800">Semis</p>
                                                                    <p className="text-xl font-black text-pink-900">{totals.semis}</p>
                                                                </div>
                                                            )}
                                                            {totals.final > 0 && (
                                                                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center">
                                                                    <p className="text-[10px] font-black uppercase text-amber-800">Final</p>
                                                                    <p className="text-xl font-black text-amber-900">{totals.final}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {totals.total !== breakdown.planned.total && (
                                                            <p className="text-[11px] text-slate-500 mb-3">
                                                                Borrador: {totals.grupos} grupos + {totals.eliminatoria} eliminatoria (cuartos, semis y final) = {totals.total} partidos.
                                                                Formato base sin extras de mínimo: {breakdown.planned.total} partidos.
                                                            </p>
                                                        )}
                                                        <table className="w-full text-sm">
                                                            <thead>
                                                                <tr className="text-left text-[10px] font-black uppercase text-slate-400 border-b border-slate-100">
                                                                    <th className="py-2 pr-4">Equipo</th>
                                                                    <th className="py-2 text-right">Partidos</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-50">
                                                                {rows.map((r) => (
                                                                    <tr key={r.name} className={r.matches < minForDiv ? 'bg-amber-50' : undefined}>
                                                                        <td className="py-2 font-medium text-slate-800">{r.name}</td>
                                                                        <td className="py-2 text-right font-black text-primary">{r.matches}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    </div>
                                )}

                                {/* 2. SIMULACIONES — Oficial: solo resumen; Simulación: gestión completa */}
                                {compSubTab === 'simulations' && compArenaMode === 'official' && (
                                    <div className="space-y-6">
                                        <div className="flex flex-wrap items-start justify-between gap-4 p-4 rounded-xl border border-slate-200 bg-slate-50/80">
                                            <div>
                                                <p className="font-bold text-slate-800 mb-1">Visibilidad pública</p>
                                                <p className="text-xs text-slate-600 max-w-xl">
                                                    Controla si Calendario, Resultados y Clasificación aparecen en la web pública.
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
                                        </div>
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
                                            <p className="text-xs font-black uppercase tracking-wide opacity-80 mb-1">Calendario oficial (BD)</p>
                                            <p className="font-black text-base">{officialCalendarStatus.headline}</p>
                                            <p className="mt-1 leading-relaxed">{officialCalendarStatus.sub}</p>
                                            <p className="mt-3 text-xs">
                                                <strong>{matches.length}</strong> partidos en base de datos ·{' '}
                                                <strong>{allSimDraftMatches.length}</strong> en borradores (no publicados)
                                            </p>
                                        </div>
                                        <div className="rounded-xl border border-purple-200 bg-purple-50 p-5 flex flex-wrap items-center justify-between gap-4">
                                            <div>
                                                <p className="font-bold text-purple-900">Generar, editar y publicar borradores</p>
                                                <p className="text-sm text-purple-800 mt-1">
                                                    Esa gestión está en <strong>Simulación → Simulaciones</strong>. El calendario oficial solo cambia al pulsar{' '}
                                                    <strong>Publicar</strong>.
                                                </p>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => setCompArenaMode('simulation')}
                                                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-lg flex items-center gap-2"
                                            >
                                                <span className="material-symbols-outlined text-lg">science</span>
                                                Abrir modo Simulación
                                            </button>
                                        </div>
                                        {!simulationsLoaded ? (
                                            <p className="text-slate-400 text-sm">Cargando borradores…</p>
                                        ) : (
                                            <div className="rounded-lg border border-slate-200 divide-y">
                                                <p className="px-4 py-2 text-xs font-black uppercase text-slate-500 bg-slate-50">
                                                    Borradores guardados (solo lectura)
                                                </p>
                                                {simDrafts.map((d) => (
                                                    <div key={d.id} className="px-4 py-3 flex justify-between text-sm">
                                                        <span className="font-semibold text-slate-800">
                                                            {d.scheduleDay ? `${d.scheduleDay} · ` : ''}
                                                            {d.name}
                                                        </span>
                                                        <span className="text-slate-500">{d.matches.length} partidos</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {compSubTab === 'simulations' && compArenaMode === 'simulation' && (
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
                                                    (infantil) son borradores independientes. El simulador Muskiz es determinístico; la IA solo refina
                                                    PENDIENTE si está activada. Usa «Generar los 3 días» para rellenarlos todos a la vez. Al publicar, puedes volcar solo el día activo o
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
                                                                Formato del torneo (también lo lee la IA al generar)
                                                            </label>
                                                            <input
                                                                value={activeDraft.formatDescription ?? ''}
                                                                onChange={(e) => void handleDraftMetadataChange({ formatDescription: e.target.value })}
                                                                placeholder="Ej. priorizar finales al cierre, evitar semis de CF y CM a la vez…"
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

                                                <div className="bg-teal-50 border border-teal-200 rounded-xl p-6">
                                                    <div className="mb-3 flex flex-wrap justify-between items-start gap-3">
                                                        <div>
                                                        <h4 className="font-bold text-teal-900 flex items-center gap-2">
                                                            <span className="material-symbols-outlined text-teal-700">event_available</span>
                                                            Simulador fin de semana Muskiz (determinístico + IA opcional)
                                                        </h4>
                                                        <label className="mt-3 flex items-start gap-3 cursor-pointer text-xs text-teal-950 max-w-3xl">
                                                            <input
                                                                type="checkbox"
                                                                checked={muskizAiSlotAssist}
                                                                onChange={(e) => setMuskizAiSlotAssist(e.target.checked)}
                                                                className="mt-0.5 size-4 rounded border-teal-300 text-teal-700 focus:ring-teal-600"
                                                            />
                                                            <span>
                                                                <strong>Ayuda Google AI (mix)</strong> — Primero el simulador{' '}
                                                                <strong>determinístico</strong> (equipos pagados y aprobados; grupos con nombres reales; cuartos ≥11: 1º vs 3º mejor, 1º vs gan. repesca, 1º vs 2º y 2º vs 2º; semis y final en plantilla). Luego la IA coloca <strong>PENDIENTE</strong> en lotes de {MUSKIZ_AI_SLOT_ASSIST_MAX}{' '}
                                                                (máx. {MUSKIZ_AI_MAX_CALLS_PER_DAY} consultas/día). Usa el campo{' '}
                                                                <strong>«Formato del torneo»</strong> del borrador como instrucciones. Al final, optimización
                                                                local de descansos <strong>sin API</strong>. Si Gemini falla, se conserva el borrador
                                                                determinístico.
                                                            </span>
                                                        </label>
                                                        <p className="text-xs text-teal-800 mt-2 leading-relaxed max-w-3xl">
                                                            <strong>Viernes:</strong> cadetes 17:00–21:00, 6 campos.{' '}
                                                            <strong>Sábado:</strong> juvenil/senior 9:00–21:00 (cuadrícula con huecos vacíos hasta las 21:00), comida fija 14:15–15:45, 6 campos.{' '}
                                                            <strong>Domingo:</strong> infantiles 9:00–15:00, 4 campos.{' '}
                                                            Huecos <strong>35 min</strong>. Mínimo de partidos por equipo configurable en cada categoría (por defecto {MIN_REAL_MATCHES_PER_TEAM}).{' '}
                                                            ≤6 → liguilla + final · 7 → 3+4 + consolación + semis + final · 8–10 → 2 grupos + semis + final (9: 4+5) · ≥11 → 3 grupos + repesca + cuartos + semis + final (11: 4+4+3).{' '}
                                                            Mínimo {MIN_TEAMS_PER_GROUP} equipos por grupo cuando hay varios grupos.{' '}
                                                            Categorías mezcladas en el horario. Intenta evitar <strong>dos partidos seguidos</strong>, pero los permite si no caben todos (menos PENDIENTE). Partidos sin hueco: <strong>PENDIENTE</strong>.{' '}
                                                            <strong>Homónimos:</strong> equipos con el mismo nombre en distintas categorías se distinguen por código (CF, CM, JF…) y por id en base de datos; no se mezclan al validar solapes.
                                                        </p>
                                                        <div className="mt-3 rounded-lg border border-teal-200 bg-white/70 p-3">
                                                            <p className="text-[11px] font-bold uppercase tracking-wide text-teal-900 mb-2">
                                                                Mín. partidos por equipo (por categoría)
                                                            </p>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                                                                {categories.map((cat) => (
                                                                    <label key={cat.id} className="flex items-center justify-between gap-2 text-xs text-teal-900">
                                                                        <span className="truncate font-medium" title={cat.name}>{cat.name}</span>
                                                                        <input
                                                                            type="number"
                                                                            min={1}
                                                                            max={20}
                                                                            defaultValue={cat.min_matches_per_team ?? MIN_REAL_MATCHES_PER_TEAM}
                                                                            onBlur={(e) => {
                                                                                const value = Math.max(1, Math.min(20, Number(e.target.value) || MIN_REAL_MATCHES_PER_TEAM));
                                                                                if (value !== Number(cat.min_matches_per_team ?? MIN_REAL_MATCHES_PER_TEAM)) {
                                                                                    void handleUpdateCategory(cat.id, { min_matches_per_team: value });
                                                                                }
                                                                            }}
                                                                            className="w-14 border border-teal-200 rounded px-2 py-1 text-center font-bold bg-white outline-none focus:ring-1 focus:ring-teal-600"
                                                                        />
                                                                    </label>
                                                                ))}
                                                            </div>
                                                            <p className="mt-2 text-[10px] text-teal-700">
                                                                Se guarda al salir del campo. También editable en la pestaña Categorías.
                                                            </p>
                                                        </div>
                                                        <p className="mt-2 text-[11px] text-teal-800">
                                                            La comida del sábado es fija de 14:15 a 15:45 para todas las categorías; la tarde arranca justo al terminar.
                                                            Semifinales, cuartos y finales solo después de terminar todos los partidos de grupos.
                                                            Orden: grupos → consolación/repesca (si aplica) → cuartos (≥11 equipos) → semis → finales. ≥11: mejor 3º directo + repesca entre los 2 peores terceros; cuartos: 1º vs 3º mejor, 1º vs gan. repesca, 1º vs 2º y 2º vs 2º.
                                                            La cuadrícula muestra todas las franjas hasta las 21:00 (huecos vacíos para mover partidos).
                                                            Ajusta partidos a mano en la lista de abajo o en Calendario (tabla / cuadrícula).
                                                        </p>
                                                        </div>
                                                        <div className="flex flex-col gap-2 shrink-0">
                                                            <input type="file" id="excel-upload" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleExcelImport} />
                                                            <label
                                                                htmlFor="excel-upload"
                                                                className={`cursor-pointer bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors ${!activeDraftId ? 'opacity-50 pointer-events-none' : ''}`}
                                                            >
                                                                <span className="material-symbols-outlined text-sm">upload_file</span>
                                                                Importar Excel
                                                            </label>
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

                                                <div className="rounded-lg border border-indigo-200 bg-indigo-50/80 px-4 py-3 text-xs text-indigo-950">
                                                    El <strong>calendario en tabla</strong>, los <strong>resultados con horario</strong> y la{' '}
                                                    <strong>clasificación</strong> están en sus pestañas. Usa el interruptor Simulación / Oficial en cada una.
                                                </div>

                                                <div>
                                                    <h4 className="text-sm font-black uppercase text-slate-500 mb-3">
                                                        Lista del borrador activo ({activeDraft?.matches.length ?? 0} partidos)
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

                                {/* Calendario general (tabla por día / por categoría) */}
                                {compSubTab === 'calendar' && (
                                    <div className="space-y-6">
                                        {compArenaMode === 'official' && (
                                            <>
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
                                                    <p className="text-xs font-black uppercase tracking-wide opacity-80 mb-1">Estado BD</p>
                                                    <p className="font-black text-base">{officialCalendarStatus.headline}</p>
                                                    <p className="mt-1 leading-relaxed">{officialCalendarStatus.sub}</p>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                    {matches.length > 0 && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => void handleMakeAllMatchesPublic()}
                                                                className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-lg text-xs font-black uppercase flex items-center gap-2"
                                                            >
                                                                <span className="material-symbols-outlined text-sm">visibility</span>
                                                                Hacer público el calendario
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (
                                                                        window.confirm(
                                                                            '¿Borrar TODOS los partidos oficiales de la base de datos?',
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
                                            </>
                                        )}
                                        <CompetitionCalendarViews
                                            matches={compDisplayMatches}
                                            teams={teams}
                                            onDownloadCategoryActas={(division, catMatches) =>
                                                void handleDownloadCategoryActas(division, catMatches)
                                            }
                                            actasExporting={actaExporting}
                                            title={
                                                compArenaMode === 'simulation'
                                                    ? simulationViewDraftId === 'all'
                                                        ? 'Calendario simulado — todos los días'
                                                        : `Calendario simulado — ${
                                                              simDrafts.find((d) => d.id === simulationViewDraftId)?.scheduleDay ??
                                                              simDrafts.find((d) => d.id === simulationViewDraftId)?.name ??
                                                              'borrador'
                                                          }`
                                                    : 'Calendario oficial (Viernes · Sábado · Domingo)'
                                            }
                                            onUpdateMatch={
                                                compArenaMode === 'simulation'
                                                    ? (id, patch) => void handleUpdateDraftMatch(id, patch)
                                                    : undefined
                                            }
                                            emptyMessage={
                                                compArenaMode === 'simulation'
                                                    ? 'Genera borradores en Simulaciones o elige otro día en el selector de arriba.'
                                                    : 'No hay partidos oficiales. Publica desde Simulación → Simulaciones.'
                                            }
                                        />
                                    </div>
                                )}

                                {/* Resultados con horario */}
                                {compSubTab === 'results' && (
                                    <div className="space-y-4">
                                        {compArenaMode === 'official' && (
                                            <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg flex items-start gap-3 text-sm text-blue-700">
                                                <span className="material-symbols-outlined text-blue-500">info</span>
                                                <p>
                                                    Tabla ordenada por <strong>día, hora y campo</strong>. Edita el marcador o abre el acta en cada fila.
                                                </p>
                                            </div>
                                        )}
                                        {compArenaMode === 'simulation' && (
                                            <p className="text-xs text-purple-800 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                                                Marcadores y actas se guardan en el <strong>borrador</strong> elegido arriba. La web oficial solo
                                                cambia al publicar.
                                            </p>
                                        )}

                                        <div className="flex flex-col gap-2">
                                            <span className="text-[10px] font-black uppercase text-slate-400">Categoría</span>
                                            <div className="flex overflow-x-auto gap-2 pb-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setResultsDivisionFilter('all')}
                                                    className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap shrink-0 ${
                                                        resultsDivisionFilter === 'all'
                                                            ? compArenaMode === 'simulation'
                                                                ? 'bg-purple-600 text-white shadow'
                                                                : 'bg-teal-700 text-white shadow'
                                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                    }`}
                                                >
                                                    Todas ({compDisplayMatches.length})
                                                </button>
                                                {DIVISIONS_LIST.map((cat) => {
                                                    const n = resultsMatchCountByDivision.get(cat) ?? 0;
                                                    return (
                                                        <button
                                                            key={cat}
                                                            type="button"
                                                            onClick={() => setResultsDivisionFilter(cat)}
                                                            className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap shrink-0 ${
                                                                resultsDivisionFilter === cat
                                                                    ? compArenaMode === 'simulation'
                                                                        ? 'bg-purple-600 text-white shadow'
                                                                        : 'bg-teal-700 text-white shadow'
                                                                    : n === 0
                                                                      ? 'bg-slate-50 text-slate-400'
                                                                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                            }`}
                                                        >
                                                            {cat} ({n})
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={handleOpenBulkActas}
                                                disabled={resultsFilteredMatches.length === 0}
                                                className={`px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50 ${
                                                    compArenaMode === 'simulation'
                                                        ? 'bg-purple-700 hover:bg-purple-800 text-white'
                                                        : 'bg-teal-700 hover:bg-teal-800 text-white'
                                                }`}
                                            >
                                                <span className="material-symbols-outlined text-lg">print</span>
                                                Imprimir todas (PDF)
                                                <span className="text-xs font-semibold opacity-90">
                                                    ({resultsFilteredMatches.length})
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void handleDownloadAllActasDocx()}
                                                disabled={resultsFilteredMatches.length === 0 || actaExporting}
                                                className="px-4 py-2.5 rounded-lg text-sm font-bold flex items-center gap-2 disabled:opacity-50 bg-slate-800 hover:bg-slate-900 text-white"
                                            >
                                                <span className="material-symbols-outlined text-lg">download</span>
                                                Descargar todas (DOCX ZIP)
                                            </button>
                                            <a
                                                href="/templates/acta-playa_kolosaurios.docx"
                                                download
                                                className="text-xs text-teal-700 font-semibold underline"
                                            >
                                                Plantilla vacía Kolosaurios
                                            </a>
                                        </div>
                                        <CompetitionResultsTable
                                            matches={resultsFilteredMatches}
                                            previewMode={compArenaMode}
                                            onUpdateSetScores={
                                                compArenaMode === 'official'
                                                    ? updateMatchSetScores
                                                    : updateDraftMatchSetScores
                                            }
                                            onOpenReport={openReportModal}
                                            onNavigateActa={
                                                compArenaMode === 'official'
                                                    ? (id) => navigate(`/admin/match-report/${id}`)
                                                    : undefined
                                            }
                                            onSocialPost={compArenaMode === 'official' ? handleGenerateSocialPost : undefined}
                                            emptyMessage={
                                                resultsDivisionFilter !== 'all'
                                                    ? `No hay partidos de ${resultsDivisionFilter} en esta vista.`
                                                    : compArenaMode === 'simulation'
                                                      ? 'No hay partidos en el borrador seleccionado. Genera el calendario en Simulaciones.'
                                                      : 'No hay partidos oficiales con horario.'
                                            }
                                        />
                                    </div>
                                )}

                                {/* Clasificación */}
                                {compSubTab === 'standings' && (
                                    <div className="space-y-4">
                                        <div className="flex overflow-x-auto gap-2 pb-1">
                                            {DIVISIONS_LIST.map((cat) => (
                                                <button
                                                    key={cat}
                                                    type="button"
                                                    onClick={() => {
                                                        setStandingsDivision(cat);
                                                        const keys = competitionGroupsForDivision(teams, cat, false);
                                                        const dist = getGroupDistributionForDivision(teams, cat, false)
                                                            .map((g) => g.key)
                                                            .filter((k) => k && k !== '—');
                                                        const first = keys[0] ?? dist[0] ?? 'A';
                                                        setStandingsGroupFilter(first);
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
                                            {standingsGroupKeys.length === 0 ? (
                                                <span className="text-xs text-slate-500">Sin grupos en esta categoría</span>
                                            ) : (
                                                standingsGroupKeys.map((g) => (
                                                    <button
                                                        key={g}
                                                        type="button"
                                                        onClick={() => setStandingsGroupFilter(g)}
                                                        className={`px-4 py-2 rounded-full text-xs font-bold min-w-[2.5rem] ${
                                                            standingsGroupFilter === g
                                                                ? 'bg-secondary text-background-dark shadow'
                                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                        }`}
                                                    >
                                                        {g}
                                                    </button>
                                                ))
                                            )}
                                        </div>

                                        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="text-[10px] font-black uppercase text-indigo-800">
                                                    Gestión de grupos (solo admin)
                                                </span>
                                                <span className="text-[10px] text-indigo-600">
                                                    La web pública solo muestra clasificación en lectura.
                                                </span>
                                            </div>
                                            <CompetitionGroupManager
                                                division={standingsDivision}
                                                teams={teams}
                                                onMoveTeam={(t, g) => void handleMoveTeamToGroup(t, g)}
                                                onSwapTeams={(a, b) => void handleSwapTeamsInGroups(a, b)}
                                                onRequestRegenerateSimulation={() => void handleGenerateMuskizAllDays()}
                                                onlyPaid={false}
                                            />
                                        </div>

                                        {compDisplayMatches.length === 0 && (
                                            <p className="text-sm text-slate-500 text-center py-4 border border-dashed rounded-lg">
                                                {compArenaMode === 'simulation'
                                                    ? 'Sin partidos en el borrador: la clasificación se verá al registrar resultados.'
                                                    : 'Sin partidos oficiales todavía.'}
                                            </p>
                                        )}

                                    <div className="overflow-hidden rounded-lg border border-slate-200">
                                        <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-600">
                                            Clasificación — Grupo {standingsGroupFilter}
                                        </div>
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
                                                {standings.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={8} className="px-6 py-8 text-center text-sm text-slate-400">
                                                            No hay equipos en el Grupo {standingsGroupFilter}.
                                                        </td>
                                                    </tr>
                                                ) : (
                                                standings.map((team, index) => (
                                                        <tr
                                                            key={team.name}
                                                            className={`hover:bg-slate-50/50 ${index < 4 ? 'bg-green-50/30' : ''}`}
                                                        >
                                                            <td className="px-6 py-4 font-mono text-slate-400">{index + 1}</td>
                                                            <td className="px-6 py-4 font-bold text-slate-800">{team.name}</td>
                                                            <td className="px-4 py-4 text-center">{team.played}</td>
                                                            <td className="px-4 py-4 text-center font-medium text-green-600">{team.won}</td>
                                                            <td className="px-4 py-4 text-center text-slate-500">{team.gf}</td>
                                                            <td className="px-4 py-4 text-center text-slate-500">{team.ga}</td>
                                                            <td className="px-4 py-4 text-center font-mono text-slate-500">
                                                                {team.gf - team.ga}
                                                            </td>
                                                            <td className="px-6 py-4 text-right font-black text-lg text-slate-900">
                                                                {team.points}
                                                            </td>
                                                        </tr>
                                                )))}
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
                                    <p className="text-xs text-slate-500 mt-1">Configura límites de equipos, precios y mínimo de partidos por equipo en el simulador.</p>
                                </div>
                                <div className="p-6">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead>
                                                <tr className="text-slate-500 border-b border-slate-100">
                                                    <th className="px-6 py-4 font-bold uppercase text-[10px]">Categoría</th>
                                                    <th className="px-6 py-4 font-bold uppercase text-[10px]">Precio (€)</th>
                                                    <th className="px-6 py-4 font-bold uppercase text-[10px]">Límite Equipos</th>
                                                    <th className="px-6 py-4 font-bold uppercase text-[10px]">Mín. partidos/equipo</th>
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
                                                        <td className="px-6 py-4">
                                                            <input
                                                                type="number"
                                                                min={1}
                                                                max={20}
                                                                defaultValue={cat.min_matches_per_team ?? MIN_REAL_MATCHES_PER_TEAM}
                                                                onBlur={(e) => {
                                                                    const value = Math.max(1, Math.min(20, Number(e.target.value) || MIN_REAL_MATCHES_PER_TEAM));
                                                                    handleUpdateCategory(cat.id, { min_matches_per_team: value });
                                                                }}
                                                                className="w-20 border border-slate-200 rounded px-2 py-1 bg-slate-50 outline-none focus:ring-1 focus:ring-primary"
                                                                title="Mínimo de partidos reales por equipo en el simulador"
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

            {/* Barra inferior fija — navegación del panel en móvil */}
            <nav
                className="lg:hidden fixed bottom-0 left-0 right-0 z-[55] bg-white border-t-2 border-primary shadow-[0_-6px_24px_rgba(0,0,0,0.15)]"
                style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
                aria-label="Secciones del panel de administración"
            >
                <div className="grid grid-cols-7 divide-x divide-slate-100">
                    {ADMIN_MAIN_NAV.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => selectAdminTab(item.id)}
                            className={`flex flex-col items-center justify-center gap-0.5 py-2 min-h-[3.25rem] transition-colors ${
                                activeTab === item.id
                                    ? 'bg-primary text-background-dark'
                                    : 'text-slate-600 active:bg-slate-100'
                            }`}
                        >
                            <span
                                className={`material-symbols-outlined text-[22px] leading-none ${
                                    activeTab === item.id ? 'filled-icon' : ''
                                }`}
                            >
                                {item.icon}
                            </span>
                            <span className="text-[8px] font-black uppercase leading-tight text-center px-0.5">
                                {item.shortLabel}
                            </span>
                        </button>
                    ))}
                </div>
            </nav>

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
                                <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {[selectedMatchForReport.teamA, selectedMatchForReport.teamB].map((teamName, idx) => {
                                        const team = teams.find(t => t.name === teamName);
                                        if (!team) return <div key={idx} className="text-red-500">Equipo no encontrado</div>;

                                        return (
                                            <div key={team.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                                <h4 className="font-bold text-lg border-b border-slate-100 pb-2 mb-4 text-center">{team.name}</h4>
                                                <div className="space-y-3">
                                                    {playersListedOnActa(team.players).length === 0 && (
                                                        <p className="text-sm text-slate-400 text-center italic">
                                                            Sin jugadores en plantilla. Añade la plantilla en Equipos.
                                                        </p>
                                                    )}
                                                    {playersListedOnActa(team.players).map((player) => {
                                                        const stat = selectedMatchForReport.report?.playerStats?.find(s => s.playerId === player.id) || { goals: 0 };
                                                        const docsOk = isPlayerEligibleForMatch(player);
                                                        return (
                                                            <div key={player.id} className="flex justify-between items-center text-sm">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <span className="bg-slate-100 text-slate-500 text-xs font-mono px-1.5 py-0.5 rounded shrink-0">#{player.number}</span>
                                                                    <span className="font-medium text-slate-700 truncate">{player.name} {player.surnames}</span>
                                                                    {!docsOk && (
                                                                        <span className="text-[9px] font-bold text-amber-700 bg-amber-50 px-1 rounded shrink-0" title="DNI o seguro pendiente">
                                                                            docs
                                                                        </span>
                                                                    )}
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
                                <div className="mt-6 border-t border-slate-200 pt-4">
                                    <p className="text-xs font-bold uppercase text-slate-500 mb-2">Vista previa acta Kolosaurios (auto-rellena)</p>
                                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white p-2 max-h-[280px] overflow-y-auto">
                                        <div className="origin-top-left scale-[0.55] w-[181%]">
                                            <MatchReportSheet match={selectedMatchForReport} teams={teams} />
                                        </div>
                                    </div>
                                </div>
                                </>
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

                        <div className="p-4 border-t border-slate-200 bg-white flex flex-wrap justify-between gap-3 items-center">
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        try {
                                            printActaHtml(selectedMatchForReport, teams);
                                        } catch (e: unknown) {
                                            toast.error(e instanceof Error ? e.message : 'No se pudo imprimir.');
                                        }
                                    }}
                                    className="px-4 py-2 rounded-lg text-sm font-bold border border-teal-200 text-teal-900 bg-teal-50 hover:bg-teal-100 flex items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-base">print</span>
                                    PDF / Imprimir
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void downloadActaDocx(selectedMatchForReport, teams).then(() => toast.success('Acta DOCX descargada'))}
                                    className="px-4 py-2 rounded-lg text-sm font-bold border border-slate-200 text-slate-800 bg-slate-50 hover:bg-slate-100 flex items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-base">download</span>
                                    Descargar DOCX
                                </button>
                            </div>
                            <div className="flex gap-3 ml-auto">
                                <button onClick={() => setSelectedMatchForReport(null)} className="px-6 py-2 rounded-lg font-bold text-slate-500 hover:bg-slate-100">Cancelar</button>
                                <button onClick={() => void saveReport()} className="px-6 py-2 rounded-lg font-bold bg-primary text-background-dark hover:opacity-90 shadow-lg">Guardar Acta</button>
                            </div>
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