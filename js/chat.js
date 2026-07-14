import {
  auth,
  db,
  onAuthStateChanged,
  doc,
  getDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "./firebase-config.js";

const params = new URLSearchParams(window.location.search);
const pedidoId = params.get("pedidoId");

const chatMessages = document.getElementById("chatMessages");
const chatTitulo = document.getElementById("chatTitulo");
const chatMeta = document.getElementById("chatMeta");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const volverLink = document.getElementById("volverLink");

let miRol = null; // "cliente" | "negocio" | "admin"
let pedido = null;

if (!pedidoId) {
  chatTitulo.textContent = "Chat no encontrado";
} else {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "index.html";
      return;
    }

    const userSnap = await getDoc(doc(db, "users", user.uid));
    const rolCuenta = userSnap.exists() ? userSnap.data().role : null;

    const pedidoSnap = await getDoc(doc(db, "pedidos", pedidoId));
    if (!pedidoSnap.exists()) {
      chatTitulo.textContent = "Este pedido no existe.";
      return;
    }
    pedido = pedidoSnap.data();

    const esCliente = rolCuenta === "cliente" && pedido.clienteUid === user.uid;
    const esNegocio = rolCuenta === "negocio" && pedido.negocioId === user.uid;
    const esAdmin = rolCuenta === "admin";

    if (!esCliente && !esNegocio && !esAdmin) {
      chatTitulo.textContent = "No tenés acceso a este chat.";
      return;
    }

    miRol = esCliente ? "cliente" : esNegocio ? "negocio" : "admin";
    volverLink.href = miRol === "negocio" ? "negocio/dashboard.html" : miRol === "cliente" ? "index.html" : "admin/dashboard.html";

    chatTitulo.textContent = miRol === "cliente" ? pedido.negocioNombre : pedido.clienteNombre;
    chatMeta.textContent = `Pedido · Total $${pedido.total ?? "—"} · Estado: ${pedido.estado}`;

    escucharMensajes();
  });
}

function escucharMensajes() {
  const q = query(collection(db, "pedidos", pedidoId, "chat"), orderBy("createdAt", "asc"));
  onSnapshot(q, (snap) => {
    chatMessages.innerHTML = "";
    snap.forEach((docSnap) => {
      const m = docSnap.data();
      const bubble = document.createElement("div");
      if (m.de === "sistema") {
        bubble.className = "chat-bubble chat-bubble--system";
        bubble.textContent = m.texto;
      } else {
        const esMio = m.de === miRol;
        bubble.className = `chat-bubble ${esMio ? "chat-bubble--out" : "chat-bubble--in"}`;
        bubble.textContent = m.texto;
      }
      chatMessages.appendChild(bubble);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
  });
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const texto = chatInput.value.trim();
  if (!texto || !miRol) return;
  chatInput.value = "";
  await addDoc(collection(db, "pedidos", pedidoId, "chat"), {
    de: miRol,
    texto,
    createdAt: serverTimestamp(),
  });
});
