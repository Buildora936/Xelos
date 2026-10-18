
/**
 * XELOS — Client Supabase
 * Fichier : js/core/supabase.js
 */

import { createClient } from
  "https://esm.sh/@supabase/supabase-js@2";

import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  APP_CONFIG
} from "./config.js";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    "XELOS : la configuration Supabase est incomplète."
  );
}

export const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: APP_CONFIG.auth.persistSession,
      autoRefreshToken: APP_CONFIG.auth.autoRefreshToken,
      detectSessionInUrl: APP_CONFIG.auth.detectSessionInUrl
    },
    global: {
      headers: {
        "X-Client-Info": "xelos-storefront"
      }
    }
  }
);

/**
 * Vérifie la connexion au service d'authentification.
 * Ne réalise aucune lecture ni modification des tables métier.
 */
export async function checkSupabaseConnection() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return {
    connected: true,
    authenticated: Boolean(data.session),
    userId: data.session?.user?.id ?? null
  };
}
