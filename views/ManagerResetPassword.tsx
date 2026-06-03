import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '../services/supabaseClient';
import { getEdgeFunctionErrorMessage } from '../utils/invokeEdgeFunction';
import {
    bootstrapManagerPasswordRecovery,
    urlLooksLikePasswordRecovery,
    type RecoveryBootstrapResult,
} from '../utils/managerPasswordRecovery';
import {
    clearManagerRecoveryPending,
    isManagerRecoveryPending,
    setManagerRecoveryPending,
} from '../utils/managerRecoveryPending';

type Step = 'loading' | 'form' | 'error' | 'success';

export const ManagerResetPassword: React.FC = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState<Step>(() =>
        urlLooksLikePasswordRecovery() || isManagerRecoveryPending() ? 'loading' : 'error'
    );
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;

        if (urlLooksLikePasswordRecovery()) {
            setManagerRecoveryPending();
        }

        const applyBootstrap = (result: RecoveryBootstrapResult) => {
            if (cancelled) return;
            if (result.status === 'ready') {
                setStep('form');
                setErrorMessage(null);
                return;
            }
            if (result.status === 'error') {
                setStep('error');
                setErrorMessage(result.message);
                return;
            }
            if (result.status === 'idle') {
                void supabase.auth.getSession().then(({ data: { session } }) => {
                    if (cancelled) return;
                    if (session) {
                        setStep('form');
                    } else {
                        setStep('error');
                        setErrorMessage(
                            'Enlace no válido o caducado. Vuelve al inicio de sesión y solicita un correo nuevo.'
                        );
                    }
                });
            }
        };

        setStep('loading');
        void bootstrapManagerPasswordRecovery(supabase).then(applyBootstrap);

        const { data: sub } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                setManagerRecoveryPending();
                setStep('form');
                setErrorMessage(null);
            }
        });

        return () => {
            cancelled = true;
            sub.subscription.unsubscribe();
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
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
            toast.error('El enlace ha caducado. Solicita uno nuevo.');
            setStep('error');
            setErrorMessage('Sesión no válida. Solicita un nuevo correo de recuperación.');
            return;
        }

        setIsSaving(true);
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) {
            setIsSaving(false);
            toast.error(error.message || 'No se pudo guardar la contraseña.');
            return;
        }

        try {
            const { data, error: fnError } = await supabase.functions.invoke(
                'notify-manager-password-changed',
                { body: {} }
            );
            if (fnError) {
                const msg = await getEdgeFunctionErrorMessage(fnError, data);
                console.warn('Confirmación por correo:', msg);
            }
        } catch (err) {
            console.warn('Confirmación por correo:', err);
        }

        clearManagerRecoveryPending();
        await supabase.auth.signOut();
        setIsSaving(false);
        setStep('success');
        setNewPassword('');
        setConfirmPassword('');
        window.history.replaceState({}, '', '/manager-reset-password');
    };

    if (step === 'success') {
        return (
            <div className="min-h-[80vh] flex flex-col items-center justify-center bg-background-light dark:bg-background-dark p-4">
                <div className="w-full max-w-md bg-white dark:bg-surface-dark p-8 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/5 text-center">
                    <span className="material-symbols-outlined text-5xl text-emerald-500">check_circle</span>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mt-4">
                        Contraseña actualizada
                    </h2>
                    <p className="text-slate-500 text-sm mt-3 leading-relaxed">
                        Tu nueva contraseña ya está guardada. Te hemos enviado un correo de confirmación.
                    </p>
                    <button
                        type="button"
                        onClick={() => navigate('/manager-login')}
                        className="mt-6 w-full bg-primary text-background-dark font-bold py-3 rounded-xl"
                    >
                        Ir al inicio de sesión
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-[80vh] flex flex-col items-center justify-center bg-background-light dark:bg-background-dark p-4">
            <div className="w-full max-w-md bg-white dark:bg-surface-dark p-8 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/5">
                <div className="text-center mb-6">
                    <span className="material-symbols-outlined text-4xl text-primary">lock_reset</span>
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white mt-3">
                        Restablecer contraseña
                    </h2>
                    <p className="text-slate-500 text-sm mt-2">
                        Elige una contraseña nueva para tu cuenta de responsable y pulsa guardar.
                    </p>
                </div>

                {step === 'loading' && (
                    <div className="flex flex-col items-center gap-3 py-8">
                        <span className="material-symbols-outlined animate-spin text-4xl text-primary">
                            progress_activity
                        </span>
                        <p className="text-slate-500 text-sm text-center">Activando enlace seguro…</p>
                    </div>
                )}

                {step === 'error' && errorMessage && (
                    <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-900/50 p-4">
                        <p className="text-red-800 dark:text-red-200 text-sm leading-relaxed">{errorMessage}</p>
                        <Link
                            to="/manager-login"
                            className="inline-block mt-4 text-sm font-bold text-primary hover:underline"
                        >
                            Volver al inicio de sesión
                        </Link>
                    </div>
                )}

                {step === 'form' && (
                    <form onSubmit={handleSubmit} className="space-y-4">
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
                            disabled={isSaving}
                            className="w-full bg-primary text-background-dark font-bold py-3 rounded-xl disabled:opacity-60 flex items-center justify-center gap-2"
                        >
                            {isSaving ? (
                                <>
                                    <span className="material-symbols-outlined animate-spin text-lg">
                                        progress_activity
                                    </span>
                                    Guardando…
                                </>
                            ) : (
                                <>
                                    <span className="material-symbols-outlined text-lg">done</span>
                                    Guardar contraseña
                                </>
                            )}
                        </button>
                        <p className="text-center text-xs text-slate-400">
                            Al guardar, se aplicará el cambio y recibirás un correo de confirmación.
                        </p>
                    </form>
                )}
            </div>
        </div>
    );
};
