import React, { useState } from 'react';
import { View, Team, CategoryLimits } from '../types';

interface RegistrationProps {
    onRegister: (team: Team, receiptFile: File) => void;
    teams: Team[];
    categoryLimits: CategoryLimits;
}

export const Registration: React.FC<RegistrationProps> = ({ onRegister, teams, categoryLimits }) => {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        name: '',
        city: '',
        division: 'Senior Masculino' as 'Infantil Femenino' | 'Infantil Masculino' | 'Cadete Femenino' | 'Cadete Masculino' | 'Juvenil Femenino' | 'Juvenil Masculino' | 'Senior Femenino' | 'Senior Masculino',
        fee: 120,
        managerName: '',
        managerEmail: '',
        password: ''
    });
    const [receiptFile, setReceiptFile] = useState<File | null>(null);

    // Calculate current counts
    const counts = {
        'Infantil Femenino': teams.filter(t => t.division === 'Infantil Femenino').length,
        'Infantil Masculino': teams.filter(t => t.division === 'Infantil Masculino').length,
        'Cadete Femenino': teams.filter(t => t.division === 'Cadete Femenino').length,
        'Cadete Masculino': teams.filter(t => t.division === 'Cadete Masculino').length,
        'Juvenil Femenino': teams.filter(t => t.division === 'Juvenil Femenino').length,
        'Juvenil Masculino': teams.filter(t => t.division === 'Juvenil Masculino').length,
        'Senior Femenino': teams.filter(t => t.division === 'Senior Femenino').length,
        'Senior Masculino': teams.filter(t => t.division === 'Senior Masculino').length,
    };

    const plans = [
        { name: 'Infantil Femenino', price: 70, limit: categoryLimits['Infantil Femenino'], current: counts['Infantil Femenino'], features: ['Arbitraje escolar'] },
        { name: 'Infantil Masculino', price: 70, limit: categoryLimits['Infantil Masculino'], current: counts['Infantil Masculino'], features: ['Arbitraje escolar'] },
        { name: 'Cadete Femenino', price: 90, limit: categoryLimits['Cadete Femenino'], current: counts['Cadete Femenino'], features: ['Árbitros federados'] },
        { name: 'Cadete Masculino', price: 90, limit: categoryLimits['Cadete Masculino'], current: counts['Cadete Masculino'], features: ['Árbitros federados'] },
        { name: 'Juvenil Femenino', price: 100, limit: categoryLimits['Juvenil Femenino'], current: counts['Juvenil Femenino'], features: ['Medallas'] },
        { name: 'Juvenil Masculino', price: 100, limit: categoryLimits['Juvenil Masculino'], current: counts['Juvenil Masculino'], features: ['Medallas'] },
        { name: 'Senior Femenino', price: 120, limit: categoryLimits['Senior Femenino'], current: counts['Senior Femenino'], features: ['Árbitros Pro'] },
        { name: 'Senior Masculino', price: 120, limit: categoryLimits['Senior Masculino'], current: counts['Senior Masculino'], features: ['Árbitros Pro'] },
    ];

    const handleRegister = () => {
        if (!formData.name || !formData.city || !formData.managerName || !formData.managerEmail || !formData.password) {
            alert("Por favor completa todos los campos, incluyendo los datos del responsable");
            return;
        }

        if (!receiptFile) {
            alert("Por favor adjunta el justificante de pago en el Paso 4");
            return;
        }

        const newTeam: Team = {
            id: `team-${Date.now()}`,
            name: formData.name,
            city: formData.city,
            division: formData.division,
            paymentStatus: 'PENDING',
            fee: formData.fee,
            players: [],
            managerName: formData.managerName,
            managerEmail: formData.managerEmail,
            password: formData.password
        };

        onRegister(newTeam, receiptFile);
    };

    return (
        <div className="min-h-screen bg-background-light dark:bg-background-dark py-12 px-4 flex justify-center animate-in fade-in">
            <div className="w-full max-w-2xl">
                <div className="bg-gradient-to-r from-background-dark to-slate-900 rounded-2xl p-8 mb-6 text-white relative overflow-hidden">
                    <div className="relative z-10">
                        <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-primary mb-4">
                            <span className="material-symbols-outlined text-sm">info</span> Inscripción 2026
                        </div>
                        <h2 className="text-2xl font-bold mb-2">Registra tu Equipo</h2>
                        <p className="text-slate-300 text-sm">Completa los datos. Si una categoría está llena, aparecerá bloqueada.</p>
                    </div>
                    <span className="material-symbols-outlined absolute -bottom-8 -right-8 text-[180px] text-white/5 rotate-12">sports_handball</span>
                </div>

                <div className="space-y-6">
                    {/* Step 1: Division */}
                    <div className="bg-white dark:bg-surface-dark p-6 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className={`size-8 rounded-full flex items-center justify-center font-bold ${step >= 1 ? 'bg-primary text-background-dark' : 'bg-slate-100 text-slate-500'}`}>1</div>
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Selecciona División</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {plans.map((plan) => {
                                const isFull = plan.current >= plan.limit;
                                return (
                                    <div
                                        key={plan.name}
                                        onClick={() => !isFull && setFormData({ ...formData, division: plan.name as any, fee: plan.price })}
                                        className={`relative border rounded-lg p-4 transition-all ${isFull
                                            ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-white/5 border-slate-200'
                                            : formData.division === plan.name
                                                ? 'border-primary bg-primary/5 ring-1 ring-primary cursor-pointer'
                                                : 'border-slate-200 dark:border-white/10 hover:border-primary/50 cursor-pointer'
                                            }`}
                                    >
                                        {isFull && (
                                            <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-black/50 backdrop-blur-[1px] rounded-lg">
                                                <span className="bg-red-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase -rotate-12 shadow-lg">Agotado</span>
                                            </div>
                                        )}
                                        <h4 className="font-bold text-slate-900 dark:text-white flex justify-between">
                                            {plan.name}
                                            <span className="text-[10px] bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">{plan.current}/{plan.limit}</span>
                                        </h4>
                                        <p className="text-2xl font-black text-slate-900 dark:text-white mt-2">${plan.price}</p>
                                        <ul className="space-y-1 mt-2">
                                            {plan.features.map(f => (
                                                <li key={f} className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1">
                                                    <span className="material-symbols-outlined text-primary text-xs">check</span> {f}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Step 2: Details */}
                    <div className="bg-white dark:bg-surface-dark p-6 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className={`size-8 rounded-full flex items-center justify-center font-bold ${formData.name ? 'bg-primary text-background-dark' : 'bg-slate-100 text-slate-500'}`}>2</div>
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Datos del Equipo</h3>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Nombre del Equipo</label>
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                    placeholder="ej. Los Guerreros de Arena"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Ciudad de Origen</label>
                                <input
                                    type="text"
                                    value={formData.city}
                                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                    placeholder="ej. Muskiz"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Step 3: Manager Credentials */}
                    <div className="bg-white dark:bg-surface-dark p-6 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className={`size-8 rounded-full flex items-center justify-center font-bold ${formData.managerEmail ? 'bg-primary text-background-dark' : 'bg-slate-100 text-slate-500'}`}>3</div>
                            <h3 className="font-bold text-lg text-slate-900 dark:text-white">Responsable del Equipo</h3>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Nombre del Responsable</label>
                                <input
                                    type="text"
                                    value={formData.managerName}
                                    onChange={(e) => setFormData({ ...formData, managerName: e.target.value })}
                                    className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                    placeholder="Nombre completo"
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Email (Usuario)</label>
                                    <input
                                        type="email"
                                        value={formData.managerEmail}
                                        onChange={(e) => setFormData({ ...formData, managerEmail: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                        placeholder="correo@ejemplo.com"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Contraseña Gesti&oacute;n</label>
                                    <input
                                        type="password"
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                        placeholder="********"
                                    />
                                </div>
                            </div>
                            <p className="text-[10px] text-slate-400">Usa estas credenciales para acceder al panel de gesti&oacute;n y añadir jugadores.</p>
                        </div>
                    </div>

                    {/* Step 4: Payment Instructions & Receipt Upload */}
                    <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-6 rounded-xl shadow-sm">
                        <div className="flex items-center gap-3 mb-6">
                            <div className={`size-8 rounded-full flex items-center justify-center font-bold ${receiptFile ? 'bg-primary text-background-dark' : 'bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300'}`}>4</div>
                            <h3 className="font-bold text-lg text-blue-900 dark:text-blue-100">Instrucciones de Pago ({formData.fee}€)</h3>
                        </div>

                        {/* Three payment options */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                            {/* Option 1: Transfer */}
                            <div className="bg-white dark:bg-surface-dark rounded-xl border border-blue-200 dark:border-blue-800/50 p-5 flex flex-col items-center text-center gap-3">
                                <div className="size-14 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-3xl text-blue-600 dark:text-blue-400">account_balance</span>
                                </div>
                                <h4 className="font-bold text-sm text-slate-900 dark:text-white">Transferencia Bancaria</h4>
                                <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 w-full">
                                    <p className="font-mono font-bold text-sm bg-blue-100 dark:bg-blue-900/40 px-3 py-1.5 rounded-md">ESXX XXXX XXXX XXXX XXXX</p>
                                    <p>Concepto: <strong>Torneo + {formData.name || 'Nombre Equipo'}</strong></p>
                                </div>
                            </div>

                            {/* Option 2: Card (Stripe) */}
                            <div className="bg-white dark:bg-surface-dark rounded-xl border border-blue-200 dark:border-blue-800/50 p-5 flex flex-col items-center text-center gap-3">
                                <div className="size-14 rounded-full bg-purple-100 dark:bg-purple-900/50 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-3xl text-purple-600 dark:text-purple-400">credit_card</span>
                                </div>
                                <h4 className="font-bold text-sm text-slate-900 dark:text-white">Pago Seguro con Tarjeta</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400">Visa, Mastercard, Amex</p>
                                <a
                                    href="https://buy.stripe.com/PON_AQUI_TU_LINK"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-auto w-full inline-flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold px-4 py-2.5 rounded-lg transition-colors"
                                >
                                    <span className="material-symbols-outlined text-base">lock</span>
                                    Pagar con Tarjeta
                                </a>
                            </div>

                            {/* Option 3: PayPal */}
                            <div className="bg-white dark:bg-surface-dark rounded-xl border border-blue-200 dark:border-blue-800/50 p-5 flex flex-col items-center text-center gap-3">
                                <div className="size-14 rounded-full bg-yellow-100 dark:bg-yellow-900/50 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-3xl text-yellow-600 dark:text-yellow-400">account_balance_wallet</span>
                                </div>
                                <h4 className="font-bold text-sm text-slate-900 dark:text-white">Pago rápido</h4>
                                <p className="text-xs text-slate-500 dark:text-slate-400">PayPal</p>
                                <a
                                    href="https://paypal.me/PON_AQUI_TU_USUARIO/50"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="mt-auto w-full inline-flex items-center justify-center gap-2 bg-[#0070ba] hover:bg-[#005ea6] text-white text-sm font-bold px-4 py-2.5 rounded-lg transition-colors"
                                >
                                    <span className="material-symbols-outlined text-base">send</span>
                                    Pagar con PayPal
                                </a>
                            </div>
                        </div>

                        {/* File upload */}
                        <div>
                            <label className="block text-xs font-bold uppercase text-blue-700 dark:text-blue-300 mb-2">Sube el justificante * (PDF del banco o Captura de pantalla del pago de Tarjeta/PayPal)</label>
                            <div className={`relative border-2 border-dashed rounded-lg p-4 transition-all text-center ${receiptFile
                                ? 'border-green-400 bg-green-50 dark:bg-green-950/20'
                                : 'border-blue-300 dark:border-blue-700 hover:border-blue-400'
                                }`}>
                                {receiptFile ? (
                                    <div className="flex items-center justify-center gap-2 text-green-700 dark:text-green-400">
                                        <span className="material-symbols-outlined">check_circle</span>
                                        <span className="text-sm font-medium">{receiptFile.name}</span>
                                        <button
                                            onClick={() => setReceiptFile(null)}
                                            className="ml-2 text-xs text-red-500 hover:text-red-700 underline"
                                        >
                                            Eliminar
                                        </button>
                                    </div>
                                ) : (
                                    <div>
                                        <span className="material-symbols-outlined text-3xl text-blue-400 dark:text-blue-500 mb-1">cloud_upload</span>
                                        <p className="text-sm text-blue-600 dark:text-blue-400">Sube el comprobante de pago</p>
                                        <p className="text-xs text-blue-400 dark:text-blue-500 mt-1">Formatos: imagen o PDF</p>
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept="image/*,.pdf"
                                    onChange={(e) => setReceiptFile(e.target.files?.[0] || null)}
                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={handleRegister}
                        className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-4 rounded-xl shadow-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                    >
                        <span>Completar Inscripción</span>
                        <span className="material-symbols-outlined">how_to_reg</span>
                    </button>
                </div>
            </div>
        </div>
    );
};