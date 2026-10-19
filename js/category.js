
/**
 * XELOS — Page des catégories
 * Fichier : js/category.js
 *
 * Chargement réel depuis Supabase via js/data.js.
 * Les permissions restent gérées par Supabase et les règles RLS.
 */

import { selectRows } from "./data.js";
import { supabase } from "./core/supabase.js";

const CATEGORY_PAGE_CONFIG = Object.freeze({
  productsPerPage: 9,
  currency: "USD",
  productDataEvent: "xelos:catalog-data",
  categoryDataEvent: "xelos:categories-data",
  pageSize: 500
});

const categoryState = {
  categories: [],
  products: [],
  selectedSlug: new URLSearchParams(window.location.search).get("slug") || "",
  search: "",
  minPrice: "",
  maxPrice: "",
  availableOnly: false,
  sort: "recommended",
  page: 1,
  view: "grid",
  dataReceived: false,
  loading: false,
  loadError: false
};

const elements = {};

document.addEventListener("DOMContentLoaded", initializeCategoryPage);

/* =========================================================
   INITIALISATION
========================================================= */

async function initializeCategoryPage() {
  cacheElements();
  bindEvents();
  setCurrentYear();
  initializeHeaderSearch();
  initializeMobileNavigation();
  initializeViewControls();
  exposeDataInterface();

  renderCategoryNavigation();
  renderCategoryTiles();
  renderCategoryFilters();
  renderProducts();
  updateCategoryHeading();
  updateCategoryStatus();

  await Promise.allSettled([
    loadCatalogue(),
    initializeHeaderActions()
  ]);
}

function cacheElements() {
  const ids = [
    "mobile-menu-button",
    "primary-navigation",
    "current-year",
    "header-search-form",
    "header-search-input",
    "shopHeaderActions",
    "category-quick-nav",
    "category-nav-status",
    "category-feature-grid",
    "category-loading",
    "category-data-note",
    "category-heading",
    "selected-category-description",
    "category-filter-list",
    "product-search",
    "price-min",
    "price-max",
    "available-only",
    "apply-filters",
    "reset-filters",
    "product-sort",
    "category-product-grid",
    "result-count",
    "result-count-label",
    "active-filter-list",
    "catalog-pagination",
    "previous-page",
    "next-page",
    "pagination-pages"
  ];

  for (const id of ids) {
    elements[id] = document.getElementById(id);
  }
}

function bindEvents() {
  elements["category-quick-nav"]?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category-slug]");
    if (!button) return;

    selectCategory(button.dataset.categorySlug || "");
  });

  elements["category-filter-list"]?.addEventListener("change", (event) => {
    if (event.target.name !== "category-filter") return;

    selectCategory(event.target.value || "");
  });

  elements["product-search"]?.addEventListener("input", (event) => {
    categoryState.search = event.target.value.trim();
    categoryState.page = 1;
    renderProducts();
  });

  elements["price-min"]?.addEventListener("input", validatePriceInputs);
  elements["price-max"]?.addEventListener("input", validatePriceInputs);

  elements["available-only"]?.addEventListener("change", (event) => {
    categoryState.availableOnly = event.target.checked;
    categoryState.page = 1;
    renderProducts();
  });

  elements["apply-filters"]?.addEventListener("click", () => {
    if (!validatePriceInputs()) return;

    categoryState.minPrice = elements["price-min"]?.value.trim() || "";
    categoryState.maxPrice = elements["price-max"]?.value.trim() || "";
    categoryState.page = 1;

    renderProducts();
  });

  elements["reset-filters"]?.addEventListener("click", resetFilters);

  elements["product-sort"]?.addEventListener("change", (event) => {
    categoryState.sort = event.target.value || "recommended";
    categoryState.page = 1;
    renderProducts();
  });

  elements["previous-page"]?.addEventListener("click", () => {
    if (categoryState.page <= 1) return;

    categoryState.page -= 1;
    renderProducts();
    scrollToProductResults();
  });

  elements["next-page"]?.addEventListener("click", () => {
    if (categoryState.page >= getTotalPages()) return;

    categoryState.page += 1;
    renderProducts();
    scrollToProductResults();
  });

  elements["pagination-pages"]?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-page]");
    if (!button) return;

    const page = Number(button.dataset.page);
    if (!Number.isInteger(page) || page < 1 || page > getTotalPages()) {
      return;
    }

    categoryState.page = page;
    renderProducts();
    scrollToProductResults();
  });

  window.addEventListener(CATEGORY_PAGE_CONFIG.productDataEvent, (event) => {
    const products = event.detail?.products;
    if (!Array.isArray(products)) return;

    categoryState.products = products.map(normalizeProduct);
    categoryState.dataReceived = true;
    categoryState.loadError = false;
    categoryState.page = 1;

    refreshCategoryInterface();
  });

  window.addEventListener(CATEGORY_PAGE_CONFIG.categoryDataEvent, (event) => {
    const categories = event.detail?.categories;
    if (!Array.isArray(categories)) return;

    categoryState.categories = categories.map(normalizeCategory);
    refreshCategoryInterface();
  });
}

