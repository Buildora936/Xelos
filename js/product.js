
const ProductPage = {
  products: [],
  currentProduct: null,
  gallery: [],
  activeImage: 0,
  quantity: 1,
  catalogReceived: false,
  toastTimer: null
};

const PRODUCT_IDS = [
  "mobileMenuToggle", "mainNavigation",
  "headerSearchForm", "headerSearchInput",
  "productLoading", "productUnavailable", "unavailableTitle",
  "unavailableMessage", "productLayout", "productGalleryMain",
  "productGalleryBadges", "productMainImage", "productImagePlaceholder",
  "productThumbnails", "galleryZoom", "galleryCount",
  "productCategoryLink", "breadcrumbProduct", "productCategory",
  "productStock", "productStockText", "productTitle", "productRatingRow",
  "productRatingStars", "productRatingValue", "productReviewLink",
  "productSubtitle", "productPrice", "productOldPrice", "productDiscount",
  "productPriceNote", "productDescription", "productQuantity",
  "quantityMinus", "quantityPlus", "addToCartButton", "wishlistButton",
  "productActionNote", "productReference", "productSku",
  "productDetails", "productFullDescription", "productFeatures",
  "productNoFeatures", "productRecommendations", "similarProducts",
  "productReviews", "productReviewSummary", "productLightbox",
  "lightboxImage", "closeLightbox", "productToast", "footerYear"
];

const productElements = {};

document.addEventListener("DOMContentLoaded", initializeProductPage);

function initializeProductPage() {
  PRODUCT_IDS.forEach((id) => {
    productElements[id] = document.getElementById(id);
  });

  bindProductEvents();

  if (productElements.footerYear) {
    productElements.footerYear.textContent = String(new Date().getFullYear());
  }

  const headerQuery = new URLSearchParams(window.location.search).get("q");
  if (productElements.headerSearchInput && headerQuery) {
    productElements.headerSearchInput.value = headerQuery;
  }

  showProductLoading();
}

function bindProductEvents() {
  productElements.mobileMenuToggle?.addEventListener("click", () => {
    const nav = productElements.mainNavigation;
    const button = productElements.mobileMenuToggle;
    if (!nav || !button) return;

    const isOpen = nav.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(isOpen));
    button.setAttribute(
      "aria-label",
      isOpen ? "Fermer le menu" : "Ouvrir le menu"
    );
  });

  productElements.headerSearchForm?.addEventListener("submit", (event) => {
    event.preventDefault();

    const query = productElements.headerSearchInput?.value.trim() || "";
    const params = new URLSearchParams();

    if (query) params.set("q", query);

    window.location.href = `search.html${params.size ? `?${params}` : ""}`;
  });

  productElements.quantityMinus?.addEventListener("click", () => {
    setQuantity(ProductPage.quantity - 1);
  });

  productElements.quantityPlus?.addEventListener("click", () => {
    setQuantity(ProductPage.quantity + 1);
  });

  productElements.productQuantity?.addEventListener("change", () => {
    setQuantity(Number(productElements.productQuantity.value));
  });

  productElements.productQuantity?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      productElements.productQuantity.blur();
    }
  });

  productElements.productThumbnails?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-image-index]");
    if (!button) return;
    setActiveImage(Number(button.dataset.imageIndex));
  });

  productElements.galleryZoom?.addEventListener("click", openLightbox);
  productElements.closeLightbox?.addEventListener("click", closeLightbox);

  productElements.productLightbox?.addEventListener("click", (event) => {
    if (event.target === productElements.productLightbox) {
      closeLightbox();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeLightbox();
  });

  productElements.addToCartButton?.addEventListener("click", handleAddToCart);
  productElements.wishlistButton?.addEventListener("click", handleWishlist);

  window.addEventListener("xelos:catalog-data", (event) => {
    const products = event.detail?.products;

    if (!Array.isArray(products)) {
      showUnavailable(
        "Catalogue incompatible",
        "Les données reçues ne correspondent pas au format attendu."
      );
      return;
    }

    setProducts(products);
  });

  window.addEventListener("xelos:catalog-error", (event) => {
    showUnavailable(
      "Chargement impossible",
      event.detail?.message || "Le catalogue n'a pas pu être chargé."
    );
  });

  // Permet aussi une intégration directe par le module central de données.
  window.addEventListener("xelos:product-data", (event) => {
    const product = event.detail?.product;
    if (product) renderProduct(product);
  });
}

