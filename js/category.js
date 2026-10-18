
const CATEGORY_PAGE_CONFIG = Object.freeze({
  productsPerPage: 9,
  currency: "USD",
  productDataEvent: "xelos:catalog-data",
  categoryDataEvent: "xelos:categories-data"
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
  dataReceived: false
};

const elements = {};

document.addEventListener("DOMContentLoaded", initializeCategoryPage);

function initializeCategoryPage() {
  cacheElements();
  bindEvents();
  setCurrentYear();
  initializeHeaderSearch();
  initializeMobileNavigation();
  renderCategoryNavigation();
  renderCategoryTiles();
  renderCategoryFilters();
  renderProducts();
  exposeDataInterface();
}

function cacheElements() {
  const ids = [
    "mobile-menu-button",
    "primary-navigation",
    "current-year",
    "header-search-form",
    "header-search-input",
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

    categoryState.selectedSlug = button.dataset.categorySlug || "";
    categoryState.page = 1;

    syncCategoryURL();
    renderCategoryNavigation();
    renderCategoryFilters();
    renderCategoryTiles();
    renderProducts();
    updateCategoryHeading();
  });

  elements["category-filter-list"]?.addEventListener("change", (event) => {
    if (event.target.name !== "category-filter") return;

    categoryState.selectedSlug = event.target.value || "";
    categoryState.page = 1;

    syncCategoryURL();
    renderCategoryNavigation();
    renderCategoryFilters();
    renderCategoryTiles();
    renderProducts();
    updateCategoryHeading();
  });

  elements["product-search"]?.addEventListener("input", (event) => {
    categoryState.search = event.target.value.trim();
    categoryState.page = 1;
    renderProducts();
    renderActiveFilters();
  });

  elements["price-min"]?.addEventListener("change", () => {
    validatePriceInputs();
  });

  elements["price-max"]?.addEventListener("change", () => {
    validatePriceInputs();
  });

  elements["available-only"]?.addEventListener("change", (event) => {
    categoryState.availableOnly = event.target.checked;
    categoryState.page = 1;
    renderProducts();
    renderActiveFilters();
  });

  elements["apply-filters"]?.addEventListener("click", () => {
    if (!validatePriceInputs()) return;

    categoryState.minPrice = elements["price-min"]?.value.trim() || "";
    categoryState.maxPrice = elements["price-max"]?.value.trim() || "";
    categoryState.page = 1;

    renderProducts();
    renderActiveFilters();
  });

  elements["reset-filters"]?.addEventListener("click", resetFilters);

  elements["product-sort"]?.addEventListener("change", (event) => {
    categoryState.sort = event.target.value;
    categoryState.page = 1;
    renderProducts();
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      categoryState.view = button.dataset.view === "list" ? "list" : "grid";

      document.querySelectorAll("[data-view]").forEach((item) => {
        const active = item === button;
        item.classList.toggle("is-active", active);
        item.setAttribute("aria-pressed", String(active));
      });

      elements["category-product-grid"]?.classList.toggle(
        "is-list",
        categoryState.view === "list"
      );
    });
  });

  elements["previous-page"]?.addEventListener("click", () => {
    if (categoryState.page <= 1) return;
    categoryState.page -= 1;
    renderProducts();
    scrollToProductResults();
  });

  elements["next-page"]?.addEventListener("click", () => {
    const totalPages = getTotalPages();
    if (categoryState.page >= totalPages) return;
    categoryState.page += 1;
    renderProducts();
    scrollToProductResults();
  });

  elements["pagination-pages"]?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-page]");
    if (!button) return;

    const nextPage = Number(button.dataset.page);
    if (!Number.isInteger(nextPage)) return;

    categoryState.page = nextPage;
    renderProducts();
    scrollToProductResults();
  });

  window.addEventListener(CATEGORY_PAGE_CONFIG.productDataEvent, (event) => {
    const products = event.detail?.products;
    if (!Array.isArray(products)) return;

    categoryState.products = products.map(normalizeProduct);
    categoryState.dataReceived = true;
    categoryState.page = 1;

    renderCategoryNavigation();
    renderCategoryTiles();
    renderCategoryFilters();
    renderProducts();
    updateCategoryHeading();
    updateCategoryStatus();
  });

  window.addEventListener(CATEGORY_PAGE_CONFIG.categoryDataEvent, (event) => {
    const categories = event.detail?.categories;
    if (!Array.isArray(categories)) return;

    categoryState.categories = categories.map(normalizeCategory);
    renderCategoryNavigation();
    renderCategoryTiles();
    renderCategoryFilters();
    renderProducts();
    updateCategoryHeading();
    updateCategoryStatus();
  });
}

function exposeDataInterface() {
  /*
   * Contrat d'interface frontend :
   * - setCategories(categoriesNormalisees)
   * - setProducts(produitsNormalises)
   *
   * Les propriétés ci-dessous sont des champs attendus par l'interface.
   * Ce ne sont pas des noms de colonnes Supabase.
   */
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
      renderCategoryNavigation();
      renderCategoryTiles();
      renderCategoryFilters();
      renderProducts();
      updateCategoryHeading();
    }
  });
}

