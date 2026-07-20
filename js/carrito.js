import {
  auth,
  db,
  onAuthStateChanged,
  doc,
  getDoc,
  getDocs,
  collection,
  addDoc,
  serverTimestamp,
} from "./firebase-config.js";

const CARRITO_KEY = "mrp_carrito";
// Estructura: { [negocioId]: { negocioNombre, items: [{productoId,nombre,precio,fotoUrl,cantidad}] } }

let clienteUid = null;
let clienteData = null;

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

function leerCarrito() {
  try {
    return JSON.parse(localStorage.getItem(CARRITO_KEY) || "{}");
  } catch {
    return {};
  }
}

function guardarCarrito(carrito) {
  localStorage.setItem(CARRITO_KEY, JSON.stringify(carrito));
  actualizarBadge();
}

function contarItems(carrito = leerCarrito()) {
  return Object.values(carrito).reduce((acc, g) => acc + g.items.reduce((a, i) => a + i.cantidad, 0), 0);
}

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- API pública: llamada desde home.js / cliente-tienda.js ----------
export function agregarAlCarrito(negocioId, negocioNombre, item, opciones = {}) {
  if (opciones.cerrado) {
    alert("Este negocio está cerrado en este momento. Probá más tarde.");
    return;
  }
  const carrito = leerCarrito();
  if (!carrito[negocioId]) carrito[negocioId] = { negocioNombre, items: [] };
  const existente = carrito[negocioId].items.find((i) => i.productoId === item.productoId);
  if (existente) existente.cantidad += 1;
  else carrito[negocioId].items.push({ ...item, cantidad: 1 });
  guardarCarrito(carrito);
  mostrarConfirmacionAgregado(item.nombre);
}

let inicializado = false;

export function initCarrito() {
  if (inicializado) {
    actualizarBadge();
    return;
  }
  inicializado = true;
  inyectarDOM();
  actualizarBadge();
}

