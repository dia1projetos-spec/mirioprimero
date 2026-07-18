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

// ---------- Sección grande: instalar la app ----------
let deferredInstallPrompt = null;
const installHero = document.getElementById("installHero");
const installBtn = document.getElementById("installBtn");
const modalInstalarManual = document.getElementById("modalInstalarManual");

// Si ya está instalada (modo standalone), no tiene sentido mostrar la sección.
const yaInstalada =
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
if (yaInstalada) installHero.hidden = true;

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
});

installBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) {
    // iOS/Safari u otros navegadores que no soportan la instalación con un toque.
    modalInstalarManual.hidden = false;
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installHero.hidden = true;
});

document.getElementById("cerrarModalInstalarManual").addEventListener("click", () => {
  modalInstalarManual.hidden = true;
});

window.addEventListener("appinstalled", () => {
  installHero.hidden = true;
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
let categoriaNegocioActiva = null;
let categoriaProductoActiva = null;
let textoBusqueda = "";

async function cargarHeaderSlides() {
  const outerWrap = document.getElementById("headerSlidesWrap");
  const wrap = document.getElementById("headerSlides");
  const dotsWrap = document.getElementById("headerSlidesDots");
  const snap = await getDoc(doc(db, "config", "homeSlides"));
  const slides = snap.exists() ? snap.data().slides || [] : [];

  if (slides.length === 0) {
    outerWrap.hidden = true;
    return;
  }
  outerWrap.hidden = false;
  wrap.innerHTML = slides.map((url) => `<img src="${url}" alt="Mi Río Primero" />`).join("");
  dotsWrap.innerHTML = slides.length > 1 ? slides.map((_, i) => `<span class="${i === 0 ? "is-active" : ""}"></span>`).join("") : "";

  if (slides.length > 1) {
    let indiceActual = 0;
    setInterval(() => {
      indiceActual = (indiceActual + 1) % slides.length;
      wrap.scrollTo({ left: wrap.clientWidth * indiceActual, behavior: "smooth" });
      dotsWrap.querySelectorAll("span").forEach((dot, i) => dot.classList.toggle("is-active", i === indiceActual));
    }, 5000);

    wrap.addEventListener("scroll", () => {
      const indice = Math.round(wrap.scrollLeft / wrap.clientWidth);
      dotsWrap.querySelectorAll("span").forEach((dot, i) => dot.classList.toggle("is-active", i === indice));
    });
  }
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

async function cargarCategoriasNegocio() {
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
      document.querySelectorAll("#categoriasBar .categoria-chip").forEach((el) => el.classList.remove("is-active"));
      chip.classList.add("is-active");
      categoriaNegocioActiva = c.nombre;
      renderProductos();
    });
    bar.appendChild(chip);
  });

  chipTodas.addEventListener("click", () => {
    document.querySelectorAll("#categoriasBar .categoria-chip").forEach((el) => el.classList.remove("is-active"));
    chipTodas.classList.add("is-active");
    categoriaNegocioActiva = null;
    renderProductos();
  });
}

