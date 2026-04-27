import React, { useState } from 'react';
import { analyzePlayerId } from '../services/geminiService';
import { Team, Player } from '../types';
import { resizeAndCompressImage } from '../utils/imageProcessor';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { teamService } from '../services/teamService';

interface TeamManagerProps {
    teams: Team[];
    onUpdateTeam: (team: Team) => void;
}

export const TeamManager: React.FC<TeamManagerProps> = ({ teams, onUpdateTeam }) => {
    const navigate = useNavigate();
    const [selectedTeamId, setSelectedTeamId] = useState<string>(teams.length > 0 ? teams[0].id : '');
    const [isAnalyzing, setIsAnalyzing] = useState(false);

    // Payment States
    const [paymentMethod, setPaymentMethod] = useState<'CARD' | 'PAYPAL' | 'TRANSFER'>('CARD');
    const [paymentProcessing, setPaymentProcessing] = useState(false);

    // Manual Entry States
    const [showManualModal, setShowManualModal] = useState(false);
    const [manualForm, setManualForm] = useState<{
        name: string; surnames: string; dniNumber: string; birthDate: string;
        number: string; position: string; role: 'PLAYER' | 'COACH' | 'OFFICIAL';
        dniUrl: string; insuranceUrl: string;
    }>({
        name: '', surnames: '', dniNumber: '', birthDate: '',
        number: '',
        position: 'Universal',
        role: 'PLAYER' as 'PLAYER' | 'COACH' | 'OFFICIAL',
        dniUrl: '', insuranceUrl: ''
    });

    const selectedTeam = teams.find(t => t.id === selectedTeamId);

    // If no teams, redirect or show empty state
    if (!selectedTeam) {
        return (
            <div className="min-h-[80vh] flex flex-col items-center justify-center text-center px-4">
                <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">groups</span>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">No tienes equipos registrados</h2>
                <p className="text-slate-500 mb-6">Registra tu primer equipo para comenzar a gestionar la plantilla.</p>
                <button
                    onClick={() => navigate('/registration')}
                    className="bg-primary text-background-dark px-6 py-3 rounded-xl font-bold"
                >
                    Registrar Equipo
                </button>
            </div>
        );
    }

    // --- Actions ---

     const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            try {
                const compressedBlob = await resizeAndCompressImage(file);
                const reader = new FileReader();
                reader.onload = (ev) => {
                    onUpdateTeam({ ...selectedTeam, logoUrl: ev.target?.result as string });
                };
                reader.readAsDataURL(compressedBlob);
            } catch (error) {
                console.error("Error comprimiendo imagen:", error);
                toast.error("Hubo un error procesando la imagen. Asegúrate de que sea un formato válido.");
            }
        }
    };


    const handlePayment = (e: React.FormEvent) => {
        e.preventDefault();
        setPaymentProcessing(true);
        setTimeout(() => {
            setPaymentProcessing(false);
            onUpdateTeam({ ...selectedTeam, paymentStatus: 'PAID' });
            toast.success(`¡Pago de ${selectedTeam.fee}€ recibido correctamente! Ya puedes añadir jugadores.`);
        }, 2000);
    };

    // Player limits
    const isSenior = selectedTeam.division.startsWith('Senior');
    const maxPlayers = isSenior ? 12 : 14;
    const minPlayers = 6;
    const currentPlayerCount = selectedTeam.players.filter(p => p.role === 'PLAYER').length;
    const canAddPlayer = currentPlayerCount < maxPlayers;
    const hasCoach = selectedTeam.players.some(p => p.role === 'COACH');
    const hasOfficial = selectedTeam.players.some(p => p.role === 'OFFICIAL');
    const canAddStaff = !hasCoach || !hasOfficial;
    const isPlayerRegistrationClosed = Date.now() > new Date('2026-06-04T00:00:00').getTime();
    const canAddMore = (canAddPlayer || canAddStaff) && !isPlayerRegistrationClosed;

    const handleAddPlayer = async (newPlayer: Player) => {
        if (newPlayer.role === 'PLAYER' && !canAddPlayer) {
            toast.error(`Límite alcanzado: máximo ${maxPlayers} jugadores para ${selectedTeam.division}.`);
            return;
        }

        if (newPlayer.role === 'COACH') {
            const hasCoach = selectedTeam.players.some(p => p.role === 'COACH');
            if (hasCoach) {
                toast.error("Ya existe un entrenador registrado para este equipo.");
                return;
            }
        }

        if (newPlayer.role === 'OFFICIAL') {
            const hasOfficial = selectedTeam.players.some(p => p.role === 'OFFICIAL');
            if (hasOfficial) {
                toast.error("Ya existe un oficial registrado para este equipo.");
                return;
            }
        }

        // Optimistic update
        const updatedPlayers = [...selectedTeam.players, newPlayer];
        onUpdateTeam({
            ...selectedTeam,
            players: updatedPlayers
        });

        // Save to DB
        try {
            await teamService.addPlayer(selectedTeam.id, newPlayer);
        } catch (error: any) {
            toast.error("Error al guardar el jugador en la base de datos.");
            // Rollback if needed, but for now we just warn the user
            console.error(error);
        }
    };

    const handleManualSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!manualForm.name || !manualForm.surnames || !manualForm.number) return;

        const newPlayer: Player = {
            id: Date.now().toString(),
            name: manualForm.name,
            surnames: manualForm.surnames,
            dniNumber: manualForm.dniNumber,
            birthDate: manualForm.birthDate,
            number: parseInt(manualForm.number) || 0,
            position: manualForm.position,
            role: manualForm.role,
            verified: false,
            dniStatus: 'EMPTY',
            insuranceStatus: 'EMPTY'
        };
        handleAddPlayer(newPlayer);
        setManualForm({
            name: '',
            surnames: '',
            dniNumber: '',
            birthDate: '',
            number: '',
            position: 'Universal',
            role: 'PLAYER',
            dniUrl: '',
            insuranceUrl: ''
        });
        setShowManualModal(false);
    };

    // --- CSV Logic ---

    const downloadCsvTemplate = () => {
        const headers = "Nombre,Apellidos,DNI,FechaNacimiento,Numero,Posicion";
        const example = "Juan,Perez Garcia,12345678Z,1995-05-20,10,Portero";
        const csvContent = headers + "\n" + example;
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", "plantilla_jugadores_muskiz.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            const text = evt.target?.result as string;
            const lines = text.split('\n');
            const newPlayers: Player[] = [];

            toast.loading("Guardando jugadores del CSV...");

            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line) {
                    const [name, surnames, dni, dob, numStr, pos] = line.split(',');
                    if (name && numStr) {
                        const playerObj: Player = {
                            id: Date.now().toString() + i,
                            name: name.trim(),
                            surnames: surnames?.trim(),
                            dniNumber: dni?.trim(),
                            birthDate: dob?.trim() || undefined,
                            number: parseInt(numStr) || 0,
                            position: pos?.trim() || 'Universal',
                            role: 'PLAYER',
                            verified: false,
                            dniStatus: 'EMPTY',
                            insuranceStatus: 'EMPTY'
                        };

                        try {
                            await teamService.addPlayer(selectedTeam.id, playerObj);
                            newPlayers.push(playerObj);
                        } catch (err) {
                            console.error(`Error al guardar jugador ${name}:`, err);
                        }
                    }
                }
            }

            if (newPlayers.length > 0) {
                onUpdateTeam({
                    ...selectedTeam,
                    players: [...selectedTeam.players, ...newPlayers]
                });
                toast.dismiss();
                toast.success(`Se han importado y guardado ${newPlayers.length} jugadores correctamente.`);
            } else {
                toast.dismiss();
                toast.error("No se pudo guardar ningún jugador del CSV. Revisa el formato.");
            }
        };
        reader.readAsText(file);
    };

    // --- AI Logic ---

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsAnalyzing(true);
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64String = reader.result as string;
            const base64Data = base64String.split(',')[1];
            const data = await analyzePlayerId(base64Data, file.type);
            if (data.name) {
                const newPlayer: Player = {
                    id: Date.now().toString(),
                    name: data.name,
                    number: data.number || 0,
                    role: 'PLAYER',
                    verified: false,
                    dniStatus: 'EMPTY',
                    insuranceStatus: 'EMPTY'
                };
                handleAddPlayer(newPlayer);
            }
            setIsAnalyzing(false);
        };
        reader.readAsDataURL(file);
    };

    const handleDeletePlayer = async (playerId: string) => {
        if (!confirm('¿Estás seguro de que quieres eliminar a este jugador?')) return;
        
        try {
            await teamService.deletePlayer(playerId);
            const updatedPlayers = selectedTeam.players.filter(p => p.id !== playerId);
            onUpdateTeam({ ...selectedTeam, players: updatedPlayers });
            toast.success('Jugador eliminado correctamente');
        } catch (error) {
            toast.error('Error al eliminar el jugador');
        }
    };

    const handleDocumentUpload = (playerId: string, type: 'dni' | 'insurance') => {
        // Real upload simulation
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*,application/pdf';
        input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (file) {
                toast.loading(`Subiendo ${type.toUpperCase()}...`);
                // Simulate network delay
                setTimeout(async () => {
                    let updatedPlayerObj: any = null;
                    const updatedPlayers = selectedTeam.players.map(p => {
                        if (p.id === playerId) {
                            updatedPlayerObj = {
                                ...p,
                                [type === 'dni' ? 'dniStatus' : 'insuranceStatus']: 'PENDING' as const,
                                [type === 'dni' ? 'dniUrl' : 'insuranceUrl']: 'https://fake-supabase-storage.com/uploaded-file.jpg'
                            };
                            return updatedPlayerObj;
                        }
                        return p;
                    });
                    
                    if (updatedPlayerObj) {
                        await teamService.updatePlayer(updatedPlayerObj);
                    }
                    
                    onUpdateTeam({ ...selectedTeam, players: updatedPlayers });
                    toast.dismiss();
                    toast.success(`${type.toUpperCase()} subido correctamente.`);
                }, 2000);
            }
        };
        input.click();
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'APPROVED': return <span className="text-green-500 material-symbols-outlined">check_circle</span>;
            case 'REJECTED': return <span className="text-red-500 material-symbols-outlined">cancel</span>;
            case 'PENDING': return <span className="text-amber-500 material-symbols-outlined">hourglass_top</span>;
            default: return <span className="text-slate-300 material-symbols-outlined">upload_file</span>;
        }
    };

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark p-6 lg:p-12 animate-in fade-in">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* Payment Feedback Notice */}
                {selectedTeam.paymentStatus === 'PENDING' && selectedTeam.paymentFeedback && (
                    <div className="bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500 p-5 rounded-r-2xl animate-in slide-in-from-top-4 duration-500 shadow-md">
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center">
                                <span className="material-symbols-outlined text-red-500">error</span>
                            </div>
                            <div className="flex-1">
                                <h4 className="font-bold text-red-800 dark:text-red-200 text-sm">Validación de Pago Rechazada</h4>
                                <p className="text-red-700 dark:text-red-300 text-xs mt-1">
                                    <span className="font-black uppercase tracking-wider text-[10px] mr-1">Motivo:</span> 
                                    {selectedTeam.paymentFeedback}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Team Selector & Header */}
                <div className="mb-8 flex flex-col lg:flex-row justify-between items-start lg:items-end gap-6">
                    <div className="w-full lg:w-auto">
                        <div className="flex items-center gap-3 mb-2">
                            <select
                                value={selectedTeamId}
                                onChange={(e) => setSelectedTeamId(e.target.value)}
                                className="bg-white dark:bg-surface-dark border border-slate-200 dark:border-white/10 text-lg font-bold rounded-lg py-2 pl-3 pr-10 focus:ring-primary focus:border-primary"
                            >
                                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                            <button onClick={() => navigate('/registration')} className="text-primary text-sm font-bold hover:underline">+ Nuevo Equipo</button>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="h-2 w-48 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div className={`h-full bg-primary transition-all duration-500 ${selectedTeam.paymentStatus === 'PAID' ? 'w-full' : 'w-10'}`}></div>
                            </div>
                            <span className={`text-xs font-bold uppercase tracking-wider ${selectedTeam.paymentStatus === 'PAID' ? 'text-primary' : 'text-amber-500'}`}>
                                {selectedTeam.paymentStatus === 'PAID' ? 'Inscripción Activa' : 'Pago Requerido'}
                            </span>
                        </div>
                    </div>

                    {/* Team Logo Upload */}
                    <div className="relative group">
                        <label className="cursor-pointer block">
                            <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                            <div className="size-24 rounded-full bg-slate-200 dark:bg-white/10 border-4 border-white dark:border-surface-dark shadow-xl overflow-hidden relative">
                                {selectedTeam.logoUrl ? (
                                    <img src={selectedTeam.logoUrl} alt="Team Logo" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center text-slate-400">
                                        <span className="material-symbols-outlined text-4xl">add_a_photo</span>
                                    </div>
                                )}
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <span className="material-symbols-outlined text-white">edit</span>
                                </div>
                            </div>
                        </label>
                        <span className="text-xs font-bold text-slate-500 text-center block mt-2 uppercase">Logo Equipo</span>
                    </div>
                </div>

                {/* Main Content Area */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                    {/* Left Column: Player List or Payment Form */}
                    <div className="lg:col-span-2 space-y-6">
                        {selectedTeam.paymentStatus === 'PENDING' ? (
                            <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-xl overflow-hidden border border-slate-200 dark:border-white/5">
                                <div className="bg-slate-50 dark:bg-white/5 p-6 border-b border-slate-100 dark:border-white/10">
                                    <h3 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                        <span className="material-symbols-outlined text-amber-500">lock</span>
                                        {selectedTeam.paymentMethod ? 'Inscripción en Proceso de Validación' : 'Completa la Inscripción'}
                                    </h3>
                                    <p className="text-slate-500 text-sm mt-1">
                                        {selectedTeam.paymentMethod 
                                            ? 'La organización está revisando tu pago. Una vez validado, podrás gestionar tu plantilla.'
                                            : 'Debes realizar el pago para desbloquear la gestión de jugadores.'}
                                    </p>
                                </div>

                                <div className="p-8">
                                    {selectedTeam.paymentMethod ? (
                                        <div className="space-y-6 animate-in fade-in">
                                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6 text-center">
                                                <span className="material-symbols-outlined text-5xl text-amber-500 mb-4 animate-pulse">hourglass_empty</span>
                                                <h4 className="text-lg font-bold text-amber-900 dark:text-amber-100">Esperando Validación</h4>
                                                <p className="text-sm text-amber-700 dark:text-amber-300 mt-2 max-w-md mx-auto">
                                                    Hemos recibido tu solicitud de inscripción vía <strong>{selectedTeam.paymentMethod === 'TRANSFER' ? 'Transferencia Bancaria' : 'Tarjeta / Stripe'}</strong>. 
                                                    El administrador validará los datos en un máximo de 24 horas laborables.
                                                </p>
                                            </div>

                                            {selectedTeam.paymentMethod === 'TRANSFER' && (
                                                <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-6 border border-slate-200 dark:border-white/10">
                                                    <h5 className="font-bold text-slate-900 dark:text-white text-sm uppercase tracking-wider mb-4 flex items-center gap-2">
                                                        <span className="material-symbols-outlined text-primary">info</span>
                                                        Recordatorio de Transferencia
                                                    </h5>
                                                    <div className="space-y-3 text-sm">
                                                        <div className="flex justify-between">
                                                            <span className="text-slate-500">IBAN:</span>
                                                            <span className="font-mono font-bold text-slate-900 dark:text-white">ES29 2095 0056 0120 5601 3105</span>
                                                        </div>
                                                        <div className="flex justify-between">
                                                            <span className="text-slate-500">Concepto:</span>
                                                            <span className="font-bold text-primary">Torneo + {selectedTeam.name} + {selectedTeam.division.split(' ')[0].substring(0,3).toUpperCase()}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="flex justify-center pt-4">
                                                <button 
                                                    onClick={() => window.location.reload()}
                                                    className="text-primary font-bold flex items-center gap-2 hover:underline"
                                                >
                                                    <span className="material-symbols-outlined text-sm">refresh</span>
                                                    Actualizar Estado
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="flex gap-2 mb-8 bg-slate-100 dark:bg-white/5 p-1 rounded-lg">
                                                <button onClick={() => setPaymentMethod('CARD')} className={`flex-1 py-3 rounded-md text-sm font-bold transition-colors flex items-center justify-center gap-2 ${paymentMethod === 'CARD' ? 'bg-white dark:bg-surface-dark shadow text-primary' : 'text-slate-500'}`}>
                                                    <span className="material-symbols-outlined text-sm">credit_card</span> Tarjeta
                                                </button>
                                                <button onClick={() => setPaymentMethod('PAYPAL')} className={`flex-1 py-3 rounded-md text-sm font-bold transition-colors flex items-center justify-center gap-2 ${paymentMethod === 'PAYPAL' ? 'bg-white dark:bg-surface-dark shadow text-blue-500' : 'text-slate-500'}`}>
                                                    <span className="material-symbols-outlined text-sm">payments</span> PayPal
                                                </button>
                                                <button onClick={() => setPaymentMethod('TRANSFER')} className={`flex-1 py-3 rounded-md text-sm font-bold transition-colors flex items-center justify-center gap-2 ${paymentMethod === 'TRANSFER' ? 'bg-white dark:bg-surface-dark shadow text-purple-500' : 'text-slate-500'}`}>
                                                    <span className="material-symbols-outlined text-sm">account_balance</span> Transf.
                                                </button>
                                            </div>

                                            <form onSubmit={handlePayment} className="space-y-6">
                                                {paymentMethod === 'CARD' && (
                                                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                                                        <div>
                                                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Titular</label>
                                                            <input type="text" required className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3" placeholder="Nombre en tarjeta" />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Número de Tarjeta</label>
                                                            <input type="text" required className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3" placeholder="0000 0000 0000 0000" />
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            <div><label className="block text-xs font-bold uppercase text-slate-500 mb-1">Caducidad</label><input type="text" required className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3" placeholder="MM/YY" /></div>
                                                            <div><label className="block text-xs font-bold uppercase text-slate-500 mb-1">CVC</label><input type="text" required className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3" placeholder="123" /></div>
                                                        </div>
                                                    </div>
                                                )}

                                                {paymentMethod === 'PAYPAL' && (
                                                    <div className="text-center py-8 animate-in fade-in slide-in-from-right-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                                                        <p className="text-slate-500 text-sm mb-4">Serás redirigido a PayPal para completar el pago de forma segura.</p>
                                                        <button type="button" className="bg-[#0070ba] text-white font-bold py-3 px-8 rounded-full flex items-center justify-center gap-2 mx-auto hover:bg-[#005ea6] transition-colors">
                                                            Pagar con <span className="font-black italic">PayPal</span>
                                                        </button>
                                                    </div>
                                                )}

                                                {paymentMethod === 'TRANSFER' && (
                                                    <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
                                                        <div className="bg-slate-100 dark:bg-white/5 p-4 rounded-lg text-sm font-mono text-slate-700 dark:text-slate-300 break-all border border-slate-200 dark:border-white/10">
                                                            <p className="text-xs text-slate-500 font-sans mb-1 uppercase font-bold">IBAN para transferencia:</p>
                                                            ES29 2095 0056 0120 5601 3105
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Subir Justificante</label>
                                                            <input type="file" required className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20" />
                                                        </div>
                                                        <p className="text-xs text-amber-500 flex items-center gap-1"><span className="material-symbols-outlined text-sm">warning</span> La validación puede tardar 24h.</p>
                                                    </div>
                                                )}

                                                <div className="pt-6 border-t border-slate-100 dark:border-white/10 mt-6">
                                                    <div className="flex justify-between items-center mb-4">
                                                        <span className="text-sm font-bold text-slate-500">Total a pagar:</span>
                                                        <span className="text-3xl font-black text-slate-900 dark:text-white">{selectedTeam.fee}€</span>
                                                    </div>
                                                    <button
                                                        type="submit"
                                                        disabled={paymentProcessing}
                                                        className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-4 rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-opacity shadow-lg"
                                                    >
                                                        {paymentProcessing ? (
                                                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                                                        ) : (
                                                            <>
                                                                <span className="material-symbols-outlined">check_circle</span>
                                                                Confirmar Pago y Activar Equipo
                                                            </>
                                                        )}
                                                    </button>
                                                </div>
                                            </form>
                                        </>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="flex flex-wrap justify-between items-center">
                                    <div>
                                        <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                                            <span className="material-symbols-outlined">groups</span> Plantilla
                                        </h3>
                                        <div className="flex items-center gap-3 mt-2">
                                            <div className="h-2 w-32 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                                <div className={`h-full rounded-full transition-all duration-500 ${currentPlayerCount >= minPlayers ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${Math.min(100, (currentPlayerCount / maxPlayers) * 100)}%` }}></div>
                                            </div>
                                            <span className={`text-xs font-bold ${currentPlayerCount >= minPlayers ? 'text-green-500' : 'text-amber-500'}`}>
                                                {currentPlayerCount}/{maxPlayers} jugadores
                                            </span>
                                            {currentPlayerCount < minPlayers && (
                                                <span className="text-[10px] text-amber-500 flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-xs">warning</span>
                                                    Mín. {minPlayers}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={downloadCsvTemplate}
                                            className="text-slate-500 hover:text-primary text-xs font-bold flex items-center gap-1 px-3 py-2 bg-white dark:bg-surface-dark rounded-lg border border-slate-200 dark:border-white/10"
                                        >
                                            <span className="material-symbols-outlined text-sm">download</span> Plantilla Excel
                                        </button>
                                        <label className="cursor-pointer text-slate-500 hover:text-primary text-xs font-bold flex items-center gap-1 px-3 py-2 bg-white dark:bg-surface-dark rounded-lg border border-slate-200 dark:border-white/10">
                                            <span className="material-symbols-outlined text-sm">upload_file</span> Importar CSV
                                            <input type="file" accept=".csv" className="hidden" onChange={handleCsvUpload} />
                                        </label>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {selectedTeam.players.map(player => (
                                        <div key={player.id} className="bg-white dark:bg-surface-dark p-4 sm:p-5 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm relative group">
                                            <div className="flex flex-col sm:flex-row gap-4 items-center">
                                                <div className="flex items-center gap-4 flex-1 w-full">
                                                    <div className="size-12 sm:size-14 rounded-full bg-slate-100 flex-shrink-0 overflow-hidden border-2 border-slate-200 dark:border-slate-700">
                                                        {player.avatarUrl ? <img src={player.avatarUrl} alt={player.name} /> : <div className="h-full w-full flex items-center justify-center"><span className="material-symbols-outlined text-slate-400">person</span></div>}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <p className="font-bold text-slate-800 dark:text-white">{player.name}</p>
                                                            {player.role === 'COACH' && <span className="bg-amber-100 text-amber-700 text-[10px] px-2 py-0.5 rounded-full font-black uppercase">Entrenador</span>}
                                                            {player.role === 'OFFICIAL' && <span className="bg-purple-100 text-purple-700 text-[10px] px-2 py-0.5 rounded-full font-black uppercase">Oficial</span>}
                                                        </div>
                                                        <div className="flex gap-2 text-xs text-slate-500 font-mono mt-1">
                                                            {player.role === 'PLAYER' && <span className="bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">#{player.number}</span>}
                                                            <span className="bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded">{player.role === 'PLAYER' ? (player.position || 'Universal') : player.role}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex gap-4 w-full sm:w-auto justify-end items-center">
                                                     <div className="flex flex-col items-center gap-1">
                                                        <label className={`relative flex items-center justify-center size-10 rounded-lg border-2 cursor-pointer transition-colors ${player.dniStatus === 'APPROVED' ? 'border-green-500 bg-green-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-primary'}`}>
                                                            {getStatusBadge(player.dniStatus)}
                                                            <input type="file" className="hidden" onChange={() => handleDocumentUpload(player.id, 'dni')} />
                                                        </label>
                                                        <span className="text-[10px] font-bold text-slate-400 uppercase">DNI</span>
                                                    </div>
                                                    {player.role === 'PLAYER' && (
                                                        <div className="flex flex-col items-center gap-1">
                                                            <label className={`relative flex items-center justify-center size-10 rounded-lg border-2 cursor-pointer transition-colors ${player.insuranceStatus === 'APPROVED' ? 'border-green-500 bg-green-500/10' : 'border-slate-200 dark:border-slate-700 hover:border-primary'}`}>
                                                                {getStatusBadge(player.insuranceStatus)}
                                                                <input type="file" className="hidden" onChange={() => handleDocumentUpload(player.id, 'insurance')} />
                                                            </label>
                                                            <span className="text-[10px] font-bold text-slate-400 uppercase">Seguro</span>
                                                        </div>
                                                    )}
                                                    
                                                    <button 
                                                        onClick={() => handleDeletePlayer(player.id)}
                                                        className="size-10 flex items-center justify-center rounded-lg border border-red-100 dark:border-red-500/20 text-red-500 hover:bg-red-500 hover:text-white transition-all ml-2"
                                                        title="Eliminar jugador"
                                                    >
                                                        <span className="material-symbols-outlined text-xl">delete</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Add Player Actions Grid */}
                                {canAddMore ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                        {/* AI Scan Option */}
                                        <div className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center transition-colors cursor-pointer relative ${isAnalyzing ? 'border-primary bg-primary/5' : 'border-slate-300 dark:border-slate-700 hover:border-primary hover:bg-slate-50 dark:hover:bg-white/5'}`}>
                                            <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" accept="image/*" onChange={handleFileUpload} />
                                            {isAnalyzing ? (
                                                <div className="flex flex-col items-center">
                                                    <span className="material-symbols-outlined text-3xl text-primary animate-spin">autorenew</span>
                                                    <p className="mt-2 text-sm font-bold text-primary">Analizando ID...</p>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="size-10 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-2">
                                                        <span className="material-symbols-outlined text-xl">document_scanner</span>
                                                    </div>
                                                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">Escaneo IA</h4>
                                                    <p className="text-[10px] text-slate-500 max-w-[150px]">Sube foto del DNI para autocompletar.</p>
                                                </>
                                            )}
                                        </div>

                                        {/* Manual Entry Option */}
                                        <button
                                            onClick={() => setShowManualModal(true)}
                                            className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-6 flex flex-col items-center justify-center text-center transition-colors hover:border-primary hover:bg-slate-50 dark:hover:bg-white/5"
                                        >
                                            <div className="size-10 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300 flex items-center justify-center mb-2">
                                                <span className="material-symbols-outlined text-xl">edit_note</span>
                                            </div>
                                            <h4 className="font-bold text-sm text-slate-900 dark:text-white">Entrada Manual</h4>
                                            <p className="text-[10px] text-slate-500 max-w-[150px]">Escribe los datos jugador por jugador.</p>
                                        </button>
                                    </div>
                                ) : (
                                    <div className="mt-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6 text-center">
                                        <span className="material-symbols-outlined text-3xl text-amber-500 mb-2">group_off</span>
                                        <p className="text-amber-800 dark:text-amber-200 font-bold text-sm">Plantilla Completa</p>
                                        <p className="text-xs text-amber-600 dark:text-amber-300">Has alcanzado el máximo de {maxPlayers} jugadores para la categoría {selectedTeam.division}.</p>
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Info Sidebar */}
                    <div className="space-y-6">
                        <div className="bg-white dark:bg-surface-dark p-6 rounded-xl border border-slate-200 dark:border-white/5 shadow-lg">
                            <h4 className="font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-white/10 pb-3 mb-3">Detalles del Equipo</h4>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">División</span>
                                    <span className="font-medium text-slate-900 dark:text-white">{selectedTeam.division}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Ciudad</span>
                                    <span className="font-medium text-slate-900 dark:text-white">{selectedTeam.city}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Estado Pago</span>
                                    <span className={`font-bold ${selectedTeam.paymentStatus === 'PAID' ? 'text-green-500' : 'text-amber-500'}`}>
                                        {selectedTeam.paymentStatus === 'PAID' ? 'PAGADO' : 'PENDIENTE'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Manual Entry Modal */}
            {showManualModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-white dark:bg-surface-dark w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Añadir Jugador Manualmente</h3>
                            <button onClick={() => setShowManualModal(false)}><span className="material-symbols-outlined text-slate-400 hover:text-white">close</span></button>
                        </div>
                        <form onSubmit={handleManualSubmit} className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Nombre</label>
                                    <input
                                        type="text"
                                        required
                                        value={manualForm.name}
                                        onChange={e => setManualForm({ ...manualForm, name: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Apellidos</label>
                                    <input
                                        type="text"
                                        required
                                        value={manualForm.surnames}
                                        onChange={e => setManualForm({ ...manualForm, surnames: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">DNI / Pasaporte</label>
                                    <input
                                        type="text"
                                        required
                                        value={manualForm.dniNumber}
                                        onChange={e => setManualForm({ ...manualForm, dniNumber: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Fecha Nacimiento</label>
                                    <input
                                        type="date"
                                        required
                                        value={manualForm.birthDate}
                                        onChange={e => setManualForm({ ...manualForm, birthDate: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Rol / Función</label>
                                    <select
                                        value={manualForm.role}
                                        onChange={e => setManualForm({ ...manualForm, role: e.target.value as any })}
                                        className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2"
                                    >
                                        <option value="PLAYER">Jugador</option>
                                        <option value="COACH">Entrenador (Máx 1)</option>
                                        <option value="OFFICIAL">Oficial (Máx 1)</option>
                                    </select>
                                </div>
                                {manualForm.role === 'PLAYER' && (
                                    <div>
                                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Dorsal</label>
                                        <input
                                            type="number"
                                            required
                                            value={manualForm.number}
                                            onChange={e => setManualForm({ ...manualForm, number: e.target.value })}
                                            className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2"
                                        />
                                    </div>
                                )}
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Posición</label>
                                    <select
                                        value={manualForm.position}
                                        onChange={e => setManualForm({ ...manualForm, position: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2"
                                    >
                                        <option value="Universal">Universal</option>
                                        <option value="Portero">Portero</option>
                                        <option value="Extremo Izquierdo">Extremo Izquierdo</option>
                                        <option value="Extremo Derecho">Extremo Derecho</option>
                                        <option value="Lateral Izquierdo">Lateral Izquierdo</option>
                                        <option value="Lateral Derecho">Lateral Derecho</option>
                                        <option value="Central">Central</option>
                                        <option value="Pivote">Pivote</option>
                                        <option value="Especialista Defensivo">Especialista Defensivo</option>
                                    </select>
                                </div>
                            </div>


                            <button type="submit" className="w-full bg-primary text-background-dark font-bold py-3 rounded-xl hover:opacity-90 mt-4 shadow-lg shadow-primary/20">
                                Guardar Jugador
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};