
/**
 * XELOS — Shop / Catalogue
 * File: js/shop.js
 *
 * Data flow: shop.js -> data.js -> Supabase
 * Authentication: existing Supabase session
 *
 * Catalogue tables:
 * - products
 * - product_media
 * - product_prices
 *
 * No demo products or fabricated prices.
 */

import { selectRows } from "./data.js";
import * as SupabaseModule from "./supabase.js";

const Shop = (() => {
  "use strict";

  const PAGE_SIZE = 12;
  const $ = (selector, root = document) => root.querySelector(selector);
  const byId = (id) => document.getElementById(id);

  const supabase =
    SupabaseModule.supabase ??
    SupabaseModule.default?.supabase ??
    SupabaseModule.default ??
    null;

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
    sort: "recommended",
    user: null
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
    "currentYear",
    "cartCount"
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

      if (!["http:", "https:"].includes(url.protocol)) return "";

      return url.href;
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

    const code = String(currency || "USD").toUpperCase();

    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: code
      }).format(value);
    } catch {
      return `${value.toFixed(2)} ${code}`;
    }
  }

  function setStatus(message) {
    if (elements.catalogStatus) {
      elements.catalogStatus.textContent = message;
    }
  }

  function showState(title, message, type = "empty") {
    if (!elements.catalogState) return;

    elements.catalogState.classList.add("is-visible");
    elements.catalogState.hidden = false;

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
    if (!elements.catalogState) return;

    elements.catalogState.classList.remove("is-visible");
    elements.catalogState.hidden = true;
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
    setStatus("Loading catalogue…");

    if (elements.resultsSummary) {
      elements.resultsSummary.textContent = "Loading products…";
    }

    if (elements.catalogPagination) {
      elements.catalogPagination.hidden = true;
    }
  }

  function setError(message, technicalError = null) {
    state.loading = false;
    state.loaded = false;
    state.error = message;

    if (elements.productGrid) {
      elements.productGrid.replaceChildren();
      elements.productGrid.hidden = true;
      elements.productGrid.setAttribute("aria-busy", "false");
    }

    showState("Catalogue unavailable", message, "error");
    setStatus("Unable to load catalogue.");

    if (elements.resultsSummary) {
      elements.resultsSummary.textContent =
        "The catalogue could not be loaded.";
    }

    if (elements.catalogPagination) {
      elements.catalogPagination.hidden = true;
    }

    if (technicalError) {
      console.error("XELOS catalogue error:", {
        message: technicalError.message ?? String(technicalError),
        code: technicalError.code ?? null,
        details: technicalError.details ?? null,
        hint: technicalError.hint ?? null
      });
    }
  }

  /**
   * Accept either an array or a common { data, error } response.
   * If the wrapper returns an error object, surface it instead of
   * silently rendering an empty catalogue.
   */
  function unwrapRows(result, tableName) {
    if (result?.error) {
      throw result.error;
    }

    const rows = Array.isArray(result)
      ? result
      : Array.isArray(result?.data)
        ? result.data
        : null;

    if (!rows) {
      throw new Error(
        `selectRows("${tableName}") did not return an array. ` +
        "Inspect the return value of js/data.js."
      );
    }

    return rows;
  }

  async function queryRows(tableName, options) {
    const result = await selectRows(tableName, options);
    return unwrapRows(result, tableName);
  }

  function sameId(first, second) {
    if (first == null || second == null) return false;
    return String(first) === String(second);
  }

  function isPublicProduct(product) {
    if (!product) return false;

    const status = String(product.status ?? "").toLowerCase();
    const visibility = String(product.visibility ?? "").toLowerCase();

    return status === "active" && visibility === "public";
  }

  function getProductMedia(mediaRows, productId) {
    return mediaRows
      .filter((media) =>
        sameId(media.product_id, productId) &&
        media.is_active !== false &&
        String(media.media_type ?? "image").toLowerCase() === "image"
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
      if (!sameId(price.product_id, productId)) return false;
      if (price.is_active === false) return false;

      const startsAt = price.starts_at
        ? Date.parse(price.starts_at)
        : 0;

      const endsAt = price.ends_at
        ? Date.parse(price.ends_at)
        : null;

      if (Number.isFinite(startsAt) && startsAt > now) return false;

      if (
        endsAt !== null &&
        Number.isFinite(endsAt) &&
        endsAt <= now
      ) {
        return false;
      }

      return ["regular", "sale", "compare_at"].includes(
        String(price.price_type ?? "").toLowerCase()
      );
    });
  }

  function latestPrice(rows, type) {
    return rows
      .filter((row) => row.price_type === type)
      .sort((a, b) => {
        const dateA = a.starts_at ? Date.parse(a.starts_at) || 0 : 0;
        const dateB = b.starts_at ? Date.parse(b.starts_at) || 0 : 0;

        return dateB - dateA;
      })[0] ?? null;
  }

  function normalizeProduct(product, mediaRows, priceRows) {
    if (!product || !isPublicProduct(product)) return null;

    if (product.id == null || !String(product.name ?? "").trim()) {
      return null;
    }

    const media = getProductMedia(mediaRows, product.id);

    const validMedia = media.find((item) =>
      safeURL(item.url) || safeURL(item.thumbnail_url)
    );

    const prices = getCurrentPrices(priceRows, product.id);

    const regular = latestPrice(prices, "regular");
    const sale = latestPrice(prices, "sale");
    const compare = latestPrice(prices, "compare_at");

    const regularAmount = regular ? Number(regular.amount) : NaN;
    const saleAmount = sale ? Number(sale.amount) : NaN;

    const useSale = Boolean(
      regular &&
      sale &&
      Number.isFinite(regularAmount) &&
      Number.isFinite(saleAmount) &&
      saleAmount >= 0 &&
      saleAmount < regularAmount
    );

    const selectedPrice = useSale ? sale : regular;

    let amount = null;
    let currency = "USD";

    if (selectedPrice && Number.isFinite(Number(selectedPrice.amount))) {
      amount = Number(selectedPrice.amount);
      currency = String(selectedPrice.currency_code || "USD").toUpperCase();
    }

    const compareAmount = useSale
      ? regularAmount
      : compare
        ? Number(compare.amount)
        : NaN;

    const compareAtPrice =
      amount !== null &&
      Number.isFinite(compareAmount) &&
      compareAmount > amount
        ? compareAmount
        : null;

    const image = validMedia
      ? safeURL(validMedia.url) || safeURL(validMedia.thumbnail_url)
      : "";

    return {
      id: String(product.id),
      name: String(product.name).trim(),
      slug: String(product.slug || product.id),
      description: String(
        product.short_description || product.description || ""
      ),
      image,
      categoryName: String(
        product.category_name ||
        product.category ||
        ""
      ),
      price: amount,
      compareAtPrice,
      currency,
      available: null,
      rating: null,
      reviewCount: 0,
      popularity: product.is_best_seller === true ? 2 :
        product.is_featured === true ? 1 : 0,
      isNewArrival: product.is_new_arrival === true,
      isBestSeller: product.is_best_seller === true,
      createdAt: product.created_at
        ? Date.parse(product.created_at) || 0
        : 0
    };
  }

  async function loadCatalogue() {
    if (state.loading) return;

    setLoading();

    try {
      /*
       * Read the existing public tables through data.js.
       * No guessed filters are passed to selectRows.
       */
      const [productRows, mediaRows, priceRows] = await Promise.all([
        queryRows("products", {
          limit: 1000,
          orderBy: "created_at",
          ascending: false
        }),
        queryRows("product_media", {
          limit: 5000,
          orderBy: "position",
          ascending: true
        }),
        queryRows("product_prices", {
          limit: 5000,
          orderBy: "starts_at",
          ascending: false
        })
      ]);

      console.info("XELOS catalogue query results:", {
        productsReturned: productRows.length,
        mediaReturned: mediaRows.length,
        pricesReturned: priceRows.length
      });

      const publicProducts = productRows.filter(isPublicProduct);

      const normalizedProducts = publicProducts
        .map((product) => normalizeProduct(product, mediaRows, priceRows))
        .filter(Boolean);

      state.products = normalizedProducts;
      state.loaded = true;
      state.loading = false;
      state.error = null;
      state.page = 1;

      renderCategories();
      render();

      if (productRows.length > 0 && publicProducts.length === 0) {
        console.warn(
          "XELOS: products were returned, but none matched status='active' " +
          "and visibility='public'. Check the actual database values."
        );
      }

      if (publicProducts.length > 0 && normalizedProducts.length === 0) {
        console.warn(
          "XELOS: public products were returned but could not be normalized."
        );
      }
    } catch (error) {
      state.loading = false;

      let message =
        "The catalogue could not be loaded. Open the browser console for details.";

      if (error?.code === "42501") {
        message =
          "Supabase denied access. Check the SELECT permissions and RLS policies for the catalogue tables.";
      } else if (
        error?.code === "PGRST205" ||
        error?.code === "PGRST200" ||
        error?.code === "42P01"
      ) {
        message =
          "Supabase could not find a catalogue table or relationship. Check the active project and database schema.";
      } else if (
        /selectRows.*did not return an array/i.test(error?.message ?? "")
      ) {
        message =
          "The data.js response format is incompatible with this page. Check the selectRows function.";
      }

      setError(message, error);
    }
  }

  function renderCategories() {
    if (!elements.categoryOptions) return;

    const categories = [
      ...new Set(
        state.products
          .map((product) => product.categoryName)
          .filter(Boolean)
      )
    ].sort((a, b) => a.localeCompare(b, "en"));

    if (!categories.length) {
      elements.categoryOptions.innerHTML = `
        <p class="filter-hint">
          No category information is available for the loaded products.
        </p>
      `;
      return;
    }

    elements.categoryOptions.innerHTML = `
      <label class="filter-option">
        <input
          type="radio"
          name="shopCategory"
          value=""
          ${state.category === "" ? "checked" : ""}
        >
        <span>All categories</span>
      </label>
      ${categories.map((category) => `
        <label class="filter-option">
          <input
            type="radio"
            name="shopCategory"
            value="${escapeHTML(category)}"
            ${state.category === category ? "checked" : ""}
          >
          <span>${escapeHTML(category)}</span>
        </label>
      `).join("")}
    `;

    elements.categoryOptions
      .querySelectorAll('input[name="shopCategory"]')
      .forEach((input) => {
        input.addEventListener("change", () => {
          state.category = input.value;
          state.page = 1;
          render();
        });
      });
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

      if (min !== null && (product.price === null || product.price < min)) {
        return false;
      }

      if (max !== null && (product.price === null || product.price > max)) {
        return false;
      }

      // Inventory data has not been verified; do not claim stock availability.
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
        products.sort((a, b) => {
          if (a.price === null) return 1;
          if (b.price === null) return -1;
          return a.price - b.price;
        });
        break;

      case "price-desc":
        products.sort((a, b) => {
          if (a.price === null) return 1;
          if (b.price === null) return -1;
          return b.price - a.price;
        });
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

    const priceMarkup = product.price !== null
      ? `
        <span class="shop-product-card__price">
          ${escapeHTML(formatPrice(product.price, product.currency))}
        </span>
        ${hasDiscount
          ? `<span class="shop-product-card__old-price">${escapeHTML(
              formatPrice(product.compareAtPrice, product.currency)
            )}</span>`
          : ""}
      `
      : `
        <span class="shop-product-card__price">
          Price unavailable
        </span>
      `;

    return `
      <article class="shop-product-card" data-product-id="${escapeHTML(product.id)}">
        <div class="shop-product-card__media">
          ${imageMarkup}
          ${badge}
        </div>

        <div class="shop-product-card__details">
          ${product.categoryName
            ? `<p class="shop-product-card__category">${escapeHTML(product.categoryName)}</p>`
            : ""}

          <h3 class="shop-product-card__title">
            <a href="${url}">${escapeHTML(product.name)}</a>
          </h3>

          ${description}

          <div class="shop-product-card__price-row">
            ${priceMarkup}
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

    if (state.category) {
      filters.push({
        label: `Category: ${state.category}`,
        clear: () => {
          state.category = "";
          renderCategories();
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
    if (end < totalPages) {
      pages.push({ label: String(totalPages), page: totalPages });
    }

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

      setStatus("No results");

      if (elements.resultsSummary) {
        elements.resultsSummary.textContent = "0 products found";
      }

      showState(
        state.products.length === 0
          ? "The catalogue is empty"
          : "No results found",
        state.products.length === 0
          ? "No active public products were returned. Check the database values and catalogue policies."
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
    const pageProducts = products.slice(
      startIndex,
      startIndex + state.pageSize
    );

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

    setStatus(`${state.products.length} products loaded`);
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

    if (elements.sortSelect) {
      elements.sortSelect.value = "recommended";
      state.sort = "recommended";
    }

    renderCategories();
    render();
  }

  function setFiltersOpen(open) {
    state.filtersOpen = open;

    if (elements.catalogFilters) {
      elements.catalogFilters.hidden = !open;
    }

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

    if (elements.catalogSearch) {
      elements.catalogSearch.value = query;
    }

    state.search = query;
    state.page = 1;
    render();

    (byId("catalogue") || elements.productGrid)?.scrollIntoView({
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

    if (elements.catalogSearch) {
      elements.catalogSearch.value = state.search;
    }

    if (elements.headerSearchInput) {
      elements.headerSearchInput.value = state.search;
    }

    if (elements.minPrice) elements.minPrice.value = state.minPrice;
    if (elements.maxPrice) elements.maxPrice.value = state.maxPrice;

    if (elements.inStockOnly) {
      elements.inStockOnly.checked = state.inStockOnly;
    }

    if (elements.sortSelect) {
      elements.sortSelect.value = state.sort;
    }
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

    const minValid = !elements.minPrice ||
      elements.minPrice.reportValidity();

    const maxValid = !elements.maxPrice ||
      elements.maxPrice.reportValidity();

    return minValid && maxValid;
  }

  /* ---------------------------------------------------------
     Header authentication
     --------------------------------------------------------- */

  function renderHeaderActions(user) {
    const container = $(".shop-header__actions");

    if (!container) return;

    if (!user) {
      container.innerHTML = `
        <a class="button button-secondary shop-auth-link" href="login.html">
          Sign in
        </a>
        <a class="button button-primary shop-auth-link" href="signup.html">
          Sign up
        </a>
      `;

      return;
    }

    container.innerHTML = `
      <a
        class="header-action"
        href="account.html"
        aria-label="My account"
        title="My account"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="3.5"></circle>
          <path d="M5 20c.6-3.6 3.1-5.5 7-5.5s6.4 1.9 7 5.5"></path>
        </svg>
      </a>

      <a
        class="header-action header-action--cart"
        href="cart.html"
        aria-label="Shopping cart"
        title="Shopping cart"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.5L21 8H6"></path>
          <circle cx="10" cy="20" r="1"></circle>
          <circle cx="18" cy="20" r="1"></circle>
        </svg>
        <span class="cart-count" id="cartCount" hidden>0</span>
      </a>
    `;

    elements.cartCount = byId("cartCount");
  }

  async function syncAuthentication() {
    if (!supabase?.auth) {
      console.error(
        "XELOS shop: Supabase client was not found in ./supabase.js. " +
        "Check the actual export in that file."
      );

      // Keep the header usable while reporting the missing client.
      renderHeaderActions(null);
      return;
    }

    try {
      const { data, error } = await supabase.auth.getSession();

      if (error) throw error;

      state.user = data?.session?.user ?? null;
      renderHeaderActions(state.user);

      supabase.auth.onAuthStateChange((_event, session) => {
        state.user = session?.user ?? null;
        renderHeaderActions(state.user);
      });
    } catch (error) {
      console.error("XELOS: could not read the Supabase session.", error);
      renderHeaderActions(null);
    }
  }

  function bindEvents() {
    elements.menuToggle?.addEventListener("click", toggleMobileMenu);

    elements.primaryNavigation?.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        elements.primaryNavigation.classList.remove("is-open");
        elements.menuToggle?.setAttribute("aria-expanded", "false");
        elements.menuToggle?.setAttribute(
          "aria-label",
          "Open navigation menu"
        );
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        elements.primaryNavigation?.classList.remove("is-open");
        elements.menuToggle?.setAttribute("aria-expanded", "false");
        elements.menuToggle?.setAttribute(
          "aria-label",
          "Open navigation menu"
        );
      }
    });

    elements.headerSearch?.addEventListener("submit", handleHeaderSearch);

    elements.catalogSearch?.addEventListener("input", () => {
      state.search = elements.catalogSearch.value.trim();

      if (elements.headerSearchInput) {
        elements.headerSearchInput.value = elements.catalogSearch.value;
      }

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

  async function init() {
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
    setFiltersOpen(state.filtersOpen);

    await syncAuthentication();
    await loadCatalogue();
  }

  return {
    init,
    loadCatalogue,
    clearFilters,
    syncAuthentication
  };
})();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", Shop.init, { once: true });
} else {
  Shop.init();
}

export default Shop;
