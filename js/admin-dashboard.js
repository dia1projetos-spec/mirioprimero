import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signOut as signOutSecondary,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  app,
  auth,
  db,
  signOut,
  collection,
  collectionGroup,
  doc,
  getDocs,
  getDoc,
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

requireRole("admin", "login.html");

// ---------- Navegación entre pestañas ----------
const tabButtons = document.querySelectorAll("[data-tab]");
const sections = document.querySelectorAll(".tab-section");

tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    tabButtons.forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");
    sections.forEach((s) => (s.hidden = s.id !== `tab-${btn.dataset.tab}`));
    if (btn.dataset.tab === "clientes") cargarClientes();
    if (btn.dataset.tab === "feed") cargarFeedVideos();
    if (btn.dataset.tab === "promociones") cargarPromociones();
    if (btn.dataset.tab === "delivery") cargarDeliveryHS();
    if (btn.dataset.tab === "productos") cargarProductosParaCategorizar();
    if (btn.dataset.tab === "prioridad") cargarPrioridad();
    if (btn.dataset.tab === "header") cargarHeaderSlides();
    if (btn.dataset.tab === "notificaciones") cargarNotificaciones();
  });
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "login.html";
});

// ---------- NEGOCIOS ----------
const modalNegocio = document.getElementById("modalNegocio");
const formNegocio = document.getElementById("formNegocio");
const negocioError = document.getElementById("negocioError");
const selectCategoriaNegocio = document.getElementById("negCategoria");

document.getElementById("btnNuevoNegocio").addEventListener("click", () => {
  negocioError.textContent = "";
  formNegocio.reset();
  document.getElementById("negocioIdEdit").value = "";
  document.getElementById("modalNegocioTitulo").textContent = "Cadastrar negocio";
  document.getElementById("submitNegocioBtn").textContent = "Cadastrar";
  document.getElementById("campoNegEmail").hidden = false;
  document.getElementById("campoNegPassword").hidden = false;
  document.getElementById("negEmail").required = true;
  document.getElementById("negPassword").required = true;
  document.getElementById("notaEdicionEmail").hidden = true;
  modalNegocio.hidden = false;
});
document.getElementById("cerrarModalNegocio").addEventListener("click", () => {
  modalNegocio.hidden = true;
});

formNegocio.addEventListener("submit", async (event) => {
  event.preventDefault();
  negocioError.textContent = "";
  const idEdit = document.getElementById("negocioIdEdit").value;
  const nombre = document.getElementById("negNombre").value.trim();
  const categoria = selectCategoriaNegocio.value;

  // ---------- Modo edición: solo nombre y categoría ----------
  if (idEdit) {
    try {
      await updateDoc(doc(db, "negocios", idEdit), { nombre, categoria });
      modalNegocio.hidden = true;
      cargarNegocios();
    } catch (err) {
      console.error(err);
      negocioError.textContent = "No pudimos guardar los cambios.";
    }
    return;
  }

  // ---------- Modo creación: crea también el login ----------
  const email = document.getElementById("negEmail").value.trim();
  const password = document.getElementById("negPassword").value;

  try {
    // Usamos una segunda instancia de Firebase Auth para crear el usuario
    // del negocio SIN cerrar la sesión del administrador actual.
    const secondaryApp = initializeApp(app.options, "secondary-" + Date.now());
    const secondaryAuth = getAuth(secondaryApp);
    const credential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = credential.user.uid;
    await signOutSecondary(secondaryAuth);

    await setDoc(doc(db, "users", uid), {
      role: "negocio",
      email,
      createdAt: serverTimestamp(),
    });

    await setDoc(doc(db, "negocios", uid), {
      nombre,
      categoria,
      email,
      slides: [],
      deliveryPropio: { activo: false, precio: 0 },
      deliveryHS: { activo: false },
      createdAt: serverTimestamp(),
    });

    modalNegocio.hidden = true;
    cargarNegocios();
  } catch (err) {
    console.error(err);
    negocioError.textContent = "No pudimos crear el negocio (revisá el email o intentá de nuevo).";
  }
});

