
const XELOS_COLLECTIONS_CONFIG = Object.freeze({
  collectionsEvent: "xelos:collections-data",
  productsEvent: "xelos:catalog-data",
  currency: "USD"
});

const collectionsState = {
  collections: [],
  products: [],
  filter: "all"
};

const collectionElements = {};

document.addEventListener("DOMContentLoaded", initializeCollectionsPage);

function initializeCollectionsPage() {
  cacheCollectionElements();
  initializeCollectionNavigation();
  initializeCollectionSearch();
  initializeCollectionTabs();
  setCollectionYear();
  renderCollections();
  exposeCollectionsInterface();
}

function cacheCollectionElements() {
  collectionElements.grid = document.getElementById("collections-grid");
  collectionElements.count = document.getElementById("collection-count");
  collectionElements.tabs = document.getElementById("collection-tabs");
  collectionElements.menuButton = document.getElementById("mobile-menu-button");
  collectionElements.navigation = document.getElementById("primary-navigation");
  collectionElements.searchForm = document.getElementById("header-search-form");
  collectionElements.searchInput = document.getElementById("header-search-input");
  collectionElements.year = document.getElementById("current-year");
}

function initializeCollectionNavigation() {
  const button = collectionElements.menuButton;
  const navigation = collectionElements.navigation;

  if (!button || !navigation) return;

  button.addEventListener("click", () => {
    const expanded = button.getAttribute("aria-expanded") === "true";
    button.setAttribute("aria-expanded", String(!expanded));
    button.setAttribute("aria-label", expanded ? "Ouvrir le menu" : "Fermer le menu");
    navigation.classList.toggle("is-open", !expanded);
  });

  navigation.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navigation.classList.remove("is-open");
      button.setAttribute("aria-expanded", "false");
      button.setAttribute("aria-label", "Ouvrir le menu");
    });
  });
}

function initializeCollectionSearch() {
  collectionElements.searchForm?.addEventListener("submit", (event) => {
    event.preventDefault();

    const query = collectionElements.searchInput?.value.trim();
    if (!query) return;

    window.location.href = `search.html?q=${encodeURIComponent(query)}`;
  });
}

function initializeCollectionTabs() {
  collectionElements.tabs?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-collection-filter]");
    if (!button) return;

    collectionsState.filter = button.dataset.collectionFilter || "all";

    collectionElements.tabs.querySelectorAll("[data-collection-filter]").forEach((tab) => {
      const active = tab === button;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-pressed", String(active));
    });

    renderCollections();
  });
}

function setCollectionYear() {
  if (collectionElements.year) {
    collectionElements.year.textContent = String(new Date().getFullYear());
  }
}

function exposeCollectionsInterface() {
  /*
   * Interface frontend publique destinée à la couche data.js.
   * Les champs normalisés ci-dessous ne sont pas des colonnes SQL.
   */
  window.XELOS_COLLECTIONS_PAGE = Object.freeze({
    setCollections(collections) {
      if (!Array.isArray(collections)) return;

      collectionsState.collections = collections.map(normalizeCollection);
      renderCollections();
    },

    setProducts(products) {
      if (!Array.isArray(products)) return;

      collectionsState.products = products.map(normalizeCollectionProduct);
      renderCollections();
    },

    refresh() {
      renderCollections();
    }
  });

  window.addEventListener(
    XELOS_COLLECTIONS_CONFIG.collectionsEvent,
    (event) => {
      window.XELOS_COLLECTIONS_PAGE.setCollections(event.detail?.collections);
    }
  );

  window.addEventListener(
    XELOS_COLLECTIONS_CONFIG.productsEvent,
    (event) => {
      window.XELOS_COLLECTIONS_PAGE.setProducts(event.detail?.products);
    }
  );
}

function normalizeCollection(collection) {
  return {
    id: collection?.id ?? "",
    name: safeCollectionString(collection?.name),
    slug: safeCollectionString(collection?.slug),
    description: safeCollectionString(collection?.description),
    image: safeCollectionString(collection?.image || collection?.coverImage),
    subtitle: safeCollectionString(collection?.subtitle),
    productCount: validCount(collection?.productCount),
    isFeatured: collection?.isFeatured === true,
    isNew: collection?.isNew === true,
    isPublished: collection?.isPublished !== false,
    sortOrder: Number.isFinite(Number(collection?.sortOrder))
      ? Number(collection.sortOrder)
      : 0
  };
}

function normalizeCollectionProduct(product) {
  return {
    id: product?.id ?? "",
    collectionId: product?.collectionId ?? "",
    collectionSlug: safeCollectionString(product?.collectionSlug)
  };
}

