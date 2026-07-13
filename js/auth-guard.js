import { auth, db, onAuthStateChanged, doc, getDoc } from "./firebase-config.js";

/**
 * Protege una página exigiendo que el usuario esté autenticado y tenga
 * el rol indicado, guardado en users/{uid}.role ("admin" | "negocio" | "cliente").
 * Devuelve una Promise que resuelve con { uid, role, userDoc } o redirige.
 */
export function requireRole(requiredRole, redirectTo) {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        window.location.href = redirectTo;
        return;
      }
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (!snap.exists() || snap.data().role !== requiredRole) {
          window.location.href = redirectTo;
          return;
        }
        resolve({ uid: user.uid, role: snap.data().role, userDoc: snap.data() });
      } catch (err) {
        console.error("Error verificando el rol:", err);
        window.location.href = redirectTo;
      }
    });
  });
}

export function watchAuth(onUser, onNoUser) {
  onAuthStateChanged(auth, (user) => {
    if (user) onUser(user);
    else if (onNoUser) onNoUser();
  });
}
