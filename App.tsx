import React, { useState, useEffect, useMemo, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Team, Match, CategoryLimits } from './types';
import { Layout } from './components/Layout';
import { ChatBot } from './components/ChatBot';
import { ProtectedRoute } from './components/ProtectedRoute';
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
import { ManagerResetPassword } from './views/ManagerResetPassword';
import { MatchReport } from './views/MatchReport';
import { MatchReportsBulk } from './views/MatchReportsBulk';
import { RefereeLogin } from './views/RefereeLogin';
import { RefereeAssignments } from './views/RefereeAssignments';
import { teamService, matchService, mapSupabaseMatchRow } from './services/teamService';
import { supabase } from './services/supabaseClient';
import { OpsErrorBoundary } from './components/OpsErrorBoundary';
import { reportOpsAlert } from './services/opsAlertService';
import { Toaster, toast } from 'sonner';
import type { User } from '@supabase/supabase-js';
import { TournamentDataProvider } from './context/TournamentDataContext';
import {
    applyFinalPhaseResolution,
    getFinalPhaseTeamPatches,
    persistFinalPhaseTeamNames,
} from './utils/resolveFinalPhaseTeams';
import {
    fetchCalendarSimulations,
    fetchScheduleVisibility,
    mergeWeekendDraftMatches,
    normalizeCalendarSimulations,
    prepareWeekendDraftsForPublicView,
    saveScheduleVisibility,
} from './services/tournamentScheduleService';
import { TOURNAMENT_WITHDRAWN_TEAMS } from './constants/tournamentWithdrawals';
import {
  excludeWithdrawnTeamMatches,
  matchesForPublicSchedule,
  mergePublicScheduleMatches,
} from './utils/matchPublicView';

