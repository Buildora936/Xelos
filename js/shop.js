/**
 * XELOS — Shop / Catalogue
 * File: js/shop.js
 *
 * Flow: shop.js -> data.js -> Supabase
 * Tables: products, product_media, product_prices
 *
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
    sort: "recommended",
    authClient: null,
    authSubscription: null,
    authInitialized: false
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
    "shopHeaderActions"
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
    if (typeof value !== "string" || !value.trim()) {
      return "";
    }

    try {
      const url = new URL(value.trim(), window.location.href);

      if (!["http:", "https:"].includes(url.protocol)) {
        return "";
      }

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
    const normalizedCurrency = String(currency || "USD").toUpperCase();

    if (!Number.isFinite(value)) {
      return "";
    }

    try {
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: normalizedCurrency
      }).format(value);
    } catch {
      return `${value.toFixed(2)} ${normalizedCurrency}`;
    }
  }

  function normalizeRows(result, tableName) {
    if (result && typeof result === "object" && !Array.isArray(result)) {
      if (result.error) {
        throw result.error;
      }

      if (Array.isArray(result.data)) {
        return result.data;
      }

      if (Array.isArray(result.rows)) {
        return result.rows;
      }
    }

    if (Array.isArray(result)) {
      return result;
    }

    if (result == null) {
      return [];
    }

    throw new Error(
      `The "${tableName}" query did not return an array. ` +
      "Check the return format of selectRows() in js/data.js."
    );
  }

  function normalizeBoolean(value) {
    if (value === true || value === 1 || value === "true") {
      return true;
    }

    if (value === false || value === 0 || value === "false") {
      return false;
    }

    return null;
  }

  function normalizeStatus(value) {
    return String(value ?? "").trim().toLowerCase();
  }

  function isPublicProduct(product) {
    /*
     * Do not display explicitly hidden, private, archived or draft products.
     * If these fields are missing, rely on the database's public SELECT RLS
     * policy and log the missing fields for diagnostics.
     */
    const status = normalizeStatus(product.status);
    const visibility = normalizeStatus(product.visibility);

    const blockedStatuses = [
      "draft",
      "scheduled",
      "archived",
      "disabled",
      "deleted"
    ];

    const blockedVisibility = [
      "hidden",
      "private",
      "internal"
    ];

    if (blockedStatuses.includes(status)) {
      return false;
    }

    if (blockedVisibility.includes(visibility)) {
      return false;
    }

    if (status && status !== "active") {
      return false;
    }

    if (visibility && visibility !== "public") {
      return false;
    }

    return true;
  }

  function sameId(first, second) {
    if (first == null || second == null) {
      return false;
    }

    return String(first) === String(second);
  }

  function getProductMedia(mediaRows, productId) {
    return mediaRows
      .filter((media) => {
        if (!sameId(media.product_id, productId)) {
          return false;
        }

        if (normalizeBoolean(media.is_active) === false) {
          return false;
        }

        const mediaType = normalizeStatus(media.media_type);

        return !mediaType || mediaType === "image";
      })
      .sort((a, b) => {
        const primaryA = normalizeBoolean(a.is_primary) === true;
        const primaryB = normalizeBoolean(b.is_primary) === true;

        if (primaryA !== primaryB) {
          return primaryA ? -1 : 1;
        }

        return Number(a.position ?? 0) - Number(b.position ?? 0);
      });
  }

  function isPriceInDateRange(price, now) {
    if (normalizeBoolean(price.is_active) === false) {
      return false;
    }

    if (price.starts_at) {
      const startsAt = Date.parse(price.starts_at);

      if (Number.isFinite(startsAt) && startsAt > now) {
        return false;
      }
    }

    if (price.ends_at) {
      const endsAt = Date.parse(price.ends_at);

      if (Number.isFinite(endsAt) && endsAt <= now) {
        return false;
      }
    }

    return true;
  }

  function getCurrentPrices(priceRows, productId) {
    const now = Date.now();

    return priceRows.filter((price) => {
      if (!sameId(price.product_id, productId)) {
        return false;
      }

      if (!isPriceInDateRange(price, now)) {
        return false;
      }

      return ["regular", "sale", "compare_at"].includes(
        normalizeStatus(price.price_type)
      );
    });
  }

  function sortPricesNewestFirst(prices) {
    return [...prices].sort((a, b) => {
      const dateA = a.starts_at ? Date.parse(a.starts_at) : 0;
      const dateB = b.starts_at ? Date.parse(b.starts_at) : 0;

      return (Number.isFinite(dateB) ? dateB : 0) -
        (Number.isFinite(dateA) ? dateA : 0);
    });
  }

  function getNumericAmount(price) {
    if (!price || price.amount == null || price.amount === "") {
      return null;
    }

    const amount = Number(price.amount);

    return Number.isFinite(amount) && amount >= 0
      ? amount
      : null;
  }

  function getPriceInformation(priceRows, productId) {
    const prices = getCurrentPrices(priceRows, productId);

    const regular = sortPricesNewestFirst(
      prices.filter((price) => price.price_type === "regular")
    ).find((price) => getNumericAmount(price) !== null);

    const sale = sortPricesNewestFirst(
      prices.filter((price) => price.price_type === "sale")
    ).find((price) => getNumericAmount(price) !== null);

    const compare = sortPricesNewestFirst(
      prices.filter((price) => price.price_type === "compare_at")
    ).find((price) => getNumericAmount(price) !== null);

    const regularAmount = getNumericAmount(regular);
    const saleAmount = getNumericAmount(sale);
    const compareAmount = getNumericAmount(compare);

    /*
     * A sale price is only applied when a regular price exists
     * and the sale price is strictly lower.
     */
    const useSale =
      regularAmount !== null &&
      saleAmount !== null &&
      saleAmount < regularAmount;

    const selectedPrice = useSale ? sale : regular;

    if (!selectedPrice) {
      return null;
    }

    const amount = getNumericAmount(selectedPrice);

    if (amount === null) {
      return null;
    }

    const oldAmount = useSale
      ? regularAmount
      : compareAmount;

    return {
      amount,
      compareAtPrice:
        oldAmount !== null && oldAmount > amount
          ? oldAmount
          : null,
      currency: String(
        selectedPrice.currency_code || "USD"
      ).toUpperCase()
    };
  }

  function normalizeProduct(product, mediaRows, priceRows) {
    if (!product || product.id == null) {
      return null;
    }

    if (!String(product.name ?? "").trim()) {
      return null;
    }

    if (!isPublicProduct(product)) {
      return null;
    }

    const media = getProductMedia(mediaRows, product.id);

    const validMedia = media.find((item) =>
      safeURL(item.url) || safeURL(item.thumbnail_url)
    );

    const priceInfo = getPriceInformation(priceRows, product.id);

    /*
     * Do not silently hide a product because its price is missing.
     * Keep it in the catalogue, but never invent a price.
     */
    const image = validMedia
      ? safeURL(validMedia.url) || safeURL(validMedia.thumbnail_url)
      : "";

    const createdAt = product.created_at
      ? Date.parse(product.created_at)
      : 0;

    return {
      id: String(product.id),
      name: String(product.name).trim(),
      slug: String(product.slug || product.id),
      description: String(
        product.short_description ||
        product.description ||
        ""
      ),
      image,
      categoryName: String(
        product.category_name ||
        product.category ||
        ""
      ),
      price: priceInfo?.amount ?? null,
      compareAtPrice: priceInfo?.compareAtPrice ?? null,
      currency: priceInfo?.currency || "USD",
      available: null,
      rating: null,
      reviewCount: 0,
      popularity:
        normalizeBoolean(product.is_best_seller) === true
          ? 2
          : normalizeBoolean(product.is_featured) === true
            ? 1
            : 0,
      isNewArrival:
        normalizeBoolean(product.is_new_arrival) === true,
      isBestSeller:
        normalizeBoolean(product.is_best_seller) === true,
      createdAt: Number.isFinite(createdAt) ? createdAt : 0
    };
  }

  function showState(title, message, type = "empty") {
    if (!elements.catalogState) {
      return;
    }

    elements.catalogState.classList.add("is-visible");

    if (elements.stateTitle) {
      elements.stateTitle.textContent = title;
    }

    if (elements.stateMessage) {
      elements.stateMessage.textContent = message;
    }

    if (elements.stateEyebrow) {
      elements.stateEyebrow.textContent =
        type === "error"
          ? "CATALOGUE CONNECTION"
          : "XELOS CATALOGUE";
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
        "The catalogue could not be loaded.";
    }

    if (elements.catalogPagination) {
      elements.catalogPagination.hidden = true;
    }
  }

  function getErrorMessage(error) {
    const code = error?.code;
    const details = error?.message || String(error);

    if (code === "42501") {
      return "Supabase denied access. Check the SELECT RLS policies for the catalogue tables.";
    }

    if (code === "PGRST205" || code === "42P01") {
      return "Supabase could not find a required table. Verify the project URL, schema and table names.";
    }

    if (code === "PGRST200" || code === "42703") {
      return "A requested table relationship or column could not be found. Check the actual database schema.";
    }

    if (code === "PGRST301" || code === "401" || code === "403") {
      return "The request was rejected. Check the Supabase session, API key configuration and access policies.";
    }

    return `Catalogue request failed: ${details}`;
  }

  async function loadCatalogue() {
    if (state.loading) {
      return;
    }

    setLoading();

    try {
      /*
       * Keep the existing data.js abstraction.
       * normalizeRows supports either a plain array or { data, error }.
       */
      const results = await Promise.all([
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

      const productRows = normalizeRows(results[0], "products");
      const mediaRows = normalizeRows(results[1], "product_media");
      const priceRows = normalizeRows(results[2], "product_prices");

      console.info("XELOS catalogue: Supabase response", {
        productsReturned: productRows.length,
        mediaReturned: mediaRows.length,
        pricesReturned: priceRows.length
      });

      if (productRows.length > 0) {
        const firstProduct = productRows[0];

        console.debug("XELOS catalogue: product field names", {
          fields: Object.keys(firstProduct),
          status: firstProduct.status ?? "(missing)",
          visibility: firstProduct.visibility ?? "(missing)"
        });
      }

      const normalized = productRows
        .map((product) =>
          normalizeProduct(product, mediaRows, priceRows)
        )
        .filter(Boolean);

      const pricedProducts = normalized.filter(
        (product) => product.price !== null
      ).length;

      const productsWithImages = normalized.filter(
        (product) => Boolean(product.image)
      ).length;

      console.info("XELOS catalogue: normalized response", {
        productsAvailable: normalized.length,
        productsWithPrices: pricedProducts,
        productsWithImages
      });

      state.products = normalized;
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
        hint: error?.hint ?? null,
        error
      });

      setError(getErrorMessage(error));
    }
  }

  function renderCategories() {
    if (!elements.categoryOptions) {
      return;
    }

    const categories = [
      ...new Set(
        state.products
          .map((product) => product.categoryName)
          .filter(Boolean)
      )
    ].sort((a, b) => a.localeCompare(b, "en"));

    if (categories.length === 0) {
      elements.categoryOptions.innerHTML = `
        <p class="filter-hint">
          No category names are available in the returned product data.
        </p>
      `;
      return;
    }

    elements.categoryOptions.innerHTML = categories.map((category) => `
      <label class="filter-option filter-option--checkbox">
        <input
          type="checkbox"
          name="shopCategory"
          value="${escapeHTML(category)}"
          ${state.category === category ? "checked" : ""}
        >
        <span>${escapeHTML(category)}</span>
      </label>
    `).join("");

    elements.categoryOptions
      .querySelectorAll('input[name="shopCategory"]')
      .forEach((input) => {
        input.addEventListener("change", () => {
          state.category = input.checked ? input.value : "";
          state.page = 1;

          elements.categoryOptions
            .querySelectorAll('input[name="shopCategory"]')
            .forEach((other) => {
              if (other !== input) {
                other.checked = false;
              }
            });

          render();
        });
      });
  }

  function readFiltersFromForm() {
    if (elements.catalogSearch) {
      state.search = elements.catalogSearch.value.trim();
    }

    if (elements.minPrice) {
      state.minPrice = elements.minPrice.value;
    }

    if (elements.maxPrice) {
      state.maxPrice = elements.maxPrice.value;
    }

    if (elements.inStockOnly) {
      state.inStockOnly = elements.inStockOnly.checked;
    }

    if (elements.sortSelect) {
      state.sort = elements.sortSelect.value;
    }

    state.page = 1;
  }

  function getFilteredProducts() {
    const query = state.search.toLocaleLowerCase("en-US");

    const min = state.minPrice === ""
      ? null
      : Number(state.minPrice);

    const max = state.maxPrice === ""
      ? null
      : Number(state.maxPrice);

    let products = state.products.filter((product) => {
      if (query) {
        const searchableText = [
          product.name,
          product.description,
          product.categoryName
        ].join(" ").toLocaleLowerCase("en-US");

        if (!searchableText.includes(query)) {
          return false;
        }
      }

      if (
        state.category &&
        product.categoryName !== state.category
      ) {
        return false;
      }

      /*
       * Products without prices remain visible in the catalogue,
       * but cannot be evaluated against a price filter.
       */
      if (min !== null && (product.price === null || product.price < min)) {
        return false;
      }

      if (max !== null && (product.price === null || product.price > max)) {
        return false;
      }

      /*
       * Inventory schema has not been confirmed.
       * Do not pretend that stock availability is known.
       */
      if (state.inStockOnly && product.available !== true) {
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
    const hasPrice = product.price !== null;
    const hasDiscount = product.compareAtPrice !== null;

    const imageMarkup = product.image
      ? `
        <a href="${escapeHTML(url)}" tabindex="-1" aria-hidden="true">
          <img
            src="${escapeHTML(product.image)}"
            alt=""
            loading="lazy"
            decoding="async"
            onerror="this.closest('.shop-product-card__media').classList.add('image-load-failed');this.remove();"
          >
        </a>
      `
      : `
        <a href="${escapeHTML(url)}" tabindex="-1" aria-hidden="true">
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
      ? `
        <p class="shop-product-card__description">
          ${escapeHTML(product.description.slice(0, 110))}
          ${product.description.length > 110 ? "…" : ""}
        </p>
      `
      : "";

    const priceMarkup = hasPrice
      ? `
        <span class="shop-product-card__price">
          ${escapeHTML(formatPrice(product.price, product.currency))}
        </span>
        ${hasDiscount ? `
          <span class="shop-product-card__old-price">
            ${escapeHTML(formatPrice(product.compareAtPrice, product.currency))}
          </span>
        ` : ""}
      `
      : `
        <span class="shop-product-card__price shop-product-card__price--unavailable">
          Price unavailable
        </span>
      `;

    return `
      <article
        class="shop-product-card"
        data-product-id="${escapeHTML(product.id)}"
      >
        <div class="shop-product-card__media">
          ${imageMarkup}
          ${badge}
        </div>

        <div class="shop-product-card__details">
          <h3 class="shop-product-card__title">
            <a href="${escapeHTML(url)}">${escapeHTML(product.name)}</a>
          </h3>

          ${description}

          <div class="shop-product-card__price-row">
            ${priceMarkup}
          </div>

          <div class="shop-product-card__actions">
            <a
              class="shop-product-card__details-link"
              href="${escapeHTML(url)}"
            >
              View product
            </a>

            <a
              class="shop-product-card__quick-add"
              href="wishlist.html"
              aria-label="Open wishlist"
              title="Open wishlist"
            >
              <i class="fa-regular fa-heart" aria-hidden="true"></i>
            </a>
          </div>
        </div>
      </article>
    `;
  }

  function renderActiveFilters() {
    if (!elements.activeFilters) {
      return;
    }

    const filters = [];

    if (state.search) {
      filters.push({
        label: `Search: ${state.search}`,
        clear: () => {
          state.search = "";

          if (elements.catalogSearch) {
            elements.catalogSearch.value = "";
          }

          if (elements.headerSearchInput) {
            elements.headerSearchInput.value = "";
          }
        }
      });
    }

    if (state.category) {
      filters.push({
        label: `Category: ${state.category}`,
        clear: () => {
          state.category = "";
        }
      });
    }

    if (state.minPrice !== "") {
      filters.push({
        label: `Min. ${state.minPrice}`,
        clear: () => {
          state.minPrice = "";

          if (elements.minPrice) {
            elements.minPrice.value = "";
          }
        }
      });
    }

    if (state.maxPrice !== "") {
      filters.push({
        label: `Max. ${state.maxPrice}`,
        clear: () => {
          state.maxPrice = "";

          if (elements.maxPrice) {
            elements.maxPrice.value = "";
          }
        }
      });
    }

    if (state.inStockOnly) {
      filters.push({
        label: "Available only",
        clear: () => {
          state.inStockOnly = false;

          if (elements.inStockOnly) {
            elements.inStockOnly.checked = false;
          }
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
        >
          <i class="fa-solid fa-xmark" aria-hidden="true"></i>
        </button>
      </span>
    `).join("");

    elements.activeFilters
      .querySelectorAll("[data-clear-filter]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          filters[Number(button.dataset.clearFilter)]?.clear();
          state.page = 1;

          if (elements.categoryOptions) {
            elements.categoryOptions
              .querySelectorAll('input[name="shopCategory"]')
              .forEach((input) => {
                input.checked = input.value === state.category;
              });
          }

          render();
        });
      });

    if (elements.activeFilterCount) {
      elements.activeFilterCount.textContent = String(filters.length);
      elements.activeFilterCount.hidden = filters.length === 0;
    }
  }

  function renderPagination(totalPages) {
    if (!elements.catalogPagination || !elements.paginationPages) {
      return;
    }

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

    const start = Math.max(
      1,
      Math.min(state.page - 2, totalPages - 4)
    );

    const end = Math.min(totalPages, start + 4);
    const pages = [];

    if (start > 1) {
      pages.push({ label: "1", page: 1 });
    }

    if (start > 2) {
      pages.push({ label: "…", page: null });
    }

    for (let page = start; page <= end; page += 1) {
      pages.push({ label: String(page), page });
    }

    if (end < totalPages - 1) {
      pages.push({ label: "…", page: null });
    }

    if (end < totalPages) {
      pages.push({ label: String(totalPages), page: totalPages });
    }

    elements.paginationPages.innerHTML = pages.map((item) => {
      if (item.page === null) {
        return `
          <span class="pagination-page" aria-hidden="true">…</span>
        `;
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

    elements.paginationPages
      .querySelectorAll("[data-page]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          state.page = Number(button.dataset.page);
          render();
          scrollToResults();
        });
      });
  }

  function scrollToResults() {
    if (!elements.productGrid) {
      return;
    }

    const top =
      elements.productGrid.getBoundingClientRect().top +
      window.scrollY -
      130;

    window.scrollTo({
      top,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth"
    });
  }

  function render() {
    renderActiveFilters();

    if (state.loading || state.error || !elements.productGrid) {
      return;
    }

    if (!state.loaded) {
      elements.productGrid.replaceChildren();
      elements.productGrid.hidden = true;
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
        elements.catalogStatus.textContent =
          state.products.length === 0
            ? "No products available"
            : "No results";
      }

      if (elements.resultsSummary) {
        elements.resultsSummary.textContent = "0 products found";
      }

      showState(
        state.products.length === 0
          ? "No products available"
          : "No results found",
        state.products.length === 0
          ? "No products passed the catalogue visibility checks. Check the console for returned row counts and product status fields."
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
      const last = Math.min(
        startIndex + state.pageSize,
        totalProducts
      );

      elements.resultsSummary.textContent =
        `Showing ${first}–${last} of ${totalProducts} products`;
    }

    if (elements.catalogStatus) {
      elements.catalogStatus.textContent =
        `${state.products.length} products loaded`;
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

    if (elements.categoryOptions) {
      elements.categoryOptions
        .querySelectorAll('input[name="shopCategory"]')
        .forEach((input) => {
          input.checked = false;
        });
    }

    render();
  }

  function setFiltersOpen(open) {
    state.filtersOpen = open;

    if (elements.catalogFilters) {
      elements.catalogFilters.hidden = !open;
    }

    if (elements.filterToggle) {
      elements.filterToggle.setAttribute(
        "aria-expanded",
        String(open)
      );

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
        state.view === "list"
          ? "Switch to grid view"
          : "Switch to list view"
      );

      elements.viewToggle.innerHTML = state.view === "list"
        ? '<i class="fa-solid fa-grip" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-list" aria-hidden="true"></i>';
    }

    render();
  }

  function toggleMobileMenu() {
    if (!elements.primaryNavigation || !elements.menuToggle) {
      return;
    }

    const isOpen =
      elements.primaryNavigation.classList.toggle("is-open");

    elements.menuToggle.setAttribute(
      "aria-expanded",
      String(isOpen)
    );

    elements.menuToggle.setAttribute(
      "aria-label",
      isOpen ? "Close navigation menu" : "Open navigation menu"
    );

    elements.menuToggle.innerHTML = isOpen
      ? '<i class="fa-solid fa-xmark" aria-hidden="true"></i>'
      : '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
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

    if (elements.catalogSearch) {
      elements.catalogSearch.value = state.search;
    }

    if (elements.headerSearchInput) {
      elements.headerSearchInput.value = state.search;
    }

    if (elements.minPrice) {
      elements.minPrice.value = state.minPrice;
    }

    if (elements.maxPrice) {
      elements.maxPrice.value = state.maxPrice;
    }

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
      elements.minPrice?.setCustomValidity(
        "Enter a valid minimum price."
      );
    }

    if (max !== "" && (!Number.isFinite(Number(max)) || Number(max) < 0)) {
      elements.maxPrice?.setCustomValidity(
        "Enter a valid maximum price."
      );
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

    const minValid =
      !elements.minPrice || elements.minPrice.reportValidity();

    const maxValid =
      !elements.maxPrice || elements.maxPrice.reportValidity();

    return minValid && maxValid;
  }

  // ------------------------------------------------------------
  // HEADER AUTHENTICATION
  // ------------------------------------------------------------

  function renderHeaderActions(isAuthenticated) {
    const container =
      elements.shopHeaderActions ||
      $(".shop-header__actions");

    if (!container) {
      console.warn(
        "XELOS header: #shopHeaderActions was not found in shop.html."
      );
      return;
    }

    if (isAuthenticated) {
      container.innerHTML = `
        <a
          class="header-action"
          href="account.html"
          aria-label="My account"
          title="My account"
        >
          <i class="fa-regular fa-user" aria-hidden="true"></i>
        </a>

        <a
          class="header-action header-action--cart"
          href="cart.html"
          aria-label="Shopping cart"
          title="Shopping cart"
        >
          <i class="fa-solid fa-bag-shopping" aria-hidden="true"></i>
          <span class="cart-count" id="cartCount" hidden>0</span>
        </a>
      `;

      return;
    }

    container.innerHTML = `
      <a class="header-action header-action--login" href="login.html">
        Sign in
      </a>

      <a class="button button-primary header-action--signup" href="signup.html">
        Create account
      </a>
    `;
  }

  function getSupabaseClient(module) {
    if (!module) {
      return null;
    }

    const candidates = [
      module.supabase,
      module.supabaseClient,
      module.client,
      module.default
    ];

    return candidates.find((candidate) =>
      candidate &&
      candidate.auth &&
      typeof candidate.auth.getSession === "function"
    ) || null;
  }

  async function findSupabaseClient() {
    /*
     * Try the common client module locations without making a failed
     * optional import prevent the catalogue from loading.
     *
     * If your project uses a different path/export, adapt this list
     * to the actual js/data.js and Supabase client implementation.
     */
    const modulePaths = [
      "./supabase.js",
      "./core/supabase.js"
    ];

    for (const path of modulePaths) {
      try {
        const module = await import(path);
        const client = getSupabaseClient(module);

        if (client) {
          return client;
        }
      } catch (error) {
        console.debug(
          `XELOS auth: could not initialize client from ${path}.`,
          error?.message || error
        );
      }
    }

    return null;
  }

  async function initializeHeaderAuth() {
    const container =
      elements.shopHeaderActions ||
      $(".shop-header__actions");

    if (!container) {
      return;
    }

    /*
     * Do not show account/cart links before the session check finishes.
     */
    container.innerHTML = `
      <span class="header-actions__loading" aria-label="Checking account">
        <i class="fa-solid fa-circle-notch fa-spin" aria-hidden="true"></i>
      </span>
    `;

    const client = await findSupabaseClient();

    if (!client) {
      /*
       * Fail closed: without a verifiable session, show visitor links.
       * The catalogue can still load through data.js.
       */
      console.error(
        "XELOS auth: Supabase client not found. " +
        "Check the exports and path in your Supabase client module."
      );

      renderHeaderActions(false);
      return;
    }

    state.authClient = client;

    try {
      const { data, error } = await client.auth.getSession();

      if (error) {
        throw error;
      }

      renderHeaderActions(Boolean(data?.session?.user));

      state.authInitialized = true;

      const result = client.auth.onAuthStateChange((_event, session) => {
        renderHeaderActions(Boolean(session?.user));
      });

      state.authSubscription =
        result?.data?.subscription || null;
    } catch (error) {
      console.error(
        "XELOS auth: could not verify the Supabase session.",
        error
      );

      renderHeaderActions(false);
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

        if (elements.menuToggle) {
          elements.menuToggle.innerHTML =
            '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
        }
      });
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        elements.primaryNavigation?.classList.remove("is-open");
        elements.menuToggle?.setAttribute("aria-expanded", "false");

        if (elements.menuToggle) {
          elements.menuToggle.innerHTML =
            '<i class="fa-solid fa-bars" aria-hidden="true"></i>';
        }
      }
    });

    elements.headerSearch?.addEventListener(
      "submit",
      handleHeaderSearch
    );

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
      if (!validatePriceInputs()) {
        return;
      }

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
      elements.currentYear.textContent = String(
        new Date().getFullYear()
      );
    }

    readURLParameters();
    bindEvents();

    /*
     * Run auth and catalogue initialization independently.
     * An auth client issue should not prevent data.js from loading products.
     */
    initializeHeaderAuth();
    renderCategories();
    loadCatalogue();
  }

  return {
    init,
    loadCatalogue,
    clearFilters
  };
})();

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", Shop.init, { once: true });
} else {
  Shop.init();
}

export default Shop;
