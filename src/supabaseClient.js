import { createClient } from '@supabase/supabase-js'

// These come from your Supabase project settings (Project Settings > API).
// Set them in a .env file at the project root:
//   VITE_SUPABASE_URL=https://xxxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=your-anon-key
// In Vercel, add the same two variables under the project's Environment Variables.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
