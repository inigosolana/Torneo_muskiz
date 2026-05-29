import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export const RefereeLogin: React.FC = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            toast.error('Email o contraseña incorrectos.');
        } else if (data.user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', data.user.id)
                .single();

            if (profile?.role !== 'referee_coordinator') {
                await supabase.auth.signOut();
                toast.error('Acceso denegado: esta cuenta no es de coordinación de árbitros.');
            } else {
                toast.success('Bienvenido al panel de árbitros.');
                navigate('/arbitros');
            }
        }

        setIsLoading(false);
    };

    return (
        <div className="min-h-[80vh] flex flex-col items-center justify-center bg-background-light dark:bg-background-dark p-4">
            <div className="w-full max-w-md bg-white dark:bg-surface-dark p-8 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/5">
                <div className="text-center mb-8">
                    <div className="size-16 bg-slate-800 text-white rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="material-symbols-outlined text-4xl">sports</span>
                    </div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white">Coordinación de árbitros</h1>
                    <p className="text-sm text-slate-500 mt-2">Asigna árbitros a cada partido del calendario oficial.</p>
                </div>
                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Email</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Contraseña</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-3 rounded-xl disabled:opacity-50"
                    >
                        {isLoading ? 'Entrando…' : 'Entrar'}
                    </button>
                </form>
            </div>
        </div>
    );
};
