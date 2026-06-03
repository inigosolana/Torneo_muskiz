import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Faltan variables de entorno VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY. Revisa tu archivo .env');
}

/**
 * implicit: los enlaces de recuperación se generan en el servidor (generateLink) y
 * vuelven con tokens en el hash (#access_token). PKCE exige code_verifier en el
 * mismo navegador que inició el flujo, y falla al abrir el correo.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        detectSessionInUrl: true,
        flowType: 'implicit',
        persistSession: true,
    },
});
