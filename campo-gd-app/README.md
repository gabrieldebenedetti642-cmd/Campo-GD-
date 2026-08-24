# Campo GD — Dashboard + Contabilidad

Primer módulo de la versión software de la planilla. Hecho con HTML/CSS/JS
simple (sin build, sin frameworks pesados) + Firebase, el mismo esquema que
Registro Mangas GD.

## Qué incluye esta versión

**Dashboard**: KPIs de Ingresos/Egresos/Balance en $ y USD filtrados por año,
cotización del dólar editable con balance consolidado, y gráficos.

**Contabilidad**:
- **Ingresos** / **Egresos**: carga de facturas y gastos (con categoría,
  moneda), edición y borrado.
- **Flujo de Caja**: supuestos editables (montos base, % de crecimiento
  mensual, saldo inicial) y proyección a 24 meses en $ y USD, con gráficos.
- **Presupuesto**: presupuesto anual por categoría de egreso (y por
  ingresos totales), comparado contra lo real cargado, por año.
- **Escenarios**: grilla de sensibilidad del balance consolidado según
  variación del precio de hacienda y de la cotización del dólar, más 3
  escenarios de referencia (conservador/base/optimista).

**Hacienda y campo**:
- **Pesadas**: carga por caravana con cálculo automático de GDP (ganancia
  diaria de peso) y resumen (cantidad, min, max, promedio, GDP promedio).
- **Existencias**: movimientos de hacienda (Entrada/Salida, categoría,
  motivo), con stock actual/mortandad/ventas/compras por categoría, carga
  de potreros y hectáreas, y cálculo de carga animal.
- **Lotes de Ganado**: compra-venta de lotes con cálculo automático de
  costo, ingreso, margen, días en el campo, GDP y margen por cabeza.

**Campo**:
- **Lluvias**: carga diaria de mm, con grilla mensual (días × meses)
  calculada sola, filtrable por año.
- **Labores**: trabajos de campo (potrero, área, tipo de labor, horas,
  gasoil), con resumen de horas y gasoil por tipo.
- **Apuntes**: mantenimiento de vehículos y equipos, con aviso de próximos
  vencimientos (30 días) arriba de la tabla.

Con esto ya está todo lo que tenía la planilla Excel, ahora como app.

## Probarla ya, sin configurar nada

La app funciona en **"modo local"** apenas la abrís: guarda los datos en
este navegador (localStorage) sin necesitar Firebase. Sirve para probar
todo el funcionamiento, pero **no sincroniza entre aparatos** y si borrás
los datos del navegador, se pierde.

Para probarla en tu computadora:

1. Abrí una terminal en esta carpeta.
2. Corré: `python3 -m http.server 8000` (o cualquier servidor local; no se
   puede abrir el `index.html` haciendo doble clic porque el navegador
   bloquea los módulos JS si no vienen de un servidor).
3. Andá a `http://localhost:8000` en el navegador.

## Pasar a modo "de verdad" (sincronizado entre tus aparatos)

Cuando quieras que los datos se sincronicen solos entre tu Mac, celular e
iPad (como en Registro Mangas GD):

1. Andá a [console.firebase.google.com](https://console.firebase.google.com)
   y creá un proyecto nuevo (ej: `campo-gd`).
2. Adentro del proyecto: **Compilación → Firestore Database → Crear base de
   datos** (modo producción, región `southamerica-east1` u otra cercana).
3. **Configuración del proyecto** (ícono de tuerca) → **Tus apps** → ícono
   `</>` (Web) → registrá una app → copiá el objeto `firebaseConfig`.
4. Pegalo en `js/firebase-config.js`, reemplazando los valores de ejemplo.
5. En **Firestore → Reglas**, para arrancar rápido:
   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if true;
       }
     }
   }
   ```
   (Más adelante podemos sumarle usuario/clave si querés restringir el
   acceso.)
6. Recargá la app — el cartel de arriba a la derecha va a decir
   "Sincronizado" en vez de "Modo local".

Los datos que ya hayas cargado en modo local **no se migran solos** a
Firebase (quedan guardados aparte, en este navegador). Si ya cargaste datos
de prueba y querés arrancar limpio en Firebase, no hace falta hacer nada
más que configurar el paso de arriba.

## Publicarla en GitHub Pages

Igual que con Registro Mangas GD:

1. Creá un repositorio nuevo en GitHub (ej: `campo-gd-app`).
2. Subí el contenido de esta carpeta (`index.html`, `css/`, `js/`,
   `assets/`).
3. Configuración del repo → **Pages** → Source: rama `main`, carpeta `/
   (root)`.
4. En unos minutos queda publicada en
   `https://TU_USUARIO.github.io/campo-gd-app/`.

## Estructura de archivos

```
index.html          — página principal, arma la barra de navegación
css/style.css        — estilos (colores, tipografía, layout)
js/firebase-config.js — tus credenciales de Firebase (editar acá)
js/db.js              — capa de datos (Firestore o localStorage)
js/utils.js            — funciones y listas compartidas (categorías, formato, etc.)
js/ingresos.js          — vista de Ingresos
js/egresos.js            — vista de Egresos
js/dashboard.js           — vista de Dashboard (KPIs y gráficos)
js/flujocaja.js            — vista de Flujo de Caja Proyectado
js/presupuesto.js           — vista de Presupuesto vs Real
js/escenarios.js              — vista de Escenarios de Precio
js/pesadas.js                   — vista de Pesadas (con GDP)
js/existencias.js                — vista de Existencias (stock, hectáreas, carga animal)
js/lotes.js                        — vista de Lotes de Ganado (compra-venta, márgenes)
js/lluvias.js                        — vista de Lluvias (con grilla mensual)
js/labores.js                          — vista de Labores (con resumen por tipo)
js/apuntes.js                            — vista de Apuntes (mantenimiento)
js/app.js                                  — navegación entre vistas
assets/logo_gd.png                          — tu logo
```