function safeCollectionString(value) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function validCount(value) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function getVisibleCollections() {
  let collections = collectionsState.collections.filter(
    (collection) => collection.isPublished && collection.name && collection.slug
  );

  if (collectionsState.filter === "featured") {
    collections = collections.filter((collection) => collection.isFeatured);
  }

  if (collectionsState.filter === "new") {
    collections = collections.filter((collection) => collection.isNew);
  }

  return collections.sort((a, b) => a.sortOrder - b.sortOrder);
}

function renderCollections() {
  const grid = collectionElements.grid;
  if (!grid) return;

  const collections = getVisibleCollections();

  grid.replaceChildren();

  if (collectionElements.count) {
    collectionElements.count.textContent = String(collections.length).padStart(2, "0");
  }

  if (!collections.length) {
    renderCollectionsEmptyState(grid);
    return;
  }

  collections.forEach((collection, index) => {
    grid.append(createCollectionCard(collection, index));
  });
}

function renderCollectionsEmptyState(grid) {
  const empty = document.createElement("div");
  empty.className = "collections-empty-state";

  const mark = document.createElement("span");
  mark.className = "empty-state-x";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = "X.";

  const heading = document.createElement("h3");
  const description = document.createElement("p");

  if (collectionsState.filter === "featured") {
    heading.textContent = "Aucune collection à la une.";
    description.textContent =
      "Les collections mises en avant apparaîtront ici lorsqu'elles seront disponibles.";
  } else if (collectionsState.filter === "new") {
    heading.textContent = "Aucune nouvelle collection.";
    description.textContent =
      "Les nouvelles collections apparaîtront ici après leur publication.";
  } else {
    heading.textContent = "Les collections arrivent ici.";
    description.textContent =
      "Les collections publiées apparaîtront ici une fois les données connectées.";
  }

  empty.append(mark, heading, description);
  grid.append(empty);
}

function createCollectionCard(collection, index) {
  const card = document.createElement("article");
  card.className = "collection-card";

  const media = document.createElement("div");
  media.className = "collection-card-media";

  if (isSafeCollectionImage(collection.image)) {
    const image = document.createElement("img");
    image.src = collection.image;
    image.alt = "";
    image.loading = index < 2 ? "eager" : "lazy";
    image.decoding = "async";
    media.append(image);
  }

  const shade = document.createElement("div");
  shade.className = "collection-card-shade";

  const topLine = document.createElement("div");
  topLine.className = "collection-card-topline";

  const indexText = document.createElement("span");
  indexText.textContent = `COLLECTION / ${String(index + 1).padStart(2, "0")}`;

  topLine.append(indexText);

  if (collection.isFeatured || collection.isNew) {
    const badge = document.createElement("span");
    badge.className = "collection-card-badge";
    badge.textContent = collection.isNew ? "Nouveau" : "À la une";
    topLine.append(badge);
  } else {
    const brand = document.createElement("span");
    brand.textContent = "XELOS®";
    topLine.append(brand);
  }

  const heading = document.createElement("h3");
  heading.textContent = collection.name;

  const description = document.createElement("p");
  description.className = "collection-card-description";
  description.textContent = collection.description;

  const bottom = document.createElement("div");
  bottom.className = "collection-card-bottom";

  const meta = document.createElement("div");
  meta.className = "collection-card-meta";

  const count = document.createElement("span");
  count.className = "collection-card-count";

  const associatedCount = collectionsState.products.length
    ? collectionsState.products.filter((product) =>
        productMatchesCollection(product, collection)
      ).length
    : collection.productCount;

  count.textContent = associatedCount === null
    ? "Explorer la sélection"
    : `${associatedCount} produit${associatedCount > 1 ? "s" : ""}`;

  const subtitle = document.createElement("span");
  subtitle.className = "collection-card-subtitle";
  subtitle.textContent = collection.subtitle || "Sélection XELOS";

  meta.append(count, subtitle);

  const arrow = document.createElement("span");
  arrow.className = "collection-card-arrow";
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "↗";

  bottom.append(meta, arrow);

  const link = document.createElement("a");
  link.className = "collection-card";
  link.href = `shop.html?collection=${encodeURIComponent(collection.slug)}`;
  link.setAttribute("aria-label", `Découvrir la collection ${collection.name}`);

  link.append(media, shade, topLine, heading);

  if (collection.description) {
    link.append(description);
  }

  link.append(bottom);

  /*
   * La carte est un lien unique. On n'imbrique pas de liens ou de boutons
   * interactifs à l'intérieur, ce qui évite un HTML invalide.
   */
  link.className = "collection-card";
  return link;
}

function productMatchesCollection(product, collection) {
  if (product.collectionId && collection.id) {
    return String(product.collectionId) === String(collection.id);
  }

  return Boolean(product.collectionSlug) &&
    product.collectionSlug === collection.slug;
}

function isSafeCollectionImage(value) {
  if (!value) return false;

  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
