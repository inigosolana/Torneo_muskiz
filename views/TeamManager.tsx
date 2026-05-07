import React, { useState, useEffect } from 'react';
import { analyzePlayerId } from '../services/geminiService';
import { Team, Player } from '../types';
import { resizeAndCompressImage } from '../utils/imageProcessor';
import { toast, Toaster } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { teamService } from '../services/teamService';
import { supabase } from '../services/supabaseClient';

interface TeamManagerProps {
    teams: Team[];
    onUpdateTeam: (team: Team) => void;
}

export const TeamManager: React.FC<TeamManagerProps> = ({ teams, onUpdateTeam }) => {
    const navigate = useNavigate();
    const [selectedTeamId, setSelectedTeamId] = useState<string>(teams.length > 0 ? teams[0].id : '');
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    useEffect(() => {
        if (teams.length > 0 && !selectedTeamId) {
            setSelectedTeamId(teams[0].id);
        }
    }, [teams, selectedTeamId]);

    const [timeLeft, setTimeLeft] = useState<number>(0);

    const selectedTeam = teams.find(t => t.id === selectedTeamId) || teams[0];

    useEffect(() => {
        if (selectedTeam?.paymentStatus === 'PENDING' && selectedTeam.paymentExpiresAt) {
            const interval = setInterval(() => {
                const diff = Math.max(0, Math.floor((selectedTeam.paymentExpiresAt! - Date.now()) / 1000));
                setTimeLeft(diff);
                if (diff <= 0) {
                    clearInterval(interval);
                    onUpdateTeam({ ...selectedTeam, paymentStatus: 'EXPIRED' });
                }
            }, 1000);
            return () => clearInterval(interval);
        }
    }, [selectedTeam, onUpdateTeam]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    // Form States
    const [newTeamName, setNewTeamName] = useState('');
    const [newTeamCity, setNewTeamCity] = useState('');
    const [showManualModal, setShowManualModal] = useState(false);
    const [manualPlayer, setManualPlayer] = useState<Partial<Player>>({
        name: '',
        number: undefined,
        position: 'Universal',
        role: 'PLAYER'
    });



    if (!selectedTeam) {
        return (
            <div className="min-h-screen bg-slate-50 dark:bg-background-dark p-6 lg:p-12">
                <div className="max-w-3xl mx-auto">
                    <div className="bg-white dark:bg-surface-dark rounded-2xl p-8 border border-slate-200 dark:border-white/10 text-center space-y-4">
                        <span className="material-symbols-outlined text-5xl text-amber-500">hourglass_top</span>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">Aun no tienes equipos autorizados</h2>
                        <p className="text-slate-500 text-sm">
                            Puedes inscribir mas equipos cuando quieras, pero solo apareceran aqui cuando el staff los apruebe.
                        </p>
                        <button
                            onClick={() => navigate('/registration')}
                            className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-white font-bold hover:opacity-90 transition-opacity"
                        >
                            <span className="material-symbols-outlined text-sm">add</span>
                            Inscribir nuevo equipo
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const currentPlayerCount = selectedTeam.players.filter(p => p.role === 'PLAYER').length;
    const maxPlayers = 12;
    const minPlayers = 6;
    const canAddMore = currentPlayerCount < maxPlayers;

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsAnalyzing(true);
        const toastId = toast.loading('Analizando DNI con IA...');

        try {
            const compressed = await resizeAndCompressImage(file);
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result as string;
                try {
                    const result = await analyzePlayerId(base64);
                    if (result) {
                        const newPlayer: Player = {
                            id: `p-${Date.now()}`,
                            teamId: selectedTeam.id,
                            name: result.nombre,
                            surnames: result.apellidos,
                            dniNumber: result.dni,
                            birthDate: result.fechaNacimiento,
                            number: 0,
                            verified: false,
                            role: 'PLAYER',
                            dniStatus: 'PENDING',
                            insuranceStatus: 'EMPTY',
                            dniUrl: base64 // Placeholder or real upload logic below
                        };
                        
                        const savedPlayer = await teamService.addPlayer(selectedTeam.id, newPlayer);
                        onUpdateTeam({ ...selectedTeam, players: [...selectedTeam.players, savedPlayer] });
                        
                        toast.success('Jugador detectado y añadido correctamente', { id: toastId });
                    }
                } catch (err) {
                    toast.error('La IA no pudo leer el DNI. Inténtalo manualmente.', { id: toastId });
                } finally {
                    setIsAnalyzing(false);
                }
            };
            reader.readAsDataURL(compressed);
        } catch (err) {
            toast.error('Error al procesar la imagen');
            setIsAnalyzing(false);
        }
    };

    const handleManualAdd = async () => {
        if (!manualPlayer.name) {
            toast.error('El nombre es obligatorio');
            return;
        }

        const newPlayer: Player = {
            id: `p-${Date.now()}`,
            teamId: selectedTeam.id,
            name: manualPlayer.name,
            number: manualPlayer.number || 0,
            position: manualPlayer.position || 'Universal',
            role: (manualPlayer.role as any) || 'PLAYER',
            verified: false,
            dniStatus: 'EMPTY',
            insuranceStatus: 'EMPTY'
        };

        try {
            const savedPlayer = await teamService.addPlayer(selectedTeam.id, newPlayer);
            onUpdateTeam({ ...selectedTeam, players: [...selectedTeam.players, savedPlayer] });
            setShowManualModal(false);
            setManualPlayer({ name: '', number: undefined, position: 'Universal', role: 'PLAYER' });
            toast.success('Jugador añadido');
        } catch (error) {
            toast.error('Error al añadir jugador');
        }
    };

    const handleDeletePlayer = async (playerId: string) => {
        if (!confirm('¿Estás seguro de que quieres eliminar a este jugador?')) return;
        try {
            await teamService.deletePlayer(playerId);
            const updatedPlayers = selectedTeam.players.filter(p => p.id !== playerId);
            onUpdateTeam({ ...selectedTeam, players: updatedPlayers });
            toast.success('Jugador eliminado');
        } catch (error) {
            toast.error('Error al eliminar');
        }
    };

    const handleDocumentUpload = (playerId: string, type: 'dni' | 'insurance') => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,application/pdf';
        input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (file) {
                const toastId = toast.loading(`Subiendo ${type.toUpperCase()}...`);
                try {
                    const fileExt = file.name.split('.').pop();
                    const filePath = `${selectedTeam.id}/${playerId}/${type}_${Date.now()}.${fileExt}`;
                    
                    const { error: uploadError } = await supabase.storage
                        .from('player-documents')
                        .upload(filePath, file);

                    if (uploadError) throw uploadError;

                    const { data: { publicUrl } } = supabase.storage
                        .from('player-documents')
                        .getPublicUrl(filePath);

                    const playerToUpdate = selectedTeam.players.find(p => p.id === playerId);
                    if (playerToUpdate) {
                        const updatedPlayerObj = {
                            ...playerToUpdate,
                            [type === 'dni' ? 'dniStatus' : 'insuranceStatus']: 'PENDING' as const,
                            [type === 'dni' ? 'dniUrl' : 'insuranceUrl']: publicUrl
                        };

                        await teamService.updatePlayer(updatedPlayerObj);
                        const updatedPlayers = selectedTeam.players.map(p => p.id === playerId ? updatedPlayerObj : p);
                        onUpdateTeam({ ...selectedTeam, players: updatedPlayers });
                        toast.success(`${type.toUpperCase()} subido correctamente`, { id: toastId });
                    }
                } catch (err: any) {
                    toast.error(`Error al subir: ${err.message || err}`, { id: toastId });
                }
            }
        };
        input.click();
    };

    const downloadCsvTemplate = () => {
        const headers = "Nombre Completo,Dorsal,Posicion,Rol(PLAYER/COACH/OFFICIAL)\n";
        const blob = new Blob([headers], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'plantilla_muskiz.csv';
        a.click();
    };

    const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            const text = event.target?.result as string;
            const lines = text.split('\n').slice(1);
            const newPlayers: Player[] = [];

            for (const line of lines) {
                if (!line.trim()) continue;
                const [name, number, position, role] = line.split(',');
                const p: Player = {
                    id: `p-${Date.now()}-${Math.random()}`,
                    teamId: selectedTeam.id,
                    name: name.trim(),
                    number: parseInt(number) || 0,
                    position: position?.trim() || 'Universal',
                    role: (role?.trim().toUpperCase() as any) || 'PLAYER',
                    verified: false,
                    dniStatus: 'EMPTY',
                    insuranceStatus: 'EMPTY'
                };
                
                try {
                    const saved = await teamService.addPlayer(selectedTeam.id, p);
                    newPlayers.push(saved);
                } catch (err) {
                    console.error("Error CSV line:", line);
                }
            }
            onUpdateTeam({ ...selectedTeam, players: [...selectedTeam.players, ...newPlayers] });
            toast.success(`${newPlayers.length} jugadores importados`);
        };
        reader.readAsText(file);
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-background-dark p-6 lg:p-12">
            <div className="max-w-6xl mx-auto space-y-8">
                
                <Toaster position="top-right" richColors />

                {/* Header & Selector */}
                <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="flex items-center gap-4">
                        <select 
                            value={selectedTeamId} 
                            onChange={(e) => setSelectedTeamId(e.target.value)}
                            className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 font-bold text-lg shadow-sm focus:ring-2 focus:ring-primary outline-none transition-all"
                        >
                            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                        <button onClick={() => navigate('/registration')} className="text-primary font-bold hover:underline text-sm">+ Nuevo Equipo</button>
                    </div>

                    <div className="flex flex-col items-center">
                        <div className="size-20 rounded-full bg-white dark:bg-surface-dark p-1 shadow-lg border border-slate-100 dark:border-white/10 overflow-hidden group relative">
                            {selectedTeam.logoUrl ? (
                                <img src={selectedTeam.logoUrl} className="w-full h-full object-contain" alt="Logo" />
                            ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-300">
                                    <span className="material-symbols-outlined text-4xl">shield</span>
                                </div>
                            )}
                        </div>
                        <span className="text-[10px] font-black text-slate-400 mt-2 uppercase tracking-widest">Logo Equipo</span>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Main Roster Panel */}
                    <div className="lg:col-span-2 space-y-6">
                        {selectedTeam.paymentStatus === 'PENDING' ? (
                            <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-xl border border-slate-200 dark:border-white/5 overflow-hidden">
                                <div className="bg-amber-50 dark:bg-white/5 p-6 border-b border-amber-100 dark:border-white/10 flex items-center gap-4">
                                    <span className="material-symbols-outlined text-amber-500 text-3xl">lock</span>
                                    <div>
                                        <h3 className="font-bold text-slate-900 dark:text-white">Gestión Bloqueada</h3>
                                        <p className="text-sm text-slate-500">Debes completar el pago para gestionar tu plantilla.</p>
                                    </div>
                                </div>
                                <div className="p-12 text-center space-y-4">
                                    <span className="material-symbols-outlined text-6xl text-slate-200">payments</span>
                                    <p className="text-slate-500 max-w-sm mx-auto">Una vez que el administrador valide tu inscripción, podrás añadir jugadores y subir sus documentos.</p>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white dark:bg-surface-dark p-4 rounded-xl border border-slate-100 dark:border-white/5 shadow-sm">
                                    <div>
                                        <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                            <span className="material-symbols-outlined text-primary">groups</span> Plantilla
                                        </h3>
                                        <div className="flex items-center gap-3 mt-1">
                                            <div className="h-1.5 w-24 bg-slate-100 dark:bg-white/10 rounded-full overflow-hidden">
                                                <div 
                                                    className={`h-full transition-all duration-500 ${currentPlayerCount >= minPlayers ? 'bg-green-500' : 'bg-primary'}`} 
                                                    style={{ width: `${(currentPlayerCount / maxPlayers) * 100}%` }}
                                                ></div>
                                            </div>
                                            <span className="text-[10px] font-bold text-slate-400">{currentPlayerCount}/{maxPlayers}</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={downloadCsvTemplate} className="flex items-center gap-1 px-3 py-2 bg-slate-50 dark:bg-white/5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition-colors">
                                            <span className="material-symbols-outlined text-sm">download</span> Excel
                                        </button>
                                        <label className="flex items-center gap-1 px-3 py-2 bg-slate-50 dark:bg-white/5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 transition-colors cursor-pointer">
                                            <span className="material-symbols-outlined text-sm">upload_file</span> CSV
                                            <input type="file" name="csvImport" id="csv-import-roster" accept=".csv" className="hidden" onChange={handleCsvUpload} />
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {selectedTeam.players.map(player => (
                                        <div key={player.id} className="bg-white dark:bg-surface-dark rounded-xl p-4 border border-slate-100 dark:border-white/5 shadow-sm hover:shadow-md transition-all">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="size-12 rounded-full bg-slate-50 dark:bg-white/5 flex items-center justify-center border border-slate-100 dark:border-white/10 overflow-hidden">
                                                        {player.avatarUrl ? <img src={player.avatarUrl} className="w-full h-full object-cover" /> : <span className="material-symbols-outlined text-slate-300">person</span>}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-bold text-slate-900 dark:text-white leading-tight">{player.name}</h4>
                                                        <div className="flex items-center gap-2 mt-0.5">
                                                            <span className="text-[10px] font-black text-primary uppercase">#{player.number || '--'}</span>
                                                            <span className="text-[10px] text-slate-400 uppercase tracking-wider">{player.role === 'PLAYER' ? (player.position || 'Universal') : player.role}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    {/* DNI */}
                                                    <div className="flex flex-col items-center gap-1">
                                                        <button 
                                                            onClick={() => handleDocumentUpload(player.id, 'dni')}
                                                            className={`size-10 rounded-lg flex items-center justify-center border transition-all ${
                                                                player.dniStatus === 'APPROVED' ? 'bg-green-50 border-green-200 text-green-600' :
                                                                player.dniStatus === 'REJECTED' ? 'bg-red-50 border-red-200 text-red-600' :
                                                                player.dniStatus === 'PENDING' ? 'bg-amber-50 border-amber-200 text-amber-600' :
                                                                'bg-slate-50 border-slate-100 text-slate-400 hover:border-primary/30 hover:text-primary'
                                                            }`}
                                                        >
                                                            <span className="material-symbols-outlined text-xl">{player.dniStatus === 'APPROVED' ? 'verified' : 'badge'}</span>
                                                        </button>
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-[8px] font-black opacity-40">DNI</span>
                                                            {player.dniUrl && (
                                                                <a href={player.dniUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:scale-110 transition-transform">
                                                                    <span className="material-symbols-outlined text-[14px]">visibility</span>
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* INSURANCE — tras recarga, role debe venir del API; si falta, asumimos jugador */}
                                                    {(player.role ?? 'PLAYER') === 'PLAYER' && (
                                                        <div className="flex flex-col items-center gap-1">
                                                            <button 
                                                                onClick={() => handleDocumentUpload(player.id, 'insurance')}
                                                                className={`size-10 rounded-lg flex items-center justify-center border transition-all ${
                                                                    player.insuranceStatus === 'APPROVED' ? 'bg-green-50 border-green-200 text-green-600' :
                                                                    player.insuranceStatus === 'REJECTED' ? 'bg-red-50 border-red-200 text-red-600' :
                                                                    player.insuranceStatus === 'PENDING' ? 'bg-amber-50 border-amber-200 text-amber-600' :
                                                                    'bg-slate-50 border-slate-100 text-slate-400 hover:border-primary/30 hover:text-primary'
                                                                }`}
                                                            >
                                                                <span className="material-symbols-outlined text-xl">{player.insuranceStatus === 'APPROVED' ? 'check_circle' : 'health_and_safety'}</span>
                                                            </button>
                                                            <div className="flex items-center gap-1">
                                                                <span className="text-[8px] font-black opacity-40">SEGURO</span>
                                                                {player.insuranceUrl && (
                                                                    <a href={player.insuranceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:scale-110 transition-transform">
                                                                        <span className="material-symbols-outlined text-[14px]">visibility</span>
                                                                    </a>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}

                                                    <div className="w-px h-8 bg-slate-100 dark:bg-white/5 mx-1"></div>

                                                    <button onClick={() => handleDeletePlayer(player.id)} className="size-8 rounded-full flex items-center justify-center text-slate-200 hover:bg-red-50 hover:text-red-500 transition-all">
                                                        <span className="material-symbols-outlined text-xl">delete</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {canAddMore && (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className={`relative border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-all ${isAnalyzing ? 'border-primary bg-primary/5' : 'border-slate-200 hover:border-primary hover:bg-slate-50'}`}>
                                            <input type="file" name="dniScan" id="dni-scan-upload" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileUpload} />
                                            {isAnalyzing ? (
                                                <div className="animate-pulse flex flex-col items-center gap-2">
                                                    <span className="material-symbols-outlined text-3xl text-primary animate-spin">autorenew</span>
                                                    <span className="text-sm font-bold text-primary">Escaneando DNI...</span>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="material-symbols-outlined text-3xl text-slate-300 mb-2">add_a_photo</span>
                                                    <p className="text-xs font-bold text-slate-500">Escaneo IA</p>
                                                </>
                                            )}
                                        </div>
                                        <button onClick={() => setShowManualModal(true)} className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center hover:border-primary hover:bg-slate-50 transition-all">
                                            <span className="material-symbols-outlined text-3xl text-slate-300 mb-2">edit_note</span>
                                            <p className="text-xs font-bold text-slate-500">Entrada Manual</p>
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Sidebar Info */}
                    <div className="space-y-6">
                        <div className="bg-white dark:bg-surface-dark rounded-2xl p-6 shadow-xl border border-slate-100 dark:border-white/5">
                            <h4 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">info</span> Detalles del Equipo
                            </h4>
                            <div className="space-y-3">
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-400">División</span>
                                    <span className="font-bold text-slate-700 dark:text-slate-300">{selectedTeam.division}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-400">Ciudad</span>
                                    <span className="font-bold text-slate-700 dark:text-slate-300">{selectedTeam.city}</span>
                                </div>
                                <div className="flex justify-between text-xs pt-3 border-t border-slate-50 dark:border-white/5">
                                    <span className="text-slate-400">Estado Pago</span>
                                    <span className={`font-black uppercase ${
                                        selectedTeam.paymentStatus === 'PAID' ? 'text-green-500' : 
                                        selectedTeam.paymentStatus === 'WAITING_VALIDATION' ? 'text-amber-500' :
                                        selectedTeam.paymentStatus === 'EXPIRED' ? 'text-red-500' : 'text-slate-400'
                                    }`}>
                                        {selectedTeam.paymentStatus === 'PAID' ? 'PAGADO' : 
                                         selectedTeam.paymentStatus === 'WAITING_VALIDATION' ? 'A VALIDAR' :
                                         selectedTeam.paymentStatus === 'EXPIRED' ? 'EXPIRADO' : 'PENDIENTE'}
                                    </span>
                                </div>
                                {selectedTeam.paymentStatus === 'PENDING' && (
                                    <div className="pt-2">
                                        <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-2 flex items-center justify-between">
                                            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase">Reserva expira en:</span>
                                            <span className="font-mono font-black text-amber-600 dark:text-amber-400">{formatTime(timeLeft)}</span>
                                        </div>
                                    </div>
                                )}
                                {selectedTeam.paymentFeedback && (
                                    <div className="pt-2">
                                        <div className="bg-red-50 dark:bg-red-950/20 rounded-lg p-2 border border-red-100 dark:border-red-900/30">
                                            <p className="text-[10px] font-black text-red-700 dark:text-red-400 uppercase mb-1">Motivo Rechazo:</p>
                                            <p className="text-[11px] text-red-600 dark:text-red-300 italic">"{selectedTeam.paymentFeedback}"</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Manual Entry Modal */}
            {showManualModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
                    <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 border-b border-slate-100 dark:border-white/10 flex justify-between items-center">
                            <h3 className="font-bold text-slate-900 dark:text-white">Añadir Jugador Manual</h3>
                            <button onClick={() => setShowManualModal(false)} className="text-slate-400 hover:text-slate-600"><span className="material-symbols-outlined">close</span></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Nombre Completo</label>
                                <input 
                                    type="text" 
                                    value={manualPlayer.name}
                                    onChange={(e) => setManualPlayer({...manualPlayer, name: e.target.value})}
                                    className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-primary"
                                    placeholder="Ej: Juan Pérez"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Dorsal</label>
                                    <input 
                                        type="number" 
                                        value={manualPlayer.number}
                                        onChange={(e) => setManualPlayer({...manualPlayer, number: parseInt(e.target.value)})}
                                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-primary"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Posición</label>
                                    <select 
                                        value={manualPlayer.position}
                                        onChange={(e) => setManualPlayer({...manualPlayer, position: e.target.value})}
                                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-primary"
                                    >
                                        <option value="Universal">Universal</option>
                                        <option value="Portero">Portero</option>
                                        <option value="Extremo">Extremo</option>
                                        <option value="Lateral">Lateral</option>
                                        <option value="Central">Central</option>
                                        <option value="Pivote">Pivote</option>
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Rol</label>
                                <div className="flex gap-2">
                                    {['PLAYER', 'COACH', 'OFFICIAL'].map(r => (
                                        <button 
                                            key={r}
                                            onClick={() => setManualPlayer({...manualPlayer, role: r as any})}
                                            className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${manualPlayer.role === r ? 'bg-primary text-white shadow-md' : 'bg-slate-100 text-slate-400'}`}
                                        >
                                            {r}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <button onClick={handleManualAdd} className="w-full bg-primary text-white font-bold py-3 rounded-xl shadow-lg hover:shadow-primary/20 transition-all mt-4">Guardar Jugador</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};