import { auth, db, signInWithEmailAndPassword, doc, getDoc } from "./firebase-config.js";

const form = document.getElementById("formLogin");
const errorEl = document.getElementById("formError");
const submitBtn = document.getElementById("submitBtn");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.textContent = "";
  submitBtn.disabled = true;
  submitBtn.textContent = "Ingresando...";

  const email = form.email.value.trim();
  const password = form.password.value;

  try {
    const credential = await signInWithEmailAndPassword(auth, email, password);
    const uid = credential.user.uid;
    const userSnap = await getDoc(doc(db, "users", uid));

    if (!userSnap.exists() || userSnap.data().role !== "negocio") {
      errorEl.textContent = "Esta cuenta no está habilitada como negocio.";
      submitBtn.disabled = false;
      submitBtn.textContent = "Ingresar";
      return;
    }

    window.location.href = "negocio/dashboard.html";
  } catch (err) {
    console.error(err);
    errorEl.textContent = "Usuario o contraseña incorrectos.";
    submitBtn.disabled = false;
    submitBtn.textContent = "Ingresar";
  }
});
