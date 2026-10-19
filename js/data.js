/**
 * XELOS — Accès centralisé aux données
 * Fichier : js/data.js
 *
 * Les opérations restent soumises aux permissions Supabase
 * et aux politiques RLS.
 */

import { supabase } from "./core/supabase.js";

function throwIfError(error) {
  if (error) {
    throw error;
  }
}

function validateTableName(table) {
  if (
    typeof table !== "string" ||
    !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)
  ) {
    throw new TypeError("Nom de table invalide.");
  }
}

export async function selectRows(
  table,
  {
    columns = "*",
    filters = {},
    limit = 50,
    offset = 0,
    orderBy,
    ascending = true
  } = {}
) {
  validateTableName(table);

  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new RangeError(
      "La limite doit être comprise entre 1 et 500."
    );
  }

  if (!Number.isInteger(offset) || offset < 0) {
    throw new RangeError(
      "Le décalage doit être un entier positif ou nul."
    );
  }

  let query = supabase
    .from(table)
    .select(columns)
    .range(offset, offset + limit - 1);

  for (const [column, value] of Object.entries(filters)) {
    if (
      !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)
    ) {
      throw new TypeError(
        `Nom de colonne invalide : ${column}`
      );
    }

    if (value === null) {
      query = query.is(column, null);
    } else if (Array.isArray(value)) {
      query = query.in(column, value);
    } else {
      query = query.eq(column, value);
    }
  }

  if (orderBy) {
    if (
      !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(orderBy)
    ) {
      throw new TypeError(
        "Colonne de tri invalide."
      );
    }

    query = query.order(orderBy, { ascending });
  }

  const { data, error } = await query;
  throwIfError(error);

  return data ?? [];
}

export async function insertRows(table, records) {
  validateTableName(table);

  if (!records || (Array.isArray(records) && records.length === 0)) {
    throw new TypeError(
      "Les données à insérer sont obligatoires."
    );
  }

  const { data, error } = await supabase
    .from(table)
    .insert(records)
    .select();

  throwIfError(error);
  return data;
}

export async function updateRows(
  table,
  changes,
  filters
) {
  validateTableName(table);

  if (!changes || typeof changes !== "object") {
    throw new TypeError(
      "Les modifications sont obligatoires."
    );
  }

  if (
    !filters ||
    typeof filters !== "object" ||
    Object.keys(filters).length === 0
  ) {
    throw new Error(
      "Une mise à jour nécessite au moins un filtre."
    );
  }

  let query = supabase.from(table).update(changes);

  for (const [column, value] of Object.entries(filters)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) {
      throw new TypeError(
        `Nom de colonne invalide : ${column}`
      );
    }

    query = value === null
      ? query.is(column, null)
      : query.eq(column, value);
  }

  const { data, error } = await query.select();
  throwIfError(error);

  return data ?? [];
}

export async function deleteRows(table, filters) {
  validateTableName(table);

  if (
    !filters ||
    typeof filters !== "object" ||
    Object.keys(filters).length === 0
  ) {
    throw new Error(
      "Une suppression nécessite au moins un filtre."
    );
  }

  let query = supabase.from(table).delete();

  for (const [column, value] of Object.entries(filters)) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(column)) {
      throw new TypeError(
        `Nom de colonne invalide : ${column}`
      );
    }

    query = value === null
      ? query.is(column, null)
      : query.eq(column, value);
  }

  const { data, error } = await query.select();
  throwIfError(error);

  return data ?? [];
}
