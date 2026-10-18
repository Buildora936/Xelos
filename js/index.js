
/**
 * XELOS — Homepage
 * File: js/index.js
 *
 * Data flow: page -> data.js -> Supabase.
 */

import { selectRows } from "./data.js";

const $ = (selector, root = document) =>
  root.querySelector(selector);

const SELECT_LIMIT = 100;
const PRODUCT_LIMIT = 8;

/* =========================================
   MOBILE NAVIGATION
========================================= */

const mobileMenuButton = $("#mobile-menu-toggle");
const navigation = $("#primary-navigation");

if (mobileMenuButton && navigation) {
  const closeMenu = () => {
    navigation.classList.remove("is-open");
    mobileMenuButton.setAttribute("aria-expanded", "false");
    mobileMenuButton.setAttribute(
      "aria-label",
      "Open navigation menu"
    );
  };

  mobileMenuButton.addEventListener("click", () => {
    const isOpen =
      mobileMenuButton.getAttribute("aria-expanded") === "true";

    mobileMenuButton.setAttribute(
      "aria-expanded",
      String(!isOpen)
    );

    mobileMenuButton.setAttribute(
      "aria-label",
      isOpen ? "Open navigation menu" : "Close navigation menu"
    );

    navigation.classList.toggle("is-open", !isOpen);
  });

  navigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
}

/* =========================================
   FOOTER YEAR
========================================= */

const yearElement = $("#current-year");

if (yearElement) {
  yearElement.textContent = String(new Date().getFullYear());
}

/* =========================================
   GENERAL HELPERS
========================================= */

function showMessage(
  container,
  message,
  className = "content-empty"
) {
  if (!container) return;

  const element = document.createElement("div");
  element.className = className;
  element.textContent = message;

  container.replaceChildren(element);
}

function isValidHttpUrl(value) {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value, window.location.href);

    return (
      url.protocol === "https:" ||
      url.protocol === "http:"
    );
  } catch {
    return false;
  }
}

function makeProductLink(product) {
  const url = new URL(
    "product.html",
    window.location.href
  );

  url.searchParams.set("id", String(product.id));

  return `${url.pathname}${url.search}`;
}

/* =========================================
   PRODUCT IMAGES
========================================= */

function getProductImage(product) {
  const media = Array.isArray(product.media)
    ? [...product.media]
    : [];

  media.sort((a, b) => {
    if (Boolean(a.is_primary) !== Boolean(b.is_primary)) {
      return a.is_primary ? -1 : 1;
    }

    return Number(a.position ?? 0) -
      Number(b.position ?? 0);
  });

  const primaryImage = media.find(
    (item) =>
      item.is_active !== false &&
      item.media_type === "image" &&
      isValidHttpUrl(item.url)
  );

  if (primaryImage) {
    return primaryImage.url;
  }

  const thumbnail = media.find(
    (item) =>
      item.is_active !== false &&
      item.media_type === "image" &&
      isValidHttpUrl(item.thumbnail_url)
  );

  return thumbnail?.thumbnail_url ?? null;
}

/* =========================================
   PRODUCT PRICES
========================================= */

function getProductPrice(product) {
  const now = Date.now();

  const prices = (
    Array.isArray(product.prices)
      ? product.prices
      : []
  ).filter((price) => {
    if (price.is_active !== true) return false;

    const startsAt = price.starts_at
      ? Date.parse(price.starts_at)
      : 0;

    const endsAt = price.ends_at
      ? Date.parse(price.ends_at)
      : null;

    return (
      (!Number.isFinite(startsAt) || startsAt <= now) &&
      (endsAt === null ||
        !Number.isFinite(endsAt) ||
        endsAt > now) &&
      Number.isFinite(Number(price.amount))
    );
  });

  const productPrices = prices.filter(
    (price) => price.product_variant_id == null
  );

  const usablePrices = productPrices.length
    ? productPrices
    : prices;

  const salePrice = usablePrices
    .filter((price) => price.price_type === "sale")
    .sort(
      (a, b) => Number(a.amount) - Number(b.amount)
    )[0];

  if (salePrice) {
    return Number(salePrice.amount);
  }

  const regularPrice = usablePrices
    .filter((price) => price.price_type === "regular")
    .sort(
      (a, b) => Number(a.amount) - Number(b.amount)
    )[0];

  if (regularPrice) {
    return Number(regularPrice.amount);
  }

  const variantPrices = (
    product.variants ?? []
  )
    .map((variant) => variant.price_override)
    .filter(
      (price) =>
        price !== null &&
        price !== undefined &&
        Number.isFinite(Number(price))
    )
    .map(Number)
    .sort((a, b) => a - b);

  return variantPrices.length
    ? variantPrices[0]
    : null;
}