function initializeViewControls() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === categoryState.view;

    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));

    button.addEventListener("click", () => {
      categoryState.view = button.dataset.view === "list" ? "list" : "grid";

      document.querySelectorAll("[data-view]").forEach((item) => {
        const isActive = item.dataset.view === categoryState.view;
        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-pressed", String(isActive));
      });

      elements["category-product-grid"]?.classList.toggle(
        "is-list",
        categoryState.view === "list"
      );
    });
  });
}

function refreshCategoryInterface() {
  renderCategoryNavigation();
  renderCategoryTiles();
  renderCategoryFilters();
  renderProducts();
  updateCategoryHeading();
  updateCategoryStatus();
}

/* =========================================================
   CHARGEMENT SUPABASE
========================================================= */

/**
 * Charge les tables indépendamment :
 * l'absence d'une table secondaire ne bloque pas les produits.
 */
async function loadCatalogue() {
  if (categoryState.loading) return;

  categoryState.loading = true;
  categoryState.loadError = false;
  setLoadingState(true);

  try {
    const results = await Promise.allSettled([
      loadAllRows("products", {
        orderBy: "created_at",
        ascending: false
      }),
      loadAllRows("categories"),
      loadAllRows("product_media", {
        orderBy: "position",
        ascending: true
      }),
      loadAllRows("product_prices", {
        orderBy: "starts_at",
        ascending: false
      }),
      loadAllRows("product_categories")
    ]);

    const productsResult = results[0];
    const categoriesResult = results[1];
    const mediaResult = results[2];
    const pricesResult = results[3];
    const relationsResult = results[4];

    if (productsResult.status === "rejected") {
      throw productsResult.reason;
    }

    const rawProducts = productsResult.value || [];
    const rawCategories = resultValue(categoriesResult);
    const rawMedia = resultValue(mediaResult);
    const rawPrices = resultValue(pricesResult);
    const rawRelations = resultValue(relationsResult);

    const categories = rawCategories.map(normalizeCategory);

    const mediaByProduct = groupByProduct(rawMedia);
    const pricesByProduct = groupPricesByProduct(rawPrices);
    const categoryByProduct = buildProductCategoryMap(rawRelations);

    categoryState.categories = categories;

    categoryState.products = rawProducts
      .filter(isPublicProduct)
      .map((product) => {
        const productId = String(product.id ?? "");
        const media = mediaByProduct.get(productId) || [];
        const prices = pricesByProduct.get(productId) || [];

        const relationCategory = categoryByProduct.get(productId);
        const directCategory = findDirectCategory(product, categories);

        const category = relationCategory
          ? categories.find(
              (item) => String(item.id) === String(relationCategory)
            ) || null
          : directCategory;

        return normalizeProduct(
          product,
          media,
          prices,
          category
        );
      });

    categoryState.dataReceived = true;
    categoryState.loadError = false;

    console.info("[XELOS] Catalogue chargé", {
      productsReceived: rawProducts.length,
      publicProducts: categoryState.products.length,
      categoriesReceived: rawCategories.length,
      mediaReceived: rawMedia.length,
      pricesReceived: rawPrices.length,
      categoryRelationsReceived: rawRelations.length
    });

    if (categoriesResult.status === "rejected") {
      console.warn(
        "[XELOS] Chargement des catégories impossible :",
        categoriesResult.reason
      );
    }

    if (mediaResult.status === "rejected") {
      console.warn(
        "[XELOS] Chargement des images impossible :",
        mediaResult.reason
      );
    }

    if (pricesResult.status === "rejected") {
      console.warn(
        "[XELOS] Chargement des prix impossible :",
        pricesResult.reason
      );
    }

    if (relationsResult.status === "rejected") {
      console.warn(
        "[XELOS] Relations produit-catégorie indisponibles. ",
        "Le script utilisera les catégories directement présentes sur les produits."
      );
    }

    refreshCategoryInterface();
  } catch (error) {
    categoryState.dataReceived = false;
    categoryState.loadError = true;

    console.error("[XELOS] Échec du chargement du catalogue :", {
      message: error?.message,
      code: error?.code,
      details: error?.details,
      hint: error?.hint
    });

    updateCategoryStatus();
    renderCategoryTiles();
    renderProducts();
  } finally {
    categoryState.loading = false;
    setLoadingState(false);
  }
}

/**
 * selectRows limite chaque requête à 500 lignes.
 * La pagination par offset permet de récupérer les pages suivantes.
 */
async function loadAllRows(table, options = {}) {
  const rows = [];
  let offset = 0;

  while (true) {
    const batch = await selectRows(table, {
      limit: CATEGORY_PAGE_CONFIG.pageSize,
      offset,
      ...options
    });

    if (!Array.isArray(batch)) {
      throw new TypeError(
        `La requête ${table} n'a pas retourné un tableau.`
      );
    }

    rows.push(...batch);

    if (batch.length < CATEGORY_PAGE_CONFIG.pageSize) {
      break;
    }

    offset += batch.length;
  }

  return rows;
}

function resultValue(result) {
  return result.status === "fulfilled" && Array.isArray(result.value)
    ? result.value
    : [];
}

function isPublicProduct(product) {
  if (!product || product.id == null) return false;

  const status = safeString(product.status).toLowerCase();
  const visibility = safeString(product.visibility).toLowerCase();

  // Si ces colonnes existent, respecter les valeurs de publication.
  if (status && status !== "active") return false;

  if (
    visibility &&
    !["public"].includes(visibility)
  ) {
    return false;
  }

  return true;
}