function normalizeProduct(raw) {
  if (!raw || raw.id == null || !raw.name) return null;

  const priceValue = Number(raw.price);
  const compareValue = Number(raw.compareAtPrice);
  const ratingValue = Number(raw.rating);
  const reviewCountValue = Number(raw.reviewCount);

  const gallery = Array.isArray(raw.gallery)
    ? raw.gallery
    : Array.isArray(raw.images)
      ? raw.images
      : [];

  const images = [
    raw.image,
    ...gallery.map((item) => typeof item === "string" ? item : item?.url)
  ].filter(isSafeImageUrl);

  return {
    id: String(raw.id),
    name: String(raw.name).trim(),
    slug: String(raw.slug || raw.id),
    description: String(raw.description || ""),
    subtitle: String(raw.subtitle || ""),
    categoryId: String(raw.categoryId ?? ""),
    categoryName: String(raw.categoryName || ""),
    price: Number.isFinite(priceValue) && priceValue >= 0 ? priceValue : null,
    compareAtPrice:
      Number.isFinite(compareValue) && compareValue >= 0
        ? compareValue
        : null,
    currency: /^[A-Z]{3}$/.test(String(raw.currency || ""))
      ? String(raw.currency)
      : "USD",
    available: raw.available === true,
    images: [...new Set(images)],
    features: normalizeFeatures(raw.features),
    sku: String(raw.sku || ""),
    rating: Number.isFinite(ratingValue) && ratingValue >= 0 && ratingValue <= 5
      ? ratingValue
      : null,
    reviewCount:
      Number.isInteger(reviewCountValue) && reviewCountValue >= 0
        ? reviewCountValue
        : 0,
    popularity: Number.isFinite(Number(raw.popularity))
      ? Number(raw.popularity)
      : 0
  };
}

function normalizeFeatures(value) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      label: String(item.label || item.name || "").trim(),
      value: String(item.value ?? "").trim()
    }))
    .filter((item) => item.label && item.value);
}

function isSafeImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return false;

  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getRequestedProductIdentifier() {
  const params = new URLSearchParams(window.location.search);
  return (params.get("id") || params.get("slug") || "").trim();
}

function setProducts(rawProducts) {
  ProductPage.products = rawProducts.map(normalizeProduct).filter(Boolean);
  ProductPage.catalogReceived = true;

  const requestedId = getRequestedProductIdentifier();

  if (!requestedId) {
    showUnavailable(
      "Choisissez un produit",
      "Aucun identifiant de produit n'a été fourni dans l'adresse."
    );
    return;
  }

  const product = ProductPage.products.find((item) =>
    item.id === requestedId || item.slug === requestedId
  );

  if (!product) {
    showUnavailable(
      "Produit introuvable",
      "Ce produit n'est pas présent dans les données du catalogue reçues."
    );
    return;
  }

  renderProduct(product);
}

function renderProduct(product) {
  const normalized = normalizeProduct(product);

  if (!normalized) {
    showUnavailable(
      "Produit indisponible",
      "Les informations de ce produit sont incomplètes."
    );
    return;
  }

  ProductPage.currentProduct = normalized;
  ProductPage.gallery = normalized.images;
  ProductPage.activeImage = 0;
  ProductPage.quantity = 1;

  document.title = `${normalized.name} | XELOS`;

  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription && normalized.description) {
    metaDescription.content = normalized.description.slice(0, 155);
  }

  hideUnavailable();
  showProductLayout();

  setText("productTitle", normalized.name);
  setText("breadcrumbProduct", normalized.name);
  setText("productCategory", normalized.categoryName || "XELOS");
  setText("productDescription", normalized.description);
  setText("productFullDescription", normalized.description);
  setText("productSubtitle", normalized.subtitle);

  productElements.productCategoryLink?.setAttribute(
    "href",
    normalized.categoryId
      ? `category.html?id=${encodeURIComponent(normalized.categoryId)}`
      : "category.html"
  );

  productElements.productSubtitle.hidden = !normalized.subtitle;
  productElements.productReference.hidden = !normalized.sku;
  setText("productSku", normalized.sku);

  renderPrice(normalized);
  renderAvailability(normalized);
  renderRating(normalized);
  renderGallery(normalized.images);
  renderFeatures(normalized.features);
  renderRecommendations(normalized);
  renderReviewSummary(normalized);

  setQuantity(1);

  const canAdd = normalized.available && normalized.price !== null;
  productElements.addToCartButton.disabled = !canAdd;

  if (productElements.addToCartButton) {
    productElements.addToCartButton.querySelector("span").textContent =
      !normalized.available
        ? "Indisponible"
        : normalized.price === null
          ? "Prix à confirmer"
          : "Ajouter au panier";
  }

  if (productElements.productActionNote) {
    productElements.productActionNote.textContent = "";
  }
}

