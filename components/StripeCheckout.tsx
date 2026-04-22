import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  CardElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';

// Initialize Stripe outside of the component to avoid recreating the object on every render
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || '');

interface CheckoutFormProps {
  amount: number;
  onSuccess: () => void;
}

const CheckoutForm: React.FC<CheckoutFormProps> = ({ amount, onSuccess }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);
    setError(null);

    const cardElement = elements.getElement(CardElement);

    if (!cardElement) {
        setProcessing(false);
        return;
    }

    // Since we don't have a backend to create a PaymentIntent, we use createToken to validate the card.
    // In a real app, you would fetch a clientSecret from your backend and use stripe.confirmCardPayment.
    const { error, token } = await stripe.createToken(cardElement);

    if (error) {
      setError(error.message || 'Ocurrió un error al validar la tarjeta.');
      setProcessing(false);
    } else {
      console.log('Stripe Token generado (modo prueba):', token);
      // Simulate successful payment delay
      setTimeout(() => {
        setProcessing(false);
        onSuccess();
      }, 1000);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
      <div className="bg-white dark:bg-slate-800 p-4 rounded-md border border-slate-200 dark:border-slate-700">
        <CardElement options={{
            style: {
                base: {
                    fontSize: '16px',
                    color: '#424770',
                    '::placeholder': {
                        color: '#aab7c4',
                    },
                },
                invalid: {
                    color: '#9e2146',
                },
            },
        }} />
      </div>
      {error && <div className="text-red-500 text-sm font-bold text-center">{error}</div>}
      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white font-bold py-3 rounded-lg transition-colors flex justify-center items-center gap-2"
      >
        {processing ? (
          <>
            <span className="material-symbols-outlined animate-spin">sync</span>
            Procesando Pago...
          </>
        ) : (
          <>
            <span className="material-symbols-outlined">lock</span>
            Pagar {amount}€ Seguro
          </>
        )}
      </button>
    </form>
  );
};

interface StripeCheckoutProps {
    amount: number;
    onSuccess: () => void;
}

export const StripeCheckout: React.FC<StripeCheckoutProps> = ({ amount, onSuccess }) => {
  return (
    <Elements stripe={stripePromise}>
      <CheckoutForm amount={amount} onSuccess={onSuccess} />
    </Elements>
  );
};
