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
let productoActual = null;

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
  document.getElementById("tiendaCategoria").textContent = negocioData.categoria || "";

  const slidesWrap = document.getElementById("tiendaSlides");
  (negocioData.slides || []).forEach((url) => {
    const img = document.createElement("img");
    img.src = url;
    slidesWrap.appendChild(img);
  });

  const hsSnap = await getDoc(doc(db, "config", "deliveryHS"));
  deliveryHSPrecio = hsSnap.exists() ? hsSnap.data().precio : 0;

  const grid = document.getElementById("tiendaGrid");
  const prodSnap = await getDocs(collection(db, "negocios", negocioId, "productos"));
  prodSnap.forEach((docSnap) => {
    const p = docSnap.data();
    const card = document.createElement("div");
    card.className = "prod-card";
    const precioMostrar = p.promocion?.activo && p.promocionAprobada ? p.promocion.precioPromo : p.precio;
    card.innerHTML = `
      <img src="${p.fotoUrl || "https://placehold.co/400x300/0f1723/8b93a1?text=Sin+foto"}" alt="${escapeHtml(p.nombre)}" />
      <div class="prod-card__body">
        <p class="prod-card__nombre">${escapeHtml(p.nombre)}</p>
        <p class="prod-card__precio">$${precioMostrar}</p>
        <button class="btn btn--gold btn--sm btn--block" style="margin-top:10px;" data-comprar="${docSnap.id}">Comprar</button>
      </div>
    `;
    grid.appendChild(card);

    card.querySelector("[data-comprar]").addEventListener("click", () => abrirModalCompra(docSnap.id, p, precioMostrar));
  });

  if (productoDestacadoId) {
    const el = grid.querySelector(`[data-comprar="${productoDestacadoId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function abrirModalCompra(productoId, producto, precio) {
  if (!clienteUid) {
    alert("Necesitás iniciar sesión como cliente para comprar. Te llevamos a la página principal para ingresar o crear tu cuenta.");
    window.location.href = "../index.html";
    return;
  }
  productoActual = { id: productoId, ...producto, precioFinal: precio };
  document.getElementById("compraProductoNombre").textContent = producto.nombre;
  document.getElementById("compraPrecioBase").textContent = `$${precio}`;
  document.getElementById("compraCupon").value = "";
  document.getElementById("compraCuponMsg").textContent = "";
  document.getElementById("compraError").textContent = "";

  const selectDelivery = document.getElementById("compraDelivery");
  selectDelivery.innerHTML = "";
  const opRetiro = new Option("Retiro en el local", "retiro");
  selectDelivery.add(opRetiro);
  if (negocioData.deliveryPropio?.activo) {
    selectDelivery.add(new Option(`Delivery propio ($${negocioData.deliveryPropio.precio})`, "propio"));
  }
  if (negocioData.deliveryHS?.activo) {
    selectDelivery.add(new Option(`Delivery HS ($${deliveryHSPrecio})`, "hs"));
  }
  selectDelivery.addEventListener("change", actualizarTotal);
  actualizarTotal();

  document.getElementById("modalCompra").hidden = false;
}

function costoDelivery() {
  const tipo = document.getElementById("compraDelivery").value;
  if (tipo === "propio") return negocioData.deliveryPropio?.precio || 0;
  if (tipo === "hs") return deliveryHSPrecio;
  return 0;
}

let cuponAplicado = null;

function actualizarTotal() {
  let total = productoActual.precioFinal + costoDelivery();
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
      productos: [{ productoId: productoActual.id, nombre: productoActual.nombre, precio: productoActual.precioFinal, cantidad: 1 }],
      deliveryTipo,
      cuponAplicado: cuponAplicado?.codigo || null,
      total,
      estado: "pendiente",
      createdAt: serverTimestamp(),
    });

    await addDoc(collection(db, "pedidos", pedidoRef.id, "chat"), {
      de: "sistema",
      texto: `Nuevo pedido de ${clienteData?.nombre || "cliente"}. Dirección: ${clienteData?.direccion || "—"}. Contacto: ${clienteData?.contacto || "—"}.`,
      createdAt: serverTimestamp(),
    });

    window.location.href = `../chat.html?pedidoId=${pedidoRef.id}`;
  } catch (err) {
    console.error(err);
    errorEl.textContent = "No pudimos confirmar el pedido. Intentá de nuevo.";
  }
});

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