function groupByProduct(rows) {
  const map = new Map();

  for (const row of rows) {
    const productId = row.product_id;
    if (productId == null) continue;

    const key = String(productId);

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key).push(row);
  }

  return map;
}

function groupPricesByProduct(rows) {
  const map = new Map();
  const now = Date.now();

  for (const row of rows) {
    if (row.product_id == null) continue;
    if (row.is_active === false) continue;

    const start = row.starts_at ? Date.parse(row.starts_at) : null;
    const end = row.ends_at ? Date.parse(row.ends_at) : null;

    if (start !== null && Number.isFinite(start) && start > now) continue;
    if (end !== null && Number.isFinite(end) && end <= now) continue;

    const type = safeString(row.price_type).toLowerCase();

    if (!["regular", "sale", "compare_at"].includes(type)) continue;

    const key = String(row.product_id);

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key).push(row);
  }

  return map;
}

function buildProductCategoryMap(relations) {
  const map = new Map();

  for (const relation of relations) {
    const productId = relation.product_id;
    const categoryId = relation.category_id;

    if (productId == null || categoryId == null) continue;

    const key = String(productId);

    if (!map.has(key)) {
      map.set(key, categoryId);
    }
  }

  return map;
}

function findDirectCategory(product, categories) {
  const categoryId =
    product.category_id ??
    product.primary_category_id ??
    product.categoryId;

  if (categoryId != null) {
    const found = categories.find(
      (category) => String(category.id) === String(categoryId)
    );

    if (found) return found;
  }

  const slug = safeString(
    product.category_slug ?? product.categorySlug
  ).toLowerCase();

  if (slug) {
    const found = categories.find(
      (category) => category.slug.toLowerCase() === slug
    );

    if (found) return found;
  }

  const name = safeString(
    product.category_name ?? product.categoryName
  ).toLowerCase();

  if (name) {
    return categories.find(
      (category) => category.name.toLowerCase() === name
    ) || null;
  }

  return null;
}

function setLoadingState(loading) {
  const loader = elements["category-loading"];
  const grid = elements["category-product-grid"];

  if (loader) {
    loader.hidden = !loading;
    loader.setAttribute("aria-hidden", String(!loading));
  }

  if (grid) {
    grid.setAttribute("aria-busy", String(loading));
  }

  if (loading) {
    updateCategoryStatus("Chargement du catalogue XELOS…");
  }
}

/* =========================================================
   NORMALISATION DES DONNÉES
========================================================= */

function normalizeCategory(category) {
  const id = category?.id ?? "";

  const name = safeString(
    category?.name ??
    category?.title ??
    category?.label
  );

  const slug = safeString(
    category?.slug ??
    category?.handle
  );

  const image = safeString(
    category?.image_url ??
    category?.cover_image_url ??
    category?.image ??
    category?.coverImage ??
    category?.thumbnail_url
  );

  const description = safeString(
    category?.description ??
    category?.short_description
  );

  const count = category?.product_count ?? category?.productCount;

  return {
    id,
    name,
    slug,
    description,
    image,
    productCount:
      count !== null &&
      count !== undefined &&
      count !== "" &&
      Number.isFinite(Number(count))
        ? Number(count)
        : null
  };
}

function normalizeProduct(
  product,
  mediaRows = [],
  priceRows = [],
  category = null
) {
  const priceInfo = getProductPrices(product, priceRows);

  const media = [...mediaRows].sort((a, b) => {
    if (a.is_primary === true && b.is_primary !== true) return -1;
    if (b.is_primary === true && a.is_primary !== true) return 1;

    return Number(a.position ?? 0) - Number(b.position ?? 0);
  });

  const selectedMedia = media.find((item) =>
    item.is_active !== false &&
    safeString(item.media_type || "image").toLowerCase() === "image" &&
    safeString(item.url || item.thumbnail_url)
  );

  const image = safeString(
    product?.image_url ??
    product?.thumbnail_url ??
    product?.image ??
    selectedMedia?.url ??
    selectedMedia?.thumbnail_url ??
    ""
  );

  const productName = safeString(
    product?.name ??
    product?.title
  );

  const description = safeString(
    product?.short_description ??
    product?.description
  );

  const createdAtValue =
    product?.created_at ??
    product?.createdAt ??
    "";

  const createdAt = createdAtValue
    ? Date.parse(createdAtValue)
    : 0;

  const ratingValue = nullableNumber(
    product?.rating ??
    product?.average_rating
  );

  const reviewCountValue = nullableNumber(
    product?.review_count ??
    product?.reviews_count
  );

  const popularityValue = nullableNumber(
    product?.popularity ??
    product?.view_count ??
    product?.sales_count
  );

  const directCategory = category || {
    id: product?.category_id ?? "",
    name: safeString(
      product?.category_name ??
      product?.categoryName
    ),
    slug: safeString(
      product?.category_slug ??
      product?.categorySlug
    )
  };

  return {
    id: product?.id ?? "",
    name: productName,
    slug: safeString(product?.slug ?? product?.handle),
    description,
    image,
    categoryId: directCategory?.id ?? product?.category_id ?? "",
    categoryName: safeString(directCategory?.name),
    categorySlug: safeString(directCategory?.slug),
    price: priceInfo.price,
    compareAtPrice: priceInfo.compareAtPrice,
    currency: priceInfo.currency,
    available: getAvailability(product),
    rating: ratingValue !== null && ratingValue > 0
      ? ratingValue
      : null,
    reviewCount: reviewCountValue ?? 0,
    popularity: popularityValue ?? 0,
    createdAt: Number.isFinite(createdAt) ? createdAt : 0
  };
}

function getProductPrices(product, priceRows) {
  const currency = safeString(
    product?.currency_code ??
    product?.currency ??
    priceRows.find((row) => row.currency_code)?.currency_code ??
    CATEGORY_PAGE_CONFIG.currency
  ).toUpperCase();

  const regularPrices = priceRows.filter(
    (row) => row.price_type === "regular"
  );

  const salePrices = priceRows.filter(
    (row) => row.price_type === "sale"
  );

  const comparePrices = priceRows.filter(
    (row) => row.price_type === "compare_at"
  );

  const regular = choosePrice(regularPrices);
  const sale = choosePrice(salePrices);
  const compareAt = choosePrice(comparePrices);

  // Certains catalogues conservent le prix directement sur products.
  const directPrice = firstValidNumber(
    product?.price,
    product?.sale_price,
    product?.regular_price
  );

  const directCompareAt = firstValidNumber(
    product?.compare_at_price,
    product?.compareAtPrice
  );

  const activePrice = sale ?? regular ?? directPrice;

  return {
    price: activePrice,
    compareAtPrice: compareAt ?? directCompareAt,
    currency
  };
}

function choosePrice(rows) {
  const valid = rows
    .map((row) => ({
      amount: nullableNumber(row.amount),
      row
    }))
    .filter((entry) => entry.amount !== null && entry.amount >= 0);

  if (!valid.length) return null;

  // Le premier prix est le plus récent selon l'ordre de starts_at.
  return valid[0].amount;
}

function firstValidNumber(...values) {
  for (const value of values) {
    const number = nullableNumber(value);

    if (number !== null && number >= 0) {
      return number;
    }
  }

  return null;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getAvailability(product) {
  // Ne pas inventer de disponibilité quand le stock n'est pas fourni.
  if (typeof product?.available === "boolean") {
    return product.available;
  }

  if (typeof product?.is_available === "boolean") {
    return product.is_available;
  }

  if (typeof product?.in_stock === "boolean") {
    return product.in_stock;
  }

  if (typeof product?.stock_quantity === "number") {
    return product.stock_quantity > 0;
  }

  if (typeof product?.quantity_available === "number") {
    return product.quantity_available > 0;
  }

  const status = safeString(product?.status).toLowerCase();

  if (status === "out_of_stock" || status === "unavailable") {
    return false;
  }

  // En l'absence d'information de stock, on n'affirme pas que
  // le produit est disponible.
  return false;
}

function safeString(value) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }

  return "";
}

/* =========================================================
   RECHERCHE ET NAVIGATION
========================================================= */

function setCurrentYear() {
  if (elements["current-year"]) {
    elements["current-year"].textContent =
      String(new Date().getFullYear());
  }
}

function initializeHeaderSearch() {
  elements["header-search-form"]?.addEventListener("submit", (event) => {
    event.preventDefault();

    const query = elements["header-search-input"]?.value.trim();
    if (!query) return;

    window.location.href = `search.html?q=${encodeURIComponent(query)}`;
  });
}

function initializeMobileNavigation() {
  const button = elements["mobile-menu-button"];
  const navigation = elements["primary-navigation"];

  if (!button || !navigation) return;

  button.addEventListener("click", () => {
    const isOpen = button.getAttribute("aria-expanded") === "true";

    button.setAttribute("aria-expanded", String(!isOpen));
    button.setAttribute(
      "aria-label",
      isOpen ? "Ouvrir le menu" : "Fermer le menu"
    );

    navigation.classList.toggle("is-open", !isOpen);
  });

  navigation.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", "Ouvrir le menu");
      navigation.classList.remove("is-open");
    });
  });
}

function syncCategoryURL() {
  const url = new URL(window.location.href);

  if (categoryState.selectedSlug) {
    url.searchParams.set("slug", categoryState.selectedSlug);
  } else {
    url.searchParams.delete("slug");
  }

  window.history.replaceState({}, "", url);
}

function selectCategory(slug) {
  categoryState.selectedSlug = slug;
  categoryState.page = 1;

  syncCategoryURL();
  renderCategoryNavigation();
  renderCategoryFilters();
  renderCategoryTiles();
  renderProducts();
  updateCategoryHeading();
}

/* =========================================================
   HEADER — COMPTE ET PANIER
========================================================= */

async function initializeHeaderActions() {
  const container = elements["shopHeaderActions"];
  if (!container) return;

  try {
    const { data, error } = await supabase.auth.getSession();

    if (error) throw error;

    renderHeaderActions(Boolean(data?.session?.user));
  } catch (error) {
    console.error("[XELOS] Vérification du compte impossible :", error);
    renderHeaderActions(false);
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    renderHeaderActions(Boolean(session?.user));
  });
}

