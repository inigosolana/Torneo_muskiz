import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';

interface StripeCheckoutProps {
    amount: number;
    onSuccess: () => void;
}

/**
 * Checkout real con Stripe:
 * 1. Al montar, llama a la Edge Function `create-payment-intent` para obtener el clientSecret.
 * 2. Al hacer submit usa stripe.confirmCardPayment(clientSecret, ...) en lugar de simular.
 *
 * NOTA: Requiere que @stripe/stripe-js esté cargado y VITE_STRIPE_PUBLIC_KEY configurado.
 */
export const StripeCheckout: React.FC<StripeCheckoutProps> = ({ amount, onSuccess }) => {
    const [cardNumber, setCardNumber] = useState('');
    const [expiry, setExpiry] = useState('');
    const [cvc, setCvc] = useState('');
    const [name, setName] = useState('');
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [loadingIntent, setLoadingIntent] = useState(true);

    // Step 1: Request a PaymentIntent from the Edge Function on mount
    useEffect(() => {
        const createIntent = async () => {
            setLoadingIntent(true);
            const { data, error: fnError } = await supabase.functions.invoke('create-payment-intent', {
                body: { amount: Math.round(amount * 100) } // Stripe expects cents
            });

            if (fnError || !data?.clientSecret) {
                setError('No se pudo inicializar el pago. Inténtalo de nuevo.');
                console.error('PaymentIntent error:', fnError);
            } else {
                setClientSecret(data.clientSecret);
            }
            setLoadingIntent(false);
        };

        createIntent();
    }, [amount]);

    const formatCard = (val: string) => {
        const digits = val.replace(/\D/g, '').slice(0, 16);
        return digits.replace(/(.{4})/g, '$1 ').trim();
    };

    const formatExpiry = (val: string) => {
        const digits = val.replace(/\D/g, '').slice(0, 4);
        if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
        return digits;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Basic validation
        const rawCard = cardNumber.replace(/\s/g, '');
        if (rawCard.length < 16) { setError('Número de tarjeta incompleto.'); return; }
        if (!expiry.includes('/') || expiry.length < 5) { setError('Fecha de vencimiento inválida.'); return; }
        if (cvc.length < 3) { setError('CVC inválido.'); return; }
        if (!name.trim()) { setError('Introduce el nombre del titular.'); return; }
        if (!clientSecret) { setError('Aún se está inicializando el pago. Espera un momento.'); return; }

        setProcessing(true);

        try {
            // Step 2: Confirm payment via Stripe.js
            const { loadStripe } = await import('@stripe/stripe-js');
            const stripePublicKey = import.meta.env.VITE_STRIPE_PUBLIC_KEY;
            const stripe = await loadStripe(stripePublicKey);

            if (!stripe) throw new Error('No se pudo cargar Stripe.');

            const [expMonth, expYear] = expiry.split('/');

            const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
                payment_method: {
                    card: {
                        number: rawCard,
                        exp_month: parseInt(expMonth),
                        exp_year: parseInt(`20${expYear}`),
                        cvc,
                    },
                    billing_details: { name },
                },
            });

            if (stripeError) {
                setError(stripeError.message ?? 'Error al procesar el pago.');
            } else if (paymentIntent?.status === 'succeeded') {
                onSuccess();
            } else {
                setError('El pago no se completó. Inténtalo de nuevo.');
            }
        } catch (err: any) {
            setError(err.message ?? 'Error inesperado.');
            console.error('Stripe error:', err);
        }

        setProcessing(false);
    };

    if (loadingIntent) {
        return (
            <div className="w-full flex justify-center items-center py-8 gap-2 text-slate-500">
                <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                <span className="text-sm">Inicializando pago seguro...</span>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="w-full space-y-3 mt-2">
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-700 rounded-lg px-3 py-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-green-600 text-sm">verified_user</span>
                <p className="text-xs text-green-700 dark:text-green-300">
                    <strong>Pago seguro.</strong> Procesado con Stripe. Tus datos no se almacenan en nuestros servidores.
                </p>
            </div>

            {/* Card number */}
            <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Número de Tarjeta</label>
                <input
                    type="text"
                    value={cardNumber}
                    onChange={e => setCardNumber(formatCard(e.target.value))}
                    placeholder="1234 5678 9012 3456"
                    maxLength={19}
                    className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm font-mono focus:border-purple-500 focus:ring-1 focus:ring-purple-400 outline-none"
                />
            </div>

            <div className="grid grid-cols-2 gap-3">
                {/* Expiry */}
                <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Vencimiento</label>
                    <input
                        type="text"
                        value={expiry}
                        onChange={e => setExpiry(formatExpiry(e.target.value))}
                        placeholder="MM/AA"
                        maxLength={5}
                        className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm font-mono focus:border-purple-500 focus:ring-1 focus:ring-purple-400 outline-none"
                    />
                </div>
                {/* CVC */}
                <div>
                    <label className="block text-xs font-bold uppercase text-slate-500 mb-1">CVC</label>
                    <input
                        type="text"
                        value={cvc}
                        onChange={e => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder="123"
                        maxLength={4}
                        className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm font-mono focus:border-purple-500 focus:ring-1 focus:ring-purple-400 outline-none"
                    />
                </div>
            </div>

            {/* Name */}
            <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Titular</label>
                <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Nombre en la tarjeta"
                    className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-400 outline-none"
                />
            </div>

            {error && (
                <p className="text-red-500 text-xs font-bold flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">error</span>{error}
                </p>
            )}

            <button
                type="submit"
                disabled={processing || loadingIntent}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-bold py-3 rounded-lg transition-colors flex justify-center items-center gap-2"
            >
                {processing ? (
                    <>
                        <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                        Procesando...
                    </>
                ) : (
                    <>
                        <span className="material-symbols-outlined text-sm">lock</span>
                        Pagar {amount}€ Seguro
                    </>
                )}
            </button>
        </form>
    );
};
