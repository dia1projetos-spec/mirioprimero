import {
  auth,
  db,
  signOut,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "./firebase-config.js";
import { requireRole } from "./auth-guard.js";
import { uploadImage } from "./cloudinary.js";

let negocioId = null;
let negocioData = null;

requireRole("negocio", "../login-negocio.html").then((info) => {
  negocioId = info.uid;
  init();
});

async function init() {
  const snap = await getDoc(doc(db, "negocios", negocioId));
  negocioData = snap.data();
  document.getElementById("nombreNegocioHeader").textContent = negocioData?.nombre || "Productos";
  mostrarEstadoTienda();

  // Cada carga es independiente: si una falla (por ejemplo por permisos),
  // las demás igual se ejecutan en vez de quedar todo el panel colgado.
  await Promise.allSettled([
    cargarCategoriasProducto(),
    cargarProductos(),
    Promise.resolve(cargarDeliveryForm()),
    Promise.resolve(mostrarLogoPreview()),
    Promise.resolve(escucharPedidos()),
  ]).then((resultados) => {
    resultados.forEach((r) => {
      if (r.status === "rejected") console.error("Error cargando el panel:", r.reason);
    });
  });
}

// ---------- Abierta / Cerrada ----------
function mostrarEstadoTienda() {
  const btn = document.getElementById("btnEstadoTienda");
  const texto = document.getElementById("tiendaEstadoTexto");
  const cerrada = negocioData?.abierto === false;
  btn.classList.toggle("is-cerrada", cerrada);
  texto.textContent = cerrada ? "Cerrada" : "Abierta";
}

document.getElementById("btnEstadoTienda").addEventListener("click", async () => {
  const nuevoEstado = negocioData?.abierto === false; // si estaba cerrada, pasa a abierta
  await updateDoc(doc(db, "negocios", negocioId), { abierto: nuevoEstado });
  negocioData.abierto = nuevoEstado;
  mostrarEstadoTienda();
});

// ---------- Navegación ----------
document.querySelectorAll("[data-tab]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("[data-tab]").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    document.querySelectorAll(".tab-section").forEach((s) => (s.hidden = s.id !== `tab-${btn.dataset.tab}`));
    if (btn.dataset.tab === "slides") { cargarSlides(); mostrarLogoPreview(); }
    if (btn.dataset.tab === "cupones") cargarCupones();
    if (btn.dataset.tab === "categorias-producto") cargarCategoriasProducto();
  });
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "../login-negocio.html";
});

// ---------- PRODUCTOS ----------
const modalProducto = document.getElementById("modalProducto");
const formProducto = document.getElementById("formProducto");

document.getElementById("btnNuevoProducto").addEventListener("click", () => {
  formProducto.reset();
  document.getElementById("productoId").value = "";
  document.getElementById("modalProductoTitulo").textContent = "Nuevo producto";
  document.getElementById("productoError").textContent = "";
  modalProducto.hidden = false;
});
document.getElementById("cerrarModalProducto").addEventListener("click", () => (modalProducto.hidden = true));

formProducto.addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById("productoError");
  errorEl.textContent = "";

  const id = document.getElementById("productoId").value;
  const nombre = document.getElementById("prodNombre").value.trim();
  const precio = Number(document.getElementById("prodPrecio").value);
  const categoriaProducto = document.getElementById("prodCategoria").value || null;
  const fotoFile = document.getElementById("prodFoto").files[0];
  const stockActivo = document.getElementById("prodStockActivo").checked;
  const stockCantidad = Number(document.getElementById("prodStockCantidad").value) || 0;
  const promoActivo = document.getElementById("prodPromoActivo").checked;
  const precioPromo = Number(document.getElementById("prodPrecioPromo").value) || null;

  try {
    let fotoUrl = null;
    if (fotoFile) fotoUrl = await uploadImage(fotoFile, `negocios/${negocioId}/productos`);

    const productosRef = collection(db, "negocios", negocioId, "productos");
    const data = {
      nombre,
      precio,
      categoriaProducto,
      stock: { activo: stockActivo, cantidad: stockCantidad },
      promocion: { activo: promoActivo, precioPromo },
      updatedAt: serverTimestamp(),
    };
    if (fotoUrl) data.fotoUrl = fotoUrl;

    let productoId = id;
    if (id) {
      await updateDoc(doc(productosRef, id), data);
    } else {
      data.destacado = false;
      data.promocionAprobada = false;
      data.createdAt = serverTimestamp();
      const nuevo = await addDoc(productosRef, data);
      productoId = nuevo.id;
    }

    if (promoActivo) {
      await addDoc(collection(db, "promocionesPendientes"), {
        negocioId,
        negocioNombre: negocioData?.nombre || "",
        productoId,
        productoNombre: nombre,
        estado: "pendiente",
        createdAt: serverTimestamp(),
      });
    }

    modalProducto.hidden = true;
    cargarProductos();
  } catch (err) {
    console.error(err);
    errorEl.textContent = "No pudimos guardar el producto. Intentá de nuevo.";
  }
});

