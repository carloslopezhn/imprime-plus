# Imprime+

**Editor de impresión de imágenes para escritorio** — Diseña layouts profesionales de fotos y envíalos directamente a tu impresora.

[![Versión](https://img.shields.io/badge/versión-1.9.2-blue.svg)](https://imprime.utp.hn)
[![Tauri](https://img.shields.io/badge/Tauri-v2-orange.svg)](https://tauri.app)
[![Plataforma](https://img.shields.io/badge/plataforma-Windows-lightgrey.svg)]()
[![Licencia](https://img.shields.io/badge/licencia-MIT-green.svg)](LICENSE)

---

## Descripción

**Imprime+** es una aplicación de escritorio ligera construida con [Tauri v2](https://tauri.app) que permite importar múltiples imágenes, organizarlas en layouts configurables, aplicar estilos visuales y enviarlas a imprimir directamente desde la aplicación. Incluye actualizaciones automáticas y manuales a través de un servidor propio.

**Ideal para:** Estudios fotográficos, imprentas, fotógrafos de eventos, y cualquier persona que necesite imprimir fotos con layouts personalizados.

---

## Descarga

**[Descargar Imprime+ para Windows](https://imprime.utp.hn)**

---

## Características

### Gestión de imágenes
- **Arrastrar y soltar** imágenes directamente al editor
- **Pegar desde portapapeles** con `Ctrl+V`
- **Importación masiva** de múltiples imágenes
- **Archivos comprimidos** ZIP, RAR, 7Z, TAR, TAR.GZ, TAR.BZ2, TAR.XZ — extrae y carga todas las imágenes de una vez
- **Selección múltiple** con `Ctrl+Clic`
- **Inspector individual** por imagen: zoom, rotación, offset, título, forma, borde, filtros
- **Menú contextual** para duplicar, rotar, expandir y eliminar

### Zoom de imagen
- **Zoom interno** con slider del inspector (panel derecho)
- **Zoom con rueda del mouse** directamente sobre la imagen
- **Pan** arrastrando con clic medio o clic izquierdo cuando hay zoom activo
- **Zoom + resize** con `Ctrl + drag` en los handles de redimensión

### Modos de distribución

| Modo | Descripción |
|------|-------------|
| **Cuadrícula** | Define filas × columnas manualmente |
| **Cantidad** | Indica cuántas imágenes por página y el motor calcula la cuadrícula óptima |
| **Tamaño** | Define dimensiones exactas (ancho × alto) y las imágenes fluyen automáticamente |

### Modo Póster
- Divide una sola imagen en múltiples páginas (hasta 4×4 = 16 páginas)
- Vista previa en tiempo real con cuadrícula y numeración de páginas
- Impresión directa de todas las páginas del póster
- Soporte multi-orden para mesas takeout y buffet

### Configuración de página
- **Presets incluidos:** Carta, Legal, A4, A5, 4×6", 5×7"
- **Presets personalizados:** Guarda y elimina tus propios tamaños
- **Unidades:** Centímetros, pulgadas, milímetros
- **Orientación:** Vertical / Horizontal
- **Guías de corte** opcionales
- **Márgenes** independientes (arriba, derecha, abajo, izquierda)
- **Espaciado** horizontal y vertical con opción de vincular

### Estilos de imagen

**Formas disponibles:** Rectángulo, Redondeado, Circular, Hexágono, Estrella

**Opciones de estilo:**
- Borde configurable (ancho y color)
- Radio de esquinas
- Sombra (ninguna, suave, media, fuerte)
- Ajuste de imagen: Cubrir, Contener, Estirar
- Color de fondo por celda
- Alineación horizontal y vertical
- Filtros de imagen: brillo, contraste, saturación, escala de grises, sepia

### Títulos / Captions
- **Posición:** Debajo, arriba o superpuesto sobre la imagen
- **Fuentes:** Arial, Georgia, Courier, Times New Roman, Verdana, Impact
- **Personalización:** Tamaño, color de texto, color de fondo
- **Fuentes de texto:** Nombre del archivo, numeración automática, texto manual

### Impresión nativa
- Selección de impresora del sistema (locales y de red)
- Acceso directo a configuración de impresora de Windows
- Ajuste de número de copias
- Renderizado a JPEG de alta calidad
- Impresión nativa vía Windows GDI+ (desde Rust)

### Actualizaciones
- **Verificación automática** al iniciar la aplicación
- **Botón de actualización manual** en la barra de herramientas
- Descarga con barra de progreso en tiempo real
- Instalación automática y reinicio de la app
- Firma digital verificada en cada actualización

### Persistencia
- Configuración guardada automáticamente en `AppData` (vía Tauri FS)
- Fallback a `localStorage` si no hay acceso al sistema de archivos

---

## Stack tecnológico

### Frontend
| Tecnología | Uso |
|-----------|-----|
| HTML / CSS / JS | Interfaz de usuario sin frameworks |
| Bootstrap Icons 1.11.3 | Iconografía |
| html2canvas | Renderizado de páginas a imagen |
| jsPDF | Generación de PDF |

### Escritorio
| Tecnología | Uso |
|-----------|-----|
| Tauri v2 | Framework de aplicación de escritorio |
| Rust | Backend nativo (impresión, extracción de archivos) |
| tauri-plugin-fs | Acceso al sistema de archivos |
| tauri-plugin-updater | Actualizaciones automáticas |
| tauri-plugin-dialog | Diálogos nativos de archivo |
| tauri-plugin-process | Gestión de procesos |
| zip / tar / sevenz-rust / unrar | Extracción de archivos comprimidos |

### Servidor de actualizaciones
| Tecnología | Uso |
|-----------|-----|
| Python / Flask | API REST y página de descarga |
| MySQL (PyMySQL) | Almacenamiento de presets personalizados |
| Gunicorn | Servidor WSGI de producción |
| Docker | Contenedorización del servidor |

---

## Estructura del proyecto

```
imprime-plus-tauri/
├── src/                        # Frontend de la aplicación
│   ├── index.html              # HTML principal
│   ├── css/
│   │   └── editor.css          # Estilos del editor
│   ├── js/
│   │   ├── editor.js           # Controlador principal del editor
│   │   └── engine.js           # Motor de layout y paginación
│   └── vendor/                 # Librerías de terceros
│       ├── bootstrap-icons-1.11.3/
│       ├── html2canvas/
│       └── jspdf/
├── src-tauri/                  # Backend Rust / Tauri
│   ├── tauri.conf.json         # Configuración de Tauri
│   ├── Cargo.toml              # Dependencias Rust
│   ├── src/
│   │   ├── main.rs             # Punto de entrada y comandos Tauri
│   │   ├── printing.rs         # Módulo de impresión nativa (GDI+)
│   │   └── archive.rs          # Extracción de archivos comprimidos
│   ├── capabilities/           # Permisos de la aplicación
│   └── icons/                  # Iconos de la aplicación
├── server/                     # Servidor de actualizaciones
│   ├── app.py                  # Aplicación Flask
│   ├── wsgi.py                 # Entry point WSGI
│   ├── Dockerfile              # Imagen Docker
│   ├── docker-compose.yml      # Orquestación de servicios
│   ├── requirements.txt        # Dependencias Python
│   └── templates/
│       └── download.html       # Página de descarga pública
├── deploy.ps1                  # Script de despliegue (auto-incrementa versión)
├── latest.json                 # Metadatos de última versión publicada
└── package.json                # Scripts npm
```

---

## Desarrollo

### Requisitos previos
- [Node.js](https://nodejs.org/) v18+
- [Rust](https://www.rust-lang.org/tools/install) stable
- [Tauri CLI](https://tauri.app/start/) v2
- Windows 10/11 (para impresión nativa GDI+)
- Visual Studio Build Tools (MSVC) — requerido por Tauri y algunas dependencias C/C++

### Instalación

```bash
git clone https://github.com/carloslopezhn/imprime-plus.git
cd imprime-plus
npm install
```

### Modo desarrollo

```bash
npm run dev
```

### Compilar para producción

```powershell
$env:CARGO_HOME = "C:\cargo"
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content ".\.tauri\keys.key" -Raw)
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "tu_password"
npx tauri build
```

> **Nota:** La clave de firma (`.tauri/keys.key`) no está incluida en el repositorio por razones de seguridad. Genera la tuya con: `npx tauri signer generate -w .tauri/keys.key --force`

---

## Servidor de actualizaciones

El servidor se ejecuta en Docker y provee:

- **Página de descarga:** `https://imprime.utp.hn`
- **API de actualización:** `GET /api/update/{target}/{arch}/{version}`
- **API de presets:** `GET/POST/DELETE /api/presets`
- **Descargas directas:** `GET /downloads/{filename}`

```bash
cd server
docker compose build web
docker compose up -d
```

---

## Despliegue

El script `deploy.ps1` automatiza el proceso completo:

1. **Auto-incrementa** la versión (patch por defecto, `.\deploy.ps1 -BumpType minor` para minor)
2. **Compila** con firma digital
3. **Sube** el instalador + firma al VPS
4. **Actualiza** `latest.json` en el servidor
5. **Reconstruye** el contenedor Docker
6. **Hace commit y push** del bump de versión a GitHub

```powershell
.\deploy.ps1              # 1.9.2 → 1.9.3
.\deploy.ps1 -BumpType minor   # 1.9.2 → 1.10.0
.\deploy.ps1 -BumpType major   # 1.9.2 → 2.0.0
```

---

## Licencia

Este proyecto está bajo la licencia [MIT](LICENSE).

---

## Autores

**UTP Honduras** — [utp.hn](https://utp.hn)

---

<p align="center">Hecho con corazon en Honduras</p>
