
/**
 * XELOS — Page d'accueil
 * Fichier : js/index.js
 */

import { selectRows } from "./data.js";

const $ = (selector, root = document) =>
  root.querySelector(selector);

const mobileMenuButton = $("#mobile-menu-toggle");
const navigation = $("#primary-navigation");

if (mobileMenuButton && navigation) {
  mobileMenuButton.addEventListener("click", () => {
    const isOpen =
      mobileMenuButton.getAttribute("aria-expanded") === "true";

    mobileMenuButton.setAttribute("aria-expanded", String(!isOpen));
    mobileMenuButton.setAttribute(
      "aria-label",
      isOpen ? "Ouvrir le menu" : "Fermer le menu"
    );

    navigation.classList.toggle("is-open", !isOpen);
  });

  navigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) {
      navigation.classList.remove("is-open");
      mobileMenuButton.setAttribute("aria-expanded", "false");
      mobileMenuButton.setAttribute("aria-label", "Ouvrir le menu");
    }
  });
}

const yearElement = $("#current-year");

if (yearElement) {
  yearElement.textContent = String(new Date().getFullYear());
}

function showMessage(container, message, className = "content-empty") {
  if (!container) return;

  const element = document.createElement("div");
  element.className = className;
  element.textContent = message;

  container.replaceChildren(element);
}

function getValue(record, candidates) {
  for (const key of candidates) {
    const value = record?.[key];

    if (value !== undefined && value !== null && value !== "") {
      return value;
    }
  }

  return null;
}

function safeInternalLink(path, id) {
  const url = new URL(path, window.location.href);
  url.searchParams.set("id", String(id));

  return url.pathname + url.search;
}

function renderProductCard(product) {
  const id = getValue(product, ["id", "product_id", "uuid"]);
  const name = getValue(product, [
    "name",
    "title",
    "product_name",
    "display_name"
  ]);

  const price = getValue(product, [
    "price",
    "selling_price",
    "sale_price",
    "unit_price"
  ]);

  const image = getValue(product, [
    "image_url",
    "thumbnail_url",
    "primary_image",
    "featured_image"
  ]);

  if (id === null || !name) return null;

  const article = document.createElement("article");
  article.className = "product-card";

  const media = document.createElement("a");
  media.className = "product-card-media";
  media.href = safeInternalLink("product.html", id);
  media.setAttribute("aria-label", `Voir ${name}`);

  if (typeof image === "string" && /^https?:\/\//i.test(image)) {
    const img = document.createElement("img");
    img.className = "product-card-image";
    img.src = image;
    img.alt = String(name);
    img.loading = "lazy";
    img.decoding = "async";
    media.append(img);
  } else {
    const visual = document.createElement("div");
    visual.className = "product-image-fallback";
    visual.setAttribute("aria-hidden", "true");
    visual.textContent = "X";
    media.append(visual);
  }

  const body = document.createElement("div");
  body.className = "product-card-body";

  const title = document.createElement("h3");
  title.className = "product-card-title";

  const titleLink = document.createElement("a");
  titleLink.href = safeInternalLink("product.html", id);
  titleLink.textContent = String(name);
  title.append(titleLink);

  body.append(title);

  if (price !== null && Number.isFinite(Number(price))) {
    const priceElement = document.createElement("p");
    priceElement.className = "product-card-price";

    const formattedPrice = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    }).format(Number(price));

    priceElement.textContent = formattedPrice;
    body.append(priceElement);
  }

  const footer = document.createElement("div");
  footer.className = "product-card-footer";

  const viewButton = document.createElement("a");
  viewButton.className = "product-card-add";
  viewButton.href = safeInternalLink("product.html", id);
  viewButton.textContent = "Découvrir le produit";

  footer.append(viewButton);
  body.append(footer);
  article.append(media, body);

  return article;
}

async function loadProductSection({
  table,
  container,
  limit = 4,
  orderBy
}) {
  if (!container) return;

  try {
    const options = { limit };

    if (orderBy) {
      options.orderBy = orderBy;
      options.ascending = false;
    }

    const records = await selectRows(table, options);

    if (!records.length) {
      showMessage(
        container,
        "Aucun produit à afficher pour le moment."
      );
      return;
    }

    const cards = records
      .map(renderProductCard)
      .filter(Boolean);

    if (!cards.length) {
      showMessage(
        container,
        "Les informations des produits doivent être vérifiées avant affichage."
      );
      return;
    }

    container.replaceChildren(...cards);
  } catch (error) {
    console.error("XELOS : chargement du catalogue impossible.", error);

    showMessage(
      container,
      "Le catalogue est momentanément indisponible. Réessayez plus tard.",
      "content-error"
    );
  }
}

/*
 * Le nom de la table et les colonnes doivent être confirmés
 * dans le schéma réel avant d'activer le chargement.
 *
 * Les fonctions de chargement seront reliées aux tables
 * confirmées lors de l'intégration du catalogue.
 */

const cartCount = $("#cart-count");

if (cartCount) {
  cartCount.hidden = true;
}

/*
 * Les catégories, nouveautés, meilleures ventes et promotions
 * restent sans fausses données. Leur branchement réel sera
 * effectué après confirmation du schéma de catalogue.
 */
