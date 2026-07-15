import {
  auth,
  db,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  collection,
  collectionGroup,
  getDocs,
  getDoc,
  doc,
  query,
  orderBy,
} from "./firebase-config.js";

// ---------- Service Worker (PWA) ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => console.warn("SW no registrado:", err));
  });
}

// ---------- Banner de instalación ----------
let deferredInstallPrompt = null;
const installBanner = document.getElementById("installBanner");
const installBtn = document.getElementById("installBtn");

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  if (!sessionStorage.getItem("installBannerCerrado")) installBanner.hidden = false;
});

installBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installBanner.hidden = true;
});

document.getElementById("closeInstallBanner").addEventListener("click", () => {
  installBanner.hidden = true;
  sessionStorage.setItem("installBannerCerrado", "1");
});

window.addEventListener("appinstalled", () => {
  installBanner.hidden = true;
});

// ---------- Estado de sesión / navegación ----------
const navLoggedOut = document.getElementById("navLoggedOut");
const navCliente = document.getElementById("navCliente");
const navNegocio = document.getElementById("navNegocio");

onAuthStateChanged(auth, async (user) => {
  navLoggedOut.hidden = true;
  navCliente.hidden = true;
  navNegocio.hidden = true;

  if (!user) {
    navLoggedOut.hidden = false;
    return;
  }

  const userSnap = await getDoc(doc(db, "users", user.uid));
  const role = userSnap.exists() ? userSnap.data().role : null;

  if (role === "cliente") navCliente.hidden = false;
  else if (role === "negocio") navNegocio.hidden = false;
  else navLoggedOut.hidden = false;
});

document.getElementById("logoutClienteBtn").addEventListener("click", () => signOut(auth));
document.getElementById("logoutNegocioBtn").addEventListener("click", () => signOut(auth));

// ---------- Modal: Ingresar ----------
const modalLogin = document.getElementById("modalLogin");
const formLoginCliente = document.getElementById("formLoginCliente");
const formLoginNegocio = document.getElementById("formLoginNegocio");

document.getElementById("btnAbrirLogin").addEventListener("click", () => (modalLogin.hidden = false));
document.getElementById("cerrarModalLogin").addEventListener("click", () => (modalLogin.hidden = true));

document.querySelectorAll("[data-auth-tab]").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-auth-tab]").forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    const esCliente = tab.dataset.authTab === "cliente";
    formLoginCliente.hidden = !esCliente;
    formLoginNegocio.hidden = esCliente;
  });
});

formLoginCliente.addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById("loginClienteError");
  errorEl.textContent = "";
  try {
    const email = document.getElementById("loginClienteEmail").value.trim();
    const password = document.getElementById("loginClientePassword").value;
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const userSnap = await getDoc(doc(db, "users", credential.user.uid));
    if (!userSnap.exists() || userSnap.data().role !== "cliente") {
      errorEl.textContent = "Esta cuenta no está registrada como cliente.";
      await signOut(auth);
      return;
    }
    modalLogin.hidden = true;
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Email o contraseña incorrectos.";
  }
});

formLoginNegocio.addEventListener("submit", async (event) => {
  event.preventDefault();
  const errorEl = document.getElementById("loginNegocioError");
  errorEl.textContent = "";
  try {
    const email = document.getElementById("loginNegocioEmail").value.trim();
    const password = document.getElementById("loginNegocioPassword").value;
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const userSnap = await getDoc(doc(db, "users", credential.user.uid));
    if (!userSnap.exists() || userSnap.data().role !== "negocio") {
      errorEl.textContent = "Esta cuenta no está habilitada como negocio.";
      await signOut(auth);
      return;
    }
    window.location.href = "negocio/dashboard.html";
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Email o contraseña incorrectos.";
  }
});

// ---------- Modal: Crear cuenta ----------
const modalRegistro = document.getElementById("modalRegistro");
document.getElementById("btnAbrirRegistro").addEventListener("click", () => (modalRegistro.hidden = false));
document.getElementById("cerrarModalRegistro").addEventListener("click", () => (modalRegistro.hidden = true));

// ---------- Feed (visible para invitados) ----------
let todosLosProductos = [];
let categoriaActiva = null;
let textoBusqueda = "";

async function cargarHeaderSlides() {
  const wrap = document.getElementById("headerSlides");
  const snap = await getDoc(doc(db, "config", "homeSlides"));
  const slides = snap.exists() ? snap.data().slides || [] : [];
  if (slides.length === 0) {
    wrap.hidden = true;
    return;
  }
  wrap.hidden = false;
  wrap.innerHTML = slides.map((url) => `<img src="${url}" alt="Mi Río Primero" />`).join("");
}

async function cargarNegociosLogos() {
  const section = document.getElementById("negociosRowSection");
  const row = document.getElementById("negociosRow");
  row.innerHTML = "";
  const snap = await getDocs(collection(db, "negocios"));

  if (snap.empty) {
    section.hidden = true;
    return;
  }
  section.hidden = false;

  snap.forEach((docSnap) => {
    const n = docSnap.data();
    const a = document.createElement("a");
    a.className = "negocio-logo-card";
    a.href = `cliente/tienda.html?id=${docSnap.id}`;
    const inicial = (n.nombre || "?").trim().charAt(0).toUpperCase();
    a.innerHTML = n.logoUrl
      ? `<img class="negocio-logo-card__img" src="${n.logoUrl}" alt="${escapeHtml(n.nombre)}" />`
      : `<span class="negocio-logo-card__img negocio-logo-card__img--placeholder">${inicial}</span>`;
    a.innerHTML += `<span class="negocio-logo-card__nombre">${escapeHtml(n.nombre)}</span>`;
    row.appendChild(a);
  });
}