function renderPrice(product) {
  const priceElement = productElements.productPrice;
  if (!priceElement) return;

  if (product.price === null) {
    priceElement.textContent = "Prix à confirmer";
    productElements.productOldPrice.hidden = true;
    productElements.productDiscount.hidden = true;
    productElements.productPriceNote.textContent =
      "Le prix n'est pas encore disponible.";
    return;
  }

  priceElement.textContent = formatPrice(product.price, product.currency);

  const hasDiscount =
    product.compareAtPrice !== null &&
    product.compareAtPrice > product.price;

  productElements.productOldPrice.hidden = !hasDiscount;
  productElements.productDiscount.hidden = !hasDiscount;

  if (hasDiscount) {
    productElements.productOldPrice.textContent = formatPrice(
      product.compareAtPrice,
      product.currency
    );

    const percentage = Math.round(
      (1 - product.price / product.compareAtPrice) * 100
    );

    productElements.productDiscount.textContent = `-${percentage}%`;
  }

  productElements.productPriceNote.textContent =
    "Les frais éventuels de livraison seront indiqués lors de la commande.";

  const badges = productElements.productGalleryBadges;
  if (badges) {
    badges.replaceChildren();

    if (hasDiscount) {
      const badge = document.createElement("span");
      badge.className = "product-image-badge is-sale";
      badge.textContent = `-${Math.round(
        (1 - product.price / product.compareAtPrice) * 100
      )}%`;
      badges.append(badge);
    }
  }
}

function renderAvailability(product) {
  const stock = productElements.productStock;
  if (!stock) return;

  stock.classList.remove("is-available", "is-unavailable");

  if (product.available) {
    stock.classList.add("is-available");
    setText("productStockText", "Disponible");
  } else {
    stock.classList.add("is-unavailable");
    setText("productStockText", "Indisponible");
  }
}

function renderRating(product) {
  const hasRating = product.rating !== null && product.reviewCount > 0;
  productElements.productRatingRow.hidden = !hasRating;

  if (!hasRating) return;

  const stars = productElements.productRatingStars;
  stars.replaceChildren();

  for (let index = 1; index <= 5; index += 1) {
    const star = document.createElement("i");
    star.className = index <= Math.round(product.rating)
      ? "fa-solid fa-star"
      : "fa-solid fa-star is-empty";
    star.setAttribute("aria-hidden", "true");
    stars.append(star);
  }

  setText("productRatingValue", product.rating.toFixed(1));
  setText(
    "productReviewLink",
    `${product.reviewCount} avis`
  );
}

function renderGallery(images) {
  const thumbnails = productElements.productThumbnails;
  const mainImage = productElements.productMainImage;
  const placeholder = productElements.productImagePlaceholder;

  thumbnails.replaceChildren();

  if (!images.length) {
    mainImage.hidden = true;
    placeholder.hidden = false;
    productElements.galleryZoom.hidden = true;
    setText("galleryCount", "Aucune image disponible");
    return;
  }

  mainImage.hidden = false;
  placeholder.hidden = true;
  productElements.galleryZoom.hidden = false;

  images.forEach((src, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "product-thumbnail";
    button.dataset.imageIndex = String(index);
    button.setAttribute("aria-label", `Afficher l'image ${index + 1}`);

    const image = document.createElement("img");
    image.src = src;
    image.alt = `${ProductPage.currentProduct.name} — image ${index + 1}`;
    image.loading = "lazy";

    image.addEventListener("error", () => {
      button.remove();

      ProductPage.gallery = ProductPage.gallery.filter(
        (item) => item !== src
      );

      if (ProductPage.activeImage >= ProductPage.gallery.length) {
        ProductPage.activeImage = Math.max(0, ProductPage.gallery.length - 1);
      }

      if (ProductPage.gallery.length) {
        setActiveImage(ProductPage.activeImage);
      } else {
        mainImage.hidden = true;
        placeholder.hidden = false;
        productElements.galleryZoom.hidden = true;
      }

      setText(
        "galleryCount",
        `${ProductPage.gallery.length} image${ProductPage.gallery.length > 1 ? "s" : ""}`
      );
    }, { once: true });

    button.append(image);
    thumbnails.append(button);
  });

  setActiveImage(0);
  setText("galleryCount", `${images.length} image${images.length > 1 ? "s" : ""}`);
}

