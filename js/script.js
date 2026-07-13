// Registro do Service Worker (PWA)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch((err) => {
      console.warn("No se pudo registrar el service worker:", err);
    });
  });
}

// Prompt de instalación PWA (Android / Desktop Chrome)
let deferredInstallPrompt = null;
const installBtn = document.getElementById("installBtn");
const installHint = document.getElementById("installHint");

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installBtn.hidden = false;
  installHint.hidden = true;
});

installBtn?.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installBtn.hidden = true;
});

window.addEventListener("appinstalled", () => {
  installBtn.hidden = true;
  installHint.hidden = true;
});

// Ruteo de tarjetas de rol.
// NOTA PARA LA FASE 2: reemplazar estos destinos por las páginas reales
// (login-negocio.html y registro-cliente.html) cuando estén construidas.
document.querySelectorAll(".role-card").forEach((card) => {
  card.addEventListener("click", () => {
    const role = card.dataset.role;
    if (role === "negocio") {
      window.location.href = "login-negocio.html";
    } else if (role === "cliente") {
      window.location.href = "registro-cliente.html";
    }
  });
});
