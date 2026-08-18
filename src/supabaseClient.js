import { createClient } from '@supabase/supabase-js'

// These come from your Supabase project settings (Project Settings > API).
// Set them as environment variables on the Netlify site (Site configuration
// > Environment variables):
//   VITE_SUPABASE_URL=https://xxxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=your-anon-key
// (Not Vercel — this project deliberately runs on Netlify, not Vercel;
// see the project decision log for why.)

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Deliberately NOT falling back to null here the way shine-public does.
// Every screen in this app calls supabase.from(...) directly with no
// null-checks (unlike shine-public, which checks `if (!supabase) return`
// throughout) — a silent null would surface as dozens of scattered,
// confusing "Cannot read property 'from' of null" errors across every
// screen instead of one clear failure. This is a staff tool, not the
// public site; failing loudly and immediately with one readable message
// is more useful here than degrading gracefully.
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase is not configured — VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY are missing. Check environment variables on the Netlify site (not Vercel).')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
