// ============================================================
// CONFIGURACIÓN DE FIREBASE
// ============================================================
// 1. Andá a https://console.firebase.google.com
// 2. Creá un proyecto nuevo (ej: "campo-gd")
// 3. Dentro del proyecto: "Compilación" > "Firestore Database" > "Crear base de datos"
//    (elegí modo producción, región la que te quede más cerca, ej southamerica-east1)
// 4. Configuración del proyecto (ícono de tuerca) > "Tus apps" > ícono "</>" (Web)
//    Registrá una app, y copiá el objeto firebaseConfig que te muestra ahí abajo,
//    reemplazando el de acá.
// 5. En Firestore > Reglas, para arrancar rápido podés usar (después las podemos
//    ajustar para que pidan usuario/clave):
//
//    rules_version = '2';
//    service cloud.firestore {
//      match /databases/{database}/documents {
//        match /{document=**} {
//          allow read, write: if true;
//        }
//      }
//    }
//
// Si dejás los valores de acá abajo sin cambiar, la app arranca igual pero
// en "modo local": los datos se guardan solo en este navegador (no se
// sincronizan entre aparatos). Es útil para probar la app antes de configurar
// Firebase de verdad.
// ============================================================

export const firebaseConfig = {
  apiKey: "AIzaSyBpxmGY4yC061Kyg6TzS7cBkNTRDrd95y4",
  authDomain: "campo-gd-gestion.firebaseapp.com",
  projectId: "campo-gd-gestion",
  storageBucket: "campo-gd-gestion.firebasestorage.app",
  messagingSenderId: "977190089240",
  appId: "1:977190089240:web:54f5dd1f4a34cfa088096d"
};

export const FIREBASE_CONFIGURADO = firebaseConfig.apiKey !== "TU_API_KEY";
