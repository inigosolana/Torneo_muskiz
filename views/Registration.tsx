import React, { useState, useEffect, useCallback } from 'react';
import { Team, CategoryLimits } from '../types';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

interface TeamEntry {
    id: string;
    name: string;
    city: string;
    division: 'Infantil Femenino' | 'Infantil Masculino' | 'Cadete Femenino' | 'Cadete Masculino' | 'Juvenil Femenino' | 'Juvenil Masculino' | 'Senior Femenino' | 'Senior Masculino';
    fee: number;
}

interface RegistrationProps {
    onRegister: (teams: Team[], receiptFile: File) => void;
    teams: Team[];
    categoryLimits: CategoryLimits;
}

const RESERVATION_MINUTES = 15;

export const Registration: React.FC<RegistrationProps> = ({ onRegister, teams, categoryLimits }) => {
    const navigate = useNavigate();
    const SESSION_KEY = 'reg_draft';

    const [dbCategories, setDbCategories] = useState<any[]>([]);

    useEffect(() => {
        const fetchCategories = async () => {
            const { data } = await supabase.from('categories').select('*').order('name');
            if (data) setDbCategories(data);
        };
        fetchCategories();
    }, []);

    // Restore from sessionStorage on mount (if within 15 min window)
    const loadDraft = () => {
        try {
            const raw = sessionStorage.getItem(SESSION_KEY);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch { return null; }
    };
    const draft = loadDraft();
    const draftValid = draft?.reservationStart &&
        (Date.now() - draft.reservationStart) < RESERVATION_MINUTES * 60 * 1000;

    // Manager info
    const [managerName, setManagerName] = useState(draftValid ? draft.managerName : '');
    const [managerSurnames, setManagerSurnames] = useState(draftValid ? draft.managerSurnames : '');
    const [managerEmail, setManagerEmail] = useState(draftValid ? draft.managerEmail : '');
    const [managerPhone, setManagerPhone] = useState(draftValid ? draft.managerPhone : '');
    const [password, setPassword] = useState('');

    // Cart of teams to register
    const [cart, setCart] = useState<TeamEntry[]>(draftValid ? draft.cart : []);

    // Form for adding a team to cart
    const [newTeamName, setNewTeamName] = useState(draftValid ? draft.newTeamName : '');
    const [newTeamCity, setNewTeamCity] = useState(draftValid ? draft.newTeamCity : '');
    const [selectedDivision, setSelectedDivision] = useState<string>(draftValid ? draft.selectedDivision : 'Senior Masculino');

    // Payment method
    const [selectedPayment, setSelectedPayment] = useState<'transfer' | null>('transfer');

    // Receipt (files can't be serialized — cleared on reload)
    const [receiptFile, setReceiptFile] = useState<File | null>(null);

    // Reservation timer
    const [reservationStart, setReservationStart] = useState<number | null>(draftValid ? draft.reservationStart : null);
    const [timeLeft, setTimeLeft] = useState<number>(
        draftValid
            ? Math.max(0, RESERVATION_MINUTES * 60 - Math.floor((Date.now() - draft.reservationStart) / 1000))
            : RESERVATION_MINUTES * 60
    );
    const [expired, setExpired] = useState(false);

    // Completion state
    const [isCompleted, setIsCompleted] = useState(false);
    const [generatedCredentials, setGeneratedCredentials] = useState<{ email: string; password: string } | null>(null);

    // Persist draft to sessionStorage whenever key fields change
    useEffect(() => {
        if (isCompleted || expired) {
            sessionStorage.removeItem(SESSION_KEY);
            return;
        }
        const data = {
            managerName, managerSurnames, managerEmail, managerPhone,
            cart, newTeamName, newTeamCity,
            selectedDivision, selectedPayment,
            reservationStart,
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    }, [managerName, managerSurnames, managerEmail, managerPhone, cart, newTeamName, newTeamCity,
        selectedDivision, selectedPayment, reservationStart, isCompleted, expired]);

    // Timer effect
    useEffect(() => {
        if (!reservationStart) return;
        const interval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - reservationStart) / 1000);
            const remaining = RESERVATION_MINUTES * 60 - elapsed;
            if (remaining <= 0) {
                setExpired(true);
                setCart([]);
                setReservationStart(null);
                setTimeLeft(0);
                sessionStorage.removeItem(SESSION_KEY);
                clearInterval(interval);
            } else {
                setTimeLeft(remaining);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [reservationStart]);


    // Calculate occupied spots (registered teams + cart reservations)
    const getCounts = useCallback(() => {
        const counts: Record<string, number> = {};
        dbCategories.forEach(cat => {
            counts[cat.name] = teams.filter(t => t.division === cat.name && t.paymentStatus !== 'EXPIRED').length + cart.filter(t => t.division === cat.name).length;
        });
        return counts;
    }, [teams, cart, dbCategories]);

    const counts = getCounts();

    const totalFee = cart.reduce((sum, t) => sum + t.fee, 0);

    const formatTime = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const handleAddToCart = () => {
        if (!newTeamName.trim() || !newTeamCity.trim()) {
            alert('Introduce el nombre y la ciudad del equipo.');
            return;
        }
        
        const category = dbCategories.find(c => c.name === selectedDivision);
        if (!category) return;

        if (counts[selectedDivision] >= category.max_teams) {
            alert('Esta categoría ya está llena.');
            return;
        }

        const entry: TeamEntry = {
            id: `cart-${Date.now()}`,
            name: newTeamName.trim(),
            city: newTeamCity.trim(),
            division: selectedDivision as any,
            fee: category.price,
        };
        setCart([...cart, entry]);
        setNewTeamName('');
        setNewTeamCity('');

        // Start reservation timer on first team added
        if (!reservationStart) {
            setReservationStart(Date.now());
        }
    };

    const removeFromCart = (id: string) => {
        setCart(cart.filter(t => t.id !== id));
    };

    const handleComplete = async () => {
        if (!managerName || !managerSurnames || !managerEmail || !managerPhone || !password) {
            alert('Por favor, completa los datos del responsable.');
            return;
        }
        if (cart.length === 0) {
            alert('Añade al menos un equipo al carrito.');
            return;
        }
        if (!selectedPayment) {
            alert('Selecciona un método de pago.');
            return;
        }
        if (selectedPayment === 'transfer' && !receiptFile) {
            alert('Debes adjuntar el justificante de la transferencia para reservar tu plaza.');
            return;
        }

        try {
            // 1. Sign up the manager in Supabase Auth
            const managerFullName = `${managerName} ${managerSurnames}`.trim();

            const { error: authError } = await supabase.auth.signUp({
                email: managerEmail,
                password: password,
                options: {
                    data: {
                        full_name: managerFullName
                    }
                }
            });

            if (authError) throw authError;

            // 2. Prepare teams without password
            const newTeams: Team[] = cart.map(entry => ({
                id: `team-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                name: entry.name,
                city: entry.city,
                division: entry.division,
                paymentStatus: 'WAITING_VALIDATION' as const,
                paymentMethod: 'TRANSFER' as const,
                paymentExpiresAt: Date.now() + RESERVATION_MINUTES * 60 * 1000,
                fee: entry.fee,
                players: [],
                managerName: managerFullName,
                managerEmail: managerEmail,
                managerPhone: managerPhone,
                status: 'pending' as const
            }));

            const finalReceipt = receiptFile ?? new File(['payment-receipt'], 'payment_receipt.pdf', { type: 'application/pdf' });
            await onRegister(newTeams, finalReceipt);

            sessionStorage.removeItem('reg_draft');
            setIsCompleted(true);
            setGeneratedCredentials({ email: managerEmail, password: password });
        } catch (error: any) {
            alert('Error en el registro: ' + error.message);
        }
    };

    // --- Completed state ---
    if (isCompleted && generatedCredentials) {
        return (
            <div className="min-h-screen bg-background-light dark:bg-background-dark py-12 px-4 flex justify-center animate-in fade-in">
                <div className="w-full max-w-lg">
                    <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-2xl p-8 text-center border border-slate-200 dark:border-white/5">
                        <div className="size-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-6">
                            <span className="material-symbols-outlined text-5xl text-green-600">check_circle</span>
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">¡Inscripción Recibida!</h2>
                        <p className="text-slate-500 text-sm mb-4">
                            Tu inscripción ha sido enviada correctamente y está pendiente de validación por el administrador.
                        </p>
                        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4 text-left mb-6">
                            <div className="flex items-start gap-2">
                                <span className="material-symbols-outlined text-amber-500 text-base mt-0.5">hourglass_top</span>
                                <p className="text-xs text-amber-800 dark:text-amber-200">
                                    <strong>Pendiente de validación.</strong> El administrador revisará tu justificante de transferencia y activará tu acceso en un máximo de 24h.
                                </p>
                            </div>
                        </div>

                        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-6 text-left space-y-3 mb-6">
                            <h3 className="font-bold text-blue-900 dark:text-blue-100 text-sm uppercase flex items-center gap-2">
                                <span className="material-symbols-outlined text-base">key</span>
                                Tus Credenciales de Responsable
                            </h3>
                            <div className="space-y-2">
                                <div>
                                    <span className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase">Email (usuario):</span>
                                    <p className="font-mono text-sm text-blue-800 dark:text-blue-200 bg-blue-100 dark:bg-blue-900/40 px-3 py-1.5 rounded-md mt-1">{generatedCredentials.email}</p>
                                </div>
                                <div>
                                    <span className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase">Contraseña:</span>
                                    <p className="font-mono text-sm text-blue-800 dark:text-blue-200 bg-blue-100 dark:bg-blue-900/40 px-3 py-1.5 rounded-md mt-1">{generatedCredentials.password}</p>
                                </div>
                            </div>
                            <p className="text-[10px] text-blue-500 mt-2">
                                ⚠️ Guarda estas credenciales. Las necesitarás para acceder al panel de gestión y añadir jugadores a tus equipos.
                            </p>
                        </div>

                        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-left mb-6">
                            <div className="flex items-start gap-2">
                                <span className="material-symbols-outlined text-amber-600 text-base mt-0.5">info</span>
                                <div className="text-xs text-amber-800 dark:text-amber-200">
                                    <p className="font-bold mb-1">Próximos pasos:</p>
                                    <ol className="list-decimal list-inside space-y-1">
                                        <li>Esperamos la validación de tu pago (máx. 24h)</li>
                                        <li>Accede al <strong>Panel de Gestión</strong> con tus credenciales</li>
                                        <li>Inscribe a los jugadores de cada equipo (mín. 6 — máx. 12 en Senior, 14 en el resto)</li>
                                    </ol>
                                </div>
                            </div>
                        </div>

                        <p className="text-xs text-slate-400 mb-4">Equipos registrados: <strong>{cart.length}</strong> — Total: <strong>{totalFee}€</strong></p>
                    </div>
                </div>
            </div>
        );
    }

    // --- Expired state ---
    if (expired) {
        return (
            <div className="min-h-screen bg-background-light dark:bg-background-dark py-12 px-4 flex justify-center animate-in fade-in">
                <div className="w-full max-w-lg">
                    <div className="bg-white dark:bg-surface-dark rounded-2xl shadow-2xl p-8 text-center border border-red-200 dark:border-red-800">
                        <div className="size-20 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-6">
                            <span className="material-symbols-outlined text-5xl text-red-500">timer_off</span>
                        </div>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Tiempo Agotado</h2>
                        <p className="text-slate-500 text-sm mb-6">
                            Han pasado los 15 minutos de reserva. Las plazas se han liberado. Por favor, inténtalo de nuevo.
                        </p>
                        <button
                            onClick={() => { setExpired(false); setTimeLeft(RESERVATION_MINUTES * 60); }}
                            className="bg-primary text-background-dark px-8 py-3 rounded-xl font-bold hover:opacity-90 transition-opacity"
                        >
                            Reintentar Inscripción
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    const isRegistrationClosed = Date.now() > new Date('2026-06-01T00:00:00').getTime();

    if (isRegistrationClosed) {
        return (
            <div className="min-h-screen bg-background-light dark:bg-background-dark py-12 px-4 flex justify-center items-center animate-in fade-in">
                <div className="w-full max-w-lg text-center bg-white dark:bg-surface-dark p-12 rounded-2xl shadow-2xl border border-red-200 dark:border-red-800">
                    <span className="material-symbols-outlined text-6xl text-red-500 mb-4">event_busy</span>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Inscripción de Equipos Cerrada</h2>
                    <p className="text-slate-500 text-sm mb-6">El plazo para inscribir nuevos equipos finalizó el 31 de mayo.</p>
                    <button onClick={() => navigate('/')} className="bg-primary text-background-dark px-8 py-3 rounded-xl font-bold">Volver al Inicio</button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark py-12 px-4 flex justify-center animate-in fade-in">
            <div className="w-full max-w-3xl">
                {/* Header */}
                <div className="bg-gradient-to-r from-background-dark to-slate-900 rounded-2xl p-8 mb-6 text-white relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-primary mb-4">
                            <span className="material-symbols-outlined text-sm">info</span> Inscripción 2026
                        </div>
                        <h2 className="text-2xl font-bold mb-2">Registra tus Equipos</h2>
                        <p className="text-slate-300 text-sm">Un responsable puede inscribir múltiples equipos en distintas categorías. Añade equipos al carrito, paga todo junto, y recibirás tus credenciales de acceso.</p>
                    </div>
                    <span className="material-symbols-outlined absolute -bottom-8 -right-8 text-[180px] text-white/5 rotate-12">sports_handball</span>

                    {/* Timer badge */}
                    {reservationStart && (
                        <div className={`absolute top-4 right-4 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold backdrop-blur-md ${timeLeft <= 120 ? 'bg-red-500/80 text-white animate-pulse' : 'bg-white/10 text-white/90'}`}>
                            <span className="material-symbols-outlined text-sm">timer</span>
                            Reserva: {formatTime(timeLeft)}
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    {/* Step 1: Manager Credentials */}
                    <div className="bg-white dark:bg-surface-dark p-6 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className={`size-8 rounded-full flex items-center justify-center font-bold ${managerEmail ? 'bg-primary text-background-dark' : 'bg-slate-100 text-slate-500'}`}>1</div>
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Datos del Responsable</h3>
                        </div>
                        <p className="text-xs text-slate-500 mb-4">Serás el responsable de todos los equipos que inscribas. Con estas credenciales podrás acceder al panel de gestión para añadir jugadores.</p>
                        <div className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Nombre del Responsable *</label>
                                    <input type="text" value={managerName} onChange={e => setManagerName(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                        placeholder="Nombre" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Apellidos del Responsable *</label>
                                    <input type="text" value={managerSurnames} onChange={e => setManagerSurnames(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                        placeholder="Apellidos" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Email (Usuario) *</label>
                                    <input type="email" value={managerEmail} onChange={e => setManagerEmail(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                        placeholder="correo@ejemplo.com" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Teléfono *</label>
                                    <input type="tel" value={managerPhone} onChange={e => setManagerPhone(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                        placeholder="+34 600 123 456" />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Contraseña *</label>
                                    <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                                        className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                        placeholder="********" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Step 2: Add Teams */}
                    <div className="bg-white dark:bg-surface-dark p-6 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className={`size-8 rounded-full flex items-center justify-center font-bold ${cart.length > 0 ? 'bg-primary text-background-dark' : 'bg-slate-100 text-slate-500'}`}>2</div>
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Añadir Equipos</h3>
                        </div>

                        {/* Division selector */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
                            {dbCategories.length === 0 ? (
                                <div className="col-span-full py-10 text-center">
                                    <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
                                    <p className="text-xs text-slate-400 mt-2">Cargando categorías...</p>
                                </div>
                            ) : (
                                dbCategories.map(cat => {
                                    const current = counts[cat.name] || 0;
                                    const isFull = current >= cat.max_teams;
                                    return (
                                        <div key={cat.id}
                                            onClick={() => !isFull && setSelectedDivision(cat.name)}
                                            className={`relative border rounded-lg p-3 transition-all text-center ${isFull
                                                ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-white/5 border-slate-200'
                                                : selectedDivision === cat.name
                                                    ? 'border-primary bg-primary/5 ring-1 ring-primary cursor-pointer'
                                                    : 'border-slate-200 dark:border-white/10 hover:border-primary/50 cursor-pointer'
                                                }`}>
                                            {isFull && (
                                                <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50 backdrop-blur-[1px] rounded-lg z-10">
                                                    <span className="bg-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full uppercase -rotate-12">Agotado</span>
                                                </div>
                                            )}
                                            <h4 className="font-bold text-xs text-slate-900 dark:text-white">{cat.name}</h4>
                                            <p className="text-lg font-black text-slate-900 dark:text-white mt-1">{cat.price}€</p>
                                            <span className="text-[9px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">{current}/{cat.max_teams}</span>
                                        </div>
                                    );
                                })
                            )}
                        </div>

                        {/* Team name & city for this entry */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Nombre del Equipo</label>
                                <input type="text" value={newTeamName} onChange={e => setNewTeamName(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                    placeholder="ej. Los Guerreros de Arena" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Ciudad</label>
                                <input type="text" value={newTeamCity} onChange={e => setNewTeamCity(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                    placeholder="ej. Muskiz" />
                            </div>
                        </div>

                        <button onClick={handleAddToCart}
                            className="w-full bg-slate-100 dark:bg-white/5 hover:bg-primary/10 text-slate-900 dark:text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2 border border-slate-200 dark:border-white/10">
                            <span className="material-symbols-outlined text-primary">add_circle</span>
                            Añadir Equipo al Carrito ({dbCategories.find(c => c.name === selectedDivision)?.price || 0}€ — {selectedDivision})
                        </button>
                    </div>

                    {/* Cart */}
                    {cart.length > 0 && (
                        <div className="bg-white dark:bg-surface-dark p-6 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                                    <span className="material-symbols-outlined text-primary">shopping_cart</span>
                                    Carrito ({cart.length} equipo{cart.length > 1 ? 's' : ''})
                                </h3>
                                <span className="text-2xl font-black text-slate-900 dark:text-white">{totalFee}€</span>
                            </div>
                            <div className="space-y-2">
                                {cart.map(entry => (
                                    <div key={entry.id} className="flex items-center justify-between bg-slate-50 dark:bg-white/5 rounded-lg px-4 py-3 border border-slate-100 dark:border-white/5">
                                        <div>
                                            <span className="font-bold text-sm text-slate-900 dark:text-white">{entry.name}</span>
                                            <span className="text-xs text-slate-500 ml-2">({entry.city})</span>
                                            <span className="block text-xs text-primary font-medium">{entry.division} — {entry.fee}€</span>
                                        </div>
                                        <button onClick={() => removeFromCart(entry.id)} className="text-red-400 hover:text-red-600">
                                            <span className="material-symbols-outlined text-sm">delete</span>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Step 3: Payment */}
                    {cart.length > 0 && (
                        <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-6 rounded-xl shadow-sm">
                            <div className="flex items-center gap-3 mb-6">
                                <div className={`size-8 rounded-full flex items-center justify-center font-bold ${
                                    (selectedPayment === 'transfer' && receiptFile)
                                        ? 'bg-primary text-background-dark'
                                        : 'bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300'
                                }`}>3</div>
                                <h3 className="font-bold text-lg text-blue-900 dark:text-blue-100">Método de Pago ({totalFee}€)</h3>
                            </div>

                            {/* Payment method selector */}
                            <div className="bg-white dark:bg-surface-dark rounded-xl border border-blue-200 dark:border-blue-800 p-5 flex flex-col items-center text-center gap-3 mb-6 shadow-sm">
                                <div className="size-14 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-3xl text-blue-600 dark:text-blue-400">account_balance</span>
                                </div>
                                <h4 className="font-bold text-sm text-slate-900 dark:text-white uppercase tracking-widest">Transferencia Bancaria</h4>
                                <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2 w-full">
                                    <p className="font-mono font-bold text-xs sm:text-sm bg-blue-50 dark:bg-black/20 border border-blue-100 dark:border-blue-800 px-3 py-2 rounded-md break-all shadow-inner text-blue-700 dark:text-blue-300">ES29 2095 0056 0120 5601 3105</p>
                                    <p className="font-medium">Concepto: <strong className="text-blue-600 dark:text-blue-400">Torneo + {cart[0]?.name || managerName} + {
                                        Array.from(new Set(cart.map(t => {
                                            const mapping: Record<string, string> = {
                                                'Infantil Masculino': 'INF M', 'Infantil Femenino': 'INF F',
                                                'Cadete Masculino': 'CAD M', 'Cadete Femenino': 'CAD F',
                                                'Juvenil Masculino': 'JUV M', 'Juvenil Femenino': 'JUV F',
                                                'Senior Masculino': 'SEN M', 'Senior Femenino': 'SEN F'
                                            };
                                            return mapping[t.division] || t.division;
                                        }))).join('/')
                                    }</strong></p>
                                    <p className="text-[10px] text-slate-400 italic">Debes adjuntar el justificante para que la reserva de plaza sea efectiva.</p>
                                </div>
                            </div>

                            {/* Transfer details + receipt upload */}
                            {selectedPayment === 'transfer' && (
                                <div className="animate-in fade-in duration-200">
                                    <label className="block text-xs font-bold uppercase text-blue-700 dark:text-blue-300 mb-2">
                                        Justificante de Transferencia *
                                    </label>
                                    <div className={`relative border-2 border-dashed rounded-lg p-4 transition-all text-center ${
                                        receiptFile
                                            ? 'border-green-400 bg-green-50 dark:bg-green-950/20'
                                            : 'border-blue-300 dark:border-blue-700 hover:border-blue-400'
                                    }`}>
                                        {receiptFile ? (
                                            <div className="flex items-center justify-center gap-2 text-green-700 dark:text-green-400">
                                                <span className="material-symbols-outlined">check_circle</span>
                                                <span className="text-sm font-medium">{receiptFile.name}</span>
                                                <button onClick={() => setReceiptFile(null)} className="ml-2 text-xs text-red-500 hover:text-red-700 underline">Eliminar</button>
                                            </div>
                                        ) : (
                                            <div>
                                                <span className="material-symbols-outlined text-3xl text-blue-400 dark:text-blue-500 mb-1">cloud_upload</span>
                                                <p className="text-sm text-blue-600 dark:text-blue-400">Sube el comprobante de transferencia</p>
                                                <p className="text-xs text-blue-400 dark:text-blue-500 mt-1">PNG, JPG o PDF (Máx. 5MB)</p>
                                            </div>
                                        )}
                                        <input type="file" accept="image/jpeg,image/png,application/pdf" onChange={e => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                if (file.size > 5 * 1024 * 1024) {
                                                    alert('El archivo es demasiado grande (máx. 5MB)');
                                                    return;
                                                }
                                                const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
                                                if (!allowedTypes.includes(file.type)) {
                                                    alert('Formato de archivo no permitido (solo JPG, PNG o PDF)');
                                                    return;
                                                }
                                                setReceiptFile(file);
                                            }
                                        }}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                                    </div>
                                </div>
                            )}



                            {/* Admin validation note */}
                            <div className="mt-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3 flex items-start gap-2">
                                <span className="material-symbols-outlined text-amber-500 text-base mt-0.5">info</span>
                                <p className="text-xs text-amber-800 dark:text-amber-200">
                                    Tu inscripción quedará <strong>pendiente de validación</strong> por el administrador. Recibirás acceso al panel de gestión una vez confirmado el pago (máx. 24h).
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Submit */}
                    {cart.length > 0 && (
                        <button onClick={handleComplete}
                            className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-4 rounded-xl shadow-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2">
                            <span>Completar Inscripción ({cart.length} equipo{cart.length > 1 ? 's' : ''} — {totalFee}€)</span>
                            <span className="material-symbols-outlined">how_to_reg</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};