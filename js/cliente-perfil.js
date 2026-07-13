import { db, doc, getDoc, collection, query, where, getDocs } from "./firebase-config.js";
import { requireRole } from "./auth-guard.js";

requireRole("cliente", "../login-negocio.html").then(async (info) => {
  const snap = await getDoc(doc(db, "clientes", info.uid));
  const c = snap.data();
  document.getElementById("perfilNombre").textContent = c.nombre;
  document.getElementById("perfilContacto").textContent = c.contacto;
  document.getElementById("perfilDireccion").textContent = c.direccion;
  if (c.fotoUrl) document.getElementById("perfilFoto").src = c.fotoUrl;

  const wrap = document.getElementById("listaPedidos");
  const empty = document.getElementById("pedidosEmpty");
  const pedidosSnap = await getDocs(query(collection(db, "pedidos"), where("clienteUid", "==", info.uid)));

  if (pedidosSnap.empty) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  pedidosSnap.docs
    .sort((a, b) => (b.data().createdAt?.seconds || 0) - (a.data().createdAt?.seconds || 0))
    .forEach((docSnap) => {
      const p = docSnap.data();
      const div = document.createElement("div");
      div.className = "panel";
      div.style.marginBottom = "12px";
      div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong>${escapeHtml(p.negocioNombre || "")}</strong>
          <span class="badge badge--${p.estado}">${p.estado}</span>
        </div>
        <p style="color:var(--text-muted); font-size:13px; margin:6px 0;">Total: $${p.total ?? "—"}</p>
        <a class="btn btn--outline btn--sm" href="../chat.html?pedidoId=${docSnap.id}">Ver chat</a>
      `;
      wrap.appendChild(div);
    });
});

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