async function cargarNegocios() {
  const tbody = document.getElementById("tablaNegocios");
  const empty = document.getElementById("negociosEmpty");
  tbody.innerHTML = "";
  const snap = await getDocs(collection(db, "negocios"));
  if (snap.empty) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  snap.forEach((docSnap) => {
    const n = docSnap.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(n.nombre)}</td>
      <td>${escapeHtml(n.categoria || "—")}</td>
      <td>${escapeHtml(n.email)}</td>
      <td><a href="../cliente/tienda.html?id=${docSnap.id}" target="_blank" style="color:var(--gold-soft);">Ver tienda ↗</a></td>
      <td>
        <button class="btn btn--outline btn--sm" data-editar-negocio="${docSnap.id}">Editar</button>
        <button class="btn btn--outline btn--sm" data-eliminar-negocio="${docSnap.id}">Eliminar</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-editar-negocio]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const snapNeg = await getDoc(doc(db, "negocios", btn.dataset.editarNegocio));
      const n = snapNeg.data();
      negocioError.textContent = "";
      document.getElementById("negocioIdEdit").value = btn.dataset.editarNegocio;
      document.getElementById("negNombre").value = n.nombre || "";
      document.getElementById("negCategoria").value = n.categoria || "";
      document.getElementById("modalNegocioTitulo").textContent = `Editar: ${n.nombre}`;
      document.getElementById("submitNegocioBtn").textContent = "Guardar cambios";
      document.getElementById("campoNegEmail").hidden = true;
      document.getElementById("campoNegPassword").hidden = true;
      document.getElementById("negEmail").required = false;
      document.getElementById("negPassword").required = false;
      document.getElementById("notaEdicionEmail").hidden = false;
      modalNegocio.hidden = false;
    });
  });

  tbody.querySelectorAll("[data-eliminar-negocio]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este negocio? Esta acción no se puede deshacer.")) return;
      await deleteDoc(doc(db, "negocios", btn.dataset.eliminarNegocio));
      cargarNegocios();
    });
  });
}

// ---------- CATEGORIAS ----------
const formCategoria = document.getElementById("formCategoria");
formCategoria.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.getElementById("nombreCategoria");
  const nombre = input.value.trim();
  if (!nombre) return;
  await addDoc(collection(db, "categorias"), { nombre, createdAt: serverTimestamp() });
  input.value = "";
  cargarCategorias();
});

