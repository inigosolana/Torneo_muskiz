import React, { useState } from 'react';
import { View, Team, CategoryLimits } from '../types';

interface RegistrationProps {
    onRegister: (team: Team) => void;
    teams: Team[];
    categoryLimits: CategoryLimits;
}

export const Registration: React.FC<RegistrationProps> = ({ onRegister, teams, categoryLimits }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
      name: '',
      city: '',
      division: 'Amateur' as 'Elite' | 'Amateur' | 'Juvenil',
      fee: 150
  });

  // Calculate current counts
  const counts = {
      Elite: teams.filter(t => t.division === 'Elite').length,
      Amateur: teams.filter(t => t.division === 'Amateur').length,
      Juvenil: teams.filter(t => t.division === 'Juvenil').length,
  };

  const plans = [
    { name: 'Élite', price: 250, limit: categoryLimits.Elite, current: counts.Elite, features: ['Árbitros Pro', 'Premios en metálico'] },
    { name: 'Amateur', price: 150, limit: categoryLimits.Amateur, current: counts.Amateur, features: ['Árbitros Rec', 'Bolsa regalo'] },
    { name: 'Juvenil', price: 100, limit: categoryLimits.Juvenil, current: counts.Juvenil, features: ['Medallas', 'Desarrollo'] },
  ];

  const handleRegister = () => {
      if (!formData.name || !formData.city) {
          alert("Por favor completa todos los campos");
          return;
      }

      const newTeam: Team = {
          id: `team-${Date.now()}`,
          name: formData.name,
          city: formData.city,
          division: formData.division,
          paymentStatus: 'PENDING',
          fee: formData.fee,
          players: []
      };

      onRegister(newTeam);
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
                     <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                         {plans.map((plan) => {
                             const isFull = plan.current >= plan.limit;
                             return (
                                <div 
                                    key={plan.name} 
                                    onClick={() => !isFull && setFormData({...formData, division: plan.name as any, fee: plan.price})}
                                    className={`relative border rounded-lg p-4 transition-all ${
                                        isFull 
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
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none" 
                                placeholder="ej. Los Guerreros de Arena" 
                             />
                         </div>
                         <div>
                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Ciudad de Origen</label>
                            <input 
                                type="text" 
                                value={formData.city}
                                onChange={(e) => setFormData({...formData, city: e.target.value})}
                                className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none" 
                                placeholder="ej. Muskiz" 
                            />
                         </div>
                     </div>
                 </div>

                 <button 
                    onClick={handleRegister}
                    className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-4 rounded-xl shadow-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                 >
                     <span>Registrar y Continuar al Pago</span>
                     <span className="material-symbols-outlined">payments</span>
                 </button>
             </div>
        </div>
    </div>
  );
};