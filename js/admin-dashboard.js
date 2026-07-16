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
    if (btn.dataset.tab === "header") cargarHeaderSlides();
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
    div.innerHTML = `<video src="${v.url}" controls style="max-width:220px; border-radius:12px; display:block; margin-bottom:8px;"></video><p style="color:var(--text-muted); font-size:14px; margin:0;">${escapeHtml(v.caption || "")}</p>`;
    wrap.appendChild(div);
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

  const [productosSnap, categoriasSnap, negociosSnap] = await Promise.all([
    getDocs(query(collectionGroup(db, "productos"), orderBy("createdAt", "desc"))),
    getDocs(collection(db, "categorias")),
    getDocs(collection(db, "negocios")),
  ]);

  if (productosSnap.empty) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const negociosMap = new Map();
  negociosSnap.forEach((d) => negociosMap.set(d.id, d.data()));
  const categorias = categoriasSnap.docs.map((d) => d.data().nombre);

  productosSnap.forEach((docSnap) => {
    const p = docSnap.data();
    const negocioId = docSnap.ref.parent.parent.id;
    const negocioNombre = negociosMap.get(negocioId)?.nombre || negocioId;

    const tr = document.createElement("tr");
    const opciones = [`<option value="">Sin categoría</option>`]
      .concat(categorias.map((c) => `<option value="${escapeHtml(c)}" ${p.categoria === c ? "selected" : ""}>${escapeHtml(c)}</option>`))
      .join("");

    tr.innerHTML = `
      <td>${p.fotoUrl ? `<img src="${p.fotoUrl}" style="width:44px;height:44px;object-fit:cover;border-radius:8px;" />` : "—"}</td>
      <td>${escapeHtml(p.nombre)}</td>
      <td>${escapeHtml(negocioNombre)}</td>
      <td>
        <select data-categorizar="${negocioId}|${docSnap.id}" style="background:var(--panel); color:var(--text); border:1px solid var(--line); border-radius:8px; padding:6px 10px;">
          ${opciones}
        </select>
      </td>
      <td><span class="form-success" data-guardado="${negocioId}|${docSnap.id}"></span></td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-categorizar]").forEach((select) => {
    select.addEventListener("change", async () => {
      const [negId, prodId] = select.dataset.categorizar.split("|");
      await updateDoc(doc(db, "negocios", negId, "productos", prodId), { categoria: select.value || null });
      const msg = tbody.querySelector(`[data-guardado="${negId}|${prodId}"]`);
      msg.textContent = "Guardado ✔";
      setTimeout(() => (msg.textContent = ""), 2000);
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

// Carga inicial
cargarNegocios();
cargarCategorias();
