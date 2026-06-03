import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { toast } from 'sonner';
import { useNavigate, useLocation } from 'react-router-dom';
import { isTeamRegistrationClosed } from '../constants/registrationDeadlines';
import { requestManagerPasswordRecovery, urlLooksLikePasswordRecovery } from '../utils/managerPasswordRecovery';
import {
    isManagerRecoveryPending,
    MANAGER_PASSWORD_RESET_PATH,
} from '../utils/managerRecoveryPending';

export const ManagerLogin: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        if (urlLooksLikePasswordRecovery() || isManagerRecoveryPending()) {
            const dest = `${MANAGER_PASSWORD_RESET_PATH}${location.search}${location.hash}`;
            navigate(dest, { replace: true });
        }
    }, [navigate, location.search, location.hash]);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            toast.error('Email o contraseña incorrectos.');
            console.error('Auth error:', error.message);
        } else if (data.user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', data.user.id)
                .single();

            if (profile?.role !== 'manager') {
                await supabase.auth.signOut();
                toast.error('Acceso denegado: Esta cuenta es de Staff.');
            } else {
                const { count: approvedTeams } = await supabase
                    .from('teams')
                    .select('id', { count: 'exact', head: true })
                    .eq('manager_email', email)
                    .eq('status', 'approved');

                if (!approvedTeams || approvedTeams < 1) {
                    toast.info(
                        'Entras al panel de responsable. Aún no tienes equipos aprobados: puedes inscribir uno o esperar la validación.'
                    );
                } else {
                    toast.success('Acceso concedido. Bienvenido a tu panel de gestión.');
                }
                navigate('/team-manager');
            }
        }

        setIsLoading(false);
    };

    const handleForgotPassword = async () => {
        if (!email.trim()) {
            toast.error('Introduce tu email para restablecer la contraseña.');
            return;
        }

        setIsLoading(true);
        try {
            const result = await requestManagerPasswordRecovery(supabase, email);
            if (result.ok) {
                toast.success(
                    'Si el correo está registrado, recibirás un enlace para restablecer la contraseña. Revisa bandeja de entrada y spam (Yahoo/ymail suele filtrarlo).'
                );
            } else {
                toast.error(result.error);
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Error al solicitar recuperación.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-[80vh] flex flex-col items-center justify-center bg-background-light dark:bg-background-dark p-4">
            <div className="w-full max-w-md bg-white dark:bg-surface-dark p-8 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/5">
                <div className="text-center mb-8">
                    <div className="size-16 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="material-symbols-outlined text-4xl">management</span>
                    </div>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Panel de Responsables</h2>
                    <p className="text-slate-500 text-sm mt-2">
                        Gestiona tus equipos y sube la documentación de tus jugadores.
                    </p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-2">
                            Email del Responsable
                        </label>
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                mail
                            </span>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                placeholder="ejemplo@correo.com"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold uppercase text-slate-500 mb-2">Contraseña</label>
                        <div className="relative">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                                lock
                            </span>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-xl pl-10 pr-4 py-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                                placeholder="********"
                                required
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-4 rounded-xl shadow-lg hover:opacity-90 transition-opacity flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                        {isLoading ? (
                            <span className="material-symbols-outlined animate-spin">progress_activity</span>
                        ) : (
                            <>
                                <span className="material-symbols-outlined">login</span>
                                Entrar a mi Panel
                            </>
                        )}
                    </button>

                    <div className="flex flex-col gap-4 text-center pt-2">
                        <button
                            type="button"
                            onClick={handleForgotPassword}
                            disabled={isLoading}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs transition-colors disabled:opacity-50"
                        >
                            ¿Has olvidado tu contraseña?
                        </button>

                        <div className="space-y-1">
                            {isTeamRegistrationClosed() ? (
                                <p className="text-xs text-slate-400">
                                    Las inscripciones están cerradas. No es posible apuntar nuevos equipos.
                                </p>
                            ) : (
                                <>
                                    <p className="text-xs text-slate-400">¿Todavía no has inscrito a tu equipo?</p>
                                    <button
                                        type="button"
                                        onClick={() => navigate('/registration')}
                                        className="text-primary font-bold text-sm hover:underline"
                                    >
                                        Inscribir equipo ahora
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
};
