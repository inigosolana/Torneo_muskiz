
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || ''; // Needs to be service role or have access to pg_attribute
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkColumns() {
    // Try to select an empty row and see the keys
    const { data, error } = await supabase.from('teams').select('*').limit(1);
    if (error) {
        console.error('Error fetching teams:', error);
        return;
    }
    if (data && data.length > 0) {
        console.log('Columns found in teams table:', Object.keys(data[0]));
    } else {
        console.log('No data found in teams table to infer columns.');
    }
}

checkColumns();
