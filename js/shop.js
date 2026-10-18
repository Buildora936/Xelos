
/**
 * XELOS — Shop / Catalogue
 * File: js/shop.js
 *
 * Flow: shop.js -> data.js -> Supabase
 * Public catalogue: products, product_media, product_prices
 * No demo products, invented tables or fabricated prices.
 */

import { selectRows } from "./data.js";

const Shop = (() => {
  "use strict";

  const PAGE_SIZE = 12;
  const $ = (selector, root = document) => root.querySelector(selector);
  const byId = (id) => document.getElementById(id);

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

  const elementIds = [
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
  ];

  function cacheElements() {
    elementIds.forEach((id) => {
      elements[id] = byId(id);
    });
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function safeURL(value) {
    if (typeof value !== "string" || !value.trim()) return "";

    try {
      const url = new URL(value, window.location.href);

      return ["http:", "https:"].includes(url.protocol)
        ? url.href
        : "";
    } catch {
      return "";
    }
  }

  function productURL(product) {
    const url = new URL("product.html", window.location.href);
    url.searchParams.set("id", String(product.id));
    return `${url.pathname}${url.search}`;
  }

  function formatPrice(amount, currency = "USD") {
    const value = Number(amount);

    if (!Number.isFinite(value)) return "";

    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: String(currency || "USD").toUpperCase()
      }).format(value);
    } catch {
      return `${value.toFixed(2)} ${currency || "USD"}`;
    }
  }

  function showState(title, message, type = "empty") {
    if (!elements.catalogState) return;

    elements.catalogState.classList.add("is-visible");

    if (elements.stateTitle) {
      elements.stateTitle.textContent = title;
    }

    if (elements.stateMessage) {
      elements.stateMessage.textContent = message;
    }

    if (elements.stateEyebrow) {
      elements.stateEyebrow.textContent =
        type === "error" ? "CATALOGUE CONNECTION" : "XELOS CATALOGUE";
    }

    if (elements.stateReset) {
      elements.stateReset.hidden = type === "error";
    }
  }

  function hideState() {
    elements.catalogState?.classList.remove("is-visible");
  }

  function setLoading() {
    state.loading = true;
    state.loaded = false;
    state.error = null;

    if (elements.productGrid) {
      elements.productGrid.hidden = false;
      elements.productGrid.setAttribute("aria-busy", "true");
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
    }

    hideState();

    if (elements.catalogStatus) {
      elements.catalogStatus.textContent = "Loading catalogue…";
    }

    if (elements.resultsSummary) {
      elements.resultsSummary.textContent = "Loading products…";
    }

    if (elements.catalogPagination) {
      elements.catalogPagination.hidden = true;
    }
  }

  function setError(message) {
    state.loading = false;
    state.loaded = false;
    state.error = message;

    if (elements.productGrid) {
      elements.productGrid.replaceChildren();
      elements.productGrid.hidden = true;
      elements.productGrid.setAttribute("aria-busy", "false");
    }

    showState("Catalogue unavailable", message, "error");

    if (elements.catalogStatus) {
      elements.catalogStatus.textContent = "Loading error";
    }

    if (elements.resultsSummary) {
      elements.resultsSummary.textContent =
        "The catalogue is temporarily unavailable.";
    }

    if (elements.catalogPagination) {
      elements.catalogPagination.hidden = true;
    }
  }

  function getProductMedia(mediaRows, productId) {
    return mediaRows
      .filter((media) =>
        media.product_id === productId &&
        media.is_active === true &&
        media.media_type === "image"
      )
      .sort((a, b) => {
        if (Boolean(a.is_primary) !== Boolean(b.is_primary)) {
          return a.is_primary ? -1 : 1;
        }

        return Number(a.position ?? 0) - Number(b.position ?? 0);
      });
  }

  function getCurrentPrices(priceRows, productId) {
    const now = Date.now();

    return priceRows.filter((price) => {
      if (price.product_id !== productId || price.is_active !== true) {
        return false;
      }

      const startsAt = price.starts_at
        ? Date.parse(price.starts_at)
        : 0;

      const endsAt = price.ends_at
        ? Date.parse(price.ends_at)
        : null;

      if (Number.isFinite(startsAt) && startsAt > now) return false;
      if (endsAt !== null && Number.isFinite(endsAt) && endsAt <= now) {
        return false;
      }

      return ["regular", "sale", "compare_at"].includes(price.price_type);
    });
  }

  function normalizeProduct(product, mediaRows, priceRows) {
    if (!product || product.status !== "active" ||
        product.visibility !== "public") {
      return null;
    }

    if (product.id == null || !String(product.name ?? "").trim()) {
      return null;
    }

    const media = getProductMedia(mediaRows, product.id);
    const validMedia = media.find((item) =>
      safeURL(item.url) || safeURL(item.thumbnail_url)
    );

    const prices = getCurrentPrices(priceRows, product.id);

    const regularPrices = prices
      .filter((item) => item.price_type === "regular")
      .sort((a, b) => Date.parse(b.starts_at || 0) - Date.parse(a.starts_at || 0));

    const salePrices = prices
      .filter((item) => item.price_type === "sale")
      .sort((a, b) => Date.parse(b.starts_at || 0) - Date.parse(a.starts_at || 0));

    const comparePrices = prices
      .filter((item) => item.price_type === "compare_at")
      .sort((a, b) => Date.parse(b.starts_at || 0) - Date.parse(a.starts_at || 0));

    const regular = regularPrices[0];
    const sale = salePrices[0];
    const compare = comparePrices[0];

    // A sale price is used only when a valid regular price also exists.
    const useSale = Boolean(
      sale &&
      regular &&
      Number(sale.amount) >= 0 &&
      Number(sale.amount) < Number(regular.amount)
    );

    const selectedPrice = useSale ? sale : (regular || sale);

    if (!selectedPrice || !Number.isFinite(Number(selectedPrice.amount))) {
      // Never invent or display a fabricated price.
      return null;
    }

    const amount = Number(selectedPrice.amount);
    const compareAmount = useSale
      ? Number(regular.amount)
      : Number(compare?.amount);

    const compareAtPrice =
      Number.isFinite(compareAmount) && compareAmount > amount
        ? compareAmount
        : null;

    const image = validMedia
      ? safeURL(validMedia.url) || safeURL(validMedia.thumbnail_url)
      : "";

    return {
      id: String(product.id),
      name: String(product.name).trim(),
      slug: String(product.slug || product.id),
      description: String(product.short_description || product.description || ""),
      image,
      categoryName: "",
      price: amount,
      compareAtPrice,
      currency: String(selectedPrice.currency_code || "USD").toUpperCase(),
      // Inventory schema has not been confirmed; do not fabricate stock status.
      available: null,
      rating: null,
      reviewCount: 0,
      popularity: product.is_best_seller === true ? 2 :
        product.is_featured === true ? 1 : 0,
      isNewArrival: product.is_new_arrival === true,
      isBestSeller: product.is_best_seller === true,
      createdAt: product.created_at ? Date.parse(product.created_at) || 0 : 0
    };
  }

  async function loadCatalogue() {
    setLoading();

    try {
      // RLS restricts public reads to active, public products.
      // These queries intentionally do not depend on unsupported filter syntax.
      const [productRows, mediaRows, priceRows] = await Promise.all([
        selectRows("products", {
          limit: 1000,
          orderBy: "created_at",
          ascending: false
        }),
        selectRows("product_media", {
          limit: 5000,
          orderBy: "position",
          ascending: true
        }),
        selectRows("product_prices", {
          limit: 5000,
          orderBy: "starts_at",
          ascending: false
        })
      ]);

      if (!Array.isArray(productRows)) {
        throw new Error("The products query did not return a valid list.");
      }

      const media = Array.isArray(mediaRows) ? mediaRows : [];
      const prices = Array.isArray(priceRows) ? priceRows : [];

      state.products = productRows
        .map((product) => normalizeProduct(product, media, prices))
        .filter(Boolean);

      state.loaded = true;
      state.loading = false;
      state.error = null;
      state.page = 1;

      renderCategories();
      render();
    } catch (error) {
      console.error("XELOS shop: catalogue loading failed.", {
        code: error?.code ?? null,
        message: error?.message ?? String(error),
        details: error?.details ?? null,
        hint: error?.hint ?? null
      });

      let message =
        "The catalogue could not be loaded. Check the browser console for the Supabase error.";

      if (error?.code === "42501") {
        message =
          "Public read access is blocked. Check the SELECT RLS policies for products, product_media and product_prices.";
      } else if (
        error?.code === "PGRST205" ||
        error?.code === "42P01"
      ) {
        message =
          "Supabase could not find a required catalogue table. Check the active project and exposed schema.";
      }

      setError(message);
    }
  }

  function renderCategories() {
    if (!elements.categoryOptions) return;

    // No category relation has been confirmed for this page yet.
    elements.categoryOptions.innerHTML = `
      <p class="filter-hint">
        Category filtering will be available when the catalogue's
        category relationship is connected.
      </p>
    `;
  }

  function readFiltersFromForm() {
    if (elements.catalogSearch) {
      state.search = elements.catalogSearch.value.trim();
    }

    if (elements.minPrice) state.minPrice = elements.minPrice.value;
    if (elements.maxPrice) state.maxPrice = elements.maxPrice.value;

    if (elements.inStockOnly) {
      state.inStockOnly = elements.inStockOnly.checked;
    }

    if (elements.sortSelect) state.sort = elements.sortSelect.value;

    state.page = 1;
  }

  function getFilteredProducts() {
    const query = state.search.toLocaleLowerCase("en-US");
    const min = state.minPrice === "" ? null : Number(state.minPrice);
    const max = state.maxPrice === "" ? null : Number(state.maxPrice);

    let products = state.products.filter((product) => {
      if (query) {
        const searchableText = [
          product.name,
          product.description,
          product.categoryName
        ].join(" ").toLocaleLowerCase("en-US");

        if (!searchableText.includes(query)) return false;
      }

      if (state.category && product.categoryName !== state.category) {
        return false;
      }

      if (min !== null && product.price < min) return false;
      if (max !== null && product.price > max) return false;

      // Do not claim a product is in stock without verified inventory data.
      if (state.inStockOnly && product.available !== true) return false;

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
        products.sort((a, b) => a.name.localeCompare(b.name, "en"));
        break;

      default:
        products.sort((a, b) =>
          Number(b.isBestSeller) - Number(a.isBestSeller) ||
          Number(b.isNewArrival) - Number(a.isNewArrival) ||
          b.createdAt - a.createdAt
        );
    }

    return products;
  }

  function createProductCard(product) {
    const url = productURL(product);
    const hasDiscount = product.compareAtPrice !== null;

    const imageMarkup = product.image
      ? `
        <a href="${url}" tabindex="-1" aria-hidden="true">
          <img
            src="${escapeHTML(product.image)}"
            alt=""
            loading="lazy"
            decoding="async"
          >
        </a>
      `
      : `
        <a href="${url}" tabindex="-1" aria-hidden="true">
          <div class="shop-product-card__placeholder">
            <span aria-hidden="true">X</span>
          </div>
        </a>
      `;

    const badge = product.isNewArrival
      ? `<span class="shop-product-card__badge">NEW</span>`
      : hasDiscount
        ? `<span class="shop-product-card__badge shop-product-card__badge--sale">SALE</span>`
        : "";

    const description = product.description
      ? `<p class="shop-product-card__description">${escapeHTML(
          product.description.slice(0, 110)
        )}${product.description.length > 110 ? "…" : ""}</p>`
      : "";

    return `
      <article class="shop-product-card" data-product-id="${escapeHTML(product.id)}">
        <div class="shop-product-card__media">
          ${imageMarkup}
          ${badge}
        </div>

        <div class="shop-product-card__details">
          <h3 class="shop-product-card__title">
            <a href="${url}">${escapeHTML(product.name)}</a>
          </h3>

          ${description}

          <div class="shop-product-card__price-row">
            <span class="shop-product-card__price">
              ${escapeHTML(formatPrice(product.price, product.currency))}
            </span>
            ${hasDiscount
              ? `<span class="shop-product-card__old-price">${escapeHTML(
                  formatPrice(product.compareAtPrice, product.currency)
                )}</span>`
              : ""}
          </div>

          <div class="shop-product-card__actions">
            <a class="shop-product-card__details-link" href="${url}">
              View product
            </a>
            <a
              class="shop-product-card__quick-add"
              href="wishlist.html"
              aria-label="Open wishlist"
              title="Open wishlist"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20.8 8.8c0 5.1-8.8 10-8.8 10s-8.8-4.9-8.8-10A4.6 4.6 0 0 1 12 6.3a4.6 4.6 0 0 1 8.8 2.5Z"></path>
              </svg>
            </a>
          </div>
        </div>
      </article>
    `;
  }

  function renderActiveFilters() {
    if (!elements.activeFilters) return;

    const filters = [];

    if (state.search) {
      filters.push({
        label: `Search: ${state.search}`,
        clear: () => {
          state.search = "";
          if (elements.catalogSearch) elements.catalogSearch.value = "";
          if (elements.headerSearchInput) elements.headerSearchInput.value = "";
        }
      });
    }

    if (state.minPrice !== "") {
      filters.push({
        label: `Min. ${state.minPrice}`,
        clear: () => {
          state.minPrice = "";
          if (elements.minPrice) elements.minPrice.value = "";
        }
      });
    }

    if (state.maxPrice !== "") {
      filters.push({
        label: `Max. ${state.maxPrice}`,
        clear: () => {
          state.maxPrice = "";
          if (elements.maxPrice) elements.maxPrice.value = "";
        }
      });
    }

    if (state.inStockOnly) {
      filters.push({
        label: "In stock",
        clear: () => {
          state.inStockOnly = false;
          if (elements.inStockOnly) elements.inStockOnly.checked = false;
        }
      });
    }

    elements.activeFilters.innerHTML = filters.map((filter, index) => `
      <span class="filter-chip">
        ${escapeHTML(filter.label)}
        <button
          type="button"
          data-clear-filter="${index}"
          aria-label="Remove filter ${escapeHTML(filter.label)}"
        >×</button>
      </span>
    `).join("");

    elements.activeFilters.querySelectorAll("[data-clear-filter]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          filters[Number(button.dataset.clearFilter)]?.clear();
          state.page = 1;
          render();
        });
      });

    if (elements.activeFilterCount) {
      elements.activeFilterCount.textContent = String(filters.length);
      elements.activeFilterCount.hidden = filters.length === 0;
    }
  }

  function renderPagination(totalPages) {
    if (!elements.catalogPagination || !elements.paginationPages) return;

    if (totalPages <= 1) {
      elements.catalogPagination.hidden = true;
      elements.paginationPages.innerHTML = "";
      return;
    }

    elements.catalogPagination.hidden = false;

    if (elements.previousPage) {
      elements.previousPage.disabled = state.page <= 1;
    }

    if (elements.nextPage) {
      elements.nextPage.disabled = state.page >= totalPages;
    }

    const start = Math.max(1, Math.min(state.page - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);
    const pages = [];

    if (start > 1) pages.push({ label: "1", page: 1 });
    if (start > 2) pages.push({ label: "…", page: null });

    for (let page = start; page <= end; page += 1) {
      pages.push({ label: String(page), page });
    }

    if (end < totalPages - 1) pages.push({ label: "…", page: null });
    if (end < totalPages) pages.push({ label: String(totalPages), page: totalPages });

    elements.paginationPages.innerHTML = pages.map((item) => {
      if (item.page === null) {
        return `<span class="pagination-page" aria-hidden="true">…</span>`;
      }

      return `
        <button
          type="button"
          class="pagination-page ${item.page === state.page ? "is-active" : ""}"
          data-page="${item.page}"
          ${item.page === state.page ? 'aria-current="page"' : ""}
        >${item.label}</button>
      `;
    }).join("");

    elements.paginationPages.querySelectorAll("[data-page]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          state.page = Number(button.dataset.page);
          render();
          scrollToResults();
        });
      });
  }

  function scrollToResults() {
    if (!elements.productGrid) return;

    const top = elements.productGrid.getBoundingClientRect().top +
      window.scrollY - 130;

    window.scrollTo({
      top,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth"
    });
  }

  function render() {
    renderActiveFilters();

    if (state.loading || state.error || !elements.productGrid) return;

    if (!state.loaded) {
      elements.productGrid.replaceChildren();
      elements.productGrid.hidden = true;

      showState(
        "Your next discovery starts here",
        "Products will appear when the catalogue has loaded."
      );

      return;
    }

    const products = getFilteredProducts();
    const totalProducts = products.length;
    const totalPages = Math.ceil(totalProducts / state.pageSize);

    if (totalPages > 0 && state.page > totalPages) {
      state.page = totalPages;
    }

    if (totalProducts === 0) {
      elements.productGrid.replaceChildren();
      elements.productGrid.hidden = true;
      elements.productGrid.setAttribute("aria-busy", "false");

      if (elements.catalogStatus) {
        elements.catalogStatus.textContent = "No results";
      }

      if (elements.resultsSummary) {
        elements.resultsSummary.textContent = "0 products found";
      }

      showState(
        state.products.length === 0 ? "The catalogue is empty" : "No results found",
        state.products.length === 0
          ? "There are no publicly available products with valid prices yet."
          : "No products match these filters. Try changing your search."
      );

      if (elements.stateReset) {
        elements.stateReset.hidden = state.products.length === 0;
      }

      if (elements.catalogPagination) {
        elements.catalogPagination.hidden = true;
      }

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

    if (elements.resultsSummary) {
      const first = startIndex + 1;
      const last = Math.min(startIndex + state.pageSize, totalProducts);
      elements.resultsSummary.textContent =
        `Showing ${first}–${last} of ${totalProducts} products`;
    }

    if (elements.catalogStatus) {
      elements.catalogStatus.textContent = `${state.products.length} products loaded`;
    }

    renderPagination(totalPages);
  }

  function clearFilters() {
    state.search = "";
    state.category = "";
    state.minPrice = "";
    state.maxPrice = "";
    state.inStockOnly = false;
    state.page = 1;

    if (elements.catalogSearch) elements.catalogSearch.value = "";
    if (elements.headerSearchInput) elements.headerSearchInput.value = "";
    if (elements.minPrice) elements.minPrice.value = "";
    if (elements.maxPrice) elements.maxPrice.value = "";
    if (elements.inStockOnly) elements.inStockOnly.checked = false;

    render();
  }

  function setFiltersOpen(open) {
    state.filtersOpen = open;

    if (elements.catalogFilters) elements.catalogFilters.hidden = !open;

    if (elements.filterToggle) {
      elements.filterToggle.setAttribute("aria-expanded", String(open));
      elements.filterToggle.classList.toggle("is-active", open);
    }
  }

  function toggleView() {
    state.view = state.view === "grid" ? "list" : "grid";

    if (elements.viewToggle) {
      elements.viewToggle.setAttribute(
        "aria-pressed",
        String(state.view === "list")
      );

      elements.viewToggle.setAttribute(
        "aria-label",
        state.view === "list" ? "Switch to grid view" : "Switch to list view"
      );
    }

    render();
  }

  function toggleMobileMenu() {
    if (!elements.primaryNavigation || !elements.menuToggle) return;

    const isOpen = elements.primaryNavigation.classList.toggle("is-open");

    elements.menuToggle.setAttribute("aria-expanded", String(isOpen));
    elements.menuToggle.setAttribute(
      "aria-label",
      isOpen ? "Close navigation menu" : "Open navigation menu"
    );
  }

  function handleHeaderSearch(event) {
    event.preventDefault();

    const query = elements.headerSearchInput?.value.trim() || "";

    if (elements.catalogSearch) elements.catalogSearch.value = query;

    state.search = query;
    state.page = 1;
    render();

    byId("catalogue")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth"
    });
  }

  function readURLParameters() {
    const params = new URLSearchParams(window.location.search);

    state.search = params.get("q") || params.get("search") || "";
    state.minPrice = params.get("min") || "";
    state.maxPrice = params.get("max") || "";
    state.inStockOnly = params.get("available") === "true";

    const sort = params.get("sort") || "recommended";
    const validSorts = [
      "recommended",
      "newest",
      "popular",
      "price-asc",
      "price-desc",
      "name-asc"
    ];

    state.sort = validSorts.includes(sort) ? sort : "recommended";

    if (elements.catalogSearch) elements.catalogSearch.value = state.search;
    if (elements.headerSearchInput) {
      elements.headerSearchInput.value = state.search;
    }
    if (elements.minPrice) elements.minPrice.value = state.minPrice;
    if (elements.maxPrice) elements.maxPrice.value = state.maxPrice;
    if (elements.inStockOnly) {
      elements.inStockOnly.checked = state.inStockOnly;
    }
    if (elements.sortSelect) elements.sortSelect.value = state.sort;
  }

  function validatePriceInputs() {
    const min = elements.minPrice?.value ?? "";
    const max = elements.maxPrice?.value ?? "";

    elements.minPrice?.setCustomValidity("");
    elements.maxPrice?.setCustomValidity("");

    if (min !== "" && (!Number.isFinite(Number(min)) || Number(min) < 0)) {
      elements.minPrice?.setCustomValidity("Enter a valid minimum price.");
    }

    if (max !== "" && (!Number.isFinite(Number(max)) || Number(max) < 0)) {
      elements.maxPrice?.setCustomValidity("Enter a valid maximum price.");
    }

    if (
      min !== "" &&
      max !== "" &&
      Number.isFinite(Number(min)) &&
      Number.isFinite(Number(max)) &&
      Number(min) > Number(max)
    ) {
      elements.maxPrice?.setCustomValidity(
        "Maximum price must be greater than or equal to minimum price."
      );
    }

    const minValid = !elements.minPrice || elements.minPrice.reportValidity();
    const maxValid = !elements.maxPrice || elements.maxPrice.reportValidity();

    return minValid && maxValid;
  }

  function bindEvents() {
    elements.menuToggle?.addEventListener("click", toggleMobileMenu);

    elements.primaryNavigation?.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        elements.primaryNavigation.classList.remove("is-open");
        elements.menuToggle?.setAttribute("aria-expanded", "false");
        elements.menuToggle?.setAttribute("aria-label", "Open navigation menu");
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        elements.primaryNavigation?.classList.remove("is-open");
        elements.menuToggle?.setAttribute("aria-expanded", "false");
      }
    });

    elements.headerSearch?.addEventListener("submit", handleHeaderSearch);

    elements.catalogSearch?.addEventListener("input", () => {
      state.search = elements.catalogSearch.value.trim();
      state.page = 1;
      render();
    });

    elements.filterToggle?.addEventListener("click", () => {
      setFiltersOpen(!state.filtersOpen);
    });

    elements.clearFilters?.addEventListener("click", clearFilters);
    elements.stateReset?.addEventListener("click", clearFilters);

    elements.applyFilters?.addEventListener("click", () => {
      if (!validatePriceInputs()) return;
      readFiltersFromForm();
      render();
    });

    elements.minPrice?.addEventListener("change", () => {
      if (validatePriceInputs()) {
        readFiltersFromForm();
        render();
      }
    });

    elements.maxPrice?.addEventListener("change", () => {
      if (validatePriceInputs()) {
        readFiltersFromForm();
        render();
      }
    });

    elements.inStockOnly?.addEventListener("change", () => {
      state.inStockOnly = elements.inStockOnly.checked;
      state.page = 1;
      render();
    });

    elements.sortSelect?.addEventListener("change", () => {
      state.sort = elements.sortSelect.value;
      state.page = 1;
      render();
    });

    elements.viewToggle?.addEventListener("click", toggleView);

    elements.previousPage?.addEventListener("click", () => {
      if (state.page > 1) {
        state.page -= 1;
        render();
        scrollToResults();
      }
    });

    elements.nextPage?.addEventListener("click", () => {
      const totalPages = Math.ceil(
        getFilteredProducts().length / state.pageSize
      );

      if (state.page < totalPages) {
        state.page += 1;
        render();
        scrollToResults();
      }
    });
  }

  function init() {
    cacheElements();

    if (elements.currentYear) {
      elements.currentYear.textContent = String(new Date().getFullYear());
    }

    if (!elements.productGrid) {
      console.error(
        "XELOS shop: #productGrid was not found. Check the IDs in shop.html."
      );
      return;
    }

    readURLParameters();
    bindEvents();
    renderCategories();
    loadCatalogue();
  }

  return {
    init,
    loadCatalogue,
    clearFilters
  };
})();

document.addEventListener("DOMContentLoaded", Shop.init);

export default Shop;