function mostrarConfirmacionAgregado(nombre) {
  const toast = document.createElement("div");
  toast.className = "mini-toast-carrito";
  toast.textContent = `✓ ${nombre} agregado al carrito`;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

function actualizarBadge() {
  const btn = document.getElementById("carritoGlobalFab");
  if (!btn) return;
  const total = contarItems();
  const badge = document.getElementById("carritoGlobalBadge");
  if (total === 0) {
    btn.hidden = true;
    return;
  }
  btn.hidden = false;
  badge.textContent = total > 99 ? "99+" : total;
}

// ---------- Inyección del DOM (botón flotante + modales) ----------
function inyectarDOM() {
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <button class="carrito-fab" id="carritoGlobalFab" hidden>
      🛒<span class="carrito-fab__badge" id="carritoGlobalBadge">0</span>
    </button>

    <div class="modal-backdrop" id="carritoGlobalModalCarrito" hidden>
      <div class="modal" style="max-width:520px;">
        <h2>Tu carrito</h2>
        <div id="carritoGlobalGrupos"></div>
        <p class="empty-state" id="carritoGlobalEmpty" hidden><span>Todavía no agregaste productos.</span></p>
        <button type="button" class="btn btn--outline btn--block" id="carritoGlobalCerrar" style="margin-top:14px;">Cerrar</button>
      </div>
    </div>

    <div class="modal-backdrop" id="carritoGlobalModalCheckout" hidden>
      <div class="modal">
        <h2 id="carritoGlobalCheckoutTitulo">Confirmar pedido</h2>
        <form id="carritoGlobalFormCheckout" class="form">
          <div id="carritoGlobalCheckoutResumen" style="color:var(--text-muted); font-size:14px;"></div>
          <div class="field">
            <label for="carritoGlobalDelivery">Entrega</label>
            <select id="carritoGlobalDelivery"></select>
          </div>
          <div class="field">
            <label for="carritoGlobalCupon">Cupón (opcional)</label>
            <input id="carritoGlobalCupon" placeholder="Ingresá el código si tenés uno" />
          </div>
          <p id="carritoGlobalCuponMsg" class="form-success"></p>
          <p style="font-size:15px; margin:0;">Total: <strong id="carritoGlobalTotal" style="color:var(--gold-soft);"></strong></p>
          <p id="carritoGlobalCheckoutError" class="form-error"></p>
          <div class="modal-actions">
            <button type="button" class="btn btn--outline" id="carritoGlobalVolverCarrito">Volver al carrito</button>
            <button type="submit" class="btn btn--gold">Confirmar y avisar al negocio</button>
          </div>
        </form>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  document.getElementById("carritoGlobalFab").addEventListener("click", () => {
    renderGrupos();
    document.getElementById("carritoGlobalModalCarrito").hidden = false;
  });
  document.getElementById("carritoGlobalCerrar").addEventListener("click", () => {
    document.getElementById("carritoGlobalModalCarrito").hidden = true;
  });
  document.getElementById("carritoGlobalVolverCarrito").addEventListener("click", () => {
    document.getElementById("carritoGlobalModalCheckout").hidden = true;
    document.getElementById("carritoGlobalModalCarrito").hidden = false;
    renderGrupos();
  });
  document.getElementById("carritoGlobalFormCheckout").addEventListener("submit", confirmarCheckout);
  document.getElementById("carritoGlobalCupon").addEventListener("blur", onBlurCupon);
}

function renderGrupos() {
  const wrap = document.getElementById("carritoGlobalGrupos");
  const empty = document.getElementById("carritoGlobalEmpty");
  const carrito = leerCarrito();
  const negocioIds = Object.keys(carrito);
  wrap.innerHTML = "";

  if (negocioIds.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  negocioIds.forEach((negocioId) => {
    const grupo = carrito[negocioId];
    const subtotal = grupo.items.reduce((a, i) => a + i.precio * i.cantidad, 0);

    const seccion = document.createElement("div");
    seccion.style.cssText = "margin-bottom:22px; padding-bottom:16px; border-bottom:1px solid var(--line);";
    seccion.innerHTML = `
      <p style="font-family:var(--font-display); font-size:18px; margin:0 0 8px; color:var(--gold-soft);">${escapeHtml(grupo.negocioNombre)}</p>
      <div data-items-de="${negocioId}"></div>
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
        <span style="font-size:14px;">Subtotal: <strong>$${subtotal}</strong></span>
        <button type="button" class="btn btn--gold btn--sm" data-finalizar="${negocioId}">Finalizar este pedido →</button>
      </div>
    `;
    wrap.appendChild(seccion);

    const itemsWrap = seccion.querySelector(`[data-items-de="${negocioId}"]`);
    grupo.items.forEach((item) => {
      const div = document.createElement("div");
      div.className = "carrito-item";
      div.innerHTML = `
        <img src="${item.fotoUrl || "https://placehold.co/100x100/0f1723/8b93a1?text=%20"}" alt="" />
        <div class="carrito-item__info">
          <p class="carrito-item__nombre">${escapeHtml(item.nombre)}</p>
          <p class="carrito-item__precio">$${item.precio} c/u</p>
        </div>
        <div class="carrito-item__qty">
          <button type="button" data-restar="${negocioId}|${item.productoId}">−</button>
          <span>${item.cantidad}</span>
          <button type="button" data-sumar="${negocioId}|${item.productoId}">+</button>
        </div>
        <button type="button" class="carrito-item__quitar" data-quitar="${negocioId}|${item.productoId}" aria-label="Quitar">✕</button>
      `;
      itemsWrap.appendChild(div);
    });
  });

  wrap.querySelectorAll("[data-sumar]").forEach((btn) => {
    btn.addEventListener("click", () => ajustarCantidad(btn.dataset.sumar, 1));
  });
  wrap.querySelectorAll("[data-restar]").forEach((btn) => {
    btn.addEventListener("click", () => ajustarCantidad(btn.dataset.restar, -1));
  });
  wrap.querySelectorAll("[data-quitar]").forEach((btn) => {
    btn.addEventListener("click", () => quitarItem(btn.dataset.quitar));
  });
  wrap.querySelectorAll("[data-finalizar]").forEach((btn) => {
    btn.addEventListener("click", () => iniciarCheckout(btn.dataset.finalizar));
  });
}

function ajustarCantidad(clave, delta) {
  const [negocioId, productoId] = clave.split("|");
  const carrito = leerCarrito();
  const grupo = carrito[negocioId];
  if (!grupo) return;
  const item = grupo.items.find((i) => i.productoId === productoId);
  if (!item) return;
  item.cantidad += delta;
  if (item.cantidad <= 0) grupo.items = grupo.items.filter((i) => i.productoId !== productoId);
  if (grupo.items.length === 0) delete carrito[negocioId];
  guardarCarrito(carrito);
  renderGrupos();
}

function quitarItem(clave) {
  const [negocioId, productoId] = clave.split("|");
  const carrito = leerCarrito();
  const grupo = carrito[negocioId];
  if (!grupo) return;
  grupo.items = grupo.items.filter((i) => i.productoId !== productoId);
  if (grupo.items.length === 0) delete carrito[negocioId];
  guardarCarrito(carrito);
  renderGrupos();
}

// ---------- Checkout ----------
let negocioIdEnCheckout = null;
let negocioDataEnCheckout = null;
let deliveryHSPrecioEnCheckout = 0;
let cuponEnCheckout = null;

async function iniciarCheckout(negocioId) {
  const carrito = leerCarrito();
  const grupo = carrito[negocioId];
  if (!grupo || grupo.items.length === 0) return;

  if (!clienteUid) {
    alert("Necesitás iniciar sesión como cliente para comprar. Te llevamos a la página principal para ingresar o crear tu cuenta.");
    const enSubcarpeta = window.location.pathname.includes("/cliente/") || window.location.pathname.includes("/negocio/") || window.location.pathname.includes("/admin/");
    window.location.href = enSubcarpeta ? "../index.html" : "index.html";
    return;
  }

  const negSnap = await getDoc(doc(db, "negocios", negocioId));
  if (!negSnap.exists()) return;
  negocioDataEnCheckout = negSnap.data();
  negocioIdEnCheckout = negocioId;

  if (negocioDataEnCheckout.abierto === false) {
    alert("Este negocio está cerrado en este momento. Probá más tarde.");
    return;
  }

  const hsSnap = await getDoc(doc(db, "config", "deliveryHS"));
  deliveryHSPrecioEnCheckout = hsSnap.exists() ? hsSnap.data().precio : 0;
  cuponEnCheckout = null;

  document.getElementById("carritoGlobalCheckoutTitulo").textContent = `Confirmar pedido — ${grupo.negocioNombre}`;
  document.getElementById("carritoGlobalCupon").value = "";
  document.getElementById("carritoGlobalCuponMsg").textContent = "";
  document.getElementById("carritoGlobalCheckoutError").textContent = "";

  const resumen = document.getElementById("carritoGlobalCheckoutResumen");
  resumen.innerHTML = grupo.items
    .map((i) => `<p style="margin:2px 0;">${i.cantidad} × ${escapeHtml(i.nombre)} — $${i.precio * i.cantidad}</p>`)
    .join("");

  const selectDelivery = document.getElementById("carritoGlobalDelivery");
  selectDelivery.innerHTML = "";
  selectDelivery.add(new Option("Retiro en el local", "retiro"));
  if (negocioDataEnCheckout.deliveryPropio?.activo) {
    selectDelivery.add(new Option(`Delivery propio ($${negocioDataEnCheckout.deliveryPropio.precio})`, "propio"));
  }
  if (negocioDataEnCheckout.deliveryHS?.activo) {
    selectDelivery.add(new Option(`Delivery HS ($${deliveryHSPrecioEnCheckout})`, "hs"));
  }
  selectDelivery.onchange = actualizarTotalCheckout;
  actualizarTotalCheckout();

  document.getElementById("carritoGlobalModalCarrito").hidden = true;
  document.getElementById("carritoGlobalModalCheckout").hidden = false;
}

function subtotalEnCheckout() {
  const carrito = leerCarrito();
  const grupo = carrito[negocioIdEnCheckout];
  if (!grupo) return 0;
  return grupo.items.reduce((a, i) => a + i.precio * i.cantidad, 0);
}

function costoDeliveryEnCheckout() {
  const tipo = document.getElementById("carritoGlobalDelivery").value;
  if (tipo === "propio") return negocioDataEnCheckout.deliveryPropio?.precio || 0;
  if (tipo === "hs") return deliveryHSPrecioEnCheckout;
  return 0;
}

function actualizarTotalCheckout() {
  let total = subtotalEnCheckout() + costoDeliveryEnCheckout();
  if (cuponEnCheckout) {
    total =
      cuponEnCheckout.tipo === "porcentaje"
        ? total - (total * cuponEnCheckout.valor) / 100
        : total - cuponEnCheckout.valor;
    total = Math.max(0, Math.round(total));
  }
  document.getElementById("carritoGlobalTotal").textContent = `$${total}`;
}

async function onBlurCupon(event) {
  const codigo = event.target.value.trim().toUpperCase();
  const msg = document.getElementById("carritoGlobalCuponMsg");
  cuponEnCheckout = null;
  if (!codigo) {
    msg.textContent = "";
    actualizarTotalCheckout();
    return;
  }
  const snap = await getDocs(collection(db, "negocios", negocioIdEnCheckout, "cupones"));
  const encontrado = snap.docs.find((d) => d.data().codigo === codigo && d.data().activo);
  if (encontrado) {
    cuponEnCheckout = encontrado.data();
    msg.textContent = "Cupón aplicado ✔";
  } else {
    msg.textContent = "Ese cupón no existe o no está activo.";
  }
  actualizarTotalCheckout();
}

async function confirmarCheckout(event) {
  event.preventDefault();
  const errorEl = document.getElementById("carritoGlobalCheckoutError");
  errorEl.textContent = "";

  const carrito = leerCarrito();
  const grupo = carrito[negocioIdEnCheckout];
  if (!grupo) return;

  try {
    const deliveryTipo = document.getElementById("carritoGlobalDelivery").value;
    const total = Number(document.getElementById("carritoGlobalTotal").textContent.replace("$", ""));

    const pedidoRef = await addDoc(collection(db, "pedidos"), {
      clienteUid,
      clienteNombre: clienteData?.nombre || "",
      clienteContacto: clienteData?.contacto || "",
      direccionEnvio: clienteData?.direccion || "",
      negocioId: negocioIdEnCheckout,
      negocioNombre: grupo.negocioNombre,
      productos: grupo.items.map((i) => ({ productoId: i.productoId, nombre: i.nombre, precio: i.precio, cantidad: i.cantidad })),
      deliveryTipo,
      cuponAplicado: cuponEnCheckout?.codigo || null,
      total,
      estado: "pendiente",
      negocioNoLeidos: 0,
      createdAt: serverTimestamp(),
    });

    const resumenTexto = grupo.items.map((i) => `${i.cantidad}x ${i.nombre}`).join(", ");
    await addDoc(collection(db, "pedidos", pedidoRef.id, "chat"), {
      de: "sistema",
      texto: `Nuevo pedido de ${clienteData?.nombre || "cliente"}: ${resumenTexto}. Dirección: ${clienteData?.direccion || "—"}. Contacto: ${clienteData?.contacto || "—"}.`,
      createdAt: serverTimestamp(),
    });

    delete carrito[negocioIdEnCheckout];
    guardarCarrito(carrito);

    const enSubcarpeta = window.location.pathname.includes("/cliente/") || window.location.pathname.includes("/negocio/") || window.location.pathname.includes("/admin/");
    window.location.href = `${enSubcarpeta ? "../" : ""}chat.html?pedidoId=${pedidoRef.id}`;
  } catch (err) {
    console.error(err);
    errorEl.textContent = "No pudimos confirmar el pedido. Intentá de nuevo.";
  }
}
