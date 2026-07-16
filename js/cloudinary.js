// Upload de imágenes a Cloudinary usando un "unsigned upload preset".
// IMPORTANTE: el API Secret de Cloudinary NUNCA debe usarse en el navegador.
// Por eso este helper sube con un preset "unsigned" que hay que crear una
// sola vez en el panel de Cloudinary (Settings > Upload > Upload presets
// > Add upload preset > Signing mode: Unsigned).
// Reemplazá UPLOAD_PRESET por el nombre que le pongas a ese preset.

const CLOUD_NAME = "v3tbrupw";
const UPLOAD_PRESET = "mirioprimero.vercel.app";

export async function uploadImage(file, folder = "general") {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", UPLOAD_PRESET);
  formData.append("folder", `mirioprimero/${folder}`);

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    { method: "POST", body: formData }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Error al subir la imagen: ${errText}`);
  }

  const data = await res.json();
  return data.secure_url;
}