async function cargarProductos() {
  const tbody = document.getElementById("tablaProductos");
  const empty = document.getElementById("productosEmpty");
  tbody.innerHTML = "";

  let snap;
  try {
    snap = await getDocs(collection(db, "negocios", negocioId, "productos"));
  } catch (err) {
    console.error(err);
    empty.hidden = false;
    empty.querySelector("span").textContent = "No pudimos cargar tus productos. Revisá la consola (F12).";
    return;
  }

  if (snap.empty) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  let destacadosCount = 0;
  snap.forEach((d) => {
    if (d.data().destacado) destacadosCount++;
  });

  snap.forEach((docSnap) => {
    try {
      const p = docSnap.data();
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${p.fotoUrl ? `<img src="${p.fotoUrl}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;" />` : "—"}</td>
        <td>${escapeHtml(p.nombre)}</td>
        <td>$${p.precio}</td>
        <td>${p.categoriaProducto ? escapeHtml(p.categoriaProducto) : "—"}</td>
        <td>${p.stock?.activo ? p.stock.cantidad : "Sin control"}</td>
        <td><input type="checkbox" data-destacar="${docSnap.id}" ${p.destacado ? "checked" : ""} /></td>
        <td>${p.promocion?.activo ? (p.promocionAprobada ? "Promo ✅" : "Promo (pendiente)") : "—"}</td>
        <td>
          <button class="btn btn--outline btn--sm" data-editar="${docSnap.id}">Editar</button>
          <button class="btn btn--outline btn--sm" data-eliminar="${docSnap.id}">Eliminar</button>
        </td>
      `;
      tbody.appendChild(tr);
    } catch (err) {
      console.error(`No se pudo mostrar el producto ${docSnap.id}:`, err);
    }
  });

  tbody.querySelectorAll("[data-destacar]").forEach((chk) => {
    chk.addEventListener("change", async () => {
      if (chk.checked && destacadosCount >= 3) {
        alert("Solo podés destacar 3 productos por vez. Desmarcá uno primero.");
        chk.checked = false;
        return;
      }
      await updateDoc(doc(db, "negocios", negocioId, "productos", chk.dataset.destacar), {
        destacado: chk.checked,
      });
      cargarProductos();
    });
  });

  tbody.querySelectorAll("[data-editar]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const snapProd = await getDoc(doc(db, "negocios", negocioId, "productos", btn.dataset.editar));
      const p = snapProd.data();
      document.getElementById("productoId").value = btn.dataset.editar;
      document.getElementById("prodNombre").value = p.nombre;
      document.getElementById("prodPrecio").value = p.precio;
      document.getElementById("prodCategoria").value = p.categoriaProducto || "";
      document.getElementById("prodStockActivo").checked = !!p.stock?.activo;
      document.getElementById("prodStockCantidad").value = p.stock?.cantidad || 0;
      document.getElementById("prodPromoActivo").checked = !!p.promocion?.activo;
      document.getElementById("prodPrecioPromo").value = p.promocion?.precioPromo || "";
      document.getElementById("modalProductoTitulo").textContent = "Editar producto";
      modalProducto.hidden = false;
    });
  });

  tbody.querySelectorAll("[data-eliminar]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este producto?")) return;
      await deleteDoc(doc(db, "negocios", negocioId, "productos", btn.dataset.eliminar));
      cargarProductos();
    });
  });
}

// ---------- CATEGORÍAS DE PRODUCTO (propias de la tienda) ----------
async function cargarCategoriasProducto() {
  const select = document.getElementById("prodCategoria");
  const tbody = document.getElementById("tablaCategoriasProducto");
  select.innerHTML = `<option value="">Sin categoría</option>`;
  if (tbody) tbody.innerHTML = "";

  let snap;
  try {
    snap = await getDocs(collection(db, "negocios", negocioId, "categoriasProducto"));
  } catch (err) {
    console.error(err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="2" style="color:var(--danger);">No pudimos cargar las categorías. Revisá la consola (F12) — puede ser que falten publicar las reglas de Firestore.</td></tr>`;
    }
    return;
  }

  snap.forEach((docSnap) => {
    const c = docSnap.data();
    const opt = document.createElement("option");
    opt.value = c.nombre;
    opt.textContent = c.nombre;
    select.appendChild(opt);

    if (tbody) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${escapeHtml(c.nombre)}</td><td><button class="btn btn--outline btn--sm" data-eliminar-cat-producto="${docSnap.id}">Eliminar</button></td>`;
      tbody.appendChild(tr);
    }
  });

  if (tbody) {
    tbody.querySelectorAll("[data-eliminar-cat-producto]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await deleteDoc(doc(db, "negocios", negocioId, "categoriasProducto", btn.dataset.eliminarCatProducto));
        cargarCategoriasProducto();
      });
    });
  }
}

document.getElementById("formCategoriaProducto").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.getElementById("nombreCategoriaProducto");
  const nombre = input.value.trim();
  if (!nombre) return;
  try {
    await addDoc(collection(db, "negocios", negocioId, "categoriasProducto"), {
      nombre,
      createdAt: serverTimestamp(),
    });
    input.value = "";
    cargarCategoriasProducto();
  } catch (err) {
    console.error(err);
    alert("No pudimos crear la categoría. Puede que falte publicar una actualización de las reglas de Firestore — revisá la consola (F12).");
  }
});

// ---------- LOGO ----------
function mostrarLogoPreview() {
  const img = document.getElementById("logoPreview");
  if (negocioData?.logoUrl) {
    img.src = negocioData.logoUrl;
    img.style.display = "block";
  } else {
    img.style.display = "none";
  }
}

document.getElementById("formLogo").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById("logoError");
  errorEl.textContent = "";
  const file = document.getElementById("logoFile").files[0];
  if (!file) return;
  try {
    const url = await uploadImage(file, `negocios/${negocioId}/logo`);
    await updateDoc(doc(db, "negocios", negocioId), { logoUrl: url });
    negocioData.logoUrl = url;
    document.getElementById("formLogo").reset();
    mostrarLogoPreview();
  } catch (err) {
    console.error(err);
    errorEl.textContent = "No pudimos subir el logo.";
  }
});

// ---------- SLIDES ----------
document.getElementById("formSlide").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById("slideError");
  errorEl.textContent = "";
  const file = document.getElementById("slideFile").files[0];
  if (!file) return;
  try {
    const url = await uploadImage(file, `negocios/${negocioId}/slides`);
    const slides = negocioData?.slides || [];
    slides.push(url);
    await updateDoc(doc(db, "negocios", negocioId), { slides });
    negocioData.slides = slides;
    document.getElementById("formSlide").reset();
    cargarSlides();
  } catch (err) {
    console.error(err);
    errorEl.textContent = "No pudimos subir la imagen.";
  }
});

function cargarSlides() {
  const wrap = document.getElementById("listaSlides");
  wrap.innerHTML = "";
  (negocioData?.slides || []).forEach((url, index) => {
    const div = document.createElement("div");
    div.style.cssText = "position:relative;";
    div.innerHTML = `
      <img src="${url}" style="width:160px;height:110px;object-fit:cover;border-radius:12px;" />
      <button data-quitar-slide="${index}" class="btn btn--danger btn--sm" style="position:absolute;top:6px;right:6px;padding:4px 8px;">✕</button>
    `;
    wrap.appendChild(div);
  });

  wrap.querySelectorAll("[data-quitar-slide]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const slides = [...(negocioData.slides || [])];
      slides.splice(Number(btn.dataset.quitarSlide), 1);
      await updateDoc(doc(db, "negocios", negocioId), { slides });
      negocioData.slides = slides;
      cargarSlides();
    });
  });
}

// ---------- CUPONES ----------
const modalCupon = document.getElementById("modalCupon");
document.getElementById("btnNuevoCupon").addEventListener("click", () => {
  document.getElementById("formCupon").reset();
  document.getElementById("cuponError").textContent = "";
  modalCupon.hidden = false;
});
document.getElementById("cerrarModalCupon").addEventListener("click", () => (modalCupon.hidden = true));

document.getElementById("formCupon").addEventListener("submit", async (event) => {
  event.preventDefault();
  const codigo = document.getElementById("cuponCodigo").value.trim().toUpperCase();
  const tipo = document.getElementById("cuponTipo").value;
  const valor = Number(document.getElementById("cuponValor").value);
  try {
    await addDoc(collection(db, "negocios", negocioId, "cupones"), {
      codigo,
      tipo,
      valor,
      activo: true,
      createdAt: serverTimestamp(),
    });
    modalCupon.hidden = true;
    cargarCupones();
  } catch (err) {
    console.error(err);
    document.getElementById("cuponError").textContent = "No pudimos crear el cupón.";
  }
});

async function cargarCupones() {
  const tbody = document.getElementById("tablaCupones");
  tbody.innerHTML = "";
  const snap = await getDocs(collection(db, "negocios", negocioId, "cupones"));
  snap.forEach((docSnap) => {
    const c = docSnap.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(c.codigo)}</td>
      <td>${c.tipo === "porcentaje" ? "Porcentaje" : "Monto fijo"}</td>
      <td>${c.tipo === "porcentaje" ? c.valor + "%" : "$" + c.valor}</td>
      <td><input type="checkbox" data-activo-cupon="${docSnap.id}" ${c.activo ? "checked" : ""} /></td>
      <td><button class="btn btn--outline btn--sm" data-eliminar-cupon="${docSnap.id}">Eliminar</button></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-activo-cupon]").forEach((chk) => {
    chk.addEventListener("change", async () => {
      await updateDoc(doc(db, "negocios", negocioId, "cupones", chk.dataset.activoCupon), { activo: chk.checked });
    });
  });
  tbody.querySelectorAll("[data-eliminar-cupon]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await deleteDoc(doc(db, "negocios", negocioId, "cupones", btn.dataset.eliminarCupon));
      cargarCupones();
    });
  });
}

// ---------- PEDIDOS ----------
let negocioPedidosNoLeidosAnterior = new Map();
let negocioPedidosPrimerCarga = true;

if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission();
}

function mostrarToastNuevoMensaje(p, pedidoId) {
  const toast = document.createElement("div");
  toast.className = "toast-nuevo-pedido";
  toast.innerHTML = `
    <strong>💬 Nuevo mensaje</strong>
    <p>${escapeHtml(p.clienteNombre || "Cliente")} te escribió</p>
    <a href="../chat.html?pedidoId=${pedidoId}">Ver conversación →</a>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 9000);

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification("Nuevo mensaje en Mi Río Primero", {
        body: `${p.clienteNombre || "Cliente"} te escribió`,
      });
    } catch (err) {
      console.warn("No se pudo mostrar la notificación del navegador:", err);
    }
  }
}

