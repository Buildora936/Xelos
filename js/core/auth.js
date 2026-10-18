
/**
 * XELOS — Authentification
 * Fichier : js/core/auth.js
 */

import { supabase } from "./supabase.js";
import { setState } from "./state.js";

function getRedirectUrl(filename) {
  return new URL(filename, window.location.href).href;
}

function handleAuthResult(result) {
  if (result.error) {
    throw result.error;
  }

  return result.data;
}

export async function signUp({
  email,
  password,
  options = {}
}) {
  if (!email || !password) {
    throw new Error(
      "Une adresse e-mail et un mot de passe sont requis."
    );
  }

  const result = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      ...options,
      emailRedirectTo: getRedirectUrl("login.html")
    }
  });

  const data = handleAuthResult(result);

  if (data.session) {
    setState({
      user: data.user,
      session: data.session
    });
  }

  return data;
}

export async function signIn(email, password) {
  if (!email || !password) {
    throw new Error(
      "Une adresse e-mail et un mot de passe sont requis."
    );
  }

  const result = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password
  });

  const data = handleAuthResult(result);

  setState({
    user: data.user,
    session: data.session
  });

  return data;
}

export async function signOut() {
  const result = await supabase.auth.signOut();
  handleAuthResult(result);

  setState({
    user: null,
    session: null
  });
}

export async function getSession() {
  const result = await supabase.auth.getSession();
  const data = handleAuthResult(result);

  setState({
    session: data.session,
    user: data.session?.user ?? null
  });

  return data.session;
}

export async function getUser() {
  const result = await supabase.auth.getUser();
  const data = handleAuthResult(result);

  setState({
    user: data.user
  });

  return data.user;
}

export async function isAuthenticated() {
  const session = await getSession();
  return Boolean(session);
}

export async function resetPassword(email) {
  if (!email) {
    throw new Error(
      "Une adresse e-mail est requise."
    );
  }

  const result = await supabase.auth.resetPasswordForEmail(
    email.trim(),
    {
      redirectTo: getRedirectUrl("reset-password.html")
    }
  );

  handleAuthResult(result);
  return true;
}

export async function updatePassword(newPassword) {
  if (!newPassword || newPassword.length < 8) {
    throw new Error(
      "Le mot de passe doit contenir au moins 8 caractères."
    );
  }

  const result = await supabase.auth.updateUser({
    password: newPassword
  });

  return handleAuthResult(result).user;
}

export function onAuthChange(callback) {
  if (typeof callback !== "function") {
    throw new TypeError(
      "Le rappel d'authentification doit être une fonction."
    );
  }

  const { data } = supabase.auth.onAuthStateChange(
    (event, session) => {
      setState({
        session,
        user: session?.user ?? null
      });

      callback(event, session);
    }
  );

  return () => {
    data.subscription.unsubscribe();
  };
}