function renderHeaderActions(isAuthenticated) {
  const container = elements["shopHeaderActions"];
  if (!container) return;

  container.replaceChildren();

  if (isAuthenticated) {
    container.append(
      createHeaderLink(
        "account.html",
        "Mon compte",
        "fa-solid fa-user"
      ),
      createHeaderLink(
        "cart.html",
        "Panier",
        "fa-solid fa-cart-shopping"
      )
    );
  } else {
    container.append(
      createHeaderLink(
        "login.html",
        "Connexion",
        "fa-solid fa-right-to-bracket"
      ),
      createHeaderLink(
        "signup.html",
        "Créer un compte",
        "fa-solid fa-user-plus"
      )
    );
  }
}

function createHeaderLink(href, label, iconClass) {
  const link = document.createElement("a");
  link.href = href;
  link.className = "shop-header__action";
  link.setAttribute("aria-label", label);
  link.title = label;

  const icon = document.createElement("i");
  icon.className = iconClass;
  icon.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.textContent = label;

  link.append(icon, text);
  return link;
}

/* =========================================================
   CATÉGORIES
========================================================= */

function getSelectedCategory() {
  return categoryState.categories.find(
    (category) => category.slug === categoryState.selectedSlug
  ) || null;
}

function updateCategoryHeading() {
  const category = getSelectedCategory();

  if (elements["category-heading"]) {
    elements["category-heading"].textContent = category
      ? `Explorer ${category.name}`
      : "Explorez par univers.";
  }

  if (elements["selected-category-description"]) {
    elements["selected-category-description"].textContent =
      category?.description ||
      "Parcourez les produits disponibles dans les catégories XELOS.";
  }
}

function updateCategoryStatus(message = "") {
  const status = elements["category-nav-status"];

  if (status) {
    if (message) {
      status.textContent = message;
    } else if (categoryState.loading) {
      status.textContent = "Chargement des catégories…";
    } else if (categoryState.loadError) {
      status.textContent =
        "Impossible de charger le catalogue. Vérifiez la connexion Supabase et la console.";
    } else if (categoryState.categories.length) {
      status.textContent =
        `${categoryState.categories.length} catégorie(s) à explorer`;
    } else if (categoryState.dataReceived) {
      status.textContent = "Aucune catégorie n'est actuellement disponible.";
    } else {
      status.textContent = "Connexion au catalogue XELOS…";
    }
  }

  const note = elements["category-data-note"];

  if (note && categoryState.loadError) {
    note.hidden = false;
    note.textContent =
      "Le catalogue n'a pas pu être chargé. Vérifiez les tables, les permissions RLS et les erreurs dans la console.";
  } else if (note) {
    note.hidden = true;
  }
}

function renderCategoryNavigation() {
  const container = elements["category-quick-nav"];
  if (!container) return;

  container.replaceChildren();

  container.append(createCategoryChip("", "Tout explorer"));

  categoryState.categories.forEach((category) => {
    if (!category.name || !category.slug) return;

    container.append(
      createCategoryChip(category.slug, category.name)
    );
  });

  const status = document.createElement("p");
  status.className = "category-nav-status";
  status.id = "category-nav-status";
  status.setAttribute("aria-live", "polite");

  container.append(status);
  elements["category-nav-status"] = status;
  updateCategoryStatus();
}

function createCategoryChip(slug, name) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "category-chip";
  button.dataset.categorySlug = slug;

  const active = slug === categoryState.selectedSlug;

  button.classList.toggle("is-active", active);
  button.setAttribute("aria-pressed", String(active));

  const label = document.createElement("span");
  label.textContent = name;

  const arrow = document.createElement("span");
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "↗";

  button.append(label, arrow);
  return button;
}

function renderCategoryTiles() {
  const container = elements["category-feature-grid"];
  if (!container) return;

  container.replaceChildren();

  if (!categoryState.categories.length) {
    const empty = document.createElement("div");
    empty.className = "category-empty-state";

    const title = document.createElement("h3");
    title.textContent = categoryState.loadError
      ? "Les catégories ne sont pas accessibles."
      : categoryState.loading
        ? "Préparation de vos univers…"
        : "Vos univers prennent forme.";

    const description = document.createElement("p");
    description.textContent = categoryState.loadError
      ? "Consultez la console du navigateur pour identifier la table ou la permission qui bloque le chargement."
      : "Les catégories réelles apparaîtront ici après leur chargement.";

    empty.append(title, description);
    container.append(empty);
    return;
  }

  categoryState.categories.forEach((category, index) => {
    if (!category.name || !category.slug) return;

    const tile = document.createElement("a");
    tile.className = "category-tile";
    tile.href = `category.html?slug=${encodeURIComponent(category.slug)}`;
    tile.setAttribute(
      "aria-label",
      `Explorer la catégorie ${category.name}`
    );

    const media = document.createElement("div");
    media.className = "category-tile-media";

    if (isSafeImageURL(category.image)) {
      const image = document.createElement("img");
      image.src = category.image;
      image.alt = "";
      image.loading = "lazy";
      image.decoding = "async";
      media.append(image);
    }

    const shade = document.createElement("div");
    shade.className = "category-tile-shade";

    const topLine = document.createElement("div");
    topLine.className = "category-tile-topline";

    const indexLabel = document.createElement("span");
    indexLabel.textContent =
      `UNIVERS / ${String(index + 1).padStart(2, "0")}`;

    const brandLabel = document.createElement("span");
    brandLabel.textContent = "XELOS";

    topLine.append(indexLabel, brandLabel);

    const title = document.createElement("h3");
    title.textContent = category.name;

    const description = document.createElement("p");
    description.className = "category-tile-description";
    description.textContent = category.description;

    const bottom = document.createElement("div");
    bottom.className = "category-tile-bottom";

    const count = document.createElement("span");
    count.className = "category-tile-count";

    const actualCount = categoryState.products.filter(
      (product) => productMatchesCategory(product, category)
    ).length;

    count.textContent = categoryState.dataReceived
      ? `${actualCount} produit(s)`
      : category.productCount !== null
        ? `${category.productCount} produit(s)`
        : "Découvrir l'univers";

    const arrow = document.createElement("span");
    arrow.className = "category-tile-arrow";
    arrow.setAttribute("aria-hidden", "true");
    arrow.textContent = "↗";

    bottom.append(count, arrow);
    tile.append(media, shade, topLine, title);

    if (category.description) {
      tile.append(description);
    }

    tile.append(bottom);
    container.append(tile);
  });
}

