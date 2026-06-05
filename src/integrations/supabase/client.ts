import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anon);

// On crée toujours un client (même factice) pour ne pas casser les imports.
// Les repositories vérifient `isSupabaseConfigured` et basculent en localStorage si besoin.
export const supabase: SupabaseClient<Database> = createClient<Database>(
  url ?? "https://placeholder.supabase.co",
  anon ?? "placeholder-anon-key",
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
