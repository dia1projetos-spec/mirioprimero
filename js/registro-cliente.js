import {
  auth,
  db,
  createUserWithEmailAndPassword,
  doc,
  setDoc,
  serverTimestamp,
} from "./firebase-config.js";
import { uploadImage } from "./cloudinary.js";

const form = document.getElementById("formRegistro");
const errorEl = document.getElementById("formError");
const submitBtn = document.getElementById("submitBtn");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.textContent = "";
  submitBtn.disabled = true;
  submitBtn.textContent = "Creando cuenta...";

  const nombre = form.nombre.value.trim();
  const direccion = form.direccion.value.trim();
  const edad = Number(form.edad.value);
  const contacto = form.contacto.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;
  const fotoFile = form.foto.files[0];

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = credential.user.uid;

    let fotoUrl = null;
    if (fotoFile) {
      fotoUrl = await uploadImage(fotoFile, "clientes");
    }

    // Documento de rol (usado por las reglas de seguridad y los guards de ruta)
    await setDoc(doc(db, "users", uid), {
      role: "cliente",
      email,
      createdAt: serverTimestamp(),
    });

    // Perfil del cliente
    await setDoc(doc(db, "clientes", uid), {
      nombre,
      direccion,
      edad,
      contacto,
      fotoUrl,
      email,
      createdAt: serverTimestamp(),
    });

    window.location.href = "index.html";
  } catch (err) {
    console.error(err);
    errorEl.textContent = mensajeDeError(err);
    submitBtn.disabled = false;
    submitBtn.textContent = "Crear cuenta";
  }
});

function mensajeDeError(err) {
  const code = err?.code || "";
  if (code.includes("email-already-in-use")) return "Ese email ya tiene una cuenta creada.";
  if (code.includes("weak-password")) return "La contraseña debe tener al menos 6 caracteres.";
  if (code.includes("invalid-email")) return "El email no es válido.";
  return "No pudimos crear la cuenta. Intentá de nuevo.";
}