function renderCategoryFilters() {
  const container = elements["category-filter-list"];
  if (!container) return;

  container.replaceChildren();

  const categories = [
    { id: "", slug: "", name: "Toutes les catégories" },
    ...categoryState.categories.filter(
      (category) => category.name && category.slug
    )
  ];

  categories.forEach((category) => {
    const label = document.createElement("label");
    label.className = "filter-option";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "category-filter";
    input.value = category.slug;
    input.checked = category.slug === categoryState.selectedSlug;

    const text = document.createElement("span");
    text.textContent = category.name;

    label.append(input, text);
    container.append(label);
  });
}

function productMatchesCategory(product, category) {
  if (!category) return true;

  if (product.categoryId && category.id) {
    return String(product.categoryId) === String(category.id);
  }

  if (product.categorySlug && category.slug) {
    return product.categorySlug.toLowerCase() ===
      category.slug.toLowerCase();
  }

  return Boolean(
    product.categoryName &&
    category.name &&
    product.categoryName.toLowerCase() === category.name.toLowerCase()
  );
}

/* =========================================================
   FILTRES ET TRI
========================================================= */

function getFilteredProducts() {
  let products = [...categoryState.products];
  const category = getSelectedCategory();

  if (categoryState.selectedSlug) {
    if (!category) return [];

    products = products.filter(
      (product) => productMatchesCategory(product, category)
    );
  }

  const query = categoryState.search.toLocaleLowerCase();

  if (query) {
    products = products.filter((product) => {
      const searchable = [
        product.name,
        product.description,
        product.categoryName
      ].join(" ").toLocaleLowerCase();

      return searchable.includes(query);
    });
  }

  if (categoryState.minPrice !== "") {
    const minimum = Number(categoryState.minPrice);

    products = products.filter(
      (product) =>
        product.price !== null &&
        product.price >= minimum
    );
  }

  if (categoryState.maxPrice !== "") {
    const maximum = Number(categoryState.maxPrice);

    products = products.filter(
      (product) =>
        product.price !== null &&
        product.price <= maximum
    );
  }

  if (categoryState.availableOnly) {
    products = products.filter((product) => product.available);
  }

  switch (categoryState.sort) {
    case "newest":
      products.sort((a, b) => b.createdAt - a.createdAt);
      break;

    case "popular":
      products.sort((a, b) => b.popularity - a.popularity);
      break;

    case "price-asc":
      products.sort(
        (a, b) => (a.price ?? Infinity) - (b.price ?? Infinity)
      );
      break;

    case "price-desc":
      products.sort(
        (a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity)
      );
      break;

    case "name":
      products.sort((a, b) => a.name.localeCompare(b.name, "fr"));
      break;

    default:
      // L'ordre reçu de Supabase est conservé.
      break;
  }

  return products;
}

/* =========================================================
   PRODUITS
========================================================= */

function renderProducts() {
  const container = elements["category-product-grid"];
  if (!container) return;

  const products = getFilteredProducts();
  const total = products.length;

  const totalPages = Math.max(
    1,
    Math.ceil(total / CATEGORY_PAGE_CONFIG.productsPerPage)
  );

  categoryState.page = Math.max(
    1,
    Math.min(categoryState.page, totalPages)
  );

  const start =
    (categoryState.page - 1) * CATEGORY_PAGE_CONFIG.productsPerPage;

  const visibleProducts = products.slice(
    start,
    start + CATEGORY_PAGE_CONFIG.productsPerPage
  );

  container.replaceChildren();
  container.classList.toggle("is-list", categoryState.view === "list");
  container.setAttribute("aria-busy", String(categoryState.loading));

  if (categoryState.loading && !categoryState.dataReceived) {
    renderEmptyState(
      container,
      "Chargement du catalogue…",
      "XELOS récupère les produits et leurs informations."
    );
  } else if (categoryState.loadError && !categoryState.dataReceived) {
    renderEmptyState(
      container,
      "Le catalogue est temporairement inaccessible.",
      "Vérifiez la connexion Supabase, les tables et les permissions RLS."
    );
  } else if (!categoryState.dataReceived) {
    renderEmptyState(
      container,
      "Connexion au catalogue…",
      "Les produits apparaîtront après le chargement des données."
    );
  } else if (!visibleProducts.length) {
    renderEmptyState(
      container,
      "Aucun produit à afficher.",
      "Essayez une autre catégorie ou réinitialisez les filtres."
    );
  } else {
    visibleProducts.forEach((product) => {
      container.append(createProductCard(product));
    });
  }

  if (elements["result-count"]) {
    elements["result-count"].textContent = String(total);
  }

  if (elements["result-count-label"]) {
    elements["result-count-label"].textContent =
      total === 1 ? "produit" : "produits";
  }

  renderPagination(total, totalPages);
  renderActiveFilters();
}