async function cargarCategorias() {
  const bar = document.getElementById("categoriasBar");
  const chipTodas = document.createElement("button");
  chipTodas.className = "categoria-chip is-active";
  chipTodas.textContent = "Todas";
  bar.appendChild(chipTodas);

  const snap = await getDocs(collection(db, "categorias"));
  snap.forEach((docSnap) => {
    const c = docSnap.data();
    const chip = document.createElement("button");
    chip.className = "categoria-chip";
    chip.textContent = c.nombre;
    chip.addEventListener("click", () => {
      document.querySelectorAll(".categoria-chip").forEach((el) => el.classList.remove("is-active"));
      chip.classList.add("is-active");
      categoriaActiva = c.nombre;
      renderProductos();
    });
    bar.appendChild(chip);
  });

  chipTodas.addEventListener("click", () => {
    document.querySelectorAll(".categoria-chip").forEach((el) => el.classList.remove("is-active"));
    chipTodas.classList.add("is-active");
    categoriaActiva = null;
    renderProductos();
  });
}

document.getElementById("buscarInput").addEventListener("input", (event) => {
  textoBusqueda = event.target.value.trim().toLowerCase();
  renderProductos();
});

async function cargarPromociones() {
  const wrap = document.getElementById("promosSlider");
  wrap.innerHTML = "";
  // NOTA: Firestore puede pedir crear un índice compuesto la primera vez
  // (aparece un link en la consola del navegador para crearlo con un clic).
  const snap = await getDocs(query(collectionGroup(db, "productos"), orderBy("createdAt", "desc")));
  const promos = snap.docs.filter((d) => d.data().promocion?.activo && d.data().promocionAprobada);

  if (promos.length === 0) {
    wrap.innerHTML = `<p style="color:var(--text-muted); padding: 0 4px;">No hay promociones activas en este momento.</p>`;
    return;
  }

  for (const docSnap of promos) {
    const p = docSnap.data();
    const negocioId = docSnap.ref.parent.parent.id;
    const a = document.createElement("a");
    a.className = "promo-slide";
    a.href = `cliente/tienda.html?id=${negocioId}&producto=${docSnap.id}`;
    a.innerHTML = `
      <img src="${p.fotoUrl || "https://placehold.co/400x260/0f1723/8b93a1?text=Sin+foto"}" alt="${escapeHtml(p.nombre)}" />
      <div class="promo-slide__info">
        <p style="margin:0 0 4px; font-weight:700;">${escapeHtml(p.nombre)}</p>
        <span class="promo-slide__precio">$${p.promocion.precioPromo ?? p.precio}</span>
      </div>
    `;
    wrap.appendChild(a);
  }
}

async function cargarProductos() {
  const snap = await getDocs(query(collectionGroup(db, "productos"), orderBy("createdAt", "desc")));
  const negocioCache = new Map();

  todosLosProductos = [];
  for (const docSnap of snap.docs) {
    const negocioId = docSnap.ref.parent.parent.id;
    if (!negocioCache.has(negocioId)) {
      const negSnap = await getDoc(doc(db, "negocios", negocioId));
      negocioCache.set(negocioId, negSnap.exists() ? negSnap.data() : null);
    }
    const negocio = negocioCache.get(negocioId);
    todosLosProductos.push({ id: docSnap.id, negocioId, negocio, ...docSnap.data() });
  }

  renderProductos();
}

function renderProductos() {
  const grid = document.getElementById("productosGrid");
  const empty = document.getElementById("feedEmpty");
  grid.innerHTML = "";

  const items = todosLosProductos.filter((p) => {
    const pasaCategoria = !categoriaActiva || p.categoria === categoriaActiva;
    const pasaBusqueda =
      !textoBusqueda ||
      p.nombre?.toLowerCase().includes(textoBusqueda) ||
      p.negocio?.nombre?.toLowerCase().includes(textoBusqueda);
    return pasaCategoria && pasaBusqueda;
  });

  if (items.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  items.forEach((p) => {
    const a = document.createElement("a");
    a.className = "producto-card";
    a.href = `cliente/tienda.html?id=${p.negocioId}&producto=${p.id}`;
    a.innerHTML = `
      <img src="${p.fotoUrl || "https://placehold.co/400x300/0f1723/8b93a1?text=Sin+foto"}" alt="${escapeHtml(p.nombre)}" />
      <div class="producto-card__info">
        <p class="producto-card__nombre">${escapeHtml(p.nombre)}</p>
        <p class="producto-card__negocio">${escapeHtml(p.negocio?.nombre || "")}</p>
        <span class="producto-card__precio">$${p.precio}</span>
      </div>
    `;
    grid.appendChild(a);
  });
}

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

cargarHeaderSlides();
cargarNegociosLogos();
cargarCategorias();
cargarPromociones();
cargarProductos();
