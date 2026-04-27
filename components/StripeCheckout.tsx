import React, { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';

// Inicializar Stripe fuera del componente para evitar recrearlo en cada render
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

interface StripeCheckoutProps {
    items: string[];
    totalAmount: number;
    onSuccess: () => void;
}

/**
 * Formulario interno que usa los hooks de Stripe
 */
const CheckoutForm: React.FC<{ totalAmount: number; clientSecret: string; onSuccess: () => void }> = ({ totalAmount, clientSecret, onSuccess }) => {
    const stripe = useStripe();
    const elements = useElements();
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [name, setName] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!stripe || !elements) return;

        setProcessing(true);
        setError(null);

        const cardElement = elements.getElement(CardElement);
        if (!cardElement) return;

        const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
            payment_method: {
                card: cardElement,
                billing_details: { name },
            },
        });

        if (stripeError) {
            setError(stripeError.message ?? 'Error al procesar el pago.');
            setProcessing(false);
        } else if (paymentIntent?.status === 'succeeded') {
            onSuccess();
        } else {
            setError('El pago no se completó. Inténtalo de nuevo.');
            setProcessing(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="w-full space-y-4 mt-2">
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-700 rounded-lg px-3 py-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-green-600 text-sm">verified_user</span>
                <p className="text-xs text-green-700 dark:text-green-300">
                    <strong>Pago seguro.</strong> Procesado por Stripe. No almacenamos tus datos bancarios.
                </p>
            </div>

            <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Titular de la Tarjeta</label>
                <input
                    type="text"
                    required
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Nombre completo"
                    className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5 text-sm focus:border-purple-500 focus:ring-1 focus:ring-purple-400 outline-none"
                />
            </div>

            <div>
                <label className="block text-xs font-bold uppercase text-slate-500 mb-1">Datos de la Tarjeta</label>
                <div className="w-full bg-slate-50 dark:bg-background-dark border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-400">
                    <CardElement
                        options={{
                            style: {
                                base: {
                                    fontSize: '14px',
                                    color: '#424770',
                                    '::placeholder': { color: '#aab7c4' },
                                    fontFamily: 'Inter, sans-serif',
                                },
                                invalid: { color: '#9e2146' },
                            },
                        }}
                    />
                </div>
            </div>

            {error && (
                <p className="text-red-500 text-xs font-bold flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">error</span>{error}
                </p>
            )}

            <button
                type="submit"
                disabled={processing || !stripe}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-bold py-3 rounded-lg transition-colors flex justify-center items-center gap-2 shadow-lg"
            >
                {processing ? (
                    <>
                        <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                        Procesando...
                    </>
                ) : (
                    <>
                        <span className="material-symbols-outlined text-sm">lock</span>
                        Pagar {totalAmount}€ con seguridad
                    </>
                )}
            </button>
        </form>
    );
};

/**
 * Componente principal que envuelve el formulario en el Provider de Elements
 */
export const StripeCheckout: React.FC<StripeCheckoutProps> = ({ items, totalAmount, onSuccess }) => {
    const [clientSecret, setClientSecret] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const createIntent = async () => {
            setLoading(true);
            setError(null);
            
            try {
                const { data, error: fnError } = await supabase.functions.invoke('create-payment-intent', {
                    body: { items }
                });

                if (fnError || !data?.clientSecret) {
                    throw new Error(fnError?.message || 'No se pudo obtener el secreto de pago.');
                }
                setClientSecret(data.clientSecret);
            } catch (err: any) {
                console.error('Error inicializando pago:', err);
                setError('Error al conectar con la pasarela de pago.');
            } finally {
                setLoading(false);
            }
        };

        createIntent();
    }, [JSON.stringify(items)]);

    if (loading) {
        return (
            <div className="w-full flex flex-col justify-center items-center py-10 gap-3 text-slate-500">
                <div className="size-8 border-4 border-slate-200 border-t-purple-600 rounded-full animate-spin"></div>
                <span className="text-sm font-medium">Preparando pago seguro con Stripe...</span>
            </div>
        );
    }

    if (error || !clientSecret) {
        return (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-center">
                <span className="material-symbols-outlined text-red-500 mb-2 text-3xl">error</span>
                <p className="text-sm text-red-700 dark:text-red-300 font-medium">{error || 'Error al iniciar el pago'}</p>
                <button 
                   onClick={() => window.location.reload()}
                   className="mt-3 text-xs bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-200 px-3 py-1.5 rounded-full hover:bg-red-200 transition-colors"
                >
                    Reintentar
                </button>
            </div>
        );
    }

    return (
        <Elements stripe={stripePromise} options={{ clientSecret }}>
            <CheckoutForm totalAmount={totalAmount} clientSecret={clientSecret} onSuccess={onSuccess} />
        </Elements>
    );
};