function renderEmptyState(container, titleText, descriptionText) {
  const empty = document.createElement("div");
  empty.className = "catalog-empty-state";

  const symbol = document.createElement("span");
  symbol.className = "empty-state-symbol";
  symbol.setAttribute("aria-hidden", "true");
  symbol.textContent = "X.";

  const title = document.createElement("h3");
  title.textContent = titleText;

  const description = document.createElement("p");
  description.textContent = descriptionText;

  empty.append(symbol, title, description);
  container.append(empty);
}

function createProductCard(product) {
  const article = document.createElement("article");
  article.className = "catalog-product-card";

  const imageLink = document.createElement("a");
  imageLink.className = "catalog-product-image";

  imageLink.href = product.slug
    ? `product.html?slug=${encodeURIComponent(product.slug)}`
    : `product.html?id=${encodeURIComponent(String(product.id))}`;

  imageLink.setAttribute(
    "aria-label",
    product.name ? `Voir ${product.name}` : "Voir le produit"
  );

  if (isSafeImageURL(product.image)) {
    const image = document.createElement("img");
    image.src = product.image;
    image.alt = product.name;
    image.loading = "lazy";
    image.decoding = "async";

    image.addEventListener("error", () => {
      image.replaceWith(createImagePlaceholder());
    }, { once: true });

    imageLink.append(image);
  } else {
    imageLink.append(createImagePlaceholder());
  }

  const stockLabel = document.createElement("span");
  stockLabel.className = "product-stock-label";
  stockLabel.textContent = product.available
    ? "Disponible"
    : "Disponibilité à confirmer";

  if (!product.available) {
    stockLabel.classList.add("is-unavailable");
  }

  imageLink.append(stockLabel);

  const info = document.createElement("div");
  info.className = "catalog-product-info";

  const category = document.createElement("p");
  category.className = "catalog-product-category";
  category.textContent = product.categoryName || "XELOS";

  const title = document.createElement("h3");
  title.className = "catalog-product-title";

  const titleLink = document.createElement("a");
  titleLink.href = imageLink.href;
  titleLink.textContent = product.name || "Produit";

  title.append(titleLink);
  info.append(category, title);

  if (product.description) {
    const description = document.createElement("p");
    description.className = "catalog-product-description";
    description.textContent = product.description;
    info.append(description);
  }

  const price = document.createElement("div");
  price.className = "catalog-product-price";

  if (product.price !== null) {
    const currentPrice = document.createElement("span");
    currentPrice.textContent = formatPrice(
      product.price,
      product.currency
    );

    price.append(currentPrice);

    if (
      product.compareAtPrice !== null &&
      product.compareAtPrice > product.price
    ) {
      const oldPrice = document.createElement("del");
      oldPrice.textContent = formatPrice(
        product.compareAtPrice,
        product.currency
      );

      price.append(oldPrice);
    }
  } else {
    const unavailablePrice = document.createElement("span");
    unavailablePrice.textContent = "Prix indisponible";
    price.append(unavailablePrice);
  }

  info.append(price);

  if (product.rating !== null && product.rating > 0) {
    const rating = document.createElement("p");
    rating.className = "catalog-product-rating";

    const ratingValue = document.createElement("strong");
    ratingValue.textContent = `★ ${product.rating.toFixed(1)}`;

    const reviews = document.createElement("span");
    reviews.textContent = `(${product.reviewCount} avis)`;

    rating.append(ratingValue, reviews);
    info.append(rating);
  }

  article.append(imageLink, info);
  return article;
}

function createImagePlaceholder() {
  const placeholder = document.createElement("span");
  placeholder.className = "product-image-placeholder";
  placeholder.setAttribute("aria-hidden", "true");
  placeholder.textContent = "X.";
  return placeholder;
}

function formatPrice(amount, currency) {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency || CATEGORY_PAGE_CONFIG.currency
    }).format(amount);
  } catch {
    return `${Number(amount).toFixed(2)} ${
      currency || CATEGORY_PAGE_CONFIG.currency
    }`;
  }
}

function isSafeImageURL(value) {
  if (!value) return false;

  try {
    const url = new URL(value, window.location.origin);

    return ["https:", "http:"].includes(url.protocol);
  } catch {
    return false;
  }
}

/* =========================================================
   PAGINATION
========================================================= */

function renderPagination(total, totalPages) {
  const nav = elements["catalog-pagination"];
  const pages = elements["pagination-pages"];

  if (!nav || !pages) return;

  nav.hidden = total <= CATEGORY_PAGE_CONFIG.productsPerPage;
  pages.replaceChildren();

  if (elements["previous-page"]) {
    elements["previous-page"].disabled = categoryState.page <= 1;
  }

  if (elements["next-page"]) {
    elements["next-page"].disabled = categoryState.page >= totalPages;
  }

  for (let page = 1; page <= totalPages; page += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.page = String(page);
    button.textContent = String(page);

    const active = page === categoryState.page;

    button.classList.toggle("is-active", active);

    if (active) {
      button.setAttribute("aria-current", "page");
    }

    pages.append(button);
  }
}

