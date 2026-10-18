
/**
 * XELOS — Configuration publique
 * Fichier : js/core/config.js
 *
 * Seules les informations publiques peuvent être exposées
 * dans le navigateur.
 */

export const SUPABASE_URL =
  "https://mpmavqxpaynuqqijtjco.supabase.co";

export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1wbWF2cXhwYXludXFxaWp0amNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExMjYxNTksImV4cCI6MjEwNjcwMjE1OX0.07CzJ7BIKWlgl-GqDmQqm_LPDhv7U2NRlg8vQgRmaBU";

export const APP_CONFIG = Object.freeze({
  name: "XELOS",
  environment: "production",
  defaultCurrency: "USD",
  defaultLocale: "en-US",
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});
