import { createClient } from '@supabase/supabase-js';

// Read from Vite env
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

let supabase;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
  // Provide a minimal stub so imports don't throw during dev/build when env is missing
  console.warn('VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY not set — supabase client disabled.');
  supabase = {
    auth: {
      async getSession() {
        return { data: { session: null } };
      },
      onAuthStateChange(_cb) {
        return { data: { subscription: { unsubscribe() {} } } };
      },
      async signInWithOAuth() {
        return { error: new Error('Supabase not configured') };
      },
      async signOut() {
        return {};
      },
    },
    from() {
      return {
        select: async () => ({ data: null, error: new Error('Supabase not configured') }),
        insert: async () => ({ data: null, error: new Error('Supabase not configured') }),
        update: async () => ({ data: null, error: new Error('Supabase not configured') }),
      };
    },
  };
}

export { supabase };