function setActiveImage(index) {
  if (!ProductPage.gallery.length) return;
  if (!Number.isInteger(index) || index < 0 || index >= ProductPage.gallery.length) return;

  ProductPage.activeImage = index;

  const mainImage = productElements.productMainImage;
  mainImage.src = ProductPage.gallery[index];
  mainImage.alt = `${ProductPage.currentProduct.name} — image ${index + 1}`;
  mainImage.hidden = false;
  productElements.productImagePlaceholder.hidden = true;

  productElements.productThumbnails.querySelectorAll(".product-thumbnail")
    .forEach((button) => {
      const active = Number(button.dataset.imageIndex) === index;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
}

function renderFeatures(features) {
  const container = productElements.productFeatures;
  container.replaceChildren();

  productElements.productNoFeatures.hidden = features.length > 0;

  features.forEach((feature) => {
    const row = document.createElement("div");
    row.className = "product-feature-row";

    const label = document.createElement("dt");
    label.textContent = feature.label;

    const value = document.createElement("dd");
    value.textContent = feature.value;

    row.append(label, value);
    container.append(row);
  });

  productElements.productDetails.hidden = false;
}

function renderRecommendations(current) {
  const recommendations = ProductPage.products
    .filter((item) => item.id !== current.id)
    .filter((item) => item.available && item.price !== null)
    .sort((a, b) => {
      const aSameCategory = a.categoryId && a.categoryId === current.categoryId;
      const bSameCategory = b.categoryId && b.categoryId === current.categoryId;

      if (aSameCategory !== bSameCategory) {
        return Number(bSameCategory) - Number(aSameCategory);
      }

      return b.popularity - a.popularity;
    })
    .slice(0, 4);

  const container = productElements.similarProducts;
  container.replaceChildren();

  recommendations.forEach((product) => {
    container.append(createRecommendationCard(product));
  });

  productElements.productRecommendations.hidden = recommendations.length === 0;
}

function createRecommendationCard(product) {
  const article = document.createElement("article");
  article.className = "product-recommendation-card";

  const link = document.createElement("a");
  link.className = "product-recommendation-image";
  link.href = getProductUrl(product);
  link.setAttribute("aria-label", `Découvrir ${product.name}`);

  if (product.images[0]) {
    const image = document.createElement("img");
    image.src = product.images[0];
    image.alt = product.name;
    image.loading = "lazy";
    link.append(image);
  } else {
    const placeholder = document.createElement("i");
    placeholder.className = "fa-regular fa-image";
    placeholder.setAttribute("aria-hidden", "true");
    link.append(placeholder);
  }

  const body = document.createElement("div");
  body.className = "product-recommendation-content";

  const category = document.createElement("p");
  category.className = "product-recommendation-category";
  category.textContent = product.categoryName || "XELOS";

  const heading = document.createElement("h3");
  const titleLink = document.createElement("a");
  titleLink.href = getProductUrl(product);
  titleLink.textContent = product.name;
  heading.append(titleLink);

  const price = document.createElement("span");
  price.className = "product-recommendation-price";
  price.textContent = formatPrice(product.price, product.currency);

  body.append(category, heading, price);

  if (
    product.compareAtPrice !== null &&
    product.compareAtPrice > product.price
  ) {
    const oldPrice = document.createElement("span");
    oldPrice.className = "product-recommendation-old-price";
    oldPrice.textContent = formatPrice(
      product.compareAtPrice,
      product.currency
    );
    body.append(oldPrice);
  }

  article.append(link, body);
  return article;
}

function renderReviewSummary(product) {
  const hasReviews = product.rating !== null && product.reviewCount > 0;

  productElements.productReviews.hidden = !hasReviews;

  if (hasReviews) {
    productElements.productReviewSummary.textContent =
      `${product.rating.toFixed(1)} sur 5 — ${product.reviewCount} avis`;
  }
}

function setQuantity(value) {
  const input = productElements.productQuantity;
  const parsed = Number(value);

  ProductPage.quantity = Number.isFinite(parsed)
    ? Math.min(99, Math.max(1, Math.floor(parsed)))
    : 1;

  if (input) input.value = String(ProductPage.quantity);

  if (productElements.quantityMinus) {
    productElements.quantityMinus.disabled = ProductPage.quantity <= 1;
  }

  if (productElements.quantityPlus) {
    productElements.quantityPlus.disabled = ProductPage.quantity >= 99;
  }
}

function handleAddToCart() {
  const product = ProductPage.currentProduct;

  if (!product || !product.available || product.price === null) return;

  const detail = {
    productId: product.id,
    slug: product.slug,
    name: product.name,
    price: product.price,
    currency: product.currency,
    image: product.images[0] || "",
    quantity: ProductPage.quantity
  };

  // Le gestionnaire du panier devra écouter cet événement au Jour 18.
  window.dispatchEvent(new CustomEvent("xelos:add-to-cart", { detail }));

  if (productElements.productActionNote) {
    productElements.productActionNote.textContent =
      "Demande transmise à l'interface du panier. La persistance du panier doit encore être raccordée.";
  }
}

function handleWishlist() {
  const product = ProductPage.currentProduct;
  if (!product) return;

  const button = productElements.wishlistButton;
  const isActive = button.getAttribute("aria-pressed") === "true";
  const nextActive = !isActive;

  button.setAttribute("aria-pressed", String(nextActive));
  button.classList.toggle("is-active", nextActive);
  button.querySelector("i").className = nextActive
    ? "fa-solid fa-heart"
    : "fa-regular fa-heart";

  showToast(
    nextActive
      ? "Produit marqué comme favori dans cette page. La sauvegarde du compte sera raccordée à la fonctionnalité Favoris."
      : "Produit retiré des favoris de cette page."
  );
}

function openLightbox() {
  const image = productElements.productMainImage;

  if (!image || image.hidden || !image.src) return;

  productElements.lightboxImage.src = image.src;
  productElements.lightboxImage.alt = image.alt;
  productElements.productLightbox.hidden = false;
  document.body.style.overflow = "hidden";
  productElements.closeLightbox?.focus();
}

function closeLightbox() {
  if (!productElements.productLightbox || productElements.productLightbox.hidden) {
    return;
  }

  productElements.productLightbox.hidden = true;
  document.body.style.overflow = "";
  productElements.galleryZoom?.focus();
}

function showToast(message) {
  const toast = productElements.productToast;
  if (!toast) return;

  toast.textContent = message;
  toast.hidden = false;

  window.clearTimeout(ProductPage.toastTimer);
  ProductPage.toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 4500);
}

function showProductLoading() {
  productElements.productLoading.hidden = false;
  productElements.productLayout.hidden = true;
  productElements.productUnavailable.hidden = true;
}

function showProductLayout() {
  productElements.productLoading.hidden = true;
  productElements.productUnavailable.hidden = true;
  productElements.productLayout.hidden = false;
}

function hideUnavailable() {
  productElements.productUnavailable.hidden = true;
}

function showUnavailable(title, message) {
  productElements.productLoading.hidden = true;
  productElements.productLayout.hidden = true;
  productElements.productUnavailable.hidden = false;

  setText("unavailableTitle", title);
  setText("unavailableMessage", message);
}

function setText(id, value) {
  const element = productElements[id];
  if (element) element.textContent = value ?? "";
}

function formatPrice(value, currency) {
  try {
    return new Intl.NumberFormat("fr-FR", {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(value);
  } catch {
    return `${Number(value).toFixed(2)} ${currency}`;
  }
}

function getProductUrl(product) {
  const identifier = product.slug || product.id;
  return `product.html?id=${encodeURIComponent(identifier)}`;
}

// Contrat public de la page produit pour le raccordement du catalogue.
window.XELOS_PRODUCT_PAGE = Object.freeze({
  setProducts,
  renderProduct,

  getCurrentProduct() {
    return ProductPage.currentProduct;
  }
});