function getTotalPages() {
  return Math.max(
    1,
    Math.ceil(
      getFilteredProducts().length /
      CATEGORY_PAGE_CONFIG.productsPerPage
    )
  );
}

function scrollToProductResults() {
  elements["category-product-grid"]?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start"
  });
}

/* =========================================================
   FILTRES ACTIFS
========================================================= */

function renderActiveFilters() {
  const container = elements["active-filter-list"];
  if (!container) return;

  container.replaceChildren();

  const activeFilters = [];

  if (categoryState.search) {
    activeFilters.push({
      label: `Recherche : ${categoryState.search}`,
      clear: () => {
        categoryState.search = "";

        if (elements["product-search"]) {
          elements["product-search"].value = "";
        }
      }
    });
  }

  if (categoryState.selectedSlug) {
    const category = getSelectedCategory();

    activeFilters.push({
      label: `Catégorie : ${category?.name || categoryState.selectedSlug}`,
      clear: () => {
        categoryState.selectedSlug = "";
        syncCategoryURL();
        renderCategoryNavigation();
        renderCategoryFilters();
        renderCategoryTiles();
        updateCategoryHeading();
      }
    });
  }

  if (categoryState.minPrice !== "") {
    activeFilters.push({
      label: `Min. ${categoryState.minPrice}`,
      clear: () => {
        categoryState.minPrice = "";

        if (elements["price-min"]) {
          elements["price-min"].value = "";
        }
      }
    });
  }

  if (categoryState.maxPrice !== "") {
    activeFilters.push({
      label: `Max. ${categoryState.maxPrice}`,
      clear: () => {
        categoryState.maxPrice = "";

        if (elements["price-max"]) {
          elements["price-max"].value = "";
        }
      }
    });
  }

  if (categoryState.availableOnly) {
    activeFilters.push({
      label: "Disponibles uniquement",
      clear: () => {
        categoryState.availableOnly = false;

        if (elements["available-only"]) {
          elements["available-only"].checked = false;
        }
      }
    });
  }

  activeFilters.forEach((filter) => {
    const chip = document.createElement("span");
    chip.className = "active-filter-chip";

    const label = document.createElement("span");
    label.textContent = filter.label;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute(
      "aria-label",
      `Supprimer le filtre ${filter.label}`
    );

    remove.addEventListener("click", () => {
      filter.clear();
      categoryState.page = 1;
      renderProducts();
      renderCategoryTiles();
      renderCategoryNavigation();
      renderCategoryFilters();
      updateCategoryHeading();
    });

    chip.append(label, remove);
    container.append(chip);
  });
}

/* =========================================================
   VALIDATION ET RÉINITIALISATION
========================================================= */

function validatePriceInputs() {
  const min = elements["price-min"]?.value.trim() || "";
  const max = elements["price-max"]?.value.trim() || "";

  const minimum = min === "" ? null : Number(min);
  const maximum = max === "" ? null : Number(max);

  const validMinimum = minimum === null ||
    (Number.isFinite(minimum) && minimum >= 0);

  const validMaximum = maximum === null ||
    (Number.isFinite(maximum) && maximum >= 0);

  const validRange = minimum === null ||
    maximum === null ||
    minimum <= maximum;

  const valid = validMinimum && validMaximum && validRange;

  elements["price-min"]?.setAttribute(
    "aria-invalid",
    String(!validMinimum || !validRange)
  );

  elements["price-max"]?.setAttribute(
    "aria-invalid",
    String(!validMaximum || !validRange)
  );

  return valid;
}

function resetFilters() {
  categoryState.selectedSlug = "";
  categoryState.search = "";
  categoryState.minPrice = "";
  categoryState.maxPrice = "";
  categoryState.availableOnly = false;
  categoryState.sort = "recommended";
  categoryState.page = 1;

  if (elements["product-search"]) {
    elements["product-search"].value = "";
  }

  if (elements["price-min"]) {
    elements["price-min"].value = "";
    elements["price-min"].setAttribute("aria-invalid", "false");
  }

  if (elements["price-max"]) {
    elements["price-max"].value = "";
    elements["price-max"].setAttribute("aria-invalid", "false");
  }

  if (elements["available-only"]) {
    elements["available-only"].checked = false;
  }

  if (elements["product-sort"]) {
    elements["product-sort"].value = "recommended";
  }

  syncCategoryURL();
  renderCategoryNavigation();
  renderCategoryFilters();
  renderCategoryTiles();
  renderProducts();
  updateCategoryHeading();
}

/* =========================================================
   INTERFACE DE DONNÉES POUR LES AUTRES SCRIPTS
========================================================= */

function exposeDataInterface() {
  window.XELOS_CATEGORY_PAGE = Object.freeze({
    setCategories(categories) {
      window.dispatchEvent(
        new CustomEvent(CATEGORY_PAGE_CONFIG.categoryDataEvent, {
          detail: { categories }
        })
      );
    },

    setProducts(products) {
      window.dispatchEvent(
        new CustomEvent(CATEGORY_PAGE_CONFIG.productDataEvent, {
          detail: { products }
        })
      );
    },

    refresh() {
      refreshCategoryInterface();
    },

    reload() {
      return loadCatalogue();
    }
  });
}
