javascript
// =========================================================
// XELOS — SEARCH PAGE
// js/search.js
//
// Contrat d'intégration :
// window.dispatchEvent(new CustomEvent("xelos:catalog-data", {
//   detail: { products: produitsNormalises }
// }));
//
// Champs normalisés attendus :
// id, name, slug, description, image, categoryId, categoryName,
// price, compareAtPrice, currency, available, createdAt, popularity
//
// Ces champs constituent le contrat frontend, pas les colonnes SQL.
// =========================================================

const SEARCH_CONFIG = Object.freeze({
  pageSize: 12,
  recentSearchLimit: 6,
  recentStorageKey: "xelos:recent-searches",
  debounceDelay: 180
});

const state = {
  products: [],
  catalogReceived: false,
  query: "",
  category: "",
  minPrice: "",
  maxPrice: "",
  availableOnly: false,
  sort: "relevance",
  page: 1,
  view: "grid",
  suggestions: [],
  suggestionIndex: -1,
  searchTimer: null,
  mobileFiltersOpen: false,
  lastError: null
};

const elements = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheElements();
  bindEvents();
  syncHeaderSearch();
  loadStateFromUrl();
  updateClearButton();
  updateFooterYear();
  renderCategories();
  renderPage();
}

function cacheElements() {
  const ids = [
    "mobileMenuToggle", "mainNavigation",
    "headerSearchForm", "headerSearchInput",
    "searchForm", "searchInput", "searchSuggestions",
    "clearSearch", "searchFilters", "resetFilters",
    "categoryOptions", "minPrice", "maxPrice",
    "availableOnly", "applyFilters", "activeFilters",
    "sortSelect", "filterCount", "mobileFilterToggle",
    "resultsHeading", "resultsCount", "searchContext",
    "searchContextText", "clearQuery", "searchLoading",
    "searchError", "searchErrorMessage", "retrySearch",
    "searchEmpty", "emptyTitle", "emptyMessage",
    "emptyReset", "recentSearches", "recentSearchList",
    "searchNoCatalog", "searchProductGrid", "searchPagination",
    "previousPage", "nextPage", "paginationNumbers",
    "footerYear", "priceFilterHint"
  ];

  ids.forEach((id) => {
    elements[id] = document.getElementById(id);
  });
}

function bindEvents() {
  elements.mobileMenuToggle?.addEventListener("click", toggleNavigation);

  elements.headerSearchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitQuery(elements.headerSearchInput?.value ?? "");
  });

  elements.searchForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    submitQuery(elements.searchInput?.value ?? "");
  });

  elements.searchInput?.addEventListener("input", () => {
    const value = elements.searchInput.value;
    updateClearButton();
    scheduleSuggestions(value);
  });

  elements.searchInput?.addEventListener("keydown", handleSuggestionKeys);

  elements.searchInput?.addEventListener("focus", () => {
    if (elements.searchInput.value.trim()) {
      renderSuggestions(elements.searchInput.value);
    }
  });

  elements.searchInput?.addEventListener("blur", () => {
    window.setTimeout(hideSuggestions, 140);
  });

  elements.clearSearch?.addEventListener("click", clearSearchInput);
  elements.clearQuery?.addEventListener("click", () => submitQuery(""));

  elements.minPrice?.addEventListener("keydown", handleFilterEnter);
  elements.maxPrice?.addEventListener("keydown", handleFilterEnter);

  elements.applyFilters?.addEventListener("click", applyFilters);
  elements.resetFilters?.addEventListener("click", resetFilters);
  elements.emptyReset?.addEventListener("click", resetAllSearch);
  elements.retrySearch?.addEventListener("click", renderPage);

  elements.sortSelect?.addEventListener("change", () => {
    state.sort = elements.sortSelect.value;
    state.page = 1;
    updateUrl();
    renderPage();
  });

  elements.mobileFilterToggle?.addEventListener("click", toggleMobileFilters);

  document.querySelectorAll(".view-button").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  elements.previousPage?.addEventListener("click", () => changePage(state.page - 1));
  elements.nextPage?.addEventListener("click", () => changePage(state.page + 1));

  elements.categoryOptions?.addEventListener("change", (event) => {
    if (event.target.matches('input[name="categoryFilter"]')) {
      state.category = event.target.value;
      state.page = 1;
      updateFilterUI();
      updateUrl();
      renderPage();
    }
  });

  elements.availableOnly?.addEventListener("change", () => {
    state.availableOnly = elements.availableOnly.checked;
    state.page = 1;
    updateFilterUI();
    updateUrl();
    renderPage();
  });

  elements.activeFilters?.addEventListener("click", handleActiveFilterClick);
  elements.recentSearchList?.addEventListener("click", handleRecentSearchClick);

  document.addEventListener("click", (event) => {
    if (!elements.searchForm?.contains(event.target)) {
      hideSuggestions();
    }

    if (
      state.mobileFiltersOpen &&
      !elements.searchFilters?.contains(event.target) &&
      !elements.mobileFilterToggle?.contains(event.target)
    ) {
      closeMobileFilters();
    }
  });

  window.addEventListener("popstate", () => {
    loadStateFromUrl();
    renderPage();
  });

  window.addEventListener("xelos:catalog-data", (event) => {
    const products = event.detail?.products;

    if (!Array.isArray(products)) {
      showError("Les données reçues ne correspondent pas au format attendu.");
      return;
    }

    state.products = normalizeProducts(products);
    state.catalogReceived = true;
    state.lastError = null;

    renderCategories();
    updateFilterUI();
    renderPage();
  });

  // Optionnel : permet au service de données de signaler une erreur.
  window.addEventListener("xelos:catalog-error", (event) => {
    state.lastError = event.detail?.message || "Impossible de charger le catalogue.";
    renderPage();
  });
}

