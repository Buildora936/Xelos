
/* =========================================================
   XELOS — SHOP / DAY 9
   Catalogue UI, filters, sorting and pagination.
   Product data will be supplied through the centralized
   data layer after the real database schema is verified.
   ========================================================= */

const Shop = (() => {
  "use strict";

  const PAGE_SIZE = 12;

  const state = {
    products: [],
    loaded: false,
    loading: false,
    error: null,
    page: 1,
    pageSize: PAGE_SIZE,
    view: "grid",
    filtersOpen: true,
    search: "",
    category: "",
    minPrice: "",
    maxPrice: "",
    inStockOnly: false,
    sort: "recommended"
  };

  const elements = {};

  function getElement(id) {
    return document.getElementById(id);
  }

  function cacheElements() {
    [
      "menuToggle",
      "primaryNavigation",
      "headerSearch",
      "headerSearchInput",
      "catalogSearch",
      "filterToggle",
      "catalogFilters",
      "clearFilters",
      "activeFilterCount",
      "sortSelect",
      "viewToggle",
      "categoryOptions",
      "minPrice",
      "maxPrice",
      "inStockOnly",
      "applyFilters",
      "resultsSummary",
      "activeFilters",
      "productGrid",
      "catalogState",
      "stateEyebrow",
      "stateTitle",
      "stateMessage",
      "stateReset",
      "catalogStatus",
      "catalogPagination",
      "previousPage",
      "nextPage",
      "paginationPages",
      "currentYear"
    ].forEach(id => {
      elements[id] = getElement(id);
    });
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
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

  function safeURL(value) {
    if (typeof value !== "string" || !value.trim()) {
      return "";
    }

    try {
      const url = new URL(value, window.location.href);

      if (!["http:", "https:"].includes(url.protocol)) {
        return "";
      }

      return url.href;
    } catch {
      return "";
    }
  }

  function formatPrice(value, currency) {
    const amount = Number(value);

    if (!Number.isFinite(amount)) {
      return "";
    }

    try {
      return new Intl.NumberFormat(
        document.documentElement.lang || "fr",
        {
          style: "currency",
          currency: currency || "USD"
        }
      ).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency || "USD"}`;
    }
  }

  /*
   * Expected normalized product object:
   * {
   *   id, name, slug, description, image,
   *   categoryName, price, compareAtPrice,
   *   currency, available, rating, reviewCount,
   *   popularity, createdAt
   * }
   *
   * These are frontend object properties, NOT assertions
   * about the names of database columns.
   * The data layer must map the actual schema to this shape.
   */

  function normalizeProduct(product) {
    if (!product || typeof product !== "object") {
      return null;
    }

    const id = product.id;

    if (id === undefined || id === null || String(id).trim() === "") {
      return null;
    }

    const name = String(product.name ?? "").trim();

    if (!name) {
      return null;
    }

    const price = Number(product.price);

    if (!Number.isFinite(price) || price < 0) {
      return null;
    }

    const compareAtPrice =
      product.compareAtPrice === null ||
      product.compareAtPrice === undefined ||
      product.compareAtPrice === ""
        ? null
        : Number(product.compareAtPrice);

    const safeCompareAtPrice =
      Number.isFinite(compareAtPrice) && compareAtPrice > price
        ? compareAtPrice
        : null;

    return {
      id: String(id),
      name,
      slug: String(product.slug ?? id),
      description: String(product.description ?? ""),
      image: safeURL(product.image),
      categoryName: String(product.categoryName ?? "").trim(),
      price,
      compareAtPrice: safeCompareAtPrice,
      currency: String(product.currency || "USD").toUpperCase(),
      available: product.available === true,
      rating: Number.isFinite(Number(product.rating))
        ? Number(product.rating)
        : null,
      reviewCount: Number.isFinite(Number(product.reviewCount))
        ? Math.max(0, Number(product.reviewCount))
        : 0,
      popularity: Number.isFinite(Number(product.popularity))
        ? Number(product.popularity)
        : 0,
      createdAt: product.createdAt
        ? Date.parse(product.createdAt) || 0
        : 0
    };
  }

  function setProducts(products) {
    if (!Array.isArray(products)) {
      setError(
        "Les données reçues ne sont pas au format attendu.",
        "Format de données invalide"
      );
      return;
    }

    state.products = products
      .map(normalizeProduct)
      .filter(Boolean);

    state.loaded = true;
    state.loading = false;
    state.error = null;
    state.page = 1;

    renderCategories();
    render();
  }

  function setLoading() {
    state.loading = true;
    state.loaded = false;
    state.error = null;

    elements.productGrid.innerHTML = Array.from(
      { length: 6 },
      () => `
        <div class="product-skeleton" aria-hidden="true">
          <div class="product-skeleton__image product-skeleton__line"></div>
          <div class="product-skeleton__body">
            <div class="product-skeleton__line product-skeleton__line--short"></div>
            <div class="product-skeleton__line"></div>
            <div class="product-skeleton__line product-skeleton__line--medium"></div>
          </div>
        </div>
      `
    ).join("");

    elements.productGrid.hidden = false;
    elements.productGrid.setAttribute("aria-busy", "true");
    elements.catalogState.classList.remove("is-visible");
    elements.catalogStatus.textContent = "Chargement…";
    elements.resultsSummary.textContent = "Chargement des produits…";
    elements.catalogPagination.hidden = true;
  }

  function setError(message, title = "Impossible de charger le catalogue") {
    state.loading = false;
    state.loaded = false;
    state.error = message;

    elements.productGrid.innerHTML = "";
    elements.productGrid.hidden = true;
    elements.productGrid.setAttribute("aria-busy", "false");

    showState(title, message, "error");

    elements.catalogStatus.textContent = "Erreur de chargement";
    elements.resultsSummary.textContent = "Le catalogue est momentanément indisponible.";
    elements.catalogPagination.hidden = true;
  }

  function renderCategories() {
    const categories = [
      ...new Set(
        state.products
          .map(product => product.categoryName)
          .filter(Boolean)
      )
    ].sort((a, b) => a.localeCompare(b, "fr"));

    const currentCategory = state.category;

    elements.categoryOptions.innerHTML = categories.length
      ? categories.map(category => `
          <label class="filter-option">
            <input
              type="radio"
              name="category"
              value="${escapeHTML(category)}"
              ${currentCategory === category ? "checked" : ""}
            >
            <span>${escapeHTML(category)}</span>
          </label>
        `).join("")
      : `<p class="filter-hint">Aucune catégorie disponible pour le moment.</p>`;

    elements.categoryOptions
      .querySelectorAll('input[name="category"]')
      .forEach(input => {
        input.addEventListener("change", () => {
          state.category = input.value;
          state.page = 1;
          render();
        });
      });

    const allCategoriesInput = document.querySelector(
      'input[name="category"][value=""]'
    );

    if (allCategoriesInput) {
      allCategoriesInput.checked = !currentCategory;
    }
  }

  function readFiltersFromForm() {
    state.search = elements.catalogSearch.value.trim();
    state.minPrice = elements.minPrice.value;
    state.maxPrice = elements.maxPrice.value;
    state.inStockOnly = elements.inStockOnly.checked;

    const selectedCategory = document.querySelector(
      'input[name="category"]:checked'
    );

    state.category = selectedCategory?.value || "";
    state.sort = elements.sortSelect.value;
    state.page = 1;
  }

  function getFilteredProducts() {
    const query = state.search.toLocaleLowerCase("fr");

    const min = state.minPrice === "" ? null : Number(state.minPrice);
    const max = state.maxPrice === "" ? null : Number(state.maxPrice);

    let products = state.products.filter(product => {
      if (query) {
        const searchableText = [
          product.name,
          product.description,
          product.categoryName
        ].join(" ").toLocaleLowerCase("fr");

        if (!searchableText.includes(query)) {
          return false;
        }
      }

      if (state.category && product.categoryName !== state.category) {
        return false;
      }

      if (min !== null && product.price < min) {
        return false;
      }

      if (max !== null && product.price > max) {
        return false;
      }

      if (state.inStockOnly && !product.available) {
        return false;
      }

      return true;
    });

    switch (state.sort) {
      case "newest":
        products.sort((a, b) => b.createdAt - a.createdAt);
        break;

      case "popular":
        products.sort((a, b) => b.popularity - a.popularity);
        break;

      case "price-asc":
        products.sort((a, b) => a.price - b.price);
        break;

      case "price-desc":
        products.sort((a, b) => b.price - a.price);
        break;

      case "name-asc":
        products.sort((a, b) => a.name.localeCompare(b.name, "fr"));
        break;

      default:
        // Keep the order chosen by the data layer for recommendations.
        break;
    }

    return products;
  }

  function createProductCard(product) {
    const productURL = `product.html?slug=${encodeURIComponent(product.slug)}`;
    const imageURL = product.image;
    const hasDiscount = product.compareAtPrice !== null;
    const outOfStock = !product.available;

    const badge = outOfStock
      ? `<span class="shop-product-card__badge shop-product-card__badge--out">Indisponible</span>`
      : hasDiscount
        ? `<span class="shop-product-card__badge shop-product-card__badge--sale">OFFRE</span>`
        : "";

    const image = imageURL
      ? `
        <a href="${productURL}" tabindex="-1" aria-hidden="true">
          <img src="${escapeHTML(imageURL)}"
               alt=""
               loading="lazy"
               decoding="async">
        </a>
      `
      : `
        <a href="${productURL}" tabindex="-1" aria-hidden="true">
          <div class="shop-product-card__placeholder">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <path d="m21 15-5-5L5 21"></path>
            </svg>
          </div>
        </a>
      `;

    const rating = product.rating !== null
      ? `
        <div class="shop-product-card__rating">
          <span class="rating-star" aria-hidden="true">★</span>
          <span>${escapeHTML(product.rating.toFixed(1))}</span>
          <span>(${escapeHTML(product.reviewCount)})</span>
        </div>
      `
      : "";

    const description = product.description
      ? `<p class="shop-product-card__description">${escapeHTML(product.description.slice(0, 110))}${product.description.length > 110 ? "…" : ""}</p>`
      : "";

    const category = product.categoryName
      ? `<p class="shop-product-card__category">${escapeHTML(product.categoryName)}</p>`
      : "";

    const availability = outOfStock
      ? `<div class="shop-product-card__availability is-unavailable">Indisponible</div>`
      : `<div class="shop-product-card__availability">Disponible</div>`;

    return `
      <article class="shop-product-card" data-product-id="${escapeHTML(product.id)}">
        <div class="shop-product-card__media">
          ${image}
          ${badge}
        </div>

        <div class="shop-product-card__details">
          ${category}
          <h3 class="shop-product-card__title">
            <a href="${productURL}">${escapeHTML(product.name)}</a>
          </h3>
          ${description}
          ${rating}

          <div class="shop-product-card__price-row">
            <span class="shop-product-card__price">
              ${escapeHTML(formatPrice(product.price, product.currency))}
            </span>
            ${hasDiscount
              ? `<span class="shop-product-card__old-price">${escapeHTML(formatPrice(product.compareAtPrice, product.currency))}</span>`
              : ""}
          </div>

          ${availability}

          <div class="shop-product-card__actions">
            <a class="shop-product-card__details-link" href="${productURL}">
              Voir le produit
            </a>
            <a class="shop-product-card__quick-add"
               href="wishlist.html"
               aria-label="Consulter mes favoris"
               title="Consulter mes favoris">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.8 8.8c0 5.1-8.8 10-8.8 10s-8.8-4.9-8.8-10A4.6 4.6 0 0 1 12 6.3a4.6 4.6 0 0 1 8.8 2.5Z"></path>
              </svg>
            </a>
          </div>
        </div>
      </article>
    `;
  }

  function showState(title, message, type = "empty") {
    elements.catalogState.classList.add("is-visible");
    elements.stateTitle.textContent = title;
    elements.stateMessage.textContent = message;
    elements.stateEyebrow.textContent =
      type === "error" ? "Connexion" : "Catalogue XELOS";

    elements.stateReset.hidden = type === "error";
  }

  function hideState() {
    elements.catalogState.classList.remove("is-visible");
  }

  function renderActiveFilters() {
    const filters = [];

    if (state.search) {
      filters.push({
        label: `Recherche : ${state.search}`,
        clear: () => {
          state.search = "";
          elements.catalogSearch.value = "";
        }
      });
    }

    if (state.category) {
      filters.push({
        label: state.category,
        clear: () => {
          state.category = "";
          document.querySelectorAll('input[name="category"]').forEach(input => {
            input.checked = input.value === "";
          });
        }
      });
    }

    if (state.minPrice !== "") {
      filters.push({
        label: `Min. ${state.minPrice}`,
        clear: () => {
          state.minPrice = "";
          elements.minPrice.value = "";
        }
      });
    }

    if (state.maxPrice !== "") {
      filters.push({
        label: `Max. ${state.maxPrice}`,
        clear: () => {
          state.maxPrice = "";
          elements.maxPrice.value = "";
        }
      });
    }

    if (state.inStockOnly) {
      filters.push({
        label: "Disponibles",
        clear: () => {
          state.inStockOnly = false;
          elements.inStockOnly.checked = false;
        }
      });
    }

    elements.activeFilters.innerHTML = filters.map((filter, index) => `
      <span class="filter-chip">
        ${escapeHTML(filter.label)}
        <button type="button" data-clear-filter="${index}" aria-label="Supprimer le filtre ${escapeHTML(filter.label)}">×</button>
      </span>
    `).join("");

    elements.activeFilters
      .querySelectorAll("[data-clear-filter]")
      .forEach(button => {
        button.addEventListener("click", () => {
          filters[Number(button.dataset.clearFilter)]?.clear();
          state.page = 1;
          render();
        });
      });

    elements.activeFilterCount.textContent = String(filters.length);
    elements.activeFilterCount.hidden = filters.length === 0;
  }

  function renderPagination(totalPages) {
    if (totalPages <= 1) {
      elements.catalogPagination.hidden = true;
      elements.paginationPages.innerHTML = "";
      return;
    }

    elements.catalogPagination.hidden = false;
    elements.previousPage.disabled = state.page <= 1;
    elements.nextPage.disabled = state.page >= totalPages;

    const pages = [];

    let start = Math.max(1, state.page - 2);
    let end = Math.min(totalPages, state.page + 2);

    if (end - start < 4) {
      if (start === 1) {
        end = Math.min(totalPages, 5);
      } else if (end === totalPages) {
        start = Math.max(1, totalPages - 4);
      }
    }

    if (start > 1) {
      pages.push({ label: "1", page: 1 });

      if (start > 2) {
        pages.push({ label: "…", page: null });
      }
    }

    for (let page = start; page <= end; page += 1) {
      pages.push({ label: String(page), page });
    }

    if (end < totalPages) {
      if (end < totalPages - 1) {
        pages.push({ label: "…", page: null });
      }

      pages.push({ label: String(totalPages), page: totalPages });
    }

    elements.paginationPages.innerHTML = pages.map(item => {
      if (item.page === null) {
        return `<span class="pagination-page" aria-hidden="true">…</span>`;
      }

      return `
        <button type="button"
                class="pagination-page ${item.page === state.page ? "is-active" : ""}"
                data-page="${item.page}"
                ${item.page === state.page ? 'aria-current="page"' : ""}>
          ${item.label}
        </button>
      `;
    }).join("");

    elements.paginationPages
      .querySelectorAll("[data-page]")
      .forEach(button => {
        button.addEventListener("click", () => {
          state.page = Number(button.dataset.page);
          render();
          scrollToCatalogResults();
        });
      });
  }

  function scrollToCatalogResults() {
    const top = elements.productGrid.getBoundingClientRect().top + window.scrollY - 130;

    window.scrollTo({
      top,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth"
    });
  }

  function render() {
    renderActiveFilters();

    if (state.loading) {
      return;
    }

    if (state.error) {
      return;
    }

    if (!state.loaded) {
      elements.productGrid.innerHTML = "";
      elements.productGrid.hidden = true;
      elements.productGrid.setAttribute("aria-busy", "false");

      showState(
        "Le catalogue se prépare",
        "Les produits réels seront affichés ici après leur chargement depuis la source de données XELOS."
      );

      elements.catalogStatus.textContent = "En attente des données";
      elements.resultsSummary.textContent = "Catalogue en attente.";
      elements.catalogPagination.hidden = true;
      return;
    }

    const products = getFilteredProducts();
    const totalProducts = products.length;
    const totalPages = Math.ceil(totalProducts / state.pageSize);

    if (totalPages > 0 && state.page > totalPages) {
      state.page = totalPages;
    }

    if (totalProducts === 0) {
      elements.productGrid.innerHTML = "";
      elements.productGrid.hidden = true;
      elements.productGrid.setAttribute("aria-busy", "false");

      elements.catalogStatus.textContent = "Aucun résultat";
      elements.resultsSummary.textContent = "0 produit trouvé";

      showState(
        state.products.length === 0
          ? "Le catalogue est vide"
          : "Aucun résultat",
        state.products.length === 0
          ? "Aucun produit n’a été fourni par la source de données."
          : "Aucun produit ne correspond à ces critères. Modifiez les filtres ou lancez une nouvelle recherche."
      );

      elements.stateReset.hidden = state.products.length === 0;
      elements.catalogPagination.hidden = true;
      return;
    }

    hideState();

    const startIndex = (state.page - 1) * state.pageSize;
    const pageProducts = products.slice(startIndex, startIndex + state.pageSize);

    elements.productGrid.classList.toggle(
      "product-grid--list",
      state.view === "list"
    );

    elements.productGrid.innerHTML = pageProducts
      .map(createProductCard)
      .join("");

    elements.productGrid.hidden = false;
    elements.productGrid.setAttribute("aria-busy", "false");

    const firstResult = startIndex + 1;
    const lastResult = Math.min(startIndex + state.pageSize, totalProducts);

    elements.resultsSummary.textContent =
      `Affichage de ${firstResult}–${lastResult} sur ${totalProducts} produit${totalProducts > 1 ? "s" : ""}`;

    elements.catalogStatus.textContent =
      `${state.products.length} produit${state.products.length > 1 ? "s" : ""} chargé${state.products.length > 1 ? "s" : ""}`;

    renderPagination(totalPages);
  }

  function clearFilters() {
    state.search = "";
    state.category = "";
    state.minPrice = "";
    state.maxPrice = "";
    state.inStockOnly = false;
    state.page = 1;

    elements.catalogSearch.value = "";
    elements.minPrice.value = "";
    elements.maxPrice.value = "";
    elements.inStockOnly.checked = false;

    const allCategoriesInput = document.querySelector(
      'input[name="category"][value=""]'
    );

    if (allCategoriesInput) {
      allCategoriesInput.checked = true;
    }

    render();
  }

  function setFiltersOpen(open) {
    state.filtersOpen = open;

    elements.catalogFilters.hidden = !open;
    elements.filterToggle.setAttribute("aria-expanded", String(open));
    elements.filterToggle.classList.toggle("is-active", open);
  }

  function toggleView() {
    state.view = state.view === "grid" ? "list" : "grid";

    elements.viewToggle.setAttribute(
      "aria-pressed",
      String(state.view === "list")
    );

    elements.viewToggle.setAttribute(
      "aria-label",
      state.view === "list"
        ? "Passer à l’affichage en grille"
        : "Passer à l’affichage en liste"
    );

    render();
  }

  function toggleMobileMenu() {
    const isOpen = elements.primaryNavigation.classList.toggle("is-open");

    elements.menuToggle.setAttribute("aria-expanded", String(isOpen));
    elements.menuToggle.setAttribute(
      "aria-label",
      isOpen ? "Fermer le menu" : "Ouvrir le menu"
    );
  }

  function handleHeaderSearch(event) {
    event.preventDefault();

    const query = elements.headerSearchInput.value.trim();

    elements.catalogSearch.value = query;
    state.search = query;
    state.page = 1;

    render();

    const catalog = getElement("catalogue");

    if (catalog) {
      catalog.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth"
      });
    }
  }

  function readURLParameters() {
    const params = new URLSearchParams(window.location.search);

    const search = params.get("q") || params.get("search") || "";
    const sort = params.get("sort") || "recommended";
    const category = params.get("category") || "";
    const min = params.get("min");
    const max = params.get("max");
    const available = params.get("available");

    state.search = search;
    state.category = category;
    state.minPrice = min !== null && min !== "" && Number(min) >= 0 ? min : "";
    state.maxPrice = max !== null && max !== "" && Number(max) >= 0 ? max : "";
    state.inStockOnly = available === "true";
    state.sort = [
      "recommended",
      "newest",
      "popular",
      "price-asc",
      "price-desc",
      "name-asc"
    ].includes(sort) ? sort : "recommended";

    elements.catalogSearch.value = state.search;
    elements.headerSearchInput.value = state.search;
    elements.minPrice.value = state.minPrice;
    elements.maxPrice.value = state.maxPrice;
    elements.inStockOnly.checked = state.inStockOnly;
    elements.sortSelect.value = state.sort;
  }

  function validatePriceInputs() {
    const min = elements.minPrice.value;
    const max = elements.maxPrice.value;

    elements.minPrice.setCustomValidity("");
    elements.maxPrice.setCustomValidity("");

    if (min !== "" && (!Number.isFinite(Number(min)) || Number(min) < 0)) {
      elements.minPrice.setCustomValidity("Entrez un prix minimum positif.");
    }

    if (max !== "" && (!Number.isFinite(Number(max)) || Number(max) < 0)) {
      elements.maxPrice.setCustomValidity("Entrez un prix maximum positif.");
    }

    if (
      min !== "" &&
      max !== "" &&
      Number.isFinite(Number(min)) &&
      Number.isFinite(Number(max)) &&
      Number(min) > Number(max)
    ) {
      elements.maxPrice.setCustomValidity(
        "Le prix maximum doit être supérieur ou égal au prix minimum."
      );
    }

    return elements.minPrice.reportValidity() &&
      elements.maxPrice.reportValidity();
  }

  function bindEvents() {
    elements.menuToggle.addEventListener("click", toggleMobileMenu);

    elements.primaryNavigation.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => {
        elements.primaryNavigation.classList.remove("is-open");
        elements.menuToggle.setAttribute("aria-expanded", "false");
        elements.menuToggle.setAttribute("aria-label", "Ouvrir le menu");
      });
    });

    elements.headerSearch.addEventListener("submit", handleHeaderSearch);

    elements.catalogSearch.addEventListener("input", () => {
      state.search = elements.catalogSearch.value.trim();
      state.page = 1;
      render();
    });

    elements.filterToggle.addEventListener("click", () => {
      setFiltersOpen(!state.filtersOpen);
    });

    elements.clearFilters.addEventListener("click", clearFilters);
    elements.stateReset.addEventListener("click", clearFilters);

    elements.applyFilters.addEventListener("click", () => {
      if (!validatePriceInputs()) {
        return;
      }

      readFiltersFromForm();
      render();
    });

    elements.minPrice.addEventListener("change", () => {
      if (validatePriceInputs()) {
        readFiltersFromForm();
        render();
      }
    });

    elements.maxPrice.addEventListener("change", () => {
      if (validatePriceInputs()) {
        readFiltersFromForm();
        render();
      }
    });

    elements.inStockOnly.addEventListener("change", () => {
      state.inStockOnly = elements.inStockOnly.checked;
      state.page = 1;
      render();
    });

    elements.sortSelect.addEventListener("change", () => {
      state.sort = elements.sortSelect.value;
      state.page = 1;
      render();
    });

    elements.viewToggle.addEventListener("click", toggleView);

    elements.previousPage.addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;
        render();
        scrollToCatalogResults();
      }
    });

    elements.nextPage.addEventListener("click", () => {
      const totalPages = Math.ceil(
        getFilteredProducts().length / state.pageSize
      );

      if (state.page < totalPages) {
        state.page += 1;
        render();
        scrollToCatalogResults();
      }
    });

    // A page-level listener can be used by the data layer when it
    // has loaded and normalized the real catalog.
    window.addEventListener("xelos:catalog-data", event => {
      setProducts(event.detail?.products);
    });

    window.addEventListener("xelos:catalog-loading", setLoading);

    window.addEventListener("xelos:catalog-error", event => {
      setError(
        event.detail?.message || "Une erreur empêche le chargement du catalogue."
      );
    });
  }

  function init() {
    cacheElements();

    elements.currentYear.textContent = String(new Date().getFullYear());

    readURLParameters();
    renderCategories();
    bindEvents();

    // No invented table names, columns, demo products or direct database
    // queries here. The centralized data layer supplies actual records
    // once its real schema mapping has been verified.
    render();
  }

  return {
    init,
    setProducts,
    setLoading,
    setError,
    clearFilters
  };
})();

document.addEventListener("DOMContentLoaded", Shop.init);

export default Shop;