function escucharPedidos() {
  const q = query(collection(db, "pedidos"), where("negocioId", "==", negocioId));
  onSnapshot(q, (snap) => {
    const wrap = document.getElementById("listaPedidos");
    const empty = document.getElementById("pedidosEmpty");

    if (!negocioPedidosPrimerCarga) {
      snap.docs.forEach((docSnap) => {
        const p = docSnap.data();
        const anterior = negocioPedidosNoLeidosAnterior.get(docSnap.id) || 0;
        if ((p.negocioNoLeidos || 0) > anterior) {
          mostrarToastNuevoMensaje(p, docSnap.id);
        }
      });
    }
    snap.docs.forEach((docSnap) => {
      negocioPedidosNoLeidosAnterior.set(docSnap.id, docSnap.data().negocioNoLeidos || 0);
    });
    negocioPedidosPrimerCarga = false;

    wrap.innerHTML = "";
    const pedidosDelNegocio = snap.docs;
    if (pedidosDelNegocio.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    pedidosDelNegocio
      .sort((a, b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0))
      .forEach((docSnap) => {
        const p = docSnap.data();
        const noLeidos = p.negocioNoLeidos || 0;
        const div = document.createElement("div");
        div.style.cssText = "padding:16px 0; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap;";
        div.innerHTML = `
          <div>
            <strong>${escapeHtml(p.clienteNombre || "Cliente")}</strong>
            <span class="badge badge--${p.estado}">${p.estado}</span>
            <p style="color:var(--text-muted); font-size:13px; margin:4px 0;">${escapeHtml(p.direccionEnvio || "")}</p>
            <p style="font-size:14px; margin:0;">Total: $${p.total ?? "—"}</p>
          </div>
          <div class="top-actions">
            <a class="btn btn--outline btn--sm" href="../chat.html?pedidoId=${docSnap.id}" style="position:relative;">
              Abrir chat
              ${noLeidos > 0 ? `<span class="chat-no-leidos-badge">${noLeidos > 9 ? "9+" : noLeidos}</span>` : ""}
            </a>
            ${p.estado === "pendiente" ? `<button class="btn btn--gold btn--sm" data-aceptar="${docSnap.id}">Aceptar</button>` : ""}
            ${p.estado === "en_proceso" ? `<button class="btn btn--gold btn--sm" data-completar="${docSnap.id}">Finalizar venta</button>` : ""}
            ${p.estado !== "completado" && p.estado !== "cancelado" ? `<button class="btn btn--danger btn--sm" data-cancelar="${docSnap.id}">Cancelar</button>` : ""}
          </div>
        `;
        wrap.appendChild(div);
      });

    wrap.querySelectorAll("[data-aceptar]").forEach((btn) => {
      btn.addEventListener("click", () => updateDoc(doc(db, "pedidos", btn.dataset.aceptar), { estado: "en_proceso" }));
    });
    wrap.querySelectorAll("[data-completar]").forEach((btn) => {
      btn.addEventListener("click", () => updateDoc(doc(db, "pedidos", btn.dataset.completar), { estado: "completado" }));
    });
    wrap.querySelectorAll("[data-cancelar]").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById("cancelarPedidoId").value = btn.dataset.cancelar;
        document.getElementById("modalCancelar").hidden = false;
      });
    });
  });
}