async function cargarCategorias() {
  const tbody = document.getElementById("tablaCategorias");
  tbody.innerHTML = "";
  selectCategoriaNegocio.innerHTML = "";
  const snap = await getDocs(collection(db, "categorias"));
  snap.forEach((docSnap) => {
    const c = docSnap.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${escapeHtml(c.nombre)}</td><td><button class="btn btn--outline btn--sm" data-eliminar-categoria="${docSnap.id}">Eliminar</button></td>`;
    tbody.appendChild(tr);

    const opt = document.createElement("option");
    opt.value = c.nombre;
    opt.textContent = c.nombre;
    selectCategoriaNegocio.appendChild(opt);
  });

  tbody.querySelectorAll("[data-eliminar-categoria]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await deleteDoc(doc(db, "categorias", btn.dataset.eliminarCategoria));
      cargarCategorias();
    });
  });
}

// ---------- CLIENTES ----------
async function cargarClientes() {
  const tbody = document.getElementById("tablaClientes");
  tbody.innerHTML = "";
  const snap = await getDocs(collection(db, "clientes"));
  snap.forEach((docSnap) => {
    const c = docSnap.data();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(c.nombre)}</td>
      <td>${escapeHtml(c.contacto)}</td>
      <td>${escapeHtml(c.direccion)}</td>
      <td><a href="#" data-ver-historial="${docSnap.id}" style="color:var(--gold-soft);">Ver historial</a></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-ver-historial]").forEach((link) => {
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      const pedidosSnap = await getDocs(
        query(collection(db, "pedidos"), where("clienteUid", "==", link.dataset.verHistorial))
      );
      const total = pedidosSnap.size;
      alert(total === 0 ? "Este cliente todavía no hizo pedidos." : `Este cliente hizo ${total} pedido(s).`);
    });
  });
}

// ---------- FEED VIDEOS ----------
const formFeedVideo = document.getElementById("formFeedVideo");
formFeedVideo.addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById("feedError");
  errorEl.textContent = "";
  const file = document.getElementById("feedVideo").files[0];
  const caption = document.getElementById("feedCaption").value.trim();
  if (!file) return;

  try {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", "mirioprimero.vercel.app");
    formData.append("folder", "mirioprimero/feed-admin");
    const res = await fetch("https://api.cloudinary.com/v1_1/v3tbrupw/video/upload", {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();

    await addDoc(collection(db, "feedAdmin"), {
      tipo: "video",
      url: data.secure_url,
      caption,
      createdAt: serverTimestamp(),
    });

    formFeedVideo.reset();
    cargarFeedVideos();
  } catch (err) {
    console.error(err);
    errorEl.textContent = "No pudimos subir el video. Intentá de nuevo.";
  }
});

async function cargarFeedVideos() {
  const wrap = document.getElementById("listaFeedVideos");
  wrap.innerHTML = "";
  const snap = await getDocs(query(collection(db, "feedAdmin"), orderBy("createdAt", "desc")));
  snap.forEach((docSnap) => {
    const v = docSnap.data();
    const div = document.createElement("div");
    div.style.cssText = "padding:12px 0; border-bottom:1px solid var(--line);";
    div.innerHTML = `
      <video src="${v.url}" controls style="max-width:220px; border-radius:12px; display:block; margin-bottom:8px;"></video>
      <input type="text" data-caption="${docSnap.id}" value="${escapeHtml(v.caption || "")}" style="width:100%; max-width:320px; background:var(--panel); color:var(--text); border:1px solid var(--line); border-radius:8px; padding:8px 10px; margin-bottom:8px;" />
      <div class="top-actions">
        <button class="btn btn--gold btn--sm" data-guardar-caption="${docSnap.id}">Guardar texto</button>
        <button class="btn btn--danger btn--sm" data-eliminar-video="${docSnap.id}">Eliminar</button>
      </div>
    `;
    wrap.appendChild(div);
  });

  wrap.querySelectorAll("[data-guardar-caption]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const input = wrap.querySelector(`[data-caption="${btn.dataset.guardarCaption}"]`);
      await updateDoc(doc(db, "feedAdmin", btn.dataset.guardarCaption), { caption: input.value.trim() });
      btn.textContent = "Guardado ✔";
      setTimeout(() => (btn.textContent = "Guardar texto"), 1500);
    });
  });

  wrap.querySelectorAll("[data-eliminar-video]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar esta publicación del feed?")) return;
      await deleteDoc(doc(db, "feedAdmin", btn.dataset.eliminarVideo));
      cargarFeedVideos();
    });
  });
}

// ---------- PROMOCIONES PENDIENTES ----------
async function cargarPromociones() {
  const wrap = document.getElementById("listaPromociones");
  const empty = document.getElementById("promocionesEmpty");
  wrap.innerHTML = "";
  const snap = await getDocs(query(collection(db, "promocionesPendientes"), where("estado", "==", "pendiente")));
  if (snap.empty) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  snap.forEach((docSnap) => {
    const p = docSnap.data();
    const div = document.createElement("div");
    div.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:14px 0; border-bottom:1px solid var(--line);";
    div.innerHTML = `
      <div>
        <strong>${escapeHtml(p.productoNombre || "Producto")}</strong>
        <p style="color:var(--text-muted); font-size:13px; margin:2px 0 0;">Negocio: ${escapeHtml(p.negocioNombre || p.negocioId)}</p>
      </div>
      <div class="top-actions">
        <button class="btn btn--gold btn--sm" data-aprobar="${docSnap.id}">Aprobar</button>
        <button class="btn btn--outline btn--sm" data-rechazar="${docSnap.id}">Rechazar</button>
      </div>
    `;
    wrap.appendChild(div);
  });

  wrap.querySelectorAll("[data-aprobar]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.aprobar;
      const promoSnap = await getDoc(doc(db, "promocionesPendientes", id));
      const promo = promoSnap.data();
      await updateDoc(doc(db, "promocionesPendientes", id), { estado: "aprobada" });
      if (promo?.negocioId && promo?.productoId) {
        await updateDoc(doc(db, "negocios", promo.negocioId, "productos", promo.productoId), {
          promocionAprobada: true,
        });
      }
      cargarPromociones();
    });
  });
  wrap.querySelectorAll("[data-rechazar]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await updateDoc(doc(db, "promocionesPendientes", btn.dataset.rechazar), { estado: "rechazada" });
      cargarPromociones();
    });
  });
}

// ---------- DELIVERY HS ----------
async function cargarDeliveryHS() {
  const snap = await getDoc(doc(db, "config", "deliveryHS"));
  document.getElementById("precioHS").value = snap.exists() ? snap.data().precio : 0;
}

document.getElementById("formDeliveryHS").addEventListener("submit", async (event) => {
  event.preventDefault();
  const precio = Number(document.getElementById("precioHS").value);
  await setDoc(doc(db, "config", "deliveryHS"), { precio }, { merge: true });
  const msg = document.getElementById("deliveryMsg");
  msg.textContent = "Precio guardado.";
  setTimeout(() => (msg.textContent = ""), 2500);
});

// ---------- CATEGORIZAR PRODUCTOS ----------
async function cargarProductosParaCategorizar() {
  const tbody = document.getElementById("tablaProductosCategorizar");
  const empty = document.getElementById("productosCategorizarEmpty");
  tbody.innerHTML = "";
  empty.hidden = true;

  let negociosSnap;
  try {
    negociosSnap = await getDocs(collection(db, "negocios"));
  } catch (err) {
    console.error(err);
    empty.hidden = false;
    empty.querySelector("span").textContent =
      "No pudimos cargar los negocios. Revisá la consola del navegador (F12) para más detalles.";
    return;
  }

  // Buscamos, para cada negocio, sus productos Y sus categorías de producto
  // propias (en vez de una consulta "collection group" entre todos).
  const productosConNegocio = [];
  const categoriasPorNegocio = new Map(); // negocioId -> [nombre, ...]

  for (const negDoc of negociosSnap.docs) {
    try {
      const [prodSnap, catSnap] = await Promise.all([
        getDocs(collection(db, "negocios", negDoc.id, "productos")),
        getDocs(collection(db, "negocios", negDoc.id, "categoriasProducto")),
      ]);
      categoriasPorNegocio.set(negDoc.id, catSnap.docs.map((d) => d.data().nombre));
      prodSnap.forEach((prodDoc) => {
        productosConNegocio.push({
          id: prodDoc.id,
          negocioId: negDoc.id,
          negocioNombre: negDoc.data().nombre || negDoc.id,
          ...prodDoc.data(),
        });
      });
    } catch (err) {
      console.error(`Error cargando datos de ${negDoc.id}:`, err);
    }
  }

  if (productosConNegocio.length === 0) {
    empty.hidden = false;
    return;
  }

  productosConNegocio.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));

  productosConNegocio.forEach((p) => {
    try {
      const tr = document.createElement("tr");
      const categoriasDeEseNegocio = categoriasPorNegocio.get(p.negocioId) || [];
      const opciones = [`<option value="">Sin categoría</option>`]
        .concat(
          categoriasDeEseNegocio.map(
            (c) => `<option value="${escapeHtml(c)}" ${p.categoriaProducto === c ? "selected" : ""}>${escapeHtml(c)}</option>`
          )
        )
        .concat([`<option value="__nueva__">+ Crear nueva categoría...</option>`])
        .join("");

      tr.innerHTML = `
        <td>${p.fotoUrl ? `<img src="${p.fotoUrl}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;" />` : "—"}</td>
        <td>${escapeHtml(p.nombre)}</td>
        <td>${escapeHtml(p.negocioNombre)}</td>
        <td>
          <select data-categorizar="${p.negocioId}|${p.id}" style="background:var(--panel); color:var(--text); border:1px solid var(--line); border-radius:8px; padding:6px 10px;">
            ${opciones}
          </select>
        </td>
        <td>
          <input type="number" data-orden="${p.negocioId}|${p.id}" value="${p.orden ?? ""}" placeholder="—" style="width:70px; background:var(--panel); color:var(--text); border:1px solid var(--line); border-radius:8px; padding:6px 8px;" />
        </td>
        <td>
          <span class="form-success" data-guardado="${p.negocioId}|${p.id}"></span>
          <button class="btn btn--danger btn--sm" data-eliminar-producto="${p.negocioId}|${p.id}">Eliminar</button>
        </td>
      `;
      tbody.appendChild(tr);
    } catch (err) {
      console.error(`No se pudo mostrar el producto ${p.id}:`, err);
    }
  });

  function mostrarGuardado(negId, prodId) {
    const msg = tbody.querySelector(`[data-guardado="${negId}|${prodId}"]`);
    if (!msg) return;
    msg.textContent = "Guardado ✔";
    setTimeout(() => (msg.textContent = ""), 2000);
  }

  tbody.querySelectorAll("[data-categorizar]").forEach((select) => {
    select.addEventListener("change", async () => {
      const [negId, prodId] = select.dataset.categorizar.split("|");

      if (select.value === "__nueva__") {
        const nombreNueva = prompt("Nombre de la nueva categoría de producto:");
        if (!nombreNueva || !nombreNueva.trim()) {
          select.value = "";
          return;
        }
        const nombreFinal = nombreNueva.trim();
        await addDoc(collection(db, "negocios", negId, "categoriasProducto"), {
          nombre: nombreFinal,
          createdAt: serverTimestamp(),
        });
        await updateDoc(doc(db, "negocios", negId, "productos", prodId), { categoriaProducto: nombreFinal });
        mostrarGuardado(negId, prodId);
        cargarProductosParaCategorizar();
        return;
      }

      await updateDoc(doc(db, "negocios", negId, "productos", prodId), { categoriaProducto: select.value || null });
      mostrarGuardado(negId, prodId);
    });
  });

  tbody.querySelectorAll("[data-orden]").forEach((input) => {
    input.addEventListener("change", async () => {
      const [negId, prodId] = input.dataset.orden.split("|");
      const valor = input.value === "" ? null : Number(input.value);
      await updateDoc(doc(db, "negocios", negId, "productos", prodId), { orden: valor });
      mostrarGuardado(negId, prodId);
    });
  });

  tbody.querySelectorAll("[data-eliminar-producto]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este producto? Esta acción no se puede deshacer.")) return;
      const [negId, prodId] = btn.dataset.eliminarProducto.split("|");
      await deleteDoc(doc(db, "negocios", negId, "productos", prodId));
      cargarProductosParaCategorizar();
    });
  });
}

// ---------- HEADER DEL SITIO (SLIDES OPCIONALES) ----------
async function cargarHeaderSlides() {
  const wrap = document.getElementById("listaHeaderSlides");
  const empty = document.getElementById("headerSlidesEmpty");
  wrap.innerHTML = "";
  const snap = await getDoc(doc(db, "config", "homeSlides"));
  const slides = snap.exists() ? snap.data().slides || [] : [];

  if (slides.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  slides.forEach((url, index) => {
    const div = document.createElement("div");
    div.style.cssText = "position:relative;";
    div.innerHTML = `
      <img src="${url}" style="width:180px;height:100px;object-fit:cover;border-radius:12px;" />
      <button data-quitar-header-slide="${index}" class="btn btn--danger btn--sm" style="position:absolute;top:6px;right:6px;padding:4px 8px;">✕</button>
    `;
    wrap.appendChild(div);
  });

  wrap.querySelectorAll("[data-quitar-header-slide]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const nuevaLista = [...slides];
      nuevaLista.splice(Number(btn.dataset.quitarHeaderSlide), 1);
      await setDoc(doc(db, "config", "homeSlides"), { slides: nuevaLista }, { merge: true });
      cargarHeaderSlides();
    });
  });
}

document.getElementById("formHeaderSlide").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById("headerSlideError");
  errorEl.textContent = "";
  const file = document.getElementById("headerSlideFile").files[0];
  if (!file) return;
  try {
    const url = await uploadImage(file, "header-sitio");
    const snap = await getDoc(doc(db, "config", "homeSlides"));
    const slides = snap.exists() ? snap.data().slides || [] : [];
    slides.push(url);
    await setDoc(doc(db, "config", "homeSlides"), { slides }, { merge: true });
    document.getElementById("formHeaderSlide").reset();
    cargarHeaderSlides();
  } catch (err) {
    console.error(err);
    errorEl.textContent = "No pudimos subir la imagen.";
  }
});

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- PEDIDOS (tiempo real + aviso de nuevo pedido) ----------
let pedidosAdminPrimerCarga = true;
let pedidosAdminIdsVistos = new Set();

if ("Notification" in window && Notification.permission === "default") {
  Notification.requestPermission();
}

function mostrarToastNuevoPedido(p) {
  const toast = document.createElement("div");
  toast.className = "toast-nuevo-pedido";
  toast.innerHTML = `
    <strong>🛎️ Nuevo pedido</strong>
    <p>${escapeHtml(p.clienteNombre || "Cliente")} en ${escapeHtml(p.negocioNombre || "")}</p>
    <a href="../chat.html?pedidoId=${p.id}" target="_blank">Ver conversación →</a>
  `;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 9000);

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification("Nuevo pedido en Mi Río Primero", {
        body: `${p.clienteNombre || "Cliente"} en ${p.negocioNombre || ""}`,
      });
    } catch (err) {
      console.warn("No se pudo mostrar la notificación del navegador:", err);
    }
  }
}

onSnapshot(collection(db, "pedidos"), (snap) => {
  const wrap = document.getElementById("listaPedidosAdmin");
  const empty = document.getElementById("pedidosAdminEmpty");

  snap.docChanges().forEach((change) => {
    if (change.type === "added") {
      const p = { id: change.doc.id, ...change.doc.data() };
      if (!pedidosAdminPrimerCarga && !pedidosAdminIdsVistos.has(p.id)) {
        mostrarToastNuevoPedido(p);
      }
      pedidosAdminIdsVistos.add(p.id);
    }
  });
  pedidosAdminPrimerCarga = false;

  if (!wrap) return; // el DOM de esta sección todavía no existe en la primera carga

  wrap.innerHTML = "";
  if (snap.empty) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  snap.docs
    .sort((a, b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0))
    .forEach((docSnap) => {
      const p = docSnap.data();
      const div = document.createElement("div");
      div.style.cssText = "padding:14px 0; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; align-items:center;";
      div.innerHTML = `
        <div>
          <strong>${escapeHtml(p.clienteNombre || "Cliente")}</strong> → ${escapeHtml(p.negocioNombre || "")}
          <span class="badge badge--${p.estado}">${p.estado}</span>
          <p style="font-size:13px; color:var(--text-muted); margin:4px 0 0;">Total: $${p.total ?? "—"}</p>
        </div>
        <div class="top-actions" style="align-items:center;">
          <a class="btn btn--outline btn--sm" href="../chat.html?pedidoId=${docSnap.id}" target="_blank">Ver conversación</a>
          <button class="btn btn--danger btn--sm" data-eliminar-pedido="${docSnap.id}" title="Eliminar pedido" aria-label="Eliminar pedido">✕</button>
        </div>
      `;
      wrap.appendChild(div);
    });

  wrap.querySelectorAll("[data-eliminar-pedido]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar este pedido? Esta acción no se puede deshacer.")) return;
      await deleteDoc(doc(db, "pedidos", btn.dataset.eliminarPedido));
    });
  });
});

// ---------- NOTIFICACIONES (broadcast a todos los usuarios) ----------
document.getElementById("formNotificacion").addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById("notifError");
  errorEl.textContent = "";
  const titulo = document.getElementById("notifTitulo").value.trim();
  const mensaje = document.getElementById("notifMensaje").value.trim();
  try {
    await addDoc(collection(db, "notificaciones"), { titulo, mensaje, createdAt: serverTimestamp() });
    document.getElementById("formNotificacion").reset();
    cargarNotificaciones();
  } catch (err) {
    console.error(err);
    errorEl.textContent = "No pudimos publicar la notificación.";
  }
});

async function cargarNotificaciones() {
  const wrap = document.getElementById("listaNotificaciones");
  const empty = document.getElementById("notificacionesEmpty");
  wrap.innerHTML = "";
  const snap = await getDocs(query(collection(db, "notificaciones"), orderBy("createdAt", "desc")));

  if (snap.empty) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  snap.forEach((docSnap) => {
    const n = docSnap.data();
    const div = document.createElement("div");
    div.style.cssText = "padding:14px 0; border-bottom:1px solid var(--line); display:flex; justify-content:space-between; gap:16px;";
    div.innerHTML = `
      <div>
        <strong>${escapeHtml(n.titulo)}</strong>
        <p style="color:var(--text-muted); font-size:13px; margin:4px 0 0;">${escapeHtml(n.mensaje)}</p>
      </div>
      <button class="btn btn--danger btn--sm" data-eliminar-notif="${docSnap.id}">Eliminar</button>
    `;
    wrap.appendChild(div);
  });

  wrap.querySelectorAll("[data-eliminar-notif]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("¿Eliminar esta notificación?")) return;
      await deleteDoc(doc(db, "notificaciones", btn.dataset.eliminarNotif));
      cargarNotificaciones();
    });
  });
}

// ---------- PRIORIDAD EN EL FEED ----------
let prioridadProductos = [];

async function cargarPrioridad() {
  const wrap = document.getElementById("listaPrioridad");
  const empty = document.getElementById("prioridadEmpty");
  wrap.innerHTML = "";

  const negociosSnap = await getDocs(collection(db, "negocios"));
  prioridadProductos = [];

  for (const negDoc of negociosSnap.docs) {
    const prodSnap = await getDocs(collection(db, "negocios", negDoc.id, "productos"));
    prodSnap.forEach((prodDoc) => {
      prioridadProductos.push({
        id: prodDoc.id,
        negocioId: negDoc.id,
        negocioNombre: negDoc.data().nombre || negDoc.id,
        ...prodDoc.data(),
      });
    });
  }

  if (prioridadProductos.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  prioridadProductos.sort((a, b) => {
    const oa = a.orden ?? Infinity;
    const ob = b.orden ?? Infinity;
    if (oa !== ob) return oa - ob;
    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
  });

  renderPrioridad();
}

function renderPrioridad() {
  const wrap = document.getElementById("listaPrioridad");
  wrap.innerHTML = "";

  prioridadProductos.forEach((p, index) => {
    const div = document.createElement("div");
    div.style.cssText = "display:flex; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--line);";
    div.innerHTML = `
      <span style="color:var(--text-muted); font-size:13px; width:20px;">${index + 1}</span>
      ${p.fotoUrl ? `<img src="${p.fotoUrl}" style="width:40px;height:40px;object-fit:cover;border-radius:8px;" />` : `<span style="width:40px;height:40px;"></span>`}
      <div style="flex:1;">
        <strong>${escapeHtml(p.nombre)}</strong>
        <p style="margin:0; font-size:12px; color:var(--text-muted);">${escapeHtml(p.negocioNombre)}</p>
      </div>
      <div class="top-actions">
        <button class="btn btn--outline btn--sm" data-subir="${index}" ${index === 0 ? "disabled" : ""}>↑</button>
        <button class="btn btn--outline btn--sm" data-bajar="${index}" ${index === prioridadProductos.length - 1 ? "disabled" : ""}>↓</button>
      </div>
    `;
    wrap.appendChild(div);
  });

  wrap.querySelectorAll("[data-subir]").forEach((btn) => {
    btn.addEventListener("click", () => moverPrioridad(Number(btn.dataset.subir), -1));
  });
  wrap.querySelectorAll("[data-bajar]").forEach((btn) => {
    btn.addEventListener("click", () => moverPrioridad(Number(btn.dataset.bajar), 1));
  });
}

async function moverPrioridad(index, direccion) {
  const nuevoIndex = index + direccion;
  if (nuevoIndex < 0 || nuevoIndex >= prioridadProductos.length) return;
  [prioridadProductos[index], prioridadProductos[nuevoIndex]] = [prioridadProductos[nuevoIndex], prioridadProductos[index]];
  renderPrioridad();

  await Promise.all(
    prioridadProductos.map((p, i) => updateDoc(doc(db, "negocios", p.negocioId, "productos", p.id), { orden: i }))
  );
}

// Carga inicial
cargarNegocios();
cargarCategorias();