function normalizeCategory(category) {
  return {
    id: category?.id ?? "",
    name: safeString(category?.name),
    slug: safeString(category?.slug),
    description: safeString(category?.description),
    image: safeString(category?.image || category?.coverImage),
    productCount: Number.isFinite(Number(category?.productCount))
      ? Number(category.productCount)
      : null
  };
}

function normalizeProduct(product) {
  const price = Number(product?.price);
  const compareAtPrice = Number(product?.compareAtPrice);
  const rating = Number(product?.rating);
  const reviewCount = Number(product?.reviewCount);
  const popularity = Number(product?.popularity);
  const timestamp = product?.createdAt ? Date.parse(product.createdAt) : 0;

  return {
    id: product?.id ?? "",
    name: safeString(product?.name),
    slug: safeString(product?.slug),
    description: safeString(product?.description),
    image: safeString(product?.image),
    categoryId: product?.categoryId ?? "",
    categoryName: safeString(product?.categoryName),
    categorySlug: safeString(product?.categorySlug),
    price: Number.isFinite(price) ? price : null,
    compareAtPrice: Number.isFinite(compareAtPrice) ? compareAtPrice : null,
    currency: safeString(product?.currency) || CATEGORY_PAGE_CONFIG.currency,
    available: product?.available === true,
    rating: Number.isFinite(rating) ? rating : null,
    reviewCount: Number.isFinite(reviewCount) ? reviewCount : 0,
    popularity: Number.isFinite(popularity) ? popularity : 0,
    createdAt: Number.isFinite(timestamp) ? timestamp : 0
  };
}