document.getElementById("cerrarModalCancelar").addEventListener("click", () => {
  document.getElementById("modalCancelar").hidden = true;
});
document.getElementById("formCancelar").addEventListener("submit", async (event) => {
  event.preventDefault();
  const pedidoId = document.getElementById("cancelarPedidoId").value;
  const motivo = document.getElementById("motivoCancelacion").value.trim();
  await updateDoc(doc(db, "pedidos", pedidoId), { estado: "cancelado", motivoCancelacion: motivo });
  await addDoc(collection(db, "cancelacionesAdmin"), {
    pedidoId,
    negocioId,
    motivo,
    createdAt: serverTimestamp(),
  });
  document.getElementById("modalCancelar").hidden = true;
  document.getElementById("formCancelar").reset();
});

// ---------- DELIVERY ----------
function cargarDeliveryForm() {
  document.getElementById("deliveryPropioActivo").checked = !!negocioData?.deliveryPropio?.activo;
  document.getElementById("deliveryPropioPrecio").value = negocioData?.deliveryPropio?.precio || 0;
  document.getElementById("deliveryHSActivo").checked = !!negocioData?.deliveryHS?.activo;
}

document.getElementById("formDelivery").addEventListener("submit", async (event) => {
  event.preventDefault();
  const deliveryPropio = {
    activo: document.getElementById("deliveryPropioActivo").checked,
    precio: Number(document.getElementById("deliveryPropioPrecio").value) || 0,
  };
  const deliveryHS = { activo: document.getElementById("deliveryHSActivo").checked };
  await updateDoc(doc(db, "negocios", negocioId), { deliveryPropio, deliveryHS });
  negocioData.deliveryPropio = deliveryPropio;
  negocioData.deliveryHS = deliveryHS;
  const msg = document.getElementById("deliveryMsg");
  msg.textContent = "Guardado.";
  setTimeout(() => (msg.textContent = ""), 2000);
});

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
