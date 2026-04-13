
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const divisions = [
    'Infantil Femenino', 'Infantil Masculino', 
    'Cadete Femenino', 'Cadete Masculino', 
    'Juvenil Femenino', 'Juvenil Masculino', 
    'Senior Femenino', 'Senior Masculino'
];

async function seed() {
    console.log('--- Starting Seeding ---');

    // 1. Clear existing data (optional but good for 'test')
    // Note: This might fail if RLS is on and we don't have service role
    // For now we just insert.

    // 2. Create 8 teams per division
    for (const division of divisions) {
        console.log(`Creating teams for ${division}...`);
        for (let i = 1; i <= 8; i++) {
            const teamName = `Equipo ${division} ${i}`;
            const { data: team, error: teamError } = await supabase
                .from('teams')
                .insert([{
                    name: teamName,
                    city: 'Muskiz',
                    division: division,
                    payment_status: 'PAID',
                    fee: 200
                }])
                .select()
                .single();

            if (teamError) {
                console.error(`Error creating team ${teamName}:`, teamError.message);
                continue;
            }

            // Add 10 players to the first team of each division as a sample
            if (i === 1) {
                const players = [];
                for (let j = 1; j <= 10; j++) {
                    players.push({
                        team_id: team.id,
                        name: `Jugador ${j}`,
                        surnames: `Apellido ${j}`,
                        dni_number: `${Math.floor(10000000 + Math.random() * 90000000)}Z`,
                        birth_date: '2010-01-01',
                        number: j,
                        position: 'Universal',
                        dni_status: 'APPROVED',
                        insurance_status: 'APPROVED'
                    });
                }
                const { error: pError } = await supabase.from('players').insert(players);
                if (pError) console.error(`Error creating players for ${teamName}:`, pError.message);
            }
        }
    }

    console.log('--- Seeding Finished ---');
}

seed();
