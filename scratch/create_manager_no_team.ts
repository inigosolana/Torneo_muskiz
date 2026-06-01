/**
 * Crea un responsable (auth + profiles) SIN ningún equipo en teams.
 *
 * Uso (PowerShell, desde la raíz del proyecto):
 *   $env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."   # Dashboard > Settings > API > service_role
 *   npx --yes tsx scratch/create_manager_no_team.ts
 *
 * Opcional:
 *   $env:MANAGER_TEST_PASSWORD = "TuContraseña123!"
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? 'https://jwixdjmbwfnfwmtsmsau.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EMAIL = (process.env.MANAGER_TEST_EMAIL ?? 'inigosolanaa@gmail.com').trim().toLowerCase();
const PASSWORD = process.env.MANAGER_TEST_PASSWORD ?? 'MuskizManager2026!';
const FULL_NAME = process.env.MANAGER_TEST_NAME ?? 'Iñigo (prueba sin equipo)';

if (!SERVICE_KEY) {
    console.error('Falta SUPABASE_SERVICE_ROLE_KEY en el entorno.');
    process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

async function findUserByEmail(email: string) {
    let page = 1;
    const perPage = 200;
    while (page <= 20) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
        if (error) throw error;
        const hit = data.users.find((u) => u.email?.toLowerCase() === email);
        if (hit) return hit;
        if (data.users.length < perPage) break;
        page += 1;
    }
    return null;
}

async function main() {
    console.log(`Creando / actualizando responsable sin equipo: ${EMAIL}`);

    let userId: string;
    const existing = await findUserByEmail(EMAIL);

    if (existing) {
        userId = existing.id;
        const { error } = await admin.auth.admin.updateUserById(userId, {
            password: PASSWORD,
            email_confirm: true,
            user_metadata: { role: 'manager', approved: true, no_team_test: true },
        });
        if (error) throw error;
        console.log('Usuario Auth ya existía — contraseña y email confirmados.');
    } else {
        const { data, error } = await admin.auth.admin.createUser({
            email: EMAIL,
            password: PASSWORD,
            email_confirm: true,
            user_metadata: { role: 'manager', approved: true, no_team_test: true },
        });
        if (error) throw error;
        userId = data.user!.id;
        console.log('Usuario Auth creado.');
    }

    const { error: profileError } = await admin.from('profiles').upsert(
        {
            id: userId,
            email: EMAIL,
            role: 'manager',
            full_name: FULL_NAME,
        },
        { onConflict: 'id' }
    );
    if (profileError) throw profileError;
    console.log('Perfil manager en public.profiles OK.');

    const { count } = await admin
        .from('teams')
        .select('id', { count: 'exact', head: true })
        .eq('manager_email', EMAIL);
    console.log(`Equipos con este correo: ${count ?? 0} (debe ser 0 para prueba sin equipo).`);

    console.log('\n--- Acceso panel responsable ---');
    console.log(`URL:  https://torneomuskizbmplaya.es/manager-login`);
    console.log(`Email: ${EMAIL}`);
    console.log(`Pass:  ${PASSWORD}`);
    console.log('\nVerás el panel sin equipos aprobados (mensaje para inscribir o esperar aprobación).');
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