function toggleNavigation() {
  const button = elements.mobileMenuToggle;
  const navigation = elements.mainNavigation;

  if (!button || !navigation) return;

  const isOpen = navigation.classList.toggle("is-open");
  button.setAttribute("aria-expanded", String(isOpen));
  button.setAttribute(
    "aria-label",
    isOpen ? "Fermer le menu" : "Ouvrir le menu"
  );
}

function syncHeaderSearch() {
  if (elements.headerSearchInput) {
    elements.headerSearchInput.value = state.query;
  }
}

function loadStateFromUrl() {
  const params = new URLSearchParams(window.location.search);

  state.query = (params.get("q") || "").trim();
  state.category = params.get("category") || "";
  state.minPrice = validPriceParam(params.get("min"));
  state.maxPrice = validPriceParam(params.get("max"));
  state.availableOnly = params.get("available") === "1";

  const allowedSorts = [
    "relevance", "newest", "price-asc", "price-desc", "name-asc"
  ];

  const requestedSort = params.get("sort");
  state.sort = allowedSorts.includes(requestedSort) ? requestedSort : "relevance";

  const requestedPage = Number.parseInt(params.get("page") || "1", 10);
  state.page = Number.isInteger(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;

  if (elements.searchInput) elements.searchInput.value = state.query;
  if (elements.headerSearchInput) elements.headerSearchInput.value = state.query;
  if (elements.minPrice) elements.minPrice.value = state.minPrice;
  if (elements.maxPrice) elements.maxPrice.value = state.maxPrice;
  if (elements.availableOnly) elements.availableOnly.checked = state.availableOnly;
  if (elements.sortSelect) elements.sortSelect.value = state.sort;

  updateClearButton();
  updateFilterUI();
}

function validPriceParam(value) {
  if (value === null || value.trim() === "") return "";

  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? String(number) : "";
}

function normalizeProducts(products) {
  return products
    .filter((product) => product && product.id != null && product.name)
    .map((product) => {
      const price = Number(product.price);
      const compareAtPrice = Number(product.compareAtPrice);
      const rawPopularity = Number(product.popularity);

      return {
        id: String(product.id),
        name: String(product.name).trim(),
        slug: String(product.slug || product.id),
        description: String(product.description || ""),
        image: isSafeImageUrl(product.image) ? product.image : "",
        categoryId: String(product.categoryId ?? ""),
        categoryName: String(product.categoryName || ""),
        price: Number.isFinite(price) && price >= 0 ? price : null,
        compareAtPrice:
          Number.isFinite(compareAtPrice) && compareAtPrice >= 0
            ? compareAtPrice
            : null,
        currency: String(product.currency || "USD"),
        available: product.available === true,
        createdAt: product.createdAt || "",
        popularity: Number.isFinite(rawPopularity) ? rawPopularity : 0
      };
    });
}

function isSafeImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;

  try {
    const url = new URL(value, window.location.origin);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function isSafeSlug(value) {
  return /^[a-zA-Z0-9_-]+$/.test(String(value || ""));
}

function getProductUrl(product) {
  const identifier = isSafeSlug(product.slug)
    ? product.slug
    : product.id;

  return `product.html?id=${encodeURIComponent(identifier)}`;
}

// ---------------------------------------------------------
// Recherche et suggestions
// ---------------------------------------------------------

function submitQuery(value) {
  state.query = String(value || "").trim();
  state.page = 1;
  state.suggestionIndex = -1;

  if (elements.searchInput) elements.searchInput.value = state.query;
  if (elements.headerSearchInput) elements.headerSearchInput.value = state.query;

  hideSuggestions();
  updateClearButton();

  if (state.query) saveRecentSearch(state.query);

  updateUrl();
  renderPage();
}

function clearSearchInput() {
  if (elements.searchInput) elements.searchInput.value = "";
  submitQuery("");
  elements.searchInput?.focus();
}

function updateClearButton() {
  if (!elements.clearSearch) return;
  elements.clearSearch.hidden = !(elements.searchInput?.value || "").length;
}

function scheduleSuggestions(value) {
  window.clearTimeout(state.searchTimer);

  state.searchTimer = window.setTimeout(() => {
    renderSuggestions(value);
  }, SEARCH_CONFIG.debounceDelay);
}

function getSearchableProducts() {
  const seen = new Set();

  return state.products.filter((product) => {
    const key = product.name.toLocaleLowerCase("fr");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function renderSuggestions(value) {
  const container = elements.searchSuggestions;
  if (!container) return;

  const query = String(value || "").trim().toLocaleLowerCase("fr");

  if (!query || !state.catalogReceived) {
    hideSuggestions();
    return;
  }

  const matches = getSearchableProducts()
    .filter((product) => {
      return product.name.toLocaleLowerCase("fr").includes(query) ||
        product.categoryName.toLocaleLowerCase("fr").includes(query);
    })
    .slice(0, 5);

  const recent = getRecentSearches()
    .filter((item) => item.toLocaleLowerCase("fr").includes(query))
    .slice(0, 3);

  const suggestions = [
    ...matches.map((product) => ({
      type: "product",
      label: product.name,
      value: product.name,
      product
    })),
    ...recent.map((item) => ({
      type: "recent",
      label: item,
      value: item
    }))
  ].slice(0, 6);

  state.suggestions = suggestions;
  state.suggestionIndex = -1;
  container.replaceChildren();

  if (!suggestions.length) {
    hideSuggestions();
    return;
  }

  const label = document.createElement("div");
  label.className = "suggestion-label";
  label.textContent = matches.length ? "Suggestions" : "Recherches récentes";
  container.append(label);

  suggestions.forEach((suggestion, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-option";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", "false");
    button.dataset.index = String(index);

    const icon = document.createElement("i");
    icon.className = suggestion.type === "product"
      ? "fa-solid fa-magnifying-glass"
      : "fa-solid fa-clock-rotate-left";
    icon.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.textContent = suggestion.label;

    button.append(icon, text);

    button.addEventListener("mousedown", (event) => {
      event.preventDefault();

      if (suggestion.type === "product" && suggestion.product) {
        window.location.href = getProductUrl(suggestion.product);
      } else {
        submitQuery(suggestion.value);
      }
    });

    container.append(button);
  });

  container.hidden = false;
  elements.searchInput?.setAttribute("aria-expanded", "true");
}

function handleSuggestionKeys(event) {
  if (elements.searchSuggestions?.hidden || !state.suggestions.length) {
    if (event.key === "Escape") hideSuggestions();
    return;
  }

  if (event.key === "ArrowDown") {
    event.preventDefault();
    state.suggestionIndex = Math.min(
      state.suggestionIndex + 1,
      state.suggestions.length - 1
    );
    updateSuggestionSelection();
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    state.suggestionIndex = Math.max(state.suggestionIndex - 1, 0);
    updateSuggestionSelection();
  } else if (event.key === "Escape") {
    hideSuggestions();
  } else if (
    event.key === "Enter" &&
    state.suggestionIndex >= 0
  ) {
    event.preventDefault();

    const suggestion = state.suggestions[state.suggestionIndex];
    if (!suggestion) return;

    if (suggestion.type === "product" && suggestion.product) {
      window.location.href = getProductUrl(suggestion.product);
    } else {
      submitQuery(suggestion.value);
    }
  }
}

function updateSuggestionSelection() {
  const options = elements.searchSuggestions?.querySelectorAll(
    ".suggestion-option"
  );

  options?.forEach((option, index) => {
    const selected = index === state.suggestionIndex;
    option.setAttribute("aria-selected", String(selected));

    if (selected) option.scrollIntoView({ block: "nearest" });
  });
}

function hideSuggestions() {
  if (!elements.searchSuggestions) return;

  elements.searchSuggestions.hidden = true;
  elements.searchInput?.setAttribute("aria-expanded", "false");
  state.suggestionIndex = -1;
}

// ---------------------------------------------------------
// Filtres
// ---------------------------------------------------------

function handleFilterEnter(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    applyFilters();
  }
}

function applyFilters() {
  const min = elements.minPrice?.value.trim() || "";
  const max = elements.maxPrice?.value.trim() || "";

  if (
    (min && (!Number.isFinite(Number(min)) || Number(min) < 0)) ||
    (max && (!Number.isFinite(Number(max)) || Number(max) < 0))
  ) {
    showError("Saisissez des prix valides, égaux ou supérieurs à zéro.");
    return;
  }

  if (min && max && Number(min) > Number(max)) {
    showError("Le prix minimum ne peut pas dépasser le prix maximum.");
    return;
  }

  state.minPrice = min;
  state.maxPrice = max;
  state.page = 1;
  state.lastError = null;

  closeMobileFilters();
  updateFilterUI();
  updateUrl();
  renderPage();
}

function resetFilters() {
  state.category = "";
  state.minPrice = "";
  state.maxPrice = "";
  state.availableOnly = false;
  state.page = 1;
  state.lastError = null;

  if (elements.minPrice) elements.minPrice.value = "";
  if (elements.maxPrice) elements.maxPrice.value = "";
  if (elements.availableOnly) elements.availableOnly.checked = false;

  const allCategory = elements.categoryOptions?.querySelector(
    'input[name="categoryFilter"][value=""]'
  );
  if (allCategory) allCategory.checked = true;

  updateFilterUI();
  updateUrl();
  renderPage();
}

function resetAllSearch() {
  state.query = "";
  state.sort = "relevance";
  state.page = 1;

  if (elements.searchInput) elements.searchInput.value = "";
  if (elements.headerSearchInput) elements.headerSearchInput.value = "";
  if (elements.sortSelect) elements.sortSelect.value = "relevance";

  resetFilters();
  updateClearButton();
}

function handleActiveFilterClick(event) {
  const button = event.target.closest("[data-remove-filter]");
  if (!button) return;

  const filter = button.dataset.removeFilter;

  if (filter === "category") state.category = "";
  if (filter === "min") state.minPrice = "";
  if (filter === "max") state.maxPrice = "";
  if (filter === "available") state.availableOnly = false;

  if (elements.minPrice) elements.minPrice.value = state.minPrice;
  if (elements.maxPrice) elements.maxPrice.value = state.maxPrice;
  if (elements.availableOnly) {
    elements.availableOnly.checked = state.availableOnly;
  }

  updateFilterUI();
  updateUrl();
  renderPage();
}

function getActiveFilterCount() {
  return Number(Boolean(state.category)) +
    Number(state.minPrice !== "") +
    Number(state.maxPrice !== "") +
    Number(state.availableOnly);
}

function updateFilterUI() {
  if (elements.categoryOptions) {
    const categoryInputs = elements.categoryOptions.querySelectorAll(
      'input[name="categoryFilter"]'
    );

    categoryInputs.forEach((input) => {
      input.checked = input.value === state.category;
    });
  }

  if (elements.filterCount) {
    const count = getActiveFilterCount();
    elements.filterCount.textContent = String(count);
    elements.filterCount.hidden = count === 0;
  }

  if (elements.activeFilters) {
    elements.activeFilters.replaceChildren();

    const active = [];

    if (state.category) {
      const product = state.products.find(
        (item) => item.categoryId === state.category
      );

      active.push({
        key: "category",
        label: product?.categoryName || getCategoryLabel(state.category)
      });
    }

    if (state.minPrice !== "") {
      active.push({ key: "min", label: `Min. ${state.minPrice}` });
    }

    if (state.maxPrice !== "") {
      active.push({ key: "max", label: `Max. ${state.maxPrice}` });
    }

    if (state.availableOnly) {
      active.push({ key: "available", label: "Disponibles" });
    }

    active.forEach((item) => {
      const chip = document.createElement("span");
      chip.className = "filter-chip";

      const label = document.createElement("span");
      label.textContent = item.label;

      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.removeFilter = item.key;
      remove.setAttribute("aria-label", `Retirer le filtre ${item.label}`);
      remove.innerHTML = '<i class="fa-solid fa-xmark" aria-hidden="true"></i>';

      chip.append(label, remove);
      elements.activeFilters.append(chip);
    });
  }
}

function getCategoryLabel(categoryId) {
  const input = elements.categoryOptions?.querySelector(
    `input[name="categoryFilter"][value="${CSS.escape(categoryId)}"]`
  );

  return input?.parentElement?.querySelector("span")?.textContent ||
    "Catégorie";
}

function renderCategories() {
  const container = elements.categoryOptions;
  if (!container || !state.catalogReceived) return;

  const categories = new Map();

  state.products.forEach((product) => {
    if (!product.categoryId || !product.categoryName) return;

    if (!categories.has(product.categoryId)) {
      categories.set(product.categoryId, product.categoryName);
    }
  });

  container.replaceChildren();

  [...categories.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "fr"))
    .forEach(([id, name]) => {
      const label = document.createElement("label");
      label.className = "filter-option";

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "categoryFilter";
      input.value = id;

      const text = document.createElement("span");
      text.textContent = name;

      label.append(input, text);
      container.append(label);
    });

  if (!categories.size) {
    const hint = document.createElement("p");
    hint.className = "filter-hint";
    hint.textContent = "Aucune catégorie disponible.";
    container.append(hint);
  }
}

// ---------------------------------------------------------
// Filtrage, tri et pagination
// ---------------------------------------------------------

function getFilteredProducts() {
  const query = normalizeText(state.query);
  const min = state.minPrice === "" ? null : Number(state.minPrice);
  const max = state.maxPrice === "" ? null : Number(state.maxPrice);

  let products = state.products.filter((product) => {
    if (query) {
      const searchableText = normalizeText([
        product.name,
        product.description,
        product.categoryName,
        product.slug
      ].join(" "));

      if (!searchableText.includes(query)) return false;
    }

    if (state.category && product.categoryId !== state.category) {
      return false;
    }

    // Un prix inconnu ne doit pas passer silencieusement un filtre de prix.
    if (min !== null && (product.price === null || product.price < min)) {
      return false;
    }

    if (max !== null && (product.price === null || product.price > max)) {
      return false;
    }

    if (state.availableOnly && !product.available) return false;

    return true;
  });

  products = [...products];

  switch (state.sort) {
    case "newest":
      products.sort((a, b) => getTimestamp(b.createdAt) - getTimestamp(a.createdAt));
      break;

    case "price-asc":
      products.sort((a, b) => compareNullableNumbers(a.price, b.price, 1));
      break;

    case "price-desc":
      products.sort((a, b) => compareNullableNumbers(a.price, b.price, -1));
      break;

    case "name-asc":
      products.sort((a, b) => a.name.localeCompare(b.name, "fr"));
      break;

    case "relevance":
    default:
      if (query) {
        products.sort((a, b) => relevanceScore(b, query) - relevanceScore(a, query));
      } else {
        products.sort((a, b) => b.popularity - a.popularity);
      }
  }

  return products;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .trim();
}

function getTimestamp(value) {
  const timestamp = Date.parse(value || "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareNullableNumbers(a, b, direction) {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return (a - b) * direction;
}

function relevanceScore(product, query) {
  const normalizedName = normalizeText(product.name);
  const normalizedCategory = normalizeText(product.categoryName);

  if (normalizedName === query) return 100;
  if (normalizedName.startsWith(query)) return 70;
  if (normalizedName.includes(query)) return 50;
  if (normalizedCategory.includes(query)) return 25;
  return 10;
}

function changePage(page) {
  const products = getFilteredProducts();
  const totalPages = Math.max(1, Math.ceil(products.length / SEARCH_CONFIG.pageSize));

  if (page < 1 || page > totalPages) return;

  state.page = page;
  updateUrl();
  renderPage();

  elements.resultsHeading?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function setView(view) {
  if (!["grid", "list"].includes(view)) return;

  state.view = view;

  elements.searchProductGrid?.classList.toggle("is-list", view === "list");

  document.querySelectorAll(".view-button").forEach((button) => {
    const active = button.dataset.view === view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

// ---------------------------------------------------------
// Rendu
// ---------------------------------------------------------

function renderPage() {
  hideSuggestions();
  hideError();

  if (elements.searchLoading) elements.searchLoading.hidden = true;

  if (state.lastError) {
    showError(state.lastError);
    return;
  }

  if (!state.catalogReceived) {
    showCatalogUnavailable();
    return;
  }

  const products = getFilteredProducts();
  const total = products.length;
  const totalPages = Math.max(1, Math.ceil(total / SEARCH_CONFIG.pageSize));

  state.page = Math.min(state.page, totalPages);

  const start = (state.page - 1) * SEARCH_CONFIG.pageSize;
  const pageProducts = products.slice(start, start + SEARCH_CONFIG.pageSize);

  updateResultsHeading(total);
  updateSearchContext();
  renderActiveResults(pageProducts, start, total);
  renderPagination(totalPages);
  renderRecentSearches();

  if (elements.searchNoCatalog) elements.searchNoCatalog.hidden = true;
  if (elements.searchEmpty) elements.searchEmpty.hidden = total > 0;
  if (elements.searchProductGrid) {
    elements.searchProductGrid.hidden = total === 0;
    elements.searchProductGrid.setAttribute("aria-busy", "false");
  }

  if (elements.searchPagination) {
    elements.searchPagination.hidden = total <= SEARCH_CONFIG.pageSize;
  }

  if (elements.searchEmpty) {
    if (!total) {
      elements.emptyTitle.textContent = state.query
        ? `Aucun résultat pour « ${state.query} »`
        : "Aucun produit ne correspond à ces filtres";

      elements.emptyMessage.textContent = state.query
        ? "Vérifiez l'orthographe, essayez un terme plus général ou modifiez les filtres."
        : "Supprimez un filtre ou élargissez votre budget pour voir davantage de produits.";
    }
  }
}

function showCatalogUnavailable() {
  if (elements.searchLoading) elements.searchLoading.hidden = true;
  if (elements.searchNoCatalog) elements.searchNoCatalog.hidden = false;
  if (elements.searchEmpty) elements.searchEmpty.hidden = true;
  if (elements.searchError) elements.searchError.hidden = true;
  if (elements.searchProductGrid) {
    elements.searchProductGrid.replaceChildren();
    elements.searchProductGrid.hidden = true;
  }
  if (elements.searchPagination) elements.searchPagination.hidden = true;

  if (elements.resultsHeading) {
    elements.resultsHeading.textContent = state.query
      ? `Recherche : ${state.query}`
      : "Explorez le catalogue";
  }

  if (elements.resultsCount) {
    elements.resultsCount.textContent =
      "Les données du catalogue ne sont pas encore disponibles.";
  }

  updateSearchContext();
}

function updateResultsHeading(total) {
  if (elements.resultsHeading) {
    elements.resultsHeading.textContent = state.query
      ? `Résultats pour « ${state.query} »`
      : "Tous les produits";
  }

  if (elements.resultsCount) {
    if (!total) {
      elements.resultsCount.textContent = "0 produit trouvé";
    } else {
      const start = (state.page - 1) * SEARCH_CONFIG.pageSize + 1;
      const end = Math.min(state.page * SEARCH_CONFIG.pageSize, total);

      elements.resultsCount.textContent =
        `${start}–${end} sur ${total} produit${total > 1 ? "s" : ""}`;
    }
  }
}

function updateSearchContext() {
  if (!elements.searchContext) return;

  elements.searchContext.hidden = !state.query;

  if (elements.searchContextText) {
    elements.searchContextText.textContent = state.query
      ? `Recherche active : ${state.query}`
      : "";
  }
}

function renderActiveResults(products, offset, total) {
  const container = elements.searchProductGrid;
  if (!container) return;

  container.replaceChildren();
  container.classList.toggle("is-list", state.view === "list");

  document.querySelectorAll(".view-button").forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });

  products.forEach((product, index) => {
    container.append(createProductCard(product, offset + index));
  });

  if (elements.searchEmpty) elements.searchEmpty.hidden = total > 0;
}

function createProductCard(product, index) {
  const article = document.createElement("article");
  article.className = "search-result-card";
  article.style.setProperty("--card-index", String(Math.min(index, 8)));

  const link = document.createElement("a");
  link.className = "search-result-media";
  link.href = getProductUrl(product);
  link.setAttribute("aria-label", `Voir ${product.name}`);

  if (product.image) {
    const image = document.createElement("img");
    image.src = product.image;
    image.alt = product.name;
    image.loading = index < 4 ? "eager" : "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => {
      image.remove();
      link.classList.add("has-no-image");
      const fallback = document.createElement("span");
      fallback.className = "search-image-fallback";
      fallback.innerHTML =
        '<i class="fa-regular fa-image" aria-hidden="true"></i>';
      link.append(fallback);
    }, { once: true });

    link.append(image);
  } else {
    link.classList.add("has-no-image");
    const fallback = document.createElement("span");
    fallback.className = "search-image-fallback";
    fallback.innerHTML =
      '<i class="fa-regular fa-image" aria-hidden="true"></i>';
    link.append(fallback);
  }

  const category = document.createElement("span");
  category.className = "search-result-category";
  category.textContent = product.categoryName || "XELOS";

  const body = document.createElement("div");
  body.className = "search-result-body";

  const name = document.createElement("h3");
  name.className = "search-result-name";

  const nameLink = document.createElement("a");
  nameLink.href = getProductUrl(product);
  nameLink.textContent = product.name;
  name.append(nameLink);

  const description = document.createElement("p");
  description.className = "search-result-description";
  description.textContent = product.description;

  const priceRow = document.createElement("div");
  priceRow.className = "search-result-price-row";

  const price = document.createElement("span");
  price.className = "search-result-price";
  price.textContent = product.price === null
    ? "Prix à confirmer"
    : formatPrice(product.price, product.currency);

  priceRow.append(price);

  if (
    product.price !== null &&
    product.compareAtPrice !== null &&
    product.compareAtPrice > product.price
  ) {
    const comparePrice = document.createElement("span");
    comparePrice.className = "search-result-compare-price";
    comparePrice.textContent = formatPrice(
      product.compareAtPrice,
      product.currency
    );
    priceRow.append(comparePrice);

    const discount = Math.round(
      (1 - product.price / product.compareAtPrice) * 100
    );

    if (discount > 0 && discount < 100) {
      const badge = document.createElement("span");
      badge.className = "search-result-discount";
      badge.textContent = `-${discount}%`;
      priceRow.append(badge);
    }
  }

  const availability = document.createElement("span");
  availability.className = product.available
    ? "search-result-availability is-available"
    : "search-result-availability is-unavailable";

  const availabilityDot = document.createElement("span");
  availabilityDot.setAttribute("aria-hidden", "true");

  const availabilityText = document.createElement("span");
  availabilityText.textContent = product.available
    ? "Disponible"
    : "Indisponible";

  availability.append(availabilityDot, availabilityText);

  body.append(category, name, description, priceRow, availability);
  article.append(link, body);

  return article;
}

function formatPrice(value, currency) {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: /^[A-Z]{3}$/.test(currency) ? currency : "USD",
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

function renderPagination(totalPages) {
  const numbers = elements.paginationNumbers;
  if (!numbers) return;

  numbers.replaceChildren();

  const pages = new Set([
    1,
    totalPages,
    state.page - 1,
    state.page,
    state.page + 1
  ]);

  const validPages = [...pages]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);

  let previous = 0;

  validPages.forEach((page) => {
    if (previous && page - previous > 1) {
      const dots = document.createElement("span");
      dots.className = "pagination-ellipsis";
      dots.textContent = "…";
      numbers.append(dots);
    }

    const button = document.createElement("button");
    button.type = "button";
    button.className = "pagination-number";
    button.textContent = String(page);
    button.setAttribute("aria-label", `Page ${page}`);

    if (page === state.page) {
      button.classList.add("is-active");
      button.setAttribute("aria-current", "page");
    }

    button.addEventListener("click", () => changePage(page));
    numbers.append(button);
    previous = page;
  });

  if (elements.previousPage) {
    elements.previousPage.disabled = state.page <= 1;
  }

  if (elements.nextPage) {
    elements.nextPage.disabled = state.page >= totalPages;
  }
}

// ---------------------------------------------------------
// Historique local des recherches
// ---------------------------------------------------------

function getRecentSearches() {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(SEARCH_CONFIG.recentStorageKey) || "[]"
    );

    return Array.isArray(value)
      ? value.filter((item) => typeof item === "string").slice(0, SEARCH_CONFIG.recentSearchLimit)
      : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(value) {
  const query = String(value || "").trim();
  if (!query) return;

  const recent = getRecentSearches().filter(
    (item) => normalizeText(item) !== normalizeText(query)
  );

  recent.unshift(query);

  try {
    window.localStorage.setItem(
      SEARCH_CONFIG.recentStorageKey,
      JSON.stringify(recent.slice(0, SEARCH_CONFIG.recentSearchLimit))
    );
  } catch {
    // La recherche reste fonctionnelle si le stockage local est indisponible.
  }
}

function renderRecentSearches() {
  const recent = getRecentSearches();
  const wrapper = elements.recentSearches;
  const list = elements.recentSearchList;

  if (!wrapper || !list) return;

  list.replaceChildren();
  wrapper.hidden = recent.length === 0;

  recent.forEach((query) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "recent-search-button";
    button.textContent = query;
    button.dataset.query = query;
    list.append(button);
  });
}

function handleRecentSearchClick(event) {
  const button = event.target.closest("[data-query]");
  if (!button) return;

  submitQuery(button.dataset.query);
}

// ---------------------------------------------------------
// URL et états d'interface
// ---------------------------------------------------------

function updateUrl() {
  const params = new URLSearchParams();

  if (state.query) params.set("q", state.query);
  if (state.category) params.set("category", state.category);
  if (state.minPrice !== "") params.set("min", state.minPrice);
  if (state.maxPrice !== "") params.set("max", state.maxPrice);
  if (state.availableOnly) params.set("available", "1");
  if (state.sort !== "relevance") params.set("sort", state.sort);
  if (state.page > 1) params.set("page", String(state.page));

  const queryString = params.toString();
  const newUrl = `${window.location.pathname}${queryString ? `?${queryString}` : ""}`;

  window.history.replaceState({}, "", newUrl);
}

function toggleMobileFilters() {
  if (!elements.searchFilters) return;

  state.mobileFiltersOpen = !state.mobileFiltersOpen;
  elements.searchFilters.classList.toggle("is-open", state.mobileFiltersOpen);
  elements.mobileFilterToggle?.setAttribute(
    "aria-expanded",
    String(state.mobileFiltersOpen)
  );

  document.body.classList.toggle("search-filters-open", state.mobileFiltersOpen);
}

function closeMobileFilters() {
  state.mobileFiltersOpen = false;
  elements.searchFilters?.classList.remove("is-open");
  elements.mobileFilterToggle?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("search-filters-open");
}

function showError(message) {
  state.lastError = message;

  if (elements.searchLoading) elements.searchLoading.hidden = true;
  if (elements.searchError) elements.searchError.hidden = false;
  if (elements.searchErrorMessage) elements.searchErrorMessage.textContent = message;
  if (elements.searchProductGrid) elements.searchProductGrid.hidden = true;
  if (elements.searchEmpty) elements.searchEmpty.hidden = true;
  if (elements.searchNoCatalog) elements.searchNoCatalog.hidden = true;
  if (elements.searchPagination) elements.searchPagination.hidden = true;
}

function hideError() {
  if (elements.searchError) elements.searchError.hidden = true;
}

function updateFooterYear() {
  if (elements.footerYear) {
    elements.footerYear.textContent = String(new Date().getFullYear());
  }
}

// API frontend pour les tests ou une future intégration.
// Le chargement du catalogue reste volontairement externe.
window.XELOS_SEARCH_PAGE = Object.freeze({
  setProducts(products) {
    if (!Array.isArray(products)) {
      showError("Le catalogue doit être fourni sous forme de tableau.");
      return;
    }

    state.products = normalizeProducts(products);
    state.catalogReceived = true;
    state.lastError = null;

    renderCategories();
    updateFilterUI();
    renderPage();
  },

  refresh() {
    renderPage();
  },

  getState() {
    return {
      query: state.query,
      category: state.category,
      minPrice: state.minPrice,
      maxPrice: state.maxPrice,
      availableOnly: state.availableOnly,
      sort: state.sort,
      page: state.page,
      view: state.view,
      catalogReceived: state.catalogReceived,
      productCount: state.products.length
    };
  }
});
