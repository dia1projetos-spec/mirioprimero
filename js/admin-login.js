import { auth, db, signInWithEmailAndPassword, doc, getDoc } from "./firebase-config.js";

const form = document.getElementById("formLogin");
const errorEl = document.getElementById("formError");
const submitBtn = document.getElementById("submitBtn");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.textContent = "";
  submitBtn.disabled = true;
  submitBtn.textContent = "Ingresando...";

  try {
    const credential = await signInWithEmailAndPassword(auth, form.email.value.trim(), form.password.value);
    const uid = credential.user.uid;
    const userSnap = await getDoc(doc(db, "users", uid));

    if (!userSnap.exists() || userSnap.data().role !== "admin") {
      errorEl.textContent = "Esta cuenta no tiene permisos de administrador.";
      submitBtn.disabled = false;
      submitBtn.textContent = "Ingresar";
      return;
    }

    window.location.href = "dashboard.html";
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Usuario o contraseña incorrectos.";
    submitBtn.disabled = false;
    submitBtn.textContent = "Ingresar";
  }
});