function safeString(value) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function setCurrentYear() {
  if (elements["current-year"]) {
    elements["current-year"].textContent = String(new Date().getFullYear());
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
    button.setAttribute("aria-label", isOpen ? "Ouvrir le menu" : "Fermer le menu");
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

function getSelectedCategory() {
  return categoryState.categories.find(
    (category) => category.slug === categoryState.selectedSlug
  ) || null;
}

function updateCategoryHeading() {
  const category = getSelectedCategory();
  const heading = elements["category-heading"];
  const description = elements["selected-category-description"];

  if (heading) {
    heading.textContent = category
      ? `Explorer ${category.name}`
      : "Explorez par univers.";
  }

  if (description) {
    description.textContent = category?.description ||
      "Parcourez les produits disponibles dans les catégories XELOS.";
  }
}

function updateCategoryStatus() {
  const status = elements["category-nav-status"];
  if (!status) return;

  status.textContent = categoryState.categories.length
    ? `${categoryState.categories.length} catégorie(s) à explorer`
    : "Les catégories apparaîtront ici lorsque les données seront connectées.";
}

function renderCategoryNavigation() {
  const container = elements["category-quick-nav"];
  if (!container) return;

  container.replaceChildren();

  const allButton = createCategoryChip("", "Tout explorer");
  container.append(allButton);

  categoryState.categories.forEach((category) => {
    if (!category.name || !category.slug) return;
    container.append(createCategoryChip(category.slug, category.name));
  });

  const status = document.createElement("p");
  status.className = "category-nav-status";
  status.id = "category-nav-status";
  status.setAttribute("aria-live", "polite");
  status.textContent = categoryState.categories.length
    ? `${categoryState.categories.length} catégorie(s) à explorer`
    : "Les catégories apparaîtront ici lorsque les données seront connectées.";

  container.append(status);
  elements["category-nav-status"] = status;
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
    title.textContent = "Vos univers prennent forme.";

    const description = document.createElement("p");
    description.textContent =
      "Les catégories réelles du catalogue apparaîtront ici après leur chargement.";

    empty.append(title, description);
    container.append(empty);
    return;
  }

  categoryState.categories.forEach((category, index) => {
    if (!category.name || !category.slug) return;

    const tile = document.createElement("a");
    tile.className = "category-tile";
    tile.href = `category.html?slug=${encodeURIComponent(category.slug)}`;
    tile.setAttribute("aria-label", `Explorer la catégorie ${category.name}`);

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
    indexLabel.textContent = `UNIVERS / ${String(index + 1).padStart(2, "0")}`;

    const categoryLabel = document.createElement("span");
    categoryLabel.textContent = "XELOS";

    topLine.append(indexLabel, categoryLabel);

    const title = document.createElement("h3");
    title.textContent = category.name;

    const description = document.createElement("p");
    description.className = "category-tile-description";
    description.textContent = category.description;

    const bottom = document.createElement("div");
    bottom.className = "category-tile-bottom";

    const count = document.createElement("span");
    count.className = "category-tile-count";

    const actualCount = categoryState.products.filter((product) =>
      productMatchesCategory(product, category)
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
    ...categoryState.categories.filter((category) => category.name && category.slug)
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
    return product.categorySlug === category.slug;
  }

  return product.categoryName.toLocaleLowerCase() ===
    category.name.toLocaleLowerCase();
}

function getFilteredProducts() {
  const category = getSelectedCategory();
  let products = [...categoryState.products];

  if (categoryState.selectedSlug) {
    if (!category) {
      return [];
    }

    products = products.filter((product) => productMatchesCategory(product, category));
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
      (product) => product.price !== null && product.price >= minimum
    );
  }

  if (categoryState.maxPrice !== "") {
    const maximum = Number(categoryState.maxPrice);
    products = products.filter(
      (product) => product.price !== null && product.price <= maximum
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
      products.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
      break;
    case "price-desc":
      products.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
      break;
    case "name":
      products.sort((a, b) => a.name.localeCompare(b.name));
      break;
    default:
      // L'ordre reçu du catalogue est conservé pour les recommandations.
      break;
  }

  return products;
}

function renderProducts() {
  const container = elements["category-product-grid"];
  if (!container) return;

  const products = getFilteredProducts();
  const total = products.length;
  const totalPages = Math.max(
    1,
    Math.ceil(total / CATEGORY_PAGE_CONFIG.productsPerPage)
  );

  categoryState.page = Math.min(categoryState.page, totalPages);

  const start = (categoryState.page - 1) * CATEGORY_PAGE_CONFIG.productsPerPage;
  const visibleProducts = products.slice(
    start,
    start + CATEGORY_PAGE_CONFIG.productsPerPage
  );

  container.replaceChildren();
  container.classList.toggle("is-list", categoryState.view === "list");
  container.setAttribute("aria-busy", "false");

  if (!categoryState.dataReceived) {
    renderEmptyState(
      container,
      "Le catalogue se prépare.",
      "Les produits apparaîtront lorsque la source de données du catalogue sera connectée."
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
      total > 1 ? "produits" : "produit";
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
    : "product.html";
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
    imageLink.append(image);
  } else {
    const placeholder = document.createElement("span");
    placeholder.className = "product-image-placeholder";
    placeholder.setAttribute("aria-hidden", "true");
    placeholder.textContent = "X.";
    imageLink.append(placeholder);
  }

  const stockLabel = document.createElement("span");
  stockLabel.className = "product-stock-label";

  if (product.available) {
    stockLabel.textContent = "Disponible";
  } else {
    stockLabel.textContent = "Indisponible";
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
    currentPrice.textContent = formatPrice(product.price, product.currency);
    price.append(currentPrice);

    if (
      product.compareAtPrice !== null &&
      product.compareAtPrice > product.price
    ) {
      const oldPrice = document.createElement("del");
      oldPrice.textContent = formatPrice(product.compareAtPrice, product.currency);
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

function formatPrice(amount, currency) {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency: currency || CATEGORY_PAGE_CONFIG.currency
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency || CATEGORY_PAGE_CONFIG.currency}`;
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
    button.classList.toggle("is-active", page === categoryState.page);
    button.setAttribute("aria-current", page === categoryState.page ? "page" : "false");
    pages.append(button);
  }
}

function getTotalPages() {
  return Math.max(
    1,
    Math.ceil(getFilteredProducts().length / CATEGORY_PAGE_CONFIG.productsPerPage)
  );
}

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
        if (elements["product-search"]) elements["product-search"].value = "";
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
        if (elements["price-min"]) elements["price-min"].value = "";
      }
    });
  }

  if (categoryState.maxPrice !== "") {
    activeFilters.push({
      label: `Max. ${categoryState.maxPrice}`,
      clear: () => {
        categoryState.maxPrice = "";
        if (elements["price-max"]) elements["price-max"].value = "";
      }
    });
  }

  if (categoryState.availableOnly) {
    activeFilters.push({
      label: "Disponibles uniquement",
      clear: () => {
        categoryState.availableOnly = false;
        if (elements["available-only"]) elements["available-only"].checked = false;
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
    remove.setAttribute("aria-label", `Supprimer le filtre ${filter.label}`);

    remove.addEventListener("click", () => {
      filter.clear();
      categoryState.page = 1;
      renderProducts();
    });

    chip.append(label, remove);
    container.append(chip);
  });
}

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

  elements["price-min"]?.setAttribute("aria-invalid", String(!validMinimum || !validRange));
  elements["price-max"]?.setAttribute("aria-invalid", String(!validMaximum || !validRange));

  if (!validMinimum || !validMaximum || !validRange) {
    return false;
  }

  return true;
}

function resetFilters() {
  categoryState.selectedSlug = "";
  categoryState.search = "";
  categoryState.minPrice = "";
  categoryState.maxPrice = "";
  categoryState.availableOnly = false;
  categoryState.sort = "recommended";
  categoryState.page = 1;

  if (elements["product-search"]) elements["product-search"].value = "";
  if (elements["price-min"]) elements["price-min"].value = "";
  if (elements["price-max"]) elements["price-max"].value = "";
  if (elements["available-only"]) elements["available-only"].checked = false;
  if (elements["product-sort"]) elements["product-sort"].value = "recommended";

  syncCategoryURL();
  renderCategoryNavigation();
  renderCategoryFilters();
  renderCategoryTiles();
  renderProducts();
  updateCategoryHeading();
}

function scrollToProductResults() {
  elements["category-product-grid"]?.scrollIntoView({
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth",
    block: "start"
  });
}