const App: React.FC = () => {
  const normalizeEmail = (value?: string | null) => String(value ?? '').trim().toLowerCase();
  // Category Limits (Admin controlled)
  const [categoryLimits, setCategoryLimits] = useState<CategoryLimits>({
    'Infantil Femenino': 8,
    'Infantil Masculino': 8,
    'Cadete Femenino': 8,
    'Cadete Masculino': 8,
    'Juvenil Femenino': 8,
    'Juvenil Masculino': 9,
    'Senior Femenino': 8,
    'Senior Masculino': 12
  });

  // Teams Data
  const [teams, setTeams] = useState<Team[]>([]);

  // Matches Data
  const [matches, setMatches] = useState<Match[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [publicMatchesVisible, setPublicMatchesVisible] = useState(false);
  /** Horarios oficiales en borrador (si aún no están en tabla matches). */
  const [publicSimulationMatches, setPublicSimulationMatches] = useState<Match[]>([]);

  // Auth Manager
  const [user, setUser] = useState<User | null>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  // Restore session & Role
  useEffect(() => {
    const fetchRole = async (userId: string, showLoading: boolean) => {
      if (showLoading) setRoleLoading(true);
      const { data } = await supabase.from('profiles').select('role').eq('id', userId).single();
      setUserRole(data?.role || null);
      setRoleLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) void fetchRole(session.user.id, true);
      else setRoleLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        setUserRole(null);
        setRoleLoading(false);
        return;
      }
      if (event === 'TOKEN_REFRESHED') return;
      void fetchRole(session.user.id, false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      setDataLoaded(false);
      // 1. Fetch Categories Limits from Supabase site_content
      const { data: limitsData } = await supabase
        .from('site_content')
        .select('value')
        .eq('key', 'category_limits')
        .single();

      if (limitsData?.value) {
        setCategoryLimits(limitsData.value as CategoryLimits);
      }

      const vis = await fetchScheduleVisibility();
      setPublicMatchesVisible(vis.publicMatchesVisible);

      // 2. Fetch Teams and Matches
      const dbTeams = await teamService.getTeams();
      const dbMatches = await matchService.getMatches();
      setTeams(dbTeams);
      setMatches(dbMatches);

      const simPayload = await fetchCalendarSimulations();
      if (simPayload?.drafts?.length) {
        const normalized = normalizeCalendarSimulations(simPayload);
        const publicDrafts = prepareWeekendDraftsForPublicView(normalized.drafts, dbTeams);
        setPublicSimulationMatches(mergeWeekendDraftMatches(publicDrafts));
      } else {
        setPublicSimulationMatches([]);
      }

      setDataLoaded(true);
    };
    loadData();

    // Realtime Events from Supabase (Optimized)
    const matchSubscription = supabase
      .channel('public:matches')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setMatches(prev => {
            if (prev.some(m => m.id === payload.new.id)) return prev;
            return [...prev, mapSupabaseMatchRow(payload.new as Record<string, unknown>)];
          });
        } else if (payload.eventType === 'UPDATE') {
          setMatches(prev => prev.map(m => m.id === payload.new.id ? mapSupabaseMatchRow(payload.new as Record<string, unknown>) : m));
        } else if (payload.eventType === 'DELETE') {
          setMatches(prev => prev.filter(m => m.id !== payload.old.id));
        }
      })
      .subscribe();

    const playerSubscription = supabase
      .channel('public:players')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, async () => {
        // Refresh all teams to get updated nested players
        const updatedTeams = await teamService.getTeams();
        setTeams(updatedTeams);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(matchSubscription);
      supabase.removeChannel(playerSubscription);
    };
  }, [user]);

  const handleUpdateLimits = async (newLimits: CategoryLimits) => {
    setCategoryLimits(newLimits);
    const { error } = await supabase
      .from('site_content')
      .upsert({ key: 'category_limits', value: newLimits }, { onConflict: 'key' });
    
    if (error) {
      toast.error('Error al guardar los límites en la base de datos');
    } else {
      toast.success('Límites actualizados correctamente');
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    sessionStorage.clear();
    setUser(null);
    setUserRole(null);
    toast.success('Sesión cerrada correctamente');
  };

  const addTeams = async (
    newTeams: Team[],
    receiptFile?: File,
    meta?: { authUserId?: string | null; managerLoginPassword?: string | null }
  ) => {
    try {
      const savedTeams = await teamService.registerTeams(newTeams, receiptFile, meta);
      if (savedTeams.length > 0) {
        setTeams(prev => [...prev, ...savedTeams]);
        toast.success('Equipos registrados correctamente');
      }
    } catch (error: any) {
      console.error('Error registrando equipos:', error);
      reportOpsAlert({
        source: 'frontend.registration',
        severity: 'error',
        message: 'Error registrando equipos',
        details: error?.message ? String(error.message) : 'Unknown registration error',
      });
      toast.error(error.message || 'Error al registrar los equipos. Revisa los permisos.');
    }
  };

  const updateTeam = async (updatedTeam: Team) => {
    try {
      await teamService.updateTeam(updatedTeam);
      setTeams(prev => prev.map(t => t.id === updatedTeam.id ? updatedTeam : t));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al guardar el equipo';
      /** Fallo habitual si no está aplicado add_competition_group_to_teams.sql — no debe spamear el bot de fallos */
      const likelyMissingCompetitionGroup =
        typeof msg === 'string' &&
        /competition_group/i.test(msg) &&
        /does not exist|unknown column|no existe|could not/i.test(msg);
      toast.error(
        likelyMissingCompetitionGroup
          ? 'Falta la columna competition_group en Supabase. Ejecuta supabase/sql/add_competition_group_to_teams.sql y recarga.'
          : msg
      );
      if (!likelyMissingCompetitionGroup) {
        void reportOpsAlert({
          source: 'frontend.team-update',
          severity: 'error',
          message: 'Error al guardar equipo (manager/admin)',
          details: e instanceof Error ? `${msg}\n${e.stack ?? ''}`.slice(0, 3500) : msg,
        });
      }
      throw e;
    }
  };

  const updateMatches = async (newMatches: Match[]) => {
    const { matches: synced } = applyFinalPhaseResolution(newMatches, teams);
    setMatches(synced);
    await matchService.saveMatches(synced);
  };

  const isStaff = userRole === 'staff' || userRole === 'admin';
  const lastFinalPhasePatchKeyRef = useRef('');

  /** Si hay placeholders pendientes en BD, staff los persiste al cargar (sin re-guardar todo el calendario). */
  useEffect(() => {
    if (!dataLoaded || !isStaff || teams.length === 0 || matches.length === 0) return;
    const { patches } = getFinalPhaseTeamPatches(matches, teams);
    if (patches.length === 0) {
      lastFinalPhasePatchKeyRef.current = '';
      return;
    }
    const patchKey = patches
        .map((p) => `${p.id}|${p.teamA}|${p.teamB}`)
        .sort()
        .join(';;');
    if (patchKey === lastFinalPhasePatchKeyRef.current) return;

    void persistFinalPhaseTeamNames(matches, teams, (p) => matchService.patchMatchTeamNames(p, teams))
        .then(({ changed, divisionsUpdated }) => {
            if (!changed) return;
            lastFinalPhasePatchKeyRef.current = patchKey;
            setMatches(applyFinalPhaseResolution(matches, teams).matches);
            toast.success(
                divisionsUpdated.length === 1
                    ? `Fase final de ${divisionsUpdated[0]} actualizada según grupos.`
                    : `Fase final actualizada: ${divisionsUpdated.join(', ')}.`
            );
        })
        .catch(() => {
            const resolved = applyFinalPhaseResolution(matches, teams);
            if (!resolved.changed) return;
            void matchService.saveMatches(resolved.matches).then(() => {
                lastFinalPhasePatchKeyRef.current = patchKey;
                setMatches(resolved.matches);
                toast.success(
                    resolved.divisionsUpdated.length === 1
                        ? `Fase final de ${resolved.divisionsUpdated[0]} actualizada según grupos.`
                        : `Fase final actualizada: ${resolved.divisionsUpdated.join(', ')}.`
                );
            }).catch(() => {
                /* reintenta en el siguiente cambio de partidos */
            });
        });
  }, [dataLoaded, isStaff, teams, matches]);

  const persistPublicMatchesVisible = async (visible: boolean) => {
    setPublicMatchesVisible(visible);
    try {
      await saveScheduleVisibility(visible);
      toast.success(visible ? 'Calendario visible para el público y equipos' : 'Calendario oculto para visitantes');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error al guardar visibilidad';
      toast.error(msg);
      const v = await fetchScheduleVisibility();
      setPublicMatchesVisible(v.publicMatchesVisible);
    }
  };

  const displayMatches = useMemo(
    () => applyFinalPhaseResolution(matches, teams).matches,
    [matches, teams]
  );

  const resolvedPublicSimulationMatches = useMemo(
    () => applyFinalPhaseResolution(publicSimulationMatches, teams).matches,
    [publicSimulationMatches, teams]
  );

  const publicDisplayMatches = useMemo(() => {
    const official = matchesForPublicSchedule(displayMatches);
    const simulation = matchesForPublicSchedule(resolvedPublicSimulationMatches);
    return excludeWithdrawnTeamMatches(
      mergePublicScheduleMatches(official, simulation),
      teams,
      TOURNAMENT_WITHDRAWN_TEAMS
    );
  }, [displayMatches, resolvedPublicSimulationMatches, teams]);

  const managerEmail = normalizeEmail(user?.email);
  const hasApprovedTeam = teams.some(
    (t) => normalizeEmail(t.managerEmail) === managerEmail && t.status === 'approved'
  );

  const adminUnauthorized = (
                  <Admin
                    onUpdateTeam={updateTeam}
                    onUpdateMatches={updateMatches}
                    onUpdateLimits={handleUpdateLimits}
                  />
  );

  return (
    <OpsErrorBoundary>
      <Router>
        <TournamentDataProvider
          value={{
            teams,
            setTeams,
            matches,
            setMatches,
            displayMatches,
            categoryLimits,
            setCategoryLimits,
            publicMatchesVisible,
            persistPublicMatchesVisible,
            publicDisplayMatches,
          }}
        >
          <Routes>
            <Route
              path="/admin/match-report/:matchId"
              element={
                <ProtectedRoute
                  allowedRole="staff"
                  user={user}
                  userRole={userRole}
                  roleLoading={roleLoading}
                  onUnauthorizedRole={handleLogout}
                  unauthenticatedElement={adminUnauthorized}
                >
                  <MatchReport />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/match-reports-bulk"
              element={
                <ProtectedRoute
                  allowedRole="staff"
                  user={user}
                  userRole={userRole}
                  roleLoading={roleLoading}
                  onUnauthorizedRole={handleLogout}
                  unauthenticatedElement={adminUnauthorized}
                >
                  <MatchReportsBulk />
                </ProtectedRoute>
              }
            />

            <Route
              element={
                <Layout>
                  <Toaster richColors position="bottom-right" />
                  <Outlet />
                  <ChatBot />
                </Layout>
              }
            >
              <Route path="/" element={<Home />} />
              <Route path="/info" element={<Information />} />
              <Route path="/schedule" element={<Schedule />} />
              <Route path="/registration" element={<Registration onRegister={addTeams} />} />
              <Route path="/manager-login" element={<ManagerLogin />} />
              <Route path="/manager-reset-password" element={<ManagerResetPassword />} />
              <Route path="/sponsors" element={<Sponsors />} />
              <Route path="/media" element={<Media />} />
              <Route path="/self-registration" element={<PlayerSelfRegistration onUpdateTeam={updateTeam} />} />

              <Route
                path="/admin"
                element={
                  <ProtectedRoute
                    allowedRole="staff"
                    user={user}
                    userRole={userRole}
                    roleLoading={roleLoading}
                    onUnauthorizedRole={handleLogout}
                    unauthenticatedElement={adminUnauthorized}
                  >
                    <Admin
                      onUpdateTeam={updateTeam}
                      onUpdateMatches={updateMatches}
                      onUpdateLimits={handleUpdateLimits}
                    />
                  </ProtectedRoute>
                }
              />

              <Route path="/arbitros-login" element={<RefereeLogin />} />
              <Route
                path="/arbitros"
                element={
                  <ProtectedRoute
                    allowedRoles={['referee_coordinator']}
                    user={user}
                    userRole={userRole}
                    roleLoading={roleLoading}
                    onUnauthorizedRole={handleLogout}
                    unauthenticatedElement={<RefereeLogin />}
                  >
                    <RefereeAssignments />
                  </ProtectedRoute>
                }
              />

              <Route path="/team-manager" element={
                <ProtectedRoute
                  allowedRole="manager"
                  user={user}
                  userRole={userRole}
                  roleLoading={roleLoading}
                  dataLoaded={dataLoaded}
                  hasApprovedTeam={hasApprovedTeam}
                  onUnauthorizedRole={handleLogout}
                  unauthenticatedElement={<ManagerLogin />}
                >
                  <div className="relative">
                    <div className="absolute top-4 right-4 z-50">
                      <button onClick={handleLogout} className="bg-red-500/10 text-red-500 px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-500/20 transition-colors flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm">logout</span> Cerrar Sesión
                      </button>
                    </div>
                    <TeamManager
                      teams={teams.filter((t) => normalizeEmail(t.managerEmail) === managerEmail && t.status === 'approved')}
                      onUpdateTeam={updateTeam}
                    />
                  </div>
                </ProtectedRoute>
              } />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </TournamentDataProvider>
    </Router>
    </OpsErrorBoundary>
  );
};

export default App;