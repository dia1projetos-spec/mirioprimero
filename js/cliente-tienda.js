import { db, collection, doc, getDoc, getDocs } from "./firebase-config.js";
import { initCarrito, agregarAlCarrito } from "./carrito.js";

const params = new URLSearchParams(window.location.search);
const negocioId = params.get("id");
const productoDestacadoId = params.get("producto");

let negocioData = null;

initCarrito();

if (!negocioId) {
  document.getElementById("tiendaNombre").textContent = "Tienda no encontrada";
} else {
  init();
}

async function init() {
  const negSnap = await getDoc(doc(db, "negocios", negocioId));
  if (!negSnap.exists()) {
    document.getElementById("tiendaNombre").textContent = "Tienda no encontrada";
    return;
  }
  negocioData = negSnap.data();
  document.getElementById("tiendaNombre").textContent = negocioData.nombre;

  const badge = document.getElementById("tiendaCategoria");
  if (negocioData.categoria) {
    badge.textContent = negocioData.categoria;
    badge.hidden = false;
  }

  if (negocioData.abierto === false) {
    const estadoBadge = document.createElement("span");
    estadoBadge.className = "tienda-header__badge";
    estadoBadge.style.cssText = "background: rgba(107,114,128,0.2); color:#9ca3af; margin-left:8px;";
    estadoBadge.textContent = "Cerrado ahora";
    badge.after(estadoBadge);
  }

  const logoWrap = document.getElementById("tiendaLogoWrap");
  const inicial = (negocioData.nombre || "?").trim().charAt(0).toUpperCase();
  logoWrap.innerHTML = negocioData.logoUrl
    ? `<img class="tienda-header__logo" src="${negocioData.logoUrl}" alt="${escapeHtml(negocioData.nombre)}" />`
    : `<span class="tienda-header__logo tienda-header__logo--placeholder">${inicial}</span>`;

  const slidesWrap = document.getElementById("tiendaSlides");
  (negocioData.slides || []).forEach((url) => {
    const img = document.createElement("img");
    img.src = url;
    slidesWrap.appendChild(img);
  });

  const contenido = document.getElementById("tiendaContenido");
  const prodSnap = await getDocs(collection(db, "negocios", negocioId, "productos"));
  const productos = prodSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (productos.length === 0) {
    contenido.innerHTML = `<p class="empty-state" style="padding: 40px 16px;"><span>Esta tienda todavía no cargó productos.</span></p>`;
    return;
  }

  // Agrupamos por categoría de producto propia de la tienda. Los que no
  // tienen categoría van juntos al final, bajo "Otros productos".
  const grupos = new Map();
  productos.forEach((p) => {
    const clave = p.categoriaProducto || "Otros productos";
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(p);
  });

  const clavesOrdenadas = [...grupos.keys()].sort((a, b) => {
    if (a === "Otros productos") return 1;
    if (b === "Otros productos") return -1;
    return a.localeCompare(b);
  });

  clavesOrdenadas.forEach((clave) => {
    const seccion = document.createElement("section");
    seccion.className = "categoria-producto-seccion";
    seccion.innerHTML = `<h2>${escapeHtml(clave)}</h2>`;

    const grid = document.createElement("div");
    grid.className = "tienda-grid";

    grupos.get(clave).forEach((p) => {
      const precioMostrar = p.promocion?.activo && p.promocionAprobada ? p.promocion.precioPromo : p.precio;
      const card = document.createElement("div");
      card.className = "prod-card";
      card.innerHTML = `
        <div class="prod-card__img-wrap">
          <img src="${p.fotoUrl || "https://placehold.co/400x300/0f1723/8b93a1?text=Sin+foto"}" alt="${escapeHtml(p.nombre)}" />
        </div>
        <div class="prod-card__body">
          <p class="prod-card__nombre">${escapeHtml(p.nombre)}</p>
          <p class="prod-card__precio">$${precioMostrar}</p>
          <button class="btn btn--gold btn--sm btn--block" style="margin-top:10px;" data-agregar="${p.id}">Agregar al carrito</button>
        </div>
      `;
      grid.appendChild(card);
      card.querySelector("[data-agregar]").addEventListener("click", () =>
        agregarAlCarrito(
          negocioId,
          negocioData.nombre,
          { productoId: p.id, nombre: p.nombre, precio: precioMostrar, fotoUrl: p.fotoUrl || null },
          { cerrado: negocioData.abierto === false }
        )
      );
    });

    seccion.appendChild(grid);
    contenido.appendChild(seccion);
  });

  if (productoDestacadoId) {
    const el = contenido.querySelector(`[data-agregar="${productoDestacadoId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
