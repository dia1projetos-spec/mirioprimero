import {
  auth,
  db,
  signOut,
  collection,
  collectionGroup,
  getDocs,
  getDoc,
  doc,
  query,
  orderBy,
} from "./firebase-config.js";
import { requireRole } from "./auth-guard.js";

requireRole("cliente", "../login-negocio.html").then(() => {
  cargarCategorias();
  cargarPromociones();
  cargarProductos();
});

document.getElementById("logoutBtn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "../index.html";
});

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
      cargarProductos(c.nombre);
    });
    bar.appendChild(chip);
  });

  chipTodas.addEventListener("click", () => {
    document.querySelectorAll(".categoria-chip").forEach((el) => el.classList.remove("is-active"));
    chipTodas.classList.add("is-active");
    cargarProductos(null);
  });
}

async function cargarPromociones() {
  const wrap = document.getElementById("promosSlider");
  wrap.innerHTML = "";
  // NOTA: collectionGroup requiere el índice compuesto que Firestore va a
  // pedir crear la primera vez (el link aparece en la consola del navegador).
  const snap = await getDocs(
    query(collectionGroup(db, "productos"), orderBy("createdAt", "desc"))
  );
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
    a.href = `tienda.html?id=${negocioId}&producto=${docSnap.id}`;
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

async function cargarProductos(categoriaFiltro = null) {
  const grid = document.getElementById("productosGrid");
  const empty = document.getElementById("feedEmpty");
  grid.innerHTML = "";

  const snap = await getDocs(query(collectionGroup(db, "productos"), orderBy("createdAt", "desc")));
  const negocioCache = new Map();

  let items = [];
  for (const docSnap of snap.docs) {
    const negocioId = docSnap.ref.parent.parent.id;
    if (!negocioCache.has(negocioId)) {
      const negSnap = await getDoc(doc(db, "negocios", negocioId));
      negocioCache.set(negocioId, negSnap.exists() ? negSnap.data() : null);
    }
    const negocio = negocioCache.get(negocioId);
    if (categoriaFiltro && negocio?.categoria !== categoriaFiltro) continue;
    items.push({ id: docSnap.id, negocioId, negocio, ...docSnap.data() });
  }

  if (items.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  items.forEach((p) => {
    const a = document.createElement("a");
    a.className = "producto-card";
    a.href = `tienda.html?id=${p.negocioId}&producto=${p.id}`;
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
