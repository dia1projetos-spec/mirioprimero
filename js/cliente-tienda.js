import {
  auth,
  db,
  onAuthStateChanged,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  serverTimestamp,
} from "./firebase-config.js";

const params = new URLSearchParams(window.location.search);
const negocioId = params.get("id");
const productoDestacadoId = params.get("producto");

let clienteUid = null;
let clienteData = null;
let negocioData = null;
let deliveryHSPrecio = 0;
let cuponAplicado = null;

// carrito: array de { productoId, nombre, precio, fotoUrl, cantidad }
let carrito = [];
const CARRITO_KEY = () => `mrp_carrito_${negocioId}`;

function cargarCarritoGuardado() {
  try {
    carrito = JSON.parse(localStorage.getItem(CARRITO_KEY()) || "[]");
  } catch {
    carrito = [];
  }
}

function guardarCarrito() {
  localStorage.setItem(CARRITO_KEY(), JSON.stringify(carrito));
}

// La tienda es visible para cualquier visitante (invitado). Solo se exige
// haber iniciado sesión como cliente en el momento de confirmar una compra.
onAuthStateChanged(auth, async (user) => {
  if (user) {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists() && userSnap.data().role === "cliente") {
      clienteUid = user.uid;
      const clienteSnap = await getDoc(doc(db, "clientes", clienteUid));
      clienteData = clienteSnap.data();
    }
  }
});

