import React, { useState } from 'react';

interface StripeCheckoutProps {
    amount: number;
    onSuccess: () => void;
}

// Mock Stripe checkout for test/demo mode.
// In production, integrate with a real Stripe backend (PaymentIntent + confirmCardPayment).
export const StripeCheckout: React.FC<StripeCheckoutProps> = ({ amount, onSuccess }) => {
    const [cardNumber, setCardNumber] = useState('4242 4242 4242 4242');
    const [expiry, setExpiry] = useState('12/28');
    const [cvc, setCvc] = useState('123');
    const [name, setName] = useState('');
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const formatCard = (val: string) => {
        const digits = val.replace(/\D/g, '').slice(0, 16);
        return digits.replace(/(.{4})/g, '$1 ').trim();
    };

    const formatExpiry = (val: string) => {
        const digits = val.replace(/\D/g, '').slice(0, 4);
        if (digits.length >= 3) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
        return digits;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // Basic validation
        const rawCard = cardNumber.replace(/\s/g, '');
        if (rawCard.length < 16) { setError('Número de tarjeta incompleto.'); return; }
        if (!expiry.includes('/') || expiry.length < 5) { setError('Fecha de vencimiento inválida.'); return; }
        if (cvc.length < 3) { setError('CVC inválido.'); return; }
        if (!name.trim()) { setError('Introduce el nombre del titular.'); return; }

        setProcessing(true);
        // Simulate processing delay
        setTimeout(() => {
            setProcessing(false);
            onSuccess();
        }, 1500);
    };

    return (
        <form onSubmit={handleSubmit} className="w-full space-y-3 mt-2">
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-500 text-sm">science</span>
                <p className="text-xs text-amber-700 dark:text-amber-300">
                    <strong>Modo prueba.</strong> Usa la tarjeta <span className="font-mono font-bold">4242 4242 4242 4242</span>
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
                disabled={processing}
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
