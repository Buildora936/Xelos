
/**
 * XELOS — Navigation et accès aux pages
 * Fichier : js/core/router.js
 */

import {
  getSession,
  onAuthChange
} from "./auth.js";

export function navigateTo(path, { replace = false } = {}) {
  const destination = new URL(path, window.location.href);

  if (destination.origin !== window.location.origin) {
    throw new Error(
      "XELOS : la navigation doit rester sur le même domaine."
    );
  }

  if (replace) {
    window.location.replace(destination.href);
  } else {
    window.location.assign(destination.href);
  }
}

export async function requireAuth({
  loginPage = "login.html"
} = {}) {
  const session = await getSession();

  if (!session) {
    const currentPage =
      window.location.pathname.split("/").pop() || "index.html";

    const returnTo = new URLSearchParams({
      next: currentPage + window.location.search
    });

    navigateTo(`${loginPage}?${returnTo.toString()}`);
    return false;
  }

  return true;
}

export async function redirectIfLoggedIn({
  destination = "account.html"
} = {}) {
  const session = await getSession();

  if (session) {
    navigateTo(destination, { replace: true });
    return true;
  }

  return false;
}

export function redirectAfterLogin({
  fallback = "account.html"
} = {}) {
  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");

  if (
    next &&
    !next.startsWith("//") &&
    !next.includes("\\") &&
    !/^[a-z][a-z\d+.-]*:/i.test(next)
  ) {
    navigateTo(next, { replace: true });
    return;
  }

  navigateTo(fallback, { replace: true });
}

export function watchProtectedPage({
  loginPage = "login.html",
  onAuthenticated = () => {}
} = {}) {
  let redirecting = false;

  const unsubscribe = onAuthChange((event, session) => {
    if (!session && !redirecting) {
      redirecting = true;
      navigateTo(loginPage, { replace: true });
      return;
    }

    if (session) {
      onAuthenticated(session);
    }
  });

  return unsubscribe;
}
