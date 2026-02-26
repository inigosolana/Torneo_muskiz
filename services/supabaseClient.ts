import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://jwixdjmbwfnfwmtsmsau.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3aXhkam1id2ZuZndtdHNtc2F1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMjk3MDQsImV4cCI6MjA4NzcwNTcwNH0.kN5KJ_eGzW9HGPiJlBYWZ6Y6hcbzaT0hMx-w9kAKw68';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
