import React, { useRef, useState } from 'react';
import { Team, Player } from '../types';
import SignatureCanvas from 'react-signature-canvas';
import { useNavigate } from 'react-router-dom';
import { useTournamentData } from '../context/TournamentDataContext';
import { canAddSquadMember, countSquadPlayers, maxPlayersForDivision } from '../utils/squadLimits';
import { toast } from 'sonner';
import {
    isPastDeadline,
    PLAYER_LICENSE_CLOSE_AT,
    PLAYER_LICENSE_LAST_DAY,
} from '../constants/registrationDeadlines';

interface PlayerSelfRegistrationProps {
    onUpdateTeam: (team: Team) => void;
}

export const PlayerSelfRegistration: React.FC<PlayerSelfRegistrationProps> = ({ onUpdateTeam }) => {
    const { teams } = useTournamentData();
    const navigate = useNavigate();
    const params = new URLSearchParams(window.location.search);
    const teamId = params.get('teamId');

    const team = teams.find(t => t.id === teamId);

    const [form, setForm] = useState({
        name: '',
        surnames: '',
        dniNumber: '',
        birthDate: '',
        number: '',
        position: 'Universal',
        insuranceUrl: ''
    });
    const sigCanvas = useRef<SignatureCanvas>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);

    const isDeadlinePassed = isPastDeadline(PLAYER_LICENSE_CLOSE_AT);

    if (isDeadlinePassed) {
        return (
            <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
                <span className="material-symbols-outlined text-6xl text-red-500 mb-4">event_busy</span>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Plazo Finalizado</h2>
                <p className="text-slate-500 mb-6 text-center">El plazo para subir licencias y documentación finalizó el {PLAYER_LICENSE_LAST_DAY}.</p>
                <button onClick={() => navigate('/')} className="px-6 py-2 bg-primary text-background-dark font-bold rounded-lg">Volver al Inicio</button>
            </div>
        );
    }

    if (!team) {
        return (
            <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
                <span className="material-symbols-outlined text-6xl text-slate-300 mb-4">error</span>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Equipo no encontrado</h2>
                <p className="text-slate-500 mb-6">El enlace de invitación no es válido o ha caducado.</p>
                <button onClick={() => navigate('/')} className="px-6 py-2 bg-primary text-background-dark font-bold rounded-lg">Volver al Inicio</button>
            </div>
        );
    }

    const rosterLimit = team
        ? canAddSquadMember(team.players, team.division, 'PLAYER')
        : { ok: false as const, reason: 'Equipo no disponible' };
    const playerSlotsUsed = team ? countSquadPlayers(team.players) : 0;
    const playerSlotsMax = team ? maxPlayersForDivision(team.division) : 0;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!team) return;
        const slot = canAddSquadMember(team.players, team.division, 'PLAYER');
        if (!slot.ok) {
            toast.error(slot.reason ?? 'La plantilla de jugadores está completa');
            return;
        }
        setIsSubmitting(true);
        setTimeout(() => {
            const newPlayer: Player = {
                id: Date.now().toString(),
                teamId: team.id,
                name: `${form.name} ${form.surnames}`,
                surnames: form.surnames,
                dniNumber: form.dniNumber,
                birthDate: form.birthDate,
                number: parseInt(form.number),
                position: form.position,
                role: 'PLAYER',
                signatureUrl: sigCanvas.current?.isEmpty() ? undefined : sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png'),
                verified: false,
                insuranceUrl: form.insuranceUrl,
                dniStatus: form.dniNumber.trim() ? 'PENDING' : 'EMPTY',
                insuranceStatus: form.insuranceUrl ? 'PENDING' : 'EMPTY'
            };

            onUpdateTeam({
                ...team,
                players: [...team.players, newPlayer]
            });
            setIsSubmitting(false);
            setSuccess(true);
        }, 1500);
    };

    if (success) {
        return (
            <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
                <span className="material-symbols-outlined text-6xl text-green-500 mb-4">check_circle</span>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">¡Inscripción Completada!</h2>
                <p className="text-slate-500 mb-6">Ya formas parte del equipo <span className="font-bold text-primary">{team.name}</span>.</p>
                <button onClick={() => navigate('/')} className="px-6 py-2 border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-lg hover:bg-slate-50 dark:hover:bg-white/5">Ir al Inicio</button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark py-12 px-4 sm:px-6 lg:px-8 flex justify-center">
            <div className="max-w-xl w-full">
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white sm:text-4xl">
                        Únete a tu Equipo
                    </h2>
                    <p className="mt-4 text-lg text-slate-500 max-w-2xl mx-auto">
                        Estás a punto de inscribirte en <span className="font-bold text-primary">{team.name}</span>. Completa el siguiente formulario.
                    </p>
                    {!rosterLimit.ok && (
                        <p className="mt-3 text-sm text-amber-700 dark:text-amber-300 font-medium text-center">
                            {rosterLimit.reason}
                        </p>
                    )}
                    {rosterLimit.ok && (
                        <p className="mt-3 text-sm text-slate-500 text-center">
                            Plazas de jugador: {playerSlotsUsed}/{playerSlotsMax}
                        </p>
                    )}
                </div>

                <div className="bg-white dark:bg-surface-dark py-8 px-6 shadow-2xl rounded-2xl border border-slate-200 dark:border-white/5">
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Nombre</label>
                                <input type="text" required value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary focus:border-primary transition-shadow text-slate-900 dark:text-white" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Apellidos</label>
                                <input type="text" required value={form.surnames} onChange={e => setForm({ ...form, surnames: e.target.value })} className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary focus:border-primary transition-shadow text-slate-900 dark:text-white" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">DNI / Pasaporte</label>
                                <input type="text" required value={form.dniNumber} onChange={e => setForm({ ...form, dniNumber: e.target.value })} className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary focus:border-primary transition-shadow text-slate-900 dark:text-white" />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Fecha de Nacimiento</label>
                                <input type="date" required value={form.birthDate} onChange={e => setForm({ ...form, birthDate: e.target.value })} className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary focus:border-primary transition-shadow text-slate-900 dark:text-white" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Dorsal</label>
                                <input type="number" required value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary focus:border-primary transition-shadow text-slate-900 dark:text-white" />
                            </div>
                            <div className="sm:col-span-2">
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Posición</label>
                                <select value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary focus:border-primary transition-shadow text-slate-900 dark:text-white">
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

                        {/* Paso 6 (Firmas Electrónicas) */}
                        {/* Paso 7 (Documentación) */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div className="bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-xl p-4">
                                <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">DNI / Pasaporte</p>
                                <p className="text-xs text-slate-500">
                                    Se usará el número que has indicado en el formulario para la validación.
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Tarjeta Seguro / Ficha</label>
                                <div className="relative group border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-4 flex flex-col items-center justify-center text-center">
                                    <input type="file" required accept="image/*" onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) setForm({ ...form, insuranceUrl: 'https://fake.storage/insurance.jpg' });
                                    }} className="absolute inset-0 opacity-0 cursor-pointer" />
                                    <span className={`material-symbols-outlined text-3xl mb-1 ${form.insuranceUrl ? 'text-green-500' : 'text-slate-400'}`}>{form.insuranceUrl ? 'check_circle' : 'upload_file'}</span>
                                    <p className="text-[10px] text-slate-500">{form.insuranceUrl ? 'Archivo seleccionado' : 'Subir Seguro'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                            <div className="sm:col-span-3">
                                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">Firma Electrónica</label>
                                <div className="border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-background-dark overflow-hidden h-40 relative">
                                    <SignatureCanvas
                                        ref={sigCanvas}
                                        canvasProps={{ className: 'w-full h-full' }}
                                    />
                                    <button type="button" onClick={() => sigCanvas.current?.clear()} className="absolute top-2 right-2 text-xs bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-1 rounded">Limpiar</button>
                                </div>
                                <p className="text-xs text-slate-500 mt-2">Firmo haber leído y aceptado las normas de competición y consiento el uso de mis datos para la gestión deportiva.</p>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isSubmitting || !rosterLimit.ok}
                            className="w-full mt-8 bg-primary text-background-dark font-extrabold py-4 px-8 rounded-xl shadow-lg shadow-primary/30 hover:opacity-90 transition-all flex justify-center items-center gap-2 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? (
                                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            ) : (
                                <>Completar Inscripción <span className="material-symbols-outlined">how_to_reg</span></>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};