function renderFiltroCategoriaProducto() {
  const bar = document.getElementById("categoriasProductoBar");
  const label = document.getElementById("categoriaProductoLabel");
  bar.innerHTML = "";

  const categoriasProducto = [...new Set(todosLosProductos.map((p) => p.categoriaProducto).filter(Boolean))].sort();

  if (categoriasProducto.length === 0) {
    bar.hidden = true;
    label.hidden = true;
    return;
  }
  bar.hidden = false;
  label.hidden = false;

  const chipTodas = document.createElement("button");
  chipTodas.className = "categoria-chip is-active";
  chipTodas.textContent = "Todas";
  bar.appendChild(chipTodas);

  categoriasProducto.forEach((nombre) => {
    const chip = document.createElement("button");
    chip.className = "categoria-chip";
    chip.textContent = nombre;
    chip.addEventListener("click", () => {
      document.querySelectorAll("#categoriasProductoBar .categoria-chip").forEach((el) => el.classList.remove("is-active"));
      chip.classList.add("is-active");
      categoriaProductoActiva = nombre;
      renderProductos();
    });
    bar.appendChild(chip);
  });

  chipTodas.addEventListener("click", () => {
    document.querySelectorAll("#categoriasProductoBar .categoria-chip").forEach((el) => el.classList.remove("is-active"));
    chipTodas.classList.add("is-active");
    categoriaProductoActiva = null;
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
  let negociosSnap;
  try {
    negociosSnap = await getDocs(collection(db, "negocios"));
  } catch (err) {
    console.error(err);
    wrap.innerHTML = `<p style="color:var(--text-muted); padding: 0 4px;">No pudimos cargar las promociones.</p>`;
    return;
  }

  const promos = [];
  for (const negDoc of negociosSnap.docs) {
    try {
      const prodSnap = await getDocs(collection(db, "negocios", negDoc.id, "productos"));
      prodSnap.forEach((prodDoc) => {
        const p = prodDoc.data();
        if (p.promocion?.activo && p.promocionAprobada) {
          promos.push({ id: prodDoc.id, negocioId: negDoc.id, ...p });
        }
      });
    } catch (err) {
      console.error(`Error cargando productos de ${negDoc.id}:`, err);
    }
  }

  if (promos.length === 0) {
    wrap.innerHTML = `<p style="color:var(--text-muted); padding: 0 4px;">No hay promociones activas en este momento.</p>`;
    return;
  }

  for (const p of promos) {
    const a = document.createElement("a");
    a.className = "promo-slide";
    a.href = `cliente/tienda.html?id=${p.negocioId}&producto=${p.id}`;
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
  const empty = document.getElementById("feedEmpty");
  let negociosSnap;
  try {
    negociosSnap = await getDocs(collection(db, "negocios"));
  } catch (err) {
    console.error(err);
    empty.hidden = false;
    empty.querySelector("span").textContent = "No pudimos cargar los productos. Revisá la consola del navegador.";
    return;
  }

  todosLosProductos = [];
  for (const negDoc of negociosSnap.docs) {
    try {
      const prodSnap = await getDocs(collection(db, "negocios", negDoc.id, "productos"));
      prodSnap.forEach((prodDoc) => {
        todosLosProductos.push({
          id: prodDoc.id,
          negocioId: negDoc.id,
          negocio: negDoc.data(),
          ...prodDoc.data(),
        });
      });
    } catch (err) {
      console.error(`Error cargando productos de ${negDoc.id}:`, err);
    }
  }

  // Orden manual definido por el admin (números más chicos primero);
  // los productos sin "orden" asignado se ordenan por más nuevo.
  todosLosProductos.sort((a, b) => {
    const ordenA = a.orden ?? Infinity;
    const ordenB = b.orden ?? Infinity;
    if (ordenA !== ordenB) return ordenA - ordenB;
    return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
  });

  renderFiltroCategoriaProducto();
  renderProductos();
}

function renderProductos() {
  const grid = document.getElementById("productosGrid");
  const empty = document.getElementById("feedEmpty");
  grid.innerHTML = "";

  const items = todosLosProductos.filter((p) => {
    const pasaCategoriaNegocio = !categoriaNegocioActiva || p.negocio?.categoria === categoriaNegocioActiva;
    const pasaCategoriaProducto = !categoriaProductoActiva || p.categoriaProducto === categoriaProductoActiva;
    const pasaBusqueda =
      !textoBusqueda ||
      p.nombre?.toLowerCase().includes(textoBusqueda) ||
      p.negocio?.nombre?.toLowerCase().includes(textoBusqueda);
    return pasaCategoriaNegocio && pasaCategoriaProducto && pasaBusqueda;
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

async function cargarNovedades() {
  const section = document.getElementById("novedadesSection");
  const wrap = document.getElementById("novedadesSlider");
  wrap.innerHTML = "";

  let snap;
  try {
    snap = await getDocs(query(collection(db, "feedAdmin"), orderBy("createdAt", "desc")));
  } catch (err) {
    console.error(err);
    section.hidden = true;
    return;
  }

  if (snap.empty) {
    section.hidden = true;
    return;
  }
  section.hidden = false;

  snap.forEach((docSnap) => {
    const v = docSnap.data();
    const div = document.createElement("div");
    div.className = "novedad-card";
    div.innerHTML = `
      <video src="${v.url}" controls playsinline preload="metadata"></video>
      ${v.caption ? `<p class="novedad-card__caption">${escapeHtml(v.caption)}</p>` : ""}
    `;
    wrap.appendChild(div);
  });
}

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

cargarHeaderSlides();
cargarNegociosLogos();
cargarNovedades();
cargarCategoriasNegocio();
cargarPromociones();
cargarProductos();