function formatPrice(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

/* =========================================
   PRODUCT CARDS
========================================= */

function renderProductCard(product) {
  if (!product?.id || !product?.name) {
    return null;
  }

  const productLink = makeProductLink(product);
  const imageUrl = getProductImage(product);
  const price = getProductPrice(product);

  const article = document.createElement("article");
  article.className = "product-card";

  const media = document.createElement("a");
  media.className = "product-card-media";
  media.href = productLink;
  media.setAttribute(
    "aria-label",
    `View ${product.name}`
  );

  if (imageUrl) {
    const image = document.createElement("img");

    image.className = "product-card-image";
    image.src = imageUrl;
    image.alt = product.name;
    image.loading = "lazy";
    image.decoding = "async";

    image.addEventListener(
      "error",
      () => {
        image.remove();
        media.classList.add(
          "product-card-media-no-image"
        );
      },
      { once: true }
    );

    media.append(image);
  } else {
    media.classList.add(
      "product-card-media-no-image"
    );
    media.setAttribute(
      "aria-label",
      `${product.name} — image unavailable`
    );
  }

  const body = document.createElement("div");
  body.className = "product-card-body";

  const title = document.createElement("h3");
  title.className = "product-card-title";

  const titleLink = document.createElement("a");
  titleLink.href = productLink;
  titleLink.textContent = product.name;

  title.append(titleLink);
  body.append(title);

  if (price !== null && Number.isFinite(price)) {
    const priceElement = document.createElement("p");

    priceElement.className = "product-card-price";
    priceElement.textContent = formatPrice(price);

    body.append(priceElement);
  }

  const footer = document.createElement("div");
  footer.className = "product-card-footer";

  const viewLink = document.createElement("a");
  viewLink.className = "product-card-add";
  viewLink.href = productLink;
  viewLink.textContent = "View product";

  footer.append(viewLink);
  body.append(footer);

  article.append(media, body);

  return article;
}

/* =========================================
   HERO PRODUCT GALLERY
========================================= */

function renderHeroProducts(products) {
  const container = $("#home-hero-products");

  if (!container) return;

  const productsWithImages = products
    .filter((product) => getProductImage(product))
    .slice(0, 3);

  if (!productsWithImages.length) {
    container.replaceChildren();

    console.info(
      "XELOS: no published product images are available for the hero."
    );

    return;
  }

  const tiles = productsWithImages.map(
    (product, index) => {
      const link = document.createElement("a");

      link.className =
        `hero-product-tile hero-product-tile-${index + 1}`;

      link.href = makeProductLink(product);
      link.setAttribute(
        "aria-label",
        `Discover ${product.name}`
      );

      const image = document.createElement("img");

      image.src = getProductImage(product);
      image.alt = product.name;
      image.loading = index === 0 ? "eager" : "lazy";
      image.decoding = "async";

      const caption = document.createElement("span");

      caption.className = "hero-product-caption";
      caption.textContent = product.name;

      image.addEventListener(
        "error",
        () => link.remove(),
        { once: true }
      );

      link.append(image, caption);

      return link;
    }
  );

  container.replaceChildren(...tiles);
}

/* =========================================
   OPTIONAL TABLE QUERIES
========================================= */

async function loadOptionalRows(
  table,
  options,
  label
) {
  try {
    return await selectRows(table, options);
  } catch (error) {
    console.warn(
      `XELOS: could not load ${label}.`,
      {
        code: error?.code ?? null,
        message: error?.message ?? String(error),
        details: error?.details ?? null,
        hint: error?.hint ?? null
      }
    );

    return [];
  }
}

/* =========================================
   ENRICH PRODUCTS WITH MEDIA, PRICES,
   AND VARIANTS
========================================= */

async function enrichProducts(products) {
  if (!products.length) return products;

  const productIds = products.map(
    (product) => product.id
  );

  const [
    mediaRows,
    priceRows,
    variantRows
  ] = await Promise.all([
    loadOptionalRows(
      "product_media",
      {
        columns: "*",
        filters: {
          product_id: productIds,
          is_active: true,
          media_type: "image"
        },
        limit: 500,
        orderBy: "position",
        ascending: true
      },
      "product media"
    ),

    loadOptionalRows(
      "product_prices",
      {
        columns: "*",
        filters: {
          product_id: productIds,
          is_active: true,
          price_type: ["regular", "sale"]
        },
        limit: 500,
        orderBy: "starts_at",
        ascending: false
      },
      "product prices"
    ),

    loadOptionalRows(
      "product_variants",
      {
        columns: "*",
        filters: {
          product_id: productIds,
          status: "active"
        },
        limit: 500,
        orderBy: "position",
        ascending: true
      },
      "product variants"
    )
  ]);

  const mediaByProduct = new Map();
  const pricesByProduct = new Map();
  const variantsByProduct = new Map();

  for (const row of mediaRows) {
    if (!mediaByProduct.has(row.product_id)) {
      mediaByProduct.set(row.product_id, []);
    }

    mediaByProduct.get(row.product_id).push(row);
  }

  for (const row of priceRows) {
    if (!pricesByProduct.has(row.product_id)) {
      pricesByProduct.set(row.product_id, []);
    }

    pricesByProduct.get(row.product_id).push(row);
  }

  for (const row of variantRows) {
    if (!variantsByProduct.has(row.product_id)) {
      variantsByProduct.set(row.product_id, []);
    }

    variantsByProduct.get(row.product_id).push(row);
  }

  return products.map((product) => ({
    ...product,
    media: mediaByProduct.get(product.id) ?? [],
    prices: pricesByProduct.get(product.id) ?? [],
    variants: variantsByProduct.get(product.id) ?? []
  }));
}

/* =========================================
   PRODUCT SECTION RENDERING
========================================= */

function renderProductSection(
  container,
  products,
  emptyMessage
) {
  if (!container) return;

  const cards = products
    .map(renderProductCard)
    .filter(Boolean);

  if (!cards.length) {
    showMessage(container, emptyMessage);
    return;
  }

  container.replaceChildren(...cards);
}

/* =========================================
   MAIN CATALOG QUERY
========================================= */

function showCatalogError(error) {
  const details = {
    code: error?.code ?? null,
    message: error?.message ?? String(error),
    details: error?.details ?? null,
    hint: error?.hint ?? null
  };

  console.error(
    "XELOS: the main product query failed.",
    details
  );

  let message =
    "The catalogue could not be loaded. Check the browser console.";

  if (
    error?.code === "42501" ||
    /permission denied|row-level security/i.test(
      error?.message ?? ""
    )
  ) {
    message =
      "The catalogue is blocked by database permissions. Check the public SELECT policies for products.";
  } else if (
    error?.code === "PGRST205" ||
    error?.code === "42P01"
  ) {
    message =
      "Supabase cannot find the products table in the exposed schema. Verify the active project and table name.";
  } else if (
    error?.code === "PGRST301" ||
    error?.code === "401" ||
    error?.code === "403"
  ) {
    message =
      "Supabase rejected the request. Check the project URL, anon key, and database permissions.";
  }

  [
    $("#new-products-grid"),
    $("#best-sellers-grid"),
    $("#recommended-products-grid")
  ].forEach((container) => {
    showMessage(container, message, "content-error");
  });

  const hero = $("#home-hero-products");

  if (hero) {
    hero.replaceChildren();
  }
}

async function loadHomepageCatalog() {
  const productContainers = [
    $("#new-products-grid"),
    $("#best-sellers-grid"),
    $("#recommended-products-grid")
  ];

  productContainers.forEach((container) => {
    if (container) {
      showMessage(container, "Loading products…");
    }
  });

  try {
    const products = await selectRows(
      "products",
      {
        columns: "*",
        filters: {
          status: "active",
          visibility: "public"
        },
        limit: SELECT_LIMIT,
        orderBy: "created_at",
        ascending: false
      }
    );

    console.info(
      `XELOS: Supabase returned ${products.length} active public product(s).`
    );

    if (!products.length) {
      const emptyMessage =
        "No published products are available yet.";

      productContainers.forEach((container) => {
        showMessage(container, emptyMessage);
      });

      showMessage(
        $("#home-categories-grid"),
        "Categories will appear when the category catalogue is connected."
      );

      renderHeroProducts([]);

      return;
    }

    const enrichedProducts =
      await enrichProducts(products);

    renderHeroProducts(enrichedProducts);

    const newArrivals = enrichedProducts.filter(
      (product) => product.is_new_arrival === true
    );

    const bestSellers = enrichedProducts.filter(
      (product) => product.is_best_seller === true
    );

    const featuredProducts = enrichedProducts.filter(
      (product) => product.is_featured === true
    );

    renderProductSection(
      $("#new-products-grid"),
      newArrivals.slice(0, PRODUCT_LIMIT),
      "No products are currently marked as new arrivals."
    );

    renderProductSection(
      $("#best-sellers-grid"),
      bestSellers.slice(0, PRODUCT_LIMIT),
      "No products are currently marked as best sellers."
    );

    renderProductSection(
      $("#recommended-products-grid"),
      featuredProducts.slice(0, PRODUCT_LIMIT),
      "No featured products are available yet."
    );

    // The actual category table has not been confirmed here.
    showMessage(
      $("#home-categories-grid"),
      "Categories will appear when the category catalogue is connected."
    );
  } catch (error) {
    showCatalogError(error);
  }
}

/* =========================================
   HEADER COUNTERS
========================================= */

const cartCount = $("#cart-count");

if (cartCount) {
  cartCount.hidden = true;
}

/* =========================================
   START
========================================= */

loadHomepageCatalog();
