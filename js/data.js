/**
 * XELOS — Boutique / Catalogue
 * Fichier : js/shop.js
 *
 * Fonctionnalités :
 * - Chargement paginé depuis Supabase
 * - Recherche dans les produits
 * - Filtres, catégories disponibles, prix et stock
 * - Tri et pagination
 * - Affichage en grille ou en liste
 * - Images et prix associés aux produits
 * - États de chargement, catalogue vide et erreurs
 * - Synchronisation des filtres avec l'URL
 * - Menu mobile
 * - Header adapté à la session Supabase
 *
 * Dépendances :
 * - ./data.js
 * - ./core/supabase.js
 *
 * Les permissions et les politiques RLS restent gérées par Supabase.
 */

import { selectRows } from "./data.js";
import { supabase } from "./core/supabase.js";

const PAGE_SIZE = 12;

const CATALOG_LIMITS = Object.freeze({
  products: 1000,
  media: 5000,
  prices: 5000,
  queryPageSize: 500
});

/* -------------------------------------------------------------------------- */
/* OUTILS GÉNÉRAUX                                                            */
/* -------------------------------------------------------------------------- */

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    };

    return entities[character];
  });
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function slugify(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sameId(first, second) {
  return (
    first !== null &&
    first !== undefined &&
    second !== null &&
    second !== undefined &&
    String(first) === String(second)
  );
}

function hasOwn(object, property) {
  return (
    object !== null &&
    typeof object === "object" &&
    Object.prototype.hasOwnProperty.call(object, property)
  );
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function formatPrice(amount, currency = "USD") {
  const value = toFiniteNumber(amount);

  if (value === null) {
    return "Prix indisponible";
  }

  const currencyCode = String(currency || "USD").toUpperCase();

  try {
    return new Intl.NumberFormat("fr-HT", {
      style: "currency",
      currency: currencyCode
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currencyCode}`;
  }
}

function safeURL(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const url = new URL(value.trim(), window.location.href);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    return url.href;
  } catch {
    return null;
  }
}

function getErrorDetails(error) {
  return {
    message: error?.message || String(error || "Erreur inconnue"),
    code: error?.code || "",
    details: error?.details || "",
    hint: error?.hint || ""
  };
}

function isMissingColumnError(error) {
  const details = getErrorDetails(error);
  const message = `${details.message} ${details.details}`.toLowerCase();

  return (
    details.code === "42703" ||
    message.includes("column") && message.includes("does not exist") ||
    message.includes("could not find") && message.includes("column")
  );
}

/* -------------------------------------------------------------------------- */
/* CHARGEMENT PAGINÉ                                                          */
/* -------------------------------------------------------------------------- */

/**
 * data.js accepte au maximum 500 lignes par appel.
 * Cette fonction récupère les résultats par pages sans dépasser cette limite.
 */
async function selectAllRows(
  table,
  {
    maxRows = 5000,
    ...options
  } = {}
) {
  const {
    limit: requestedLimit = CATALOG_LIMITS.queryPageSize,
    offset: requestedOffset = 0,
    orderBy: requestedOrderBy,
    ...queryOptions
  } = options;

  if (!Number.isInteger(maxRows) || maxRows < 1) {
    throw new RangeError("maxRows doit être un entier positif.");
  }

  const pageSize = Math.min(
    CATALOG_LIMITS.queryPageSize,
    Math.max(
      1,
      Number.isInteger(requestedLimit)
        ? requestedLimit
        : CATALOG_LIMITS.queryPageSize
    )
  );

  let offset = (
    Number.isInteger(requestedOffset) && requestedOffset >= 0
  )
    ? requestedOffset
    : 0;

  let orderBy = requestedOrderBy;
  let orderingFallbackUsed = false;

  const allRows = [];

  while (allRows.length < maxRows) {
    const limit = Math.min(
      pageSize,
      maxRows - allRows.length
    );

    const requestOptions = {
      ...queryOptions,
      limit,
      offset
    };

    if (orderBy) {
      requestOptions.orderBy = orderBy;
    }

    let rows;

    try {
      rows = await selectRows(table, requestOptions);
    } catch (error) {
      /*
       * Si seule la colonne de tri est absente, réessayer sans le tri.
       * Les autres erreurs restent visibles dans les diagnostics.
       */
      if (orderBy && isMissingColumnError(error)) {
        console.warn(
          `[XELOS] Colonne de tri "${orderBy}" absente de "${table}". ` +
          "Nouvelle tentative sans tri."
        );

        orderBy = undefined;
        orderingFallbackUsed = true;

        const fallbackOptions = {
          ...queryOptions,
          limit,
          offset
        };

        try {
          rows = await selectRows(table, fallbackOptions);
        } catch (fallbackError) {
          throw fallbackError;
        }
      } else {
        throw error;
      }
    }

    if (!Array.isArray(rows)) {
      throw new TypeError(
        `La table "${table}" n'a pas renvoyé un tableau.`
      );
    }

    allRows.push(...rows);

    if (rows.length < limit) {
      break;
    }

    offset += rows.length;
  }

  if (orderingFallbackUsed) {
    console.info(
      `[XELOS] Les données de "${table}" ont été chargées sans tri SQL.`
    );
  }

  if (allRows.length >= maxRows) {
    console.warn(
      `[XELOS] Limite atteinte pour "${table}" : ${maxRows} lignes.`
    );
  }

  return allRows;
}

/**
 * Les médias et les prix sont complémentaires.
 * Leur absence ne doit pas empêcher le chargement des produits.
 */
async function selectOptionalTable(table, options) {
  try {
    return await selectAllRows(table, options);
  } catch (error) {
    console.error(
      `[XELOS] Impossible de charger la table facultative "${table}".`,
      getErrorDetails(error)
    );

    return [];
  }
}

/* -------------------------------------------------------------------------- */
/* VISIBILITÉ DES PRODUITS                                                    */
/* -------------------------------------------------------------------------- */

function isPublicProduct(product) {
  if (!product || typeof product !== "object") {
    return false;
  }

  /*
   * Si ces colonnes existent dans le résultat, on respecte leur valeur.
   * Si elles n'existent pas, on ne suppose pas qu'elles existent dans le schéma.
   * L'accès à la table reste soumis à RLS.
   */
  if (hasOwn(product, "status")) {
    const status = normalizeText(product.status);

    if (!["active", "published"].includes(status)) {
      return false;
    }
  }

  if (hasOwn(product, "visibility")) {
    if (normalizeText(product.visibility) !== "public") {
      return false;
    }
  }

  if (hasOwn(product, "is_active") && product.is_active === false) {
    return false;
  }

  return true;
}

/* -------------------------------------------------------------------------- */
/* IMAGES                                                                     */
/* -------------------------------------------------------------------------- */

function getFallbackImage(product) {
  const possibleFields = [
    "image_url",
    "thumbnail_url",
    "featured_image_url",
    "featured_image",
    "cover_image_url",
    "cover_image",
    "image"
  ];

  for (const field of possibleFields) {
    const value = product?.[field];

    if (typeof value === "string") {
      const url = safeURL(value);

      if (url) {
        return url;
      }
    }

    if (value && typeof value === "object") {
      const nestedURL = safeURL(
        value.url || value.src || value.thumbnail_url
      );

      if (nestedURL) {
        return nestedURL;
      }
    }

    if (Array.isArray(value) && value.length > 0) {
      const first = value[0];

      const arrayURL = safeURL(
        typeof first === "string"
          ? first
          : first?.url || first?.src
      );

      if (arrayURL) {
        return arrayURL;
      }
    }
  }

  return null;
}

function getMediaImage(product, mediaRows) {
  const matchingMedia = mediaRows
    .filter((media) => sameId(media.product_id, product.id))
    .filter((media) => media.is_active !== false)
    .filter((media) => {
      const type = normalizeText(media.media_type);

      return !type || type === "image";
    })
    .sort((first, second) => {
      const firstPrimary = first.is_primary === true ? 1 : 0;
      const secondPrimary = second.is_primary === true ? 1 : 0;

      if (firstPrimary !== secondPrimary) {
        return secondPrimary - firstPrimary;
      }

      const firstPosition = toFiniteNumber(first.position) ?? 0;
      const secondPosition = toFiniteNumber(second.position) ?? 0;

      return firstPosition - secondPosition;
    });

  for (const media of matchingMedia) {
    const url = safeURL(
      media.thumbnail_url || media.url
    );

    if (url) {
      return {
        url,
        alt: media.alt_text || product.name
      };
    }
  }

  const fallback = getFallbackImage(product);

  if (fallback) {
    return {
      url: fallback,
      alt: product.name
    };
  }

  return {
    url: null,
    alt: product.name
  };
}

/* -------------------------------------------------------------------------- */
/* PRIX                                                                        */
/* -------------------------------------------------------------------------- */

function isPriceCurrentlyValid(price, now = Date.now()) {
  if (!price || price.is_active === false) {
    return false;
  }

  const start = price.starts_at
    ? new Date(price.starts_at).getTime()
    : null;

  const end = price.ends_at
    ? new Date(price.ends_at).getTime()
    : null;

  if (start !== null && !Number.isFinite(start)) {
    return false;
  }

  if (end !== null && !Number.isFinite(end)) {
    return false;
  }

  if (start !== null && start > now) {
    return false;
  }

  if (end !== null && end <= now) {
    return false;
  }

  return true;
}

function getProductPricing(product, priceRows) {
  const now = Date.now();

  const matchingPrices = priceRows
    .filter((price) => sameId(price.product_id, product.id))
    .filter((price) => {
      /*
       * On utilise ici les prix généraux du produit.
       * Les prix propres aux variantes nécessitent de connaître
       * la variante sélectionnée sur la page produit.
       */
      return (
        !hasOwn(price, "product_variant_id") ||
        price.product_variant_id === null
      );
    })
    .filter((price) => isPriceCurrentlyValid(price, now))
    .map((price) => ({
      ...price,
      normalizedType: normalizeText(price.price_type),
      normalizedCurrency: String(
        price.currency_code || "USD"
      ).toUpperCase(),
      numericAmount: toFiniteNumber(price.amount),
      startTimestamp: price.starts_at
        ? new Date(price.starts_at).getTime()
        : 0
    }))
    .filter((price) => price.numericAmount !== null)
    .filter((price) => price.numericAmount >= 0);

  if (matchingPrices.length === 0) {
    return {
      amount: null,
      regularAmount: null,
      saleAmount: null,
      compareAtAmount: null,
      currency: "USD",
      isOnSale: false
    };
  }

  /*
   * La boutique privilégie USD, puis choisit une autre devise
   * uniquement si aucun prix USD n'est disponible.
   */
  const hasUSD = matchingPrices.some(
    (price) => price.normalizedCurrency === "USD"
  );

  const currency = hasUSD
    ? "USD"
    : matchingPrices[0].normalizedCurrency;

  const currencyPrices = matchingPrices
    .filter((price) => price.normalizedCurrency === currency)
    .sort((first, second) => {
      return second.startTimestamp - first.startTimestamp;
    });

  const regularPrice = currencyPrices.find(
    (price) => price.normalizedType === "regular"
  );

  const salePrice = currencyPrices.find(
    (price) => price.normalizedType === "sale"
  );

  const compareAtPrice = currencyPrices.find(
    (price) => price.normalizedType === "compare_at"
  );

  const regularAmount = regularPrice?.numericAmount ?? null;
  const proposedSaleAmount = salePrice?.numericAmount ?? null;

  const saleIsValid = (
    proposedSaleAmount !== null &&
    (
      regularAmount === null ||
      proposedSaleAmount < regularAmount
    )
  );

  const saleAmount = saleIsValid
    ? proposedSaleAmount
    : null;

  const amount = saleAmount !== null
    ? saleAmount
    : regularAmount;

  const compareAtAmount = (
    compareAtPrice?.numericAmount ??
    (
      saleAmount !== null && regularAmount !== null
        ? regularAmount
        : null
    )
  );

  return {
    amount,
    regularAmount,
    saleAmount,
    compareAtAmount,
    currency,
    isOnSale: (
      saleAmount !== null &&
      regularAmount !== null &&
      saleAmount < regularAmount
    )
  };
}

/* -------------------------------------------------------------------------- */
/* STOCK                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Cette fonction lit uniquement les champs de stock présents dans les
 * données reçues. Elle ne suppose pas l'existence d'une table d'inventaire.
 *
 * Retourne true, false ou null lorsque l'information est indisponible.
 */
function getStockAvailability(product) {
  const booleanFields = [
    "in_stock",
    "is_in_stock",
    "available"
  ];

  for (const field of booleanFields) {
    if (!hasOwn(product, field) || product[field] === null) {
      continue;
    }

    if (typeof product[field] === "boolean") {
      return product[field];
    }

    const value = normalizeText(product[field]);

    if (["true", "1", "yes", "available", "in_stock"].includes(value)) {
      return true;
    }

    if (["false", "0", "no", "unavailable", "out_of_stock"].includes(value)) {
      return false;
    }
  }

  const statusFields = [
    "stock_status",
    "availability"
  ];

  for (const field of statusFields) {
    if (!hasOwn(product, field) || product[field] === null) {
      continue;
    }

    const status = normalizeText(product[field]);

    if (
      ["in_stock", "in stock", "available", "instock"].includes(status)
    ) {
      return true;
    }

    if (
      [
        "out_of_stock",
        "out of stock",
        "sold_out",
        "sold out",
        "unavailable"
      ].includes(status)
    ) {
      return false;
    }
  }

  const quantityFields = [
    "quantity_available",
    "available_quantity",
    "inventory_quantity",
    "stock_quantity",
    "quantity"
  ];

  for (const field of quantityFields) {
    if (!hasOwn(product, field) || product[field] === null) {
      continue;
    }

    const quantity = toFiniteNumber(product[field]);

    if (quantity !== null) {
      return quantity > 0;
    }
  }

  return null;
}

/* -------------------------------------------------------------------------- */
/* NORMALISATION DES PRODUITS                                                  */
/* -------------------------------------------------------------------------- */

function getProductCategory(product) {
  const fields = [
    "category_name",
    "category_title",
    "category",
    "primary_category"
  ];

  for (const field of fields) {
    const value = product?.[field];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (value && typeof value === "object") {
      const nestedName = (
        value.name ||
        value.title ||
        value.label
      );

      if (typeof nestedName === "string" && nestedName.trim()) {
        return nestedName.trim();
      }
    }
  }

  return "";
}

function normalizeProductRows(productRows, mediaRows, priceRows) {
  return productRows
    .filter(isPublicProduct)
    .filter((product) => product.id !== null && product.id !== undefined)
    .filter((product) => {
      return Boolean(
        String(product.name || product.title || "").trim()
      );
    })
    .map((product) => {
      const name = String(
        product.name || product.title
      ).trim();

      const category = getProductCategory(product);

      const pricing = getProductPricing(product, priceRows);
      const media = getMediaImage(product, mediaRows);

      const searchableFields = [
        name,
        product.slug,
        product.short_description,
        product.description,
        category,
        product.brand,
        product.sku,
        product.product_type
      ];

      if (Array.isArray(product.tags)) {
        searchableFields.push(...product.tags);
      }

      return {
        id: product.id,
        slug: product.slug || slugify(name),
        name,
        shortDescription: String(
          product.short_description ||
          product.description ||
          ""
        ).trim(),
        category,
        categoryKey: slugify(category),
        brand: String(product.brand || "").trim(),
        sku: String(product.sku || "").trim(),
        productType: String(product.product_type || "").trim(),
        createdAt: product.created_at || null,
        image: media.url,
        imageAlt: media.alt || name,
        price: pricing.amount,
        regularPrice: pricing.regularAmount,
        salePrice: pricing.saleAmount,
        compareAtPrice: pricing.compareAtAmount,
        currency: pricing.currency,
        isOnSale: pricing.isOnSale,
        inStock: getStockAvailability(product),
        searchableText: normalizeText(
          searchableFields.filter(Boolean).join(" ")
        ),
        source: product
      };
    });
}

/* -------------------------------------------------------------------------- */
/* INITIALISATION DE LA PAGE                                                   */
/* -------------------------------------------------------------------------- */

function initShop() {
  if (window.__xelosShopInitialized) {
    return;
  }

  window.__xelosShopInitialized = true;

  const elements = {
    menuToggle: document.getElementById("menuToggle"),
    primaryNavigation: document.getElementById("primaryNavigation"),

    headerSearch: document.getElementById("headerSearch"),
    headerSearchInput: document.getElementById("headerSearchInput"),
    shopHeaderActions: document.getElementById("shopHeaderActions"),

    catalogSearch: document.getElementById("catalogSearch"),
    filterToggle: document.getElementById("filterToggle"),
    catalogFilters: document.getElementById("catalogFilters"),
    clearFilters: document.getElementById("clearFilters"),
    activeFilterCount: document.getElementById("activeFilterCount"),
    sortSelect: document.getElementById("sortSelect"),
    viewToggle: document.getElementById("viewToggle"),

    categoryOptions: document.getElementById("categoryOptions"),
    minPrice: document.getElementById("minPrice"),
    maxPrice: document.getElementById("maxPrice"),
    inStockOnly: document.getElementById("inStockOnly"),
    applyFilters: document.getElementById("applyFilters"),

    resultsSummary: document.getElementById("resultsSummary"),
    activeFilters: document.getElementById("activeFilters"),
    productGrid: document.getElementById("productGrid"),

    catalogState: document.getElementById("catalogState"),
    stateEyebrow: document.getElementById("stateEyebrow"),
    stateTitle: document.getElementById("stateTitle"),
    stateMessage: document.getElementById("stateMessage"),
    stateReset: document.getElementById("stateReset"),

    catalogStatus: document.getElementById("catalogStatus"),
    catalogPagination: document.getElementById("catalogPagination"),
    previousPage: document.getElementById("previousPage"),
    nextPage: document.getElementById("nextPage"),
    paginationPages: document.getElementById("paginationPages"),

    currentYear: document.getElementById("currentYear")
  };

  const state = {
    products: [],
    filteredProducts: [],
    currentPage: 1,
    view: "grid",
    loading: false,
    loadError: null,
    selectedCategories: new Set(),
    search: "",
    minPrice: null,
    maxPrice: null,
    inStockOnly: false,
    sort: "",
    rawCounts: {
      products: 0,
      publicProducts: 0,
      media: 0,
      prices: 0
    }
  };

  /* ------------------------------------------------------------------------ */
  /* HEADER ET FONT AWESOME                                                   */
  /* ------------------------------------------------------------------------ */

  function ensureFontAwesome() {
    const existingStylesheet = document.querySelector(
      'link[href*="font-awesome"],' +
      'link[href*="fontawesome"],' +
      'link[href*="fontawesome.com"]'
    );

    if (existingStylesheet) {
      return;
    }

    const stylesheet = document.createElement("link");

    stylesheet.rel = "stylesheet";
    stylesheet.href =
      "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css";
    stylesheet.crossOrigin = "anonymous";
    stylesheet.referrerPolicy = "no-referrer";

    document.head.appendChild(stylesheet);
  }

  function getHeaderActionsContainer() {
    let container = (
      elements.shopHeaderActions ||
      document.querySelector(
        "#shopHeaderActions, [data-shop-header-actions], .shop-header__actions"
      )
    );

    if (container) {
      return container;
    }

    const headerHost = document.querySelector(
      ".shop-header__inner, .shop-header__content, " +
      ".header__inner, header .container, header"
    );

    if (!headerHost) {
      return null;
    }

    container = document.createElement("div");
    container.id = "shopHeaderActions";
    container.className = "shop-header__actions";
    container.setAttribute("aria-live", "polite");

    headerHost.appendChild(container);

    elements.shopHeaderActions = container;

    return container;
  }

  function renderHeaderActions(session) {
    const container = getHeaderActionsContainer();

    if (!container) {
      console.warn(
        "[XELOS] Conteneur d'actions du header introuvable."
      );
      return;
    }

    const authenticated = Boolean(session?.user);

    if (authenticated) {
      container.innerHTML = `
        <a
          class="shop-header__action"
          href="account.html"
          aria-label="Mon compte"
        >
          <i class="fa-solid fa-user" aria-hidden="true"></i>
          <span>Mon compte</span>
        </a>

        <a
          class="shop-header__action"
          href="cart.html"
          aria-label="Mon panier"
        >
          <i class="fa-solid fa-cart-shopping" aria-hidden="true"></i>
          <span>Panier</span>
        </a>
      `;

      return;
    }

    container.innerHTML = `
      <a
        class="shop-header__action"
        href="login.html"
        aria-label="Se connecter"
      >
        <i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i>
        <span>Connexion</span>
      </a>

      <a
        class="shop-header__action"
        href="signup.html"
        aria-label="Créer un compte"
      >
        <i class="fa-solid fa-user-plus" aria-hidden="true"></i>
        <span>Créer un compte</span>
      </a>
    `;
  }

  async function initHeaderAuthentication() {
    ensureFontAwesome();

    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        throw error;
      }

      renderHeaderActions(data?.session || null);
    } catch (error) {
      console.error(
        "[XELOS] Impossible de récupérer la session Supabase.",
        getErrorDetails(error)
      );

      renderHeaderActions(null);
    }

    if (supabase.auth?.onAuthStateChange) {
      supabase.auth.onAuthStateChange((_event, session) => {
        renderHeaderActions(session || null);
      });
    }
  }

  /* ------------------------------------------------------------------------ */
  /* ÉTATS DU CATALOGUE                                                       */
  /* ------------------------------------------------------------------------ */

  function setCatalogStatus(message) {
    if (elements.catalogStatus) {
      elements.catalogStatus.textContent = message;
    }
  }

  function showCatalogState({
    eyebrow = "CATALOGUE XELOS",
    title = "Aucun produit trouvé",
    message = "Essaie de modifier tes critères de recherche.",
    buttonText = "Réinitialiser les filtres",
    isError = false
  } = {}) {
    if (elements.catalogState) {
      elements.catalogState.hidden = false;
      elements.catalogState.classList.toggle("is-error", isError);
    }

    if (elements.stateEyebrow) {
      elements.stateEyebrow.textContent = eyebrow;
    }

    if (elements.stateTitle) {
      elements.stateTitle.textContent = title;
    }

    if (elements.stateMessage) {
      elements.stateMessage.textContent = message;
    }

    if (elements.stateReset) {
      elements.stateReset.textContent = buttonText;
      elements.stateReset.hidden = false;
    }
  }

  function hideCatalogState() {
    if (elements.catalogState) {
      elements.catalogState.hidden = true;
      elements.catalogState.classList.remove("is-error");
    }
  }

  function renderLoadingSkeletons() {
    if (!elements.productGrid) {
      return;
    }

    hideCatalogState();

    elements.productGrid.hidden = false;
    elements.productGrid.innerHTML = Array.from(
      { length: 8 },
      () => `
        <article class="shop-product-card shop-product-skeleton" aria-hidden="true">
          <div class="shop-product-card__media shop-product-skeleton__media"></div>
          <div class="shop-product-card__content">
            <div class="shop-product-skeleton__line"></div>
            <div class="shop-product-skeleton__line shop-product-skeleton__line--short"></div>
            <div class="shop-product-skeleton__line shop-product-skeleton__line--price"></div>
          </div>
        </article>
      `
    ).join("");

    if (elements.catalogPagination) {
      elements.catalogPagination.hidden = true;
    }

    setCatalogStatus("Chargement du catalogue XELOS…");

    if (elements.resultsSummary) {
      elements.resultsSummary.textContent = "Chargement des produits…";
    }
  }

  /* ------------------------------------------------------------------------ */
  /* CATÉGORIES                                                               */
  /* ------------------------------------------------------------------------ */

  function getAvailableCategories() {
    const categories = new Map();

    for (const product of state.products) {
      if (!product.category || !product.categoryKey) {
        continue;
      }

      if (!categories.has(product.categoryKey)) {
        categories.set(product.categoryKey, product.category);
      }
    }

    return Array.from(categories.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((first, second) => {
        return first.label.localeCompare(second.label, "fr");
      });
  }

  function renderCategories() {
    if (!elements.categoryOptions) {
      return;
    }

    const categories = getAvailableCategories();

    if (categories.length === 0) {
      elements.categoryOptions.innerHTML = `
        <p class="shop-filter-empty">
          Les catégories seront disponibles lorsque les produits
          contiendront leurs informations de catégorie.
        </p>
      `;

      return;
    }

    elements.categoryOptions.innerHTML = categories.map((category) => {
      const checked = state.selectedCategories.has(category.key);

      return `
        <label class="shop-filter-option">
          <input
            type="checkbox"
            name="category"
            value="${escapeHTML(category.key)}"
            ${checked ? "checked" : ""}
          >
          <span>${escapeHTML(category.label)}</span>
        </label>
      `;
    }).join("");
  }

  /* ------------------------------------------------------------------------ */
  /* FILTRES                                                                  */
  /* ------------------------------------------------------------------------ */

  function readURLParameters() {
    const params = new URLSearchParams(window.location.search);

    const search = (
      params.get("q") ||
      params.get("search") ||
      ""
    ).trim();

    const minPrice = toFiniteNumber(
      params.get("min") ?? params.get("minPrice")
    );

    const maxPrice = toFiniteNumber(
      params.get("max") ?? params.get("maxPrice")
    );

    const categoryParameter = params.get("category") || "";

    state.search = search;
    state.minPrice = minPrice;
    state.maxPrice = maxPrice;
    state.sort = params.get("sort") || "";
    state.inStockOnly = params.get("stock") === "1";

    state.selectedCategories = new Set(
      categoryParameter
        .split(",")
        .map((item) => slugify(item))
        .filter(Boolean)
    );

    if (elements.catalogSearch) {
      elements.catalogSearch.value = search;
    }

    if (elements.headerSearchInput) {
      elements.headerSearchInput.value = search;
    }

    if (elements.minPrice) {
      elements.minPrice.value = minPrice ?? "";
    }

    if (elements.maxPrice) {
      elements.maxPrice.value = maxPrice ?? "";
    }

    if (elements.inStockOnly) {
      elements.inStockOnly.checked = state.inStockOnly;
    }

    if (
      elements.sortSelect &&
      state.sort &&
      Array.from(elements.sortSelect.options).some(
        (option) => option.value === state.sort
      )
    ) {
      elements.sortSelect.value = state.sort;
    }
  }

  function syncControlsToState() {
    if (elements.catalogSearch) {
      state.search = elements.catalogSearch.value.trim();
    } else if (elements.headerSearchInput) {
      state.search = elements.headerSearchInput.value.trim();
    }

    if (elements.headerSearchInput && elements.catalogSearch) {
      elements.headerSearchInput.value = state.search;
    }

    if (elements.catalogSearch && elements.headerSearchInput) {
      elements.catalogSearch.value = state.search;
    }

    state.minPrice = toFiniteNumber(elements.minPrice?.value);
    state.maxPrice = toFiniteNumber(elements.maxPrice?.value);

    state.inStockOnly = Boolean(elements.inStockOnly?.checked);

    state.sort = elements.sortSelect?.value || "";

    if (elements.categoryOptions) {
      const checkedCategories = Array.from(
        elements.categoryOptions.querySelectorAll(
          'input[name="category"]:checked'
        )
      ).map((input) => slugify(input.value));

      state.selectedCategories = new Set(checkedCategories);
    }
  }

  function updateURL() {
    const params = new URLSearchParams(window.location.search);

    [
      "q",
      "search",
      "category",
      "min",
      "minPrice",
      "max",
      "maxPrice",
      "sort",
      "stock",
      "page"
    ].forEach((key) => params.delete(key));

    if (state.search) {
      params.set("q", state.search);
    }

    if (state.selectedCategories.size > 0) {
      params.set(
        "category",
        Array.from(state.selectedCategories).join(",")
      );
    }

    if (state.minPrice !== null) {
      params.set("min", String(state.minPrice));
    }

    if (state.maxPrice !== null) {
      params.set("max", String(state.maxPrice));
    }

    if (state.sort) {
      params.set("sort", state.sort);
    }

    if (state.inStockOnly) {
      params.set("stock", "1");
    }

    if (state.currentPage > 1) {
      params.set("page", String(state.currentPage));
    }

    const query = params.toString();

    const nextURL = (
      window.location.pathname +
      (query ? `?${query}` : "") +
      window.location.hash
    );

    window.history.replaceState({}, "", nextURL);
  }

  function getActiveFilterCount() {
    let count = 0;

    if (state.search) count += 1;

    count += state.selectedCategories.size;

    if (state.minPrice !== null) count += 1;
    if (state.maxPrice !== null) count += 1;
    if (state.inStockOnly) count += 1;

    return count;
  }

  function renderActiveFilters() {
    if (elements.activeFilterCount) {
      const count = getActiveFilterCount();

      elements.activeFilterCount.textContent = String(count);
      elements.activeFilterCount.hidden = count === 0;
    }

    if (!elements.activeFilters) {
      return;
    }

    const chips = [];

    if (state.search) {
      chips.push(`
        <button
          type="button"
          class="shop-filter-chip"
          data-remove-filter="search"
          aria-label="Retirer la recherche"
        >
          Recherche : ${escapeHTML(state.search)}
          <span aria-hidden="true">&times;</span>
        </button>
      `);
    }

    const categoryLabels = new Map(
      getAvailableCategories().map((category) => [
        category.key,
        category.label
      ])
    );

    for (const categoryKey of state.selectedCategories) {
      const label = categoryLabels.get(categoryKey) || categoryKey;

      chips.push(`
        <button
          type="button"
          class="shop-filter-chip"
          data-remove-category="${escapeHTML(categoryKey)}"
          aria-label="Retirer la catégorie ${escapeHTML(label)}"
        >
          ${escapeHTML(label)}
          <span aria-hidden="true">&times;</span>
        </button>
      `);
    }

    if (state.minPrice !== null) {
      chips.push(`
        <button
          type="button"
          class="shop-filter-chip"
          data-remove-filter="min"
          aria-label="Retirer le prix minimum"
        >
          Dès ${escapeHTML(formatPrice(state.minPrice))}
          <span aria-hidden="true">&times;</span>
        </button>
      `);
    }

    if (state.maxPrice !== null) {
      chips.push(`
        <button
          type="button"
          class="shop-filter-chip"
          data-remove-filter="max"
          aria-label="Retirer le prix maximum"
        >
          Jusqu'à ${escapeHTML(formatPrice(state.maxPrice))}
          <span aria-hidden="true">&times;</span>
        </button>
      `);
    }

    if (state.inStockOnly) {
      chips.push(`
        <button
          type="button"
          class="shop-filter-chip"
          data-remove-filter="stock"
          aria-label="Retirer le filtre de disponibilité"
        >
          En stock
          <span aria-hidden="true">&times;</span>
        </button>
      `);
    }

    elements.activeFilters.innerHTML = chips.join("");
    elements.activeFilters.hidden = chips.length === 0;
  }

  function resetFilters() {
    state.search = "";
    state.minPrice = null;
    state.maxPrice = null;
    state.inStockOnly = false;
    state.selectedCategories.clear();
    state.currentPage = 1;

    if (elements.catalogSearch) {
      elements.catalogSearch.value = "";
    }

    if (elements.headerSearchInput) {
      elements.headerSearchInput.value = "";
    }

    if (elements.minPrice) {
      elements.minPrice.value = "";
    }

    if (elements.maxPrice) {
      elements.maxPrice.value = "";
    }

    if (elements.inStockOnly) {
      elements.inStockOnly.checked = false;
    }

    if (elements.sortSelect) {
      elements.sortSelect.selectedIndex = 0;
      state.sort = elements.sortSelect.value || "";
    }

    renderCategories();
    renderCatalogue();
  }

  /* ------------------------------------------------------------------------ */
  /* RECHERCHE, TRI ET FILTRES                                                */
  /* ------------------------------------------------------------------------ */

  function filterProducts(products) {
    const query = normalizeText(state.search);

    const min = state.minPrice;
    const max = state.maxPrice;

    return products.filter((product) => {
      if (
        query &&
        !product.searchableText.includes(query)
      ) {
        return false;
      }

      if (
        state.selectedCategories.size > 0 &&
        !state.selectedCategories.has(product.categoryKey)
      ) {
        return false;
      }

      if (min !== null) {
        if (product.price === null || product.price < min) {
          return false;
        }
      }

      if (max !== null) {
        if (product.price === null || product.price > max) {
          return false;
        }
      }

      if (
        state.inStockOnly &&
        product.inStock !== true
      ) {
        return false;
      }

      return true;
    });
  }

  function compareCreatedAt(first, second) {
    const firstTime = first.createdAt
      ? new Date(first.createdAt).getTime()
      : 0;

    const secondTime = second.createdAt
      ? new Date(second.createdAt).getTime()
      : 0;

    return (
      (Number.isFinite(secondTime) ? secondTime : 0) -
      (Number.isFinite(firstTime) ? firstTime : 0)
    );
  }

  function sortProducts(products) {
    const sorted = [...products];
    const sort = normalizeText(state.sort);

    switch (sort) {
      case "price-asc":
      case "price-low":
      case "price-low-to-high":
      case "price_asc":
        sorted.sort((first, second) => {
          if (first.price === null) return 1;
          if (second.price === null) return -1;

          return first.price - second.price;
        });
        break;

      case "price-desc":
      case "price-high":
      case "price-high-to-low":
      case "price_desc":
        sorted.sort((first, second) => {
          if (first.price === null) return 1;
          if (second.price === null) return -1;

          return second.price - first.price;
        });
        break;

      case "name-asc":
      case "name_asc":
      case "alphabetical":
        sorted.sort((first, second) => {
          return first.name.localeCompare(second.name, "fr");
        });
        break;

      case "name-desc":
      case "name_desc":
        sorted.sort((first, second) => {
          return second.name.localeCompare(first.name, "fr");
        });
        break;

      case "oldest":
        sorted.sort((first, second) => {
          return -compareCreatedAt(first, second);
        });
        break;

      case "newest":
      case "recent":
      case "created_at":
      default:
        sorted.sort(compareCreatedAt);
        break;
    }

    return sorted;
  }

  /* ------------------------------------------------------------------------ */
  /* CARTES PRODUITS                                                          */
  /* ------------------------------------------------------------------------ */

  function renderPrice(product) {
    if (product.price === null) {
      return `
        <div class="shop-product-card__price">
          <span class="shop-product-card__price-current">
            Prix indisponible
          </span>
        </div>
      `;
    }

    const currentPrice = formatPrice(
      product.price,
      product.currency
    );

    const previousPrice = (
      product.isOnSale &&
      product.regularPrice !== null &&
      product.regularPrice > product.price
    )
      ? formatPrice(product.regularPrice, product.currency)
      : "";

    return `
      <div class="shop-product-card__price">
        <span class="shop-product-card__price-current">
          ${escapeHTML(currentPrice)}
        </span>

        ${
          previousPrice
            ? `
              <span class="shop-product-card__price-old">
                ${escapeHTML(previousPrice)}
              </span>
              <span class="shop-product-card__sale-label">
                Offre
              </span>
            `
            : ""
        }
      </div>
    `;
  }

  function renderProductCard(product) {
    const productURL = (
      `product.html?id=${encodeURIComponent(String(product.id))}`
    );

    const categoryMarkup = product.category
      ? `
        <p class="shop-product-card__category">
          ${escapeHTML(product.category)}
        </p>
      `
      : "";

    const imageMarkup = product.image
      ? `
        <img
          class="shop-product-card__image"
          src="${escapeHTML(product.image)}"
          alt="${escapeHTML(product.imageAlt)}"
          loading="lazy"
          decoding="async"
        >
      `
      : `
        <span class="shop-product-card__image-fallback" aria-hidden="true">
          <i class="fa-regular fa-image"></i>
        </span>
      `;

    const stockMarkup = product.inStock === false
      ? `
        <span class="shop-product-card__stock shop-product-card__stock--out">
          Indisponible
        </span>
      `
      : "";

    return `
      <article
        class="shop-product-card product-card"
        data-product-id="${escapeHTML(product.id)}"
      >
        <a
          class="shop-product-card__media"
          href="${escapeHTML(productURL)}"
          aria-label="Voir ${escapeHTML(product.name)}"
        >
          ${imageMarkup}

          ${
            product.isOnSale
              ? `
                <span class="shop-product-card__badge">
                  Offre spéciale
                </span>
              `
              : ""
          }

          ${stockMarkup}
        </a>

        <div class="shop-product-card__content">
          ${categoryMarkup}

          <h3 class="shop-product-card__title">
            <a href="${escapeHTML(productURL)}">
              ${escapeHTML(product.name)}
            </a>
          </h3>

          ${
            product.shortDescription
              ? `
                <p class="shop-product-card__description">
                  ${escapeHTML(product.shortDescription)}
                </p>
              `
              : ""
          }

          ${renderPrice(product)}

          <div class="shop-product-card__actions">
            <a
              class="shop-product-card__view"
              href="${escapeHTML(productURL)}"
            >
              Voir le produit
              <i class="fa-solid fa-arrow-right" aria-hidden="true"></i>
            </a>

            <a
              class="shop-product-card__wishlist"
              href="wishlist.html"
              aria-label="Consulter la liste de souhaits"
              title="Liste de souhaits"
            >
              <i class="fa-regular fa-heart" aria-hidden="true"></i>
            </a>
          </div>
        </div>
      </article>
    `;
  }

  /* ------------------------------------------------------------------------ */
  /* PAGINATION                                                               */
  /* ------------------------------------------------------------------------ */

  function renderPagination(totalItems) {
    if (!elements.catalogPagination) {
      return;
    }

    const totalPages = Math.max(
      1,
      Math.ceil(totalItems / PAGE_SIZE)
    );

    state.currentPage = Math.min(
      Math.max(1, state.currentPage),
      totalPages
    );

    elements.catalogPagination.hidden = totalPages <= 1;

    if (elements.previousPage) {
      elements.previousPage.disabled = state.currentPage <= 1;
      elements.previousPage.setAttribute(
        "aria-label",
        "Page précédente"
      );
    }

    if (elements.nextPage) {
      elements.nextPage.disabled = state.currentPage >= totalPages;
      elements.nextPage.setAttribute(
        "aria-label",
        "Page suivante"
      );
    }

    if (!elements.paginationPages) {
      return;
    }

    const maxVisiblePages = 7;
    let startPage = Math.max(
      1,
      state.currentPage - Math.floor(maxVisiblePages / 2)
    );

    let endPage = Math.min(
      totalPages,
      startPage + maxVisiblePages - 1
    );

    startPage = Math.max(
      1,
      endPage - maxVisiblePages + 1
    );

    const buttons = [];

    if (startPage > 1) {
      buttons.push(`
        <button
          class="shop-pagination__page"
          type="button"
          data-page="1"
          aria-label="Page 1"
        >1</button>
      `);

      if (startPage > 2) {
        buttons.push(`
          <span class="shop-pagination__ellipsis" aria-hidden="true">
            …
          </span>
        `);
      }
    }

    for (let page = startPage; page <= endPage; page += 1) {
      const isCurrent = page === state.currentPage;

      buttons.push(`
        <button
          class="shop-pagination__page ${isCurrent ? "is-active" : ""}"
          type="button"
          data-page="${page}"
          ${isCurrent ? 'aria-current="page"' : ""}
          aria-label="Page ${page}"
        >
          ${page}
        </button>
      `);
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        buttons.push(`
          <span class="shop-pagination__ellipsis" aria-hidden="true">
            …
          </span>
        `);
      }

      buttons.push(`
        <button
          class="shop-pagination__page"
          type="button"
          data-page="${totalPages}"
          aria-label="Page ${totalPages}"
        >
          ${totalPages}
        </button>
      `);
    }

    elements.paginationPages.innerHTML = buttons.join("");
  }

  /* ------------------------------------------------------------------------ */
  /* GRILLE / LISTE                                                           */
  /* ------------------------------------------------------------------------ */

  function setView(view) {
    state.view = view === "list" ? "list" : "grid";

    if (elements.productGrid) {
      elements.productGrid.classList.toggle(
        "is-list-view",
        state.view === "list"
      );

      elements.productGrid.classList.toggle(
        "is-grid-view",
        state.view === "grid"
      );

      elements.productGrid.classList.toggle(
        "shop-product-grid--list",
        state.view === "list"
      );

      elements.productGrid.classList.toggle(
        "shop-product-grid--grid",
        state.view === "grid"
      );

      elements.productGrid.dataset.view = state.view;
    }

    if (elements.viewToggle) {
      elements.viewToggle.dataset.view = state.view;

      const isList = state.view === "list";

      elements.viewToggle.setAttribute(
        "aria-pressed",
        String(isList)
      );

      elements.viewToggle.setAttribute(
        "aria-label",
        isList
          ? "Passer à la vue en grille"
          : "Passer à la vue en liste"
      );

      elements.viewToggle.classList.toggle("is-active", isList);

      elements.viewToggle
        .querySelectorAll("[data-view]")
        .forEach((button) => {
          const active = button.dataset.view === state.view;

          button.classList.toggle("is-active", active);
          button.setAttribute("aria-pressed", String(active));
        });
    }
  }

  /* ------------------------------------------------------------------------ */
  /* RENDU DU CATALOGUE                                                       */
  /* ------------------------------------------------------------------------ */

  function renderCatalogue() {
    renderActiveFilters();

    const filtered = filterProducts(state.products);
    state.filteredProducts = sortProducts(filtered);

    const resultCount = state.filteredProducts.length;

    if (elements.resultsSummary) {
      elements.resultsSummary.textContent = (
        `${resultCount} produit${resultCount === 1 ? "" : "s"} trouvé` +
        `${resultCount === 1 ? "" : "s"}`
      );
    }

    if (resultCount === 0) {
      if (elements.productGrid) {
        elements.productGrid.innerHTML = "";
        elements.productGrid.hidden = true;
      }

      if (elements.catalogPagination) {
        elements.catalogPagination.hidden = true;
      }

      const hasActiveFilters = getActiveFilterCount() > 0;

      let title = hasActiveFilters
        ? "Aucun produit ne correspond à ces critères"
        : "Aucun produit disponible pour le moment";

      let message = hasActiveFilters
        ? "Modifie ta recherche ou enlève certains filtres pour voir davantage de produits."
        : "Le catalogue ne contient actuellement aucun produit public et actif.";

      if (
        state.inStockOnly &&
        !state.products.some((product) => product.inStock !== null)
      ) {
        title = "Les informations de stock sont indisponibles";
        message =
          "Les produits chargés ne contiennent pas de donnée de stock reconnue. " +
          "Désactive le filtre de disponibilité ou relie les données d'inventaire.";
      }

      showCatalogState({
        eyebrow: "CATALOGUE XELOS",
        title,
        message,
        buttonText: hasActiveFilters
          ? "Réinitialiser les filtres"
          : "Actualiser le catalogue"
      });

      setCatalogStatus(
        hasActiveFilters
          ? "Aucun produit ne correspond aux filtres actifs."
          : "Aucun produit public et actif n'a été trouvé."
      );

      updateURL();

      return;
    }

    hideCatalogState();

    if (elements.productGrid) {
      const start = (state.currentPage - 1) * PAGE_SIZE;
      const pageProducts = state.filteredProducts.slice(
        start,
        start + PAGE_SIZE
      );

      elements.productGrid.hidden = false;
      elements.productGrid.innerHTML = pageProducts
        .map(renderProductCard)
        .join("");
    }

    renderPagination(resultCount);
    setView(state.view);

    setCatalogStatus(
      `${resultCount} produit${resultCount === 1 ? "" : "s"} disponible${resultCount === 1 ? "" : "s"}.`
    );

    updateURL();
  }

  /* ------------------------------------------------------------------------ */
  /* CHARGEMENT INITIAL                                                       */
  /* ------------------------------------------------------------------------ */

  async function loadCatalogue() {
    if (state.loading) {
      return;
    }

    state.loading = true;
    state.loadError = null;

    renderLoadingSkeletons();

    try {
      /*
       * Les produits sont prioritaires : si cette requête échoue,
       * le catalogue ne peut pas être rendu correctement.
       */
      const productRows = await selectAllRows("products", {
        maxRows: CATALOG_LIMITS.products,
        limit: CATALOG_LIMITS.queryPageSize,
        orderBy: "created_at",
        ascending: false
      });

      /*
       * Les médias et les prix sont chargés séparément.
       * Une erreur dans l'une de ces tables n'empêche pas d'afficher
       * les produits qui sont accessibles.
       */
      const [mediaRows, priceRows] = await Promise.all([
        selectOptionalTable("product_media", {
          maxRows: CATALOG_LIMITS.media,
          limit: CATALOG_LIMITS.queryPageSize,
          orderBy: "position",
          ascending: true
        }),

        selectOptionalTable("product_prices", {
          maxRows: CATALOG_LIMITS.prices,
          limit: CATALOG_LIMITS.queryPageSize,
          orderBy: "starts_at",
          ascending: false
        })
      ]);

      const publicRows = productRows.filter(isPublicProduct);

      state.rawCounts = {
        products: productRows.length,
        publicProducts: publicRows.length,
        media: mediaRows.length,
        prices: priceRows.length
      };

      state.products = normalizeProductRows(
        productRows,
        mediaRows,
        priceRows
      );

      console.info("[XELOS] Diagnostic du catalogue :", {
        ...state.rawCounts,
        normalizedProducts: state.products.length,
        statuses: [
          ...new Set(
            productRows.map((product) => String(product.status ?? "(absent)"))
          )
        ],
        visibilities: [
          ...new Set(
            productRows.map((product) => String(product.visibility ?? "(absent)"))
          )
        ]
      });

      renderCategories();

      const params = new URLSearchParams(window.location.search);
      const pageFromURL = Number.parseInt(params.get("page") || "1", 10);

      state.currentPage = (
        Number.isInteger(pageFromURL) && pageFromURL > 0
      )
        ? pageFromURL
        : 1;

      /*
       * Les commandes de filtre sont synchronisées après le rendu des
       * catégories. Cela permet de restaurer une catégorie présente dans l'URL.
       */
      if (elements.categoryOptions) {
        elements.categoryOptions
          .querySelectorAll('input[name="category"]')
          .forEach((input) => {
            input.checked = state.selectedCategories.has(
              slugify(input.value)
            );
          });
      }

      renderCatalogue();

      if (state.products.length === 0) {
        console.warn(
          "[XELOS] Aucune ligne de produit visible. " +
          "Vérifier les données, status, visibility et les politiques RLS."
        );
      }
    } catch (error) {
      state.loadError = error;

      console.error(
        "[XELOS] Échec du chargement des produits :",
        getErrorDetails(error)
      );

      if (elements.productGrid) {
        elements.productGrid.innerHTML = "";
        elements.productGrid.hidden = true;
      }

      if (elements.catalogPagination) {
        elements.catalogPagination.hidden = true;
      }

      if (elements.resultsSummary) {
        elements.resultsSummary.textContent =
          "Le catalogue n'a pas pu être chargé.";
      }

      showCatalogState({
        eyebrow: "ERREUR DE CHARGEMENT",
        title: "Impossible de charger le catalogue",
        message:
          "Vérifie la connexion à Supabase, le nom de la table products " +
          "et les politiques RLS. Les détails techniques sont disponibles " +
          "dans la console du navigateur.",
        buttonText: "Réessayer",
        isError: true
      });

      setCatalogStatus(
        "Erreur : le catalogue n'a pas pu être chargé."
      );
    } finally {
      state.loading = false;
    }
  }

  /* ------------------------------------------------------------------------ */
  /* ÉVÉNEMENTS                                                               */
  /* ------------------------------------------------------------------------ */

  function applyCurrentFilters() {
    syncControlsToState();

    state.currentPage = 1;

    /*
     * Une fourchette incorrecte ne doit pas donner un résultat trompeur.
     */
    if (
      state.minPrice !== null &&
      state.maxPrice !== null &&
      state.minPrice > state.maxPrice
    ) {
      showCatalogState({
        eyebrow: "FILTRES",
        title: "Fourchette de prix invalide",
        message:
          "Le prix minimum ne peut pas être supérieur au prix maximum. " +
          "Corrige les montants puis réessaie.",
        buttonText: "Réinitialiser les filtres"
      });

      return;
    }

    renderCatalogue();

    if (
      elements.catalogFilters &&
      window.matchMedia("(max-width: 760px)").matches
    ) {
      elements.catalogFilters.classList.remove("is-open");

      if (elements.filterToggle) {
        elements.filterToggle.setAttribute("aria-expanded", "false");
      }
    }
  }

  function bindEvents() {
    if (elements.menuToggle && elements.primaryNavigation) {
      elements.menuToggle.addEventListener("click", () => {
        const isExpanded =
          elements.menuToggle.getAttribute("aria-expanded") === "true";

        elements.menuToggle.setAttribute(
          "aria-expanded",
          String(!isExpanded)
        );

        elements.primaryNavigation.classList.toggle(
          "is-open",
          !isExpanded
        );

        document.body.classList.toggle(
          "shop-menu-open",
          !isExpanded
        );
      });

      elements.primaryNavigation
        .querySelectorAll("a")
        .forEach((link) => {
          link.addEventListener("click", () => {
            elements.menuToggle.setAttribute("aria-expanded", "false");
            elements.primaryNavigation.classList.remove("is-open");
            document.body.classList.remove("shop-menu-open");
          });
        });
    }

    if (elements.headerSearch) {
      elements.headerSearch.addEventListener("submit", (event) => {
        event.preventDefault();

        const value = elements.headerSearchInput?.value.trim() || "";

        if (elements.catalogSearch) {
          elements.catalogSearch.value = value;
        }

        state.search = value;
        state.currentPage = 1;

        renderCatalogue();
      });
    }

    if (elements.catalogSearch) {
      elements.catalogSearch.addEventListener("input", () => {
        state.search = elements.catalogSearch.value.trim();

        if (elements.headerSearchInput) {
          elements.headerSearchInput.value = state.search;
        }

        state.currentPage = 1;
        renderCatalogue();
      });
    }

    if (elements.filterToggle && elements.catalogFilters) {
      elements.filterToggle.addEventListener("click", () => {
        const isOpen =
          elements.catalogFilters.classList.toggle("is-open");

        elements.filterToggle.setAttribute(
          "aria-expanded",
          String(isOpen)
        );
      });
    }

    if (elements.clearFilters) {
      elements.clearFilters.addEventListener("click", resetFilters);
    }

    if (elements.applyFilters) {
      elements.applyFilters.addEventListener(
        "click",
        applyCurrentFilters
      );
    }

    if (elements.catalogFilters) {
      elements.catalogFilters.addEventListener("submit", (event) => {
        event.preventDefault();
        applyCurrentFilters();
      });

      elements.catalogFilters.addEventListener("change", (event) => {
        if (
          event.target.matches('input[name="category"]') ||
          event.target === elements.inStockOnly ||
          event.target === elements.sortSelect
        ) {
          applyCurrentFilters();
        }
      });
    }

    [elements.minPrice, elements.maxPrice].forEach((input) => {
      if (!input) {
        return;
      }

      input.addEventListener("change", applyCurrentFilters);

      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          applyCurrentFilters();
        }
      });
    });

    if (elements.viewToggle) {
      elements.viewToggle.addEventListener("click", (event) => {
        const specificButton = event.target.closest("[data-view]");

        if (specificButton && elements.viewToggle.contains(specificButton)) {
          const requestedView = specificButton.dataset.view;

          if (requestedView === "grid" || requestedView === "list") {
            setView(requestedView);
            return;
          }
        }

        setView(state.view === "grid" ? "list" : "grid");
      });
    }

    if (elements.previousPage) {
      elements.previousPage.addEventListener("click", () => {
        if (state.currentPage <= 1) {
          return;
        }

        state.currentPage -= 1;
        renderCatalogue();
      });
    }

    if (elements.nextPage) {
      elements.nextPage.addEventListener("click", () => {
        const totalPages = Math.max(
          1,
          Math.ceil(state.filteredProducts.length / PAGE_SIZE)
        );

        if (state.currentPage >= totalPages) {
          return;
        }

        state.currentPage += 1;
        renderCatalogue();
      });
    }

    if (elements.paginationPages) {
      elements.paginationPages.addEventListener("click", (event) => {
        const button = event.target.closest("[data-page]");

        if (!button) {
          return;
        }

        const page = Number.parseInt(button.dataset.page, 10);

        if (!Number.isInteger(page) || page < 1) {
          return;
        }

        state.currentPage = page;
        renderCatalogue();
      });
    }

    if (elements.activeFilters) {
      elements.activeFilters.addEventListener("click", (event) => {
        const categoryButton = event.target.closest("[data-remove-category]");

        if (categoryButton) {
          state.selectedCategories.delete(
            slugify(categoryButton.dataset.removeCategory)
          );

          renderCategories();
          renderCatalogue();

          return;
        }

        const filterButton = event.target.closest("[data-remove-filter]");

        if (!filterButton) {
          return;
        }

        const filter = filterButton.dataset.removeFilter;

        if (filter === "search") {
          state.search = "";

          if (elements.catalogSearch) {
            elements.catalogSearch.value = "";
          }

          if (elements.headerSearchInput) {
            elements.headerSearchInput.value = "";
          }
        }

        if (filter === "min") {
          state.minPrice = null;

          if (elements.minPrice) {
            elements.minPrice.value = "";
          }
        }

        if (filter === "max") {
          state.maxPrice = null;

          if (elements.maxPrice) {
            elements.maxPrice.value = "";
          }
        }

        if (filter === "stock") {
          state.inStockOnly = false;

          if (elements.inStockOnly) {
            elements.inStockOnly.checked = false;
          }
        }

        state.currentPage = 1;
        renderCatalogue();
      });
    }

    if (elements.stateReset) {
      elements.stateReset.addEventListener("click", () => {
        if (state.loadError) {
          loadCatalogue();
          return;
        }

        if (
          getActiveFilterCount() > 0 ||
          elements.catalogState?.classList.contains("is-error")
        ) {
          resetFilters();
          return;
        }

        loadCatalogue();
      });
    }

    window.addEventListener("popstate", () => {
      readURLParameters();
      renderCategories();

      if (elements.categoryOptions) {
        elements.categoryOptions
          .querySelectorAll('input[name="category"]')
          .forEach((input) => {
            input.checked = state.selectedCategories.has(
              slugify(input.value)
            );
          });
      }

      state.currentPage = 1;
      renderCatalogue();
    });
  }

  /* ------------------------------------------------------------------------ */
  /* DÉMARRAGE                                                                */
  /* ------------------------------------------------------------------------ */

  if (elements.currentYear) {
    elements.currentYear.textContent = String(
      new Date().getFullYear()
    );
  }

  readURLParameters();
  bindEvents();
  setView("grid");

  void initHeaderAuthentication();
  void loadCatalogue();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initShop, { once: true });
} else {
  initShop();
}
