import React, { useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { getEdgeFunctionErrorMessage } from '../utils/invokeEdgeFunction';
import { isTeamRegistrationClosed } from '../constants/registrationDeadlines';
import {
    bootstrapManagerPasswordRecovery,
    urlLooksLikePasswordRecovery,
    type RecoveryBootstrapResult,
} from '../utils/managerPasswordRecovery';

export const ManagerLogin: React.FC = () => {
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [recoveryMode, setRecoveryMode] = useState(() => urlLooksLikePasswordRecovery());
    const [recoveryBootstrap, setRecoveryBootstrap] = useState<RecoveryBootstrapResult>(() =>
        urlLooksLikePasswordRecovery() ? { status: 'loading' } : { status: 'idle' }
    );
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isResetting, setIsResetting] = useState(false);

    useEffect(() => {
        let cancelled = false;

        if (urlLooksLikePasswordRecovery()) {
            setRecoveryMode(true);
            setRecoveryBootstrap({ status: 'loading' });
            void bootstrapManagerPasswordRecovery(supabase).then((result) => {
                if (cancelled) return;
                setRecoveryBootstrap(result);
                if (result.status === 'ready') setRecoveryMode(true);
                if (result.status === 'error') setRecoveryMode(true);
            });
        }

        const { data: sub } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                setRecoveryMode(true);
                setRecoveryBootstrap({ status: 'ready' });
            }
        });

        return () => {
            cancelled = true;
            sub.subscription.unsubscribe();
        };
    }, []);

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
            const { data, error } = await supabase.functions.invoke('request-manager-password-reset', {
                body: { email: email.trim().toLowerCase() },
            });

            if (error) {
                const msg = await getEdgeFunctionErrorMessage(error, data);
                toast.error(msg);
            } else if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
                toast.error((data as { error: string }).error);
            } else {
                toast.success(
                    'Si el correo está registrado, recibirás un enlace para restablecer la contraseña (revisa spam).'
                );
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Error al solicitar recuperación.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSetNewPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword.length < 6) {
            toast.error('La contraseña debe tener al menos 6 caracteres.');
            return;
        }
        if (newPassword !== confirmPassword) {
            toast.error('Las contraseñas no coinciden.');
            return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            toast.error('El enlace ha caducado o no es válido. Solicita uno nuevo con «¿Has olvidado tu contraseña?».');
            return;
        }

        setIsResetting(true);
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        setIsResetting(false);

        if (error) {
            toast.error(error.message || 'No se pudo guardar la contraseña. Solicita un nuevo enlace.');
            return;
        }

        toast.success('Contraseña actualizada. Ya puedes entrar con tu nueva contraseña.');
        setRecoveryMode(false);
        setRecoveryBootstrap({ status: 'idle' });
        setNewPassword('');
        setConfirmPassword('');
        window.history.replaceState({}, '', '/manager-login');
        await supabase.auth.signOut();
    };

    if (recoveryMode) {
        const recoveryLoading = recoveryBootstrap.status === 'loading';
        const recoveryError =
            recoveryBootstrap.status === 'error' ? recoveryBootstrap.message : null;

        return (
            <div className="min-h-[80vh] flex flex-col items-center justify-center bg-background-light dark:bg-background-dark p-4">
                <div className="w-full max-w-md bg-white dark:bg-surface-dark p-8 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/5">
                    <div className="text-center mb-6">
                        <span className="material-symbols-outlined text-4xl text-primary">lock_reset</span>
                        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mt-3">Nueva contraseña</h2>
                        <p className="text-slate-500 text-sm mt-2">
                            Elige una contraseña nueva para tu cuenta de responsable.
                        </p>
                    </div>

                    {recoveryLoading && (
                        <div className="flex flex-col items-center gap-3 py-8">
                            <span className="material-symbols-outlined animate-spin text-4xl text-primary">
                                progress_activity
                            </span>
                            <p className="text-slate-500 text-sm text-center">Activando enlace seguro…</p>
                        </div>
                    )}

                    {recoveryError && !recoveryLoading && (
                        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50 p-4">
                            <p className="text-red-800 dark:text-red-200 text-sm leading-relaxed">{recoveryError}</p>
                            <button
                                type="button"
                                className="mt-3 text-sm font-bold text-primary hover:underline"
                                onClick={() => {
                                    setRecoveryMode(false);
                                    setRecoveryBootstrap({ status: 'idle' });
                                    window.history.replaceState({}, '', '/manager-login');
                                }}
                            >
                                Volver al inicio de sesión
                            </button>
                        </div>
                    )}

                    {!recoveryLoading && !recoveryError && (
                    <form onSubmit={handleSetNewPassword} className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                                Nueva contraseña
                            </label>
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                                autoComplete="new-password"
                                required
                                minLength={6}
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                                Repetir contraseña
                            </label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
                                autoComplete="new-password"
                                required
                                minLength={6}
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={isResetting}
                            className="w-full bg-primary text-background-dark font-bold py-3 rounded-xl disabled:opacity-60"
                        >
                            {isResetting ? 'Guardando…' : 'Guardar contraseña'}
                        </button>
                    </form>
                    )}
                </div>
            </div>
        );
    }

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
