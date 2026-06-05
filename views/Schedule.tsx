import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PLAYER_LICENSE_LAST_DAY } from '../constants/registrationDeadlines';
import { searchRules } from '../services/geminiService';
import { useTournamentData } from '../context/TournamentDataContext';
import { CompetitionCalendarViews } from '../components/CompetitionCalendarViews';
import { CompetitionPublicResultsSection } from '../components/CompetitionPublicResultsSection';
import { CompetitionPublicStandingsSection } from '../components/CompetitionPublicStandingsSection';
import { CompetitionPublicFinalPhaseSection } from '../components/CompetitionPublicFinalPhaseSection';

type ScheduleTab = 'info' | 'calendar' | 'results' | 'standings' | 'finals';

function tabFromSearchParam(value: string | null): ScheduleTab | null {
    if (value === 'info' || value === 'calendar' || value === 'results' || value === 'standings' || value === 'finals') {
        return value;
    }
    return null;
}

export const Schedule: React.FC = () => {
    const { teams, categoryLimits, publicMatchesVisible, publicDisplayMatches } = useTournamentData();
    const [searchParams] = useSearchParams();
    const requestedTab = tabFromSearchParam(searchParams.get('tab'));
    const [activeTab, setActiveTab] = useState<ScheduleTab>(requestedTab ?? 'info');

    useEffect(() => {
        const tab = tabFromSearchParam(searchParams.get('tab'));
        if (tab) setActiveTab(tab);
    }, [searchParams]);
    const [infoSubTab, setInfoSubTab] = useState<'general' | 'rules'>('general');

    const publicMatches = publicDisplayMatches;

    const [showMapModal, setShowMapModal] = useState(false);
    const [mapQuery, setMapQuery] = useState('');
    const [mapResult, setMapResult] = useState<{ text: string, links: any[] } | null>(null);
    const handleSearchVenue = async () => {
        setMapResult(null);
        const res = await searchRules(`¿Dónde está la cancha ${mapQuery || 'más cercana'}?`);
        setMapResult(res);
    };

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark py-12 px-4 sm:px-6 lg:px-8 animate-in fade-in">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
                    <div>
                        <h2 className="text-4xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Competición</h2>
                        <p className="text-slate-500 mt-2">Toda la información, resultados y normativas del torneo.</p>
                    </div>

                    <button
                        onClick={() => setShowMapModal(true)}
                        className="bg-white dark:bg-surface-dark text-slate-900 dark:text-white px-6 py-3 rounded-xl font-bold shadow-sm border border-slate-200 dark:border-white/10 flex items-center gap-2 hover:border-primary transition-colors"
                    >
                        <span className="material-symbols-outlined text-primary">map</span>
                        Mapa Canchas
                    </button>
                </div>

                <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 overflow-hidden">
                    <div className="flex border-b border-slate-200 dark:border-white/10 overflow-x-auto no-scrollbar">
                        {(['info', 'calendar', 'results', 'standings', 'finals'] as const)
                            .filter((tab) => tab === 'info' || publicMatchesVisible)
                            .map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={`px-6 sm:px-8 py-4 font-bold text-sm uppercase tracking-wide whitespace-nowrap transition-colors border-b-2 ${activeTab === tab ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                            >
                                {tab === 'info'
                                    ? 'Información'
                                    : tab === 'calendar'
                                      ? 'Calendario'
                                      : tab === 'results'
                                        ? 'Resultados'
                                        : tab === 'standings'
                                          ? 'Clasificación'
                                          : 'Fase final'}
                            </button>
                        ))}
                    </div>

                    <div className="p-6 md:p-8 min-h-[400px]">
                        {activeTab === 'info' && (
                            <div className="space-y-8 animate-in fade-in">
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
                                        {/* Horarios */}
                                        <div className="grid md:grid-cols-3 gap-4">
                                            {/* Viernes */}
                                            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-5">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <span className="material-symbols-outlined text-primary text-lg">calendar_today</span>
                                                    <div>
                                                        <p className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-wide">Viernes 5 Jun</p>
                                                        <p className="text-xs text-primary font-bold">17:00 - 21:00</p>
                                                    </div>
                                                </div>
                                                <div className="bg-primary/10 rounded-lg px-3 py-2 text-center">
                                                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200">🏐 Cadete (M/F)</span>
                                                </div>
                                            </div>

                                            {/* Sábado */}
                                            <div className="bg-secondary/5 border border-secondary/20 rounded-2xl p-5">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <span className="material-symbols-outlined text-secondary text-lg">calendar_today</span>
                                                    <div>
                                                        <p className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-wide">Sábado 6 Jun</p>
                                                        <p className="text-xs text-secondary font-bold">09:00 - 21:00</p>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="bg-secondary/10 rounded-lg px-3 py-2 text-center">
                                                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200">🏐 Juvenil (M/F)</span>
                                                    </div>
                                                    <div className="bg-secondary/10 rounded-lg px-3 py-2 text-center">
                                                        <span className="text-sm font-bold text-slate-800 dark:text-slate-200">🏐 Senior (M/F)</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Domingo */}
                                            <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-5">
                                                <div className="flex items-center gap-2 mb-3">
                                                    <span className="material-symbols-outlined text-slate-500 text-lg">calendar_today</span>
                                                    <div>
                                                        <p className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-wide">Domingo 7 Jun</p>
                                                        <p className="text-xs text-slate-500 font-bold">09:00 - 15:00</p>
                                                    </div>
                                                </div>
                                                <div className="bg-slate-200 dark:bg-white/10 rounded-lg px-3 py-2 text-center">
                                                    <span className="text-sm font-bold text-slate-800 dark:text-slate-200">🏐 Infantil (M/F)</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Normativa de Jugadores */}
                                        <div>
                                            <h3 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3 mb-6">
                                                <span className="material-symbols-outlined text-primary text-3xl">groups</span>
                                                Normativa de Jugadores
                                            </h3>
                                            <div className="grid lg:grid-cols-3 gap-8">
                                                <div className="lg:col-span-2">
                                                    <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10">
                                                        <table className="w-full text-sm">
                                                            <thead>
                                                                <tr className="bg-slate-50 dark:bg-white/5">
                                                                    <th className="text-left px-6 py-4 font-bold text-xs uppercase text-slate-500">Categoría</th>
                                                                    <th className="text-center px-6 py-4 font-bold text-xs uppercase text-slate-500">Equipos Max.</th>
                                                                    <th className="text-center px-6 py-4 font-bold text-xs uppercase text-slate-500">Jugadores (Min-Max)</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100 dark:divide-white/5 text-slate-700 dark:text-slate-200">
                                                                {[
                                                                    { cat: 'Senior Masculino', min: 6, max: 12, teams: categoryLimits['Senior Masculino'] },
                                                                    { cat: 'Senior Femenino', min: 6, max: 12, teams: categoryLimits['Senior Femenino'] },
                                                                    { cat: 'Juvenil (M/F)', min: 6, max: 14, teams: categoryLimits['Juvenil Masculino'] },
                                                                    { cat: 'Cadete (M/F)', min: 6, max: 14, teams: categoryLimits['Cadete Masculino'] },
                                                                    { cat: 'Infantil (M/F)', min: 6, max: 14, teams: categoryLimits['Infantil Masculino'] },
                                                                ].map((row, i) => (
                                                                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                                                        <td className="px-6 py-4 font-medium">{row.cat}</td>
                                                                        <td className="px-6 py-4 text-center font-bold text-secondary">{row.teams}</td>
                                                                        <td className="px-6 py-4 text-center font-bold text-primary">{row.min} - {row.max}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                                <div className="space-y-4">
                                                    <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-5 border border-slate-100 dark:border-white/5">
                                                        <div className="flex items-center gap-3 mb-2">
                                                            <span className="material-symbols-outlined text-primary">badge</span>
                                                            <h4 className="font-bold text-slate-900 dark:text-white uppercase text-xs tracking-widest">DNI Obligatorio</h4>
                                                        </div>
                                                        <p className="text-xs text-slate-500 leading-relaxed">Es imprescindible subir una copia del DNI de todos los participantes para el seguro deportivo.</p>
                                                    </div>
                                                    <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-5 border border-slate-100 dark:border-white/5">
                                                        <div className="flex items-center gap-3 mb-2">
                                                            <span className="material-symbols-outlined text-secondary">health_and_safety</span>
                                                            <h4 className="font-bold text-slate-900 dark:text-white uppercase text-xs tracking-widest">Seguro Deportivo</h4>
                                                        </div>
                                                        <p className="text-xs text-slate-500 leading-relaxed">Cada jugador debe disponer de su ficha federada o de un seguro privado.</p>
                                                    </div>
                                                    <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-5 border border-slate-100 dark:border-white/5">
                                                        <div className="flex items-center gap-3 mb-2">
                                                            <span className="material-symbols-outlined text-red-500">event_busy</span>
                                                            <h4 className="font-bold text-slate-900 dark:text-white uppercase text-xs tracking-widest">Límites de Inscripción</h4>
                                                        </div>
                                                        <p className="text-xs text-slate-600 dark:text-slate-400"><span className="font-bold text-slate-900 dark:text-white">Equipos:</span> 1 de Junio</p>
                                                        <p className="text-xs text-slate-600 dark:text-slate-400 mt-1"><span className="font-bold text-slate-900 dark:text-white">Plantilla / licencias:</span> {PLAYER_LICENSE_LAST_DAY}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                ) : (
                                    <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-right-4 fade-in duration-300">
                                        <h3 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                                            <span className="material-symbols-outlined text-primary text-3xl">rule</span>
                                            Reglamento de Competición
                                        </h3>

                                        <div className="grid md:grid-cols-2 gap-6">
                                            {/* Fase de Grupos */}
                                            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 space-y-3">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center">
                                                        <span className="material-symbols-outlined text-primary">groups</span>
                                                    </div>
                                                    <h4 className="font-bold text-slate-900 dark:text-white uppercase text-sm tracking-wider">Fase de Grupos</h4>
                                                </div>
                                                <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                                                    <li className="flex items-start gap-2"><span className="material-symbols-outlined text-primary text-base mt-0.5">check_circle</span>3 partidos garantizados por equipo</li>
                                                </ul>
                                            </div>

                                            {/* Fase final */}
                                            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-6 space-y-3">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className="size-10 rounded-full bg-primary/20 flex items-center justify-center">
                                                        <span className="material-symbols-outlined text-primary">emoji_events</span>
                                                    </div>
                                                    <h4 className="font-bold text-slate-900 dark:text-white uppercase text-sm tracking-wider">Fase final</h4>
                                                </div>
                                                <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
                                                    <li className="flex items-start gap-2"><span className="material-symbols-outlined text-primary text-base mt-0.5">check_circle</span>Fase final</li>
                                                </ul>
                                            </div>
                                        </div>

                                        {/* Formato de partido */}
                                        <div className="bg-white dark:bg-surface-dark rounded-2xl p-6 border border-slate-200 dark:border-white/10">
                                            <h4 className="font-bold text-slate-900 dark:text-white uppercase text-xs tracking-widest mb-4 flex items-center gap-2">
                                                <span className="material-symbols-outlined text-primary">timer</span>
                                                Formato de Partido
                                            </h4>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                                                <div className="text-center bg-slate-50 dark:bg-white/5 rounded-xl p-4">
                                                    <span className="block text-2xl font-black text-primary">2</span>
                                                    <span className="text-xs text-slate-500 uppercase font-bold">Sets</span>
                                                </div>
                                                <div className="text-center bg-slate-50 dark:bg-white/5 rounded-xl p-4">
                                                    <span className="block text-2xl font-black text-primary">10'</span>
                                                    <span className="text-xs text-slate-500 uppercase font-bold">Por Set</span>
                                                </div>
                                                <div className="text-center bg-slate-50 dark:bg-white/5 rounded-xl p-4 col-span-2 sm:col-span-1">
                                                    <span className="block text-2xl font-black text-secondary">×2</span>
                                                    <span className="text-xs text-slate-500 uppercase font-bold">Goles Espectaculares</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {activeTab === 'calendar' && (
                            <div className="animate-in fade-in">
                                <CompetitionCalendarViews
                                    matches={publicMatches}
                                    teams={teams}
                                    readOnly
                                    readOnlyAudience="public"
                                    title="Calendario oficial (Viernes · Sábado · Domingo)"
                                    emptyMessage="El calendario oficial se publicará próximamente."
                                />
                            </div>
                        )}

                        {activeTab === 'results' && (
                            <CompetitionPublicResultsSection matches={publicMatches} teams={teams} />
                        )}

                        {activeTab === 'standings' && (
                            <CompetitionPublicStandingsSection matches={publicMatches} teams={teams} />
                        )}

                        {activeTab === 'finals' && (
                            <CompetitionPublicFinalPhaseSection matches={publicMatches} teams={teams} />
                        )}
                    </div>
                </div>
            </div>

            {showMapModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-surface-dark w-full max-w-lg rounded-2xl p-6 shadow-2xl">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white">Búsqueda de Canchas</h3>
                            <button onClick={() => setShowMapModal(false)}><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="mb-4 flex gap-2">
                            <input
                                type="text"
                                value={mapQuery}
                                onChange={(e) => setMapQuery(e.target.value)}
                                placeholder="ej. ¿Dónde está la Cancha 2?"
                                className="flex-1 bg-slate-100 dark:bg-background-dark border-none rounded-lg px-4 py-2"
                            />
                            <button onClick={handleSearchVenue} className="bg-primary text-background-dark px-4 rounded-lg font-bold">Buscar</button>
                        </div>
                        <div className="bg-slate-50 dark:bg-background-dark p-4 rounded-lg min-h-[100px]">
                            {mapResult ? (
                                <div>
                                    <p className="text-sm">{mapResult.text}</p>
                                    {mapResult.links.map((link, i) => (
                                        <a key={i} href={link.uri} target="_blank" rel="noreferrer" className="block text-primary text-xs underline mt-1">{link.title}</a>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-slate-400 text-sm text-center">Buscando localizaciones...</p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};