# Mi Río Primero — PWA marketplace

Sistema completo (HTML + CSS + JS separados, sin frameworks) con tres áreas:
**Cliente**, **Negocio** y **Administrador**. Usa Firebase (Auth + Firestore)
y Cloudinary para las imágenes/videos. Pensado para hospedar gratis en
GitHub Pages o Vercel.

⚠️ **Este código fue escrito sin poder probarlo en vivo contra tu proyecto de
Firebase real** (el entorno donde lo generé no tiene acceso a internet hacia
Firebase/Cloudinary). Está construido siguiendo el SDK y las reglas
correctas, pero necesita una pasada de pruebas de tu parte antes de usarlo
con clientes reales. Más abajo te dejo exactamente qué revisar.

## 1. Antes de publicar: 3 configuraciones obligatorias

### a) Cloudinary — el "unsigned upload preset" ya está configurado
El preset se llama `mirioprimero.vercel.app` y ya está creado con Signing
mode Unsigned. Si en algún momento lo recreás o cambiás de nombre, actualizá
`UPLOAD_PRESET` en `js/cloudinary.js` y en `js/admin-dashboard.js` (la subida
de video del feed) para que coincidan.

### b) Firestore — publicar las reglas de seguridad
El archivo `firestore.rules` de esta carpeta tiene las reglas de acceso
(cliente/negocio/admin). Pegalas en Firebase Console → Firestore Database →
Reglas, y publicá.

### c) Crear tu usuario administrador
No hay pantalla de "registro de admin" (a propósito, por seguridad). Para
crear el primero:
1. Firebase Console → Authentication → Add user (tu email + contraseña).
2. Copiá el UID generado.
3. Firestore → creá manualmente el documento `users/{ESE_UID}` con:
   ```
   role: "admin"
   email: "tu-email@..."
   ```
4. Entrá por `admin/login.html` con ese email y contraseña.

### d) Índices de Firestore
Ya no hacen falta índices manuales: las consultas que juntan productos de
todos los negocios (`collectionGroup("productos")`) ordenan los resultados
en el propio navegador en vez de pedirle el orden a Firestore, así que
funcionan sin configuración extra desde el primer producto cargado.

## 2. Mapa de archivos

```
index.html                  Splash / instalar PWA / elegir Cliente o Negocio
registro-cliente.html       Alta de cliente (autónoma)
login-negocio.html          Login de negocio (cuenta creada por el admin)
chat.html?pedidoId=...      Chat compartido cliente↔negocio de un pedido

cliente/feed.html           Feed estilo iFood (categorías, promos, productos)
cliente/tienda.html?id=...  Tienda pública de un negocio + flujo de compra
cliente/perfil.html         Datos del cliente + historial de pedidos

negocio/dashboard.html      Productos, slides, cupones, pedidos, delivery

admin/login.html            Login exclusivo del administrador
admin/dashboard.html        Negocios, categorías, clientes, feed de video,
                            promociones pendientes, precio Delivery HS

css/style.css               Estilos de la portada (hero premium)
css/app.css                 Sistema de diseño de las páginas internas
js/firebase-config.js       Config + exports de Firebase
js/cloudinary.js            Helper de subida de imágenes
js/auth-guard.js            Protección de rutas por rol
js/*.js                     Un archivo de lógica por página
firestore.rules             Reglas de seguridad
manifest.json + sw.js       PWA instalable
```

## 3. Modelo de datos (Firestore)

- `users/{uid}` → `{ role: "cliente"|"negocio"|"admin", email }`
- `clientes/{uid}` → `{ nombre, direccion, edad, contacto, fotoUrl }`
- `negocios/{uid}` → `{ nombre, categoria, logoUrl, slides:[url...], deliveryPropio:{activo,precio}, deliveryHS:{activo} }`
  (`categoria` acá es la **categoría de negocio**: Maxikiosko, Super, Farmacia, etc. — se elige de `categorias/` al cargar el negocio)
  - `negocios/{uid}/productos/{id}` → `{ nombre, precio, fotoUrl, categoriaProducto, orden, stock:{activo,cantidad}, destacado, promocion:{activo,precioPromo}, promocionAprobada }`
    - `categoriaProducto`: **categoría de producto**, propia de cada tienda (ej: Bebidas, Snacks). La crea el negocio desde su panel o el admin desde "Categorizar productos". No tiene relación con la categoría de negocio.
    - `orden`: número opcional que el admin asigna en "Categorizar productos" para forzar el orden en el feed de la home (menor = aparece primero). Sin asignar, se ordena por más nuevo.
  - `negocios/{uid}/cupones/{id}` → `{ codigo, tipo:"porcentaje"|"monto", valor, activo }`
  - `negocios/{uid}/categoriasProducto/{id}` → `{ nombre }` (categorías de producto propias de esa tienda)
- `categorias/{id}` → `{ nombre }` (categorías de **negocio**, no de producto)
- `pedidos/{id}` → `{ clienteUid, negocioId, productos:[...], total, estado, deliveryTipo, cuponAplicado, motivoCancelacion }`
  - `pedidos/{id}/chat/{id}` → `{ de:"cliente"|"negocio"|"sistema", texto }`
- `feedAdmin/{id}` → `{ tipo:"video", url, caption }`
- `promocionesPendientes/{id}` → `{ negocioId, productoId, estado:"pendiente"|"aprobada"|"rechazada" }`
- `cancelacionesAdmin/{id}` → `{ pedidoId, negocioId, motivo }`
- `config/deliveryHS` → `{ precio }`
- `config/homeSlides` → `{ slides:[url...] }` (opcional — si está vacío, el slider no se muestra)

## 4. Qué quedó simplificado a propósito (y cómo seguir)

Para entregarte el sistema completo en un solo paquete, tomé estas
decisiones de alcance — son perfectamente funcionales, pero más simples que
una versión "de lujo":

- **Orden manual de productos en el feed**: el admin puede escribir un número
  en "Categorizar productos" (menor = aparece primero). Es un campo numérico,
  no una pantalla de arrastrar-y-soltar — más simple de construir, pero
  cumple la misma función.
- **Control de stock**: se guarda el número, pero todavía no descuenta
  automáticamente stock al confirmarse una venta.
- **Notificaciones push** (avisar al negocio/admin en tiempo real fuera de
  la app): no implementadas. Hoy la actualización es en tiempo real *dentro*
  de la app (Firestore `onSnapshot`), pero no hay notificación push al
  celular cuando la app está cerrada.
- **Precio de venta con cupón**: el descuento se calcula en el navegador del
  cliente antes de crear el pedido. Para un sistema de pagos real conviene
  mover ese cálculo a una Cloud Function, para que nadie pueda manipularlo
  desde el navegador.
- Los íconos de la PWA (`icons/icon-192.png`, `icons/icon-512.png`) son
  provisorios (generados automáticamente) — reemplazalos por tu diseño
  final antes de publicar.

## 5. Publicar

1. Subí toda la carpeta a un repositorio de GitHub.
2. Conectá el repo a Vercel (o activá GitHub Pages) — no hace falta build,
   son archivos estáticos.
3. Como es HTTPS en producción, el botón "Descargar la app" de `index.html`
   va a aparecer solo (en local no aparece, es normal).
