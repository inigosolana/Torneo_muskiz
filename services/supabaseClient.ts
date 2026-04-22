import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://jwixdjmbwfnfwmtsmsau.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_lrCyCW40bebkxjUVekMtoQ_Cn_KIIrV';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