if (!negocioId) {
  document.getElementById("tiendaNombre").textContent = "Tienda no encontrada";
} else {
  cargarCarritoGuardado();
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

  const hsSnap = await getDoc(doc(db, "config", "deliveryHS"));
  deliveryHSPrecio = hsSnap.exists() ? hsSnap.data().precio : 0;

  const contenido = document.getElementById("tiendaContenido");
  const prodSnap = await getDocs(collection(db, "negocios", negocioId, "productos"));
  const productos = prodSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (productos.length === 0) {
    contenido.innerHTML = `<p class="empty-state" style="padding: 40px 16px;"><span>Esta tienda todavía no cargó productos.</span></p>`;
    actualizarBotonCarrito();
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
        agregarAlCarrito({ productoId: p.id, nombre: p.nombre, precio: precioMostrar, fotoUrl: p.fotoUrl || null })
      );
    });

    seccion.appendChild(grid);
    contenido.appendChild(seccion);
  });

  if (productoDestacadoId) {
    const el = contenido.querySelector(`[data-agregar="${productoDestacadoId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  actualizarBotonCarrito();
}

// ---------- Carrito ----------
function agregarAlCarrito(item) {
  if (negocioData.abierto === false) {
    alert("Este negocio está cerrado en este momento. Probá más tarde.");
    return;
  }
  const existente = carrito.find((i) => i.productoId === item.productoId);
  if (existente) {
    existente.cantidad += 1;
  } else {
    carrito.push({ ...item, cantidad: 1 });
  }
  guardarCarrito();
  actualizarBotonCarrito();
}

function actualizarBotonCarrito() {
  const btn = document.getElementById("btnAbrirCarrito");
  const badge = document.getElementById("carritoBadge");
  const totalItems = carrito.reduce((acc, i) => acc + i.cantidad, 0);
  if (totalItems === 0) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  badge.textContent = totalItems > 99 ? "99+" : totalItems;
}

function subtotalCarrito() {
  return carrito.reduce((acc, i) => acc + i.precio * i.cantidad, 0);
}

function renderCarrito() {
  const wrap = document.getElementById("carritoItems");
  const empty = document.getElementById("carritoEmpty");
  wrap.innerHTML = "";

  if (carrito.length === 0) {
    empty.hidden = false;
    document.getElementById("carritoSubtotal").textContent = "$0";
    return;
  }
  empty.hidden = true;

  carrito.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "carrito-item";
    div.innerHTML = `
      <img src="${item.fotoUrl || "https://placehold.co/100x100/0f1723/8b93a1?text=%20"}" alt="" />
      <div class="carrito-item__info">
        <p class="carrito-item__nombre">${escapeHtml(item.nombre)}</p>
        <p class="carrito-item__precio">$${item.precio} c/u</p>
      </div>
      <div class="carrito-item__qty">
        <button type="button" data-restar="${index}">−</button>
        <span>${item.cantidad}</span>
        <button type="button" data-sumar="${index}">+</button>
      </div>
      <button type="button" class="carrito-item__quitar" data-quitar="${index}" aria-label="Quitar">✕</button>
    `;
    wrap.appendChild(div);
  });

  wrap.querySelectorAll("[data-sumar]").forEach((btn) => {
    btn.addEventListener("click", () => {
      carrito[Number(btn.dataset.sumar)].cantidad += 1;
      guardarCarrito();
      renderCarrito();
      actualizarBotonCarrito();
    });
  });
  wrap.querySelectorAll("[data-restar]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.restar);
      carrito[idx].cantidad -= 1;
      if (carrito[idx].cantidad <= 0) carrito.splice(idx, 1);
      guardarCarrito();
      renderCarrito();
      actualizarBotonCarrito();
    });
  });
  wrap.querySelectorAll("[data-quitar]").forEach((btn) => {
    btn.addEventListener("click", () => {
      carrito.splice(Number(btn.dataset.quitar), 1);
      guardarCarrito();
      renderCarrito();
      actualizarBotonCarrito();
    });
  });

  document.getElementById("carritoSubtotal").textContent = `$${subtotalCarrito()}`;
}

document.getElementById("btnAbrirCarrito").addEventListener("click", () => {
  renderCarrito();
  document.getElementById("modalCarrito").hidden = false;
});
document.getElementById("cerrarModalCarrito").addEventListener("click", () => {
  document.getElementById("modalCarrito").hidden = true;
});

document.getElementById("btnContinuarCompra").addEventListener("click", () => {
  if (carrito.length === 0) return;
  if (!clienteUid) {
    alert("Necesitás iniciar sesión como cliente para comprar. Te llevamos a la página principal para ingresar o crear tu cuenta.");
    window.location.href = "../index.html";
    return;
  }
  document.getElementById("modalCarrito").hidden = true;
  abrirModalCheckout();
});

// ---------- Checkout (entrega + cupón + confirmar) ----------
function abrirModalCheckout() {
  document.getElementById("compraCupon").value = "";
  document.getElementById("compraCuponMsg").textContent = "";
  document.getElementById("compraError").textContent = "";
  cuponAplicado = null;

  const resumen = document.getElementById("checkoutResumen");
  resumen.innerHTML = carrito
    .map((i) => `<p style="margin:2px 0;">${i.cantidad} × ${escapeHtml(i.nombre)} — $${i.precio * i.cantidad}</p>`)
    .join("");

  const selectDelivery = document.getElementById("compraDelivery");
  selectDelivery.innerHTML = "";
  selectDelivery.add(new Option("Retiro en el local", "retiro"));
  if (negocioData.deliveryPropio?.activo) {
    selectDelivery.add(new Option(`Delivery propio ($${negocioData.deliveryPropio.precio})`, "propio"));
  }
  if (negocioData.deliveryHS?.activo) {
    selectDelivery.add(new Option(`Delivery HS ($${deliveryHSPrecio})`, "hs"));
  }
  selectDelivery.onchange = actualizarTotal;
  actualizarTotal();

  document.getElementById("modalCompra").hidden = false;
}

function costoDelivery() {
  const tipo = document.getElementById("compraDelivery").value;
  if (tipo === "propio") return negocioData.deliveryPropio?.precio || 0;
  if (tipo === "hs") return deliveryHSPrecio;
  return 0;
}

function actualizarTotal() {
  let total = subtotalCarrito() + costoDelivery();
  if (cuponAplicado) {
    total =
      cuponAplicado.tipo === "porcentaje"
        ? total - (total * cuponAplicado.valor) / 100
        : total - cuponAplicado.valor;
    total = Math.max(0, Math.round(total));
  }
  document.getElementById("compraTotal").textContent = `$${total}`;
}

document.getElementById("compraCupon").addEventListener("blur", async (event) => {
  const codigo = event.target.value.trim().toUpperCase();
  const msg = document.getElementById("compraCuponMsg");
  cuponAplicado = null;
  if (!codigo) {
    msg.textContent = "";
    actualizarTotal();
    return;
  }
  const snap = await getDocs(collection(db, "negocios", negocioId, "cupones"));
  const encontrado = snap.docs.find((d) => d.data().codigo === codigo && d.data().activo);
  if (encontrado) {
    cuponAplicado = encontrado.data();
    msg.textContent = "Cupón aplicado ✔";
  } else {
    msg.textContent = "Ese cupón no existe o no está activo.";
  }
  actualizarTotal();
});

document.getElementById("cerrarModalCompra").addEventListener("click", () => {
  document.getElementById("modalCompra").hidden = true;
  document.getElementById("modalCarrito").hidden = false;
  renderCarrito();
});

document.getElementById("formCompra").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById("compraError");
  errorEl.textContent = "";

  try {
    const deliveryTipo = document.getElementById("compraDelivery").value;
    const total = Number(document.getElementById("compraTotal").textContent.replace("$", ""));

    const pedidoRef = await addDoc(collection(db, "pedidos"), {
      clienteUid,
      clienteNombre: clienteData?.nombre || "",
      clienteContacto: clienteData?.contacto || "",
      direccionEnvio: clienteData?.direccion || "",
      negocioId,
      negocioNombre: negocioData.nombre,
      productos: carrito.map((i) => ({ productoId: i.productoId, nombre: i.nombre, precio: i.precio, cantidad: i.cantidad })),
      deliveryTipo,
      cuponAplicado: cuponAplicado?.codigo || null,
      total,
      estado: "pendiente",
      negocioNoLeidos: 0,
      createdAt: serverTimestamp(),
    });

    const resumenTexto = carrito.map((i) => `${i.cantidad}x ${i.nombre}`).join(", ");
    await addDoc(collection(db, "pedidos", pedidoRef.id, "chat"), {
      de: "sistema",
      texto: `Nuevo pedido de ${clienteData?.nombre || "cliente"}: ${resumenTexto}. Dirección: ${clienteData?.direccion || "—"}. Contacto: ${clienteData?.contacto || "—"}.`,
      createdAt: serverTimestamp(),
    });

    carrito = [];
    guardarCarrito();

    window.location.href = `../chat.html?pedidoId=${pedidoRef.id}`;
  } catch (err) {
    console.error(err);
    errorEl.textContent = "No pudimos confirmar el pedido. Intentá de nuevo.";
  }
});

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
