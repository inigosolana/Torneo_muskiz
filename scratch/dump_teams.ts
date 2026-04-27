
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  'https://jwixdjmbwfnfwmtsmsau.supabase.co',
  'sb_publishable_lrCyCW40bebkxjUVekMtoQ_Cn_KIIrV'
);

async function dumpTeams() {
  const { data, error } = await supabase.from('teams').select('*').limit(1);
  if (error) console.error(error);
  else console.log('Team data:', data);
}

dumpTeams();
