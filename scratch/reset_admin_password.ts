import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = 'https://jwixdjmbwfnfwmtsmsau.supabase.co';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseServiceKey) {
  console.error('Error: SUPABASE_SERVICE_ROLE_KEY not found in environment.');
  Deno.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const userId = '4f747ac6-6470-4b47-b521-b31a9f53f278';
const newPassword = 'MuskizAdmin2026!';

const { data, error } = await supabase.auth.admin.updateUserById(userId, {
  password: newPassword
});

if (error) {
  console.error('Error resetting password:', error.message);
} else {
  console.log('Successfully reset password for admin.');
}
