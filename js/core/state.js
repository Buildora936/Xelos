
/**
 * XELOS — État partagé de l'application
 * Fichier : js/core/state.js
 */

const initialState = {
  user: null,
  session: null,
  cartCount: 0,
  wishlistCount: 0,
  isLoading: false
};

let state = { ...initialState };
const listeners = new Set();

function notify() {
  for (const listener of listeners) {
    try {
      listener(getState());
    } catch (error) {
      console.error("XELOS : erreur d'écoute de l'état.", error);
    }
  }
}

export function getState() {
  return { ...state };
}

export function getStateValue(key) {
  return state[key];
}

export function setState(updates) {
  if (!updates || typeof updates !== "object") {
    throw new TypeError(
      "Les mises à jour doivent être un objet."
    );
  }

  state = { ...state, ...updates };
  notify();

  return getState();
}

export function subscribe(listener) {
  if (typeof listener !== "function") {
    throw new TypeError(
      "L'écouteur doit être une fonction."
    );
  }

  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export function resetState() {
  state = { ...initialState };
  notify();

  return getState();
}
