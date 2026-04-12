# 🖨️ Imprime+

**Editor de impresión de imágenes para escritorio** — Diseña layouts profesionales de fotos y envíalos directamente a tu impresora.

[![Versión](https://img.shields.io/badge/versión-1.4.2-blue.svg)](https://imprime.utp.hn)
[![Tauri](https://img.shields.io/badge/Tauri-v2-orange.svg)](https://tauri.app)
[![Plataforma](https://img.shields.io/badge/plataforma-Windows-lightgrey.svg)]()
[![Licencia](https://img.shields.io/badge/licencia-MIT-green.svg)](LICENSE)

---

## 📋 Descripción

**Imprime+** es una aplicación de escritorio ligera construida con [Tauri v2](https://tauri.app) que permite importar múltiples imágenes, organizarlas en layouts configurables, aplicar estilos visuales y enviarlas a imprimir directamente desde la aplicación. Incluye actualizaciones automáticas a través de un servidor propio.

**Ideal para:** Estudios fotográficos, imprentas, fotógrafos de eventos, y cualquier persona que necesite imprimir fotos con layouts personalizados.

---

## ✨ Características

### Gestión de imágenes
- **Arrastrar y soltar** imágenes directamente al editor
- **Pegar desde portapapeles** con `Ctrl+V`
- **Importación masiva** de múltiples imágenes
- **Selección múltiple** con `Ctrl+Clic`
- **Inspector individual** para editar propiedades por imagen (zoom, rotación, offset, título)
- **Menú contextual** para duplicar, rotar y eliminar

### Modos de distribución

| Modo | Descripción |
|------|-------------|
| **Cuadrícula** | Define filas × columnas manualmente |
| **Cantidad** | Indica cuántas imágenes por página y el motor calcula la cuadrícula óptima |
| **Tamaño** | Define dimensiones exactas (ancho × alto) y las imágenes fluyen automáticamente |

### Modo Póster 🆕
- Divide una sola imagen en múltiples páginas (hasta 4×4 = 16 páginas)
- Vista previa en tiempo real con cuadrícula y numeración de páginas
- Impresión directa de todas las páginas del póster

### Configuración de página
- **Presets incluidos:** Carta, Legal, A4, A5, 4×6", 5×7"
- **Presets personalizados:** Guarda y elimina tus propios tamaños
- **Unidades:** Centímetros, pulgadas, milímetros
- **Orientación:** Vertical / Horizontal
- **Guías de corte** opcionales
- **Márgenes** independientes (arriba, derecha, abajo, izquierda)
- **Espaciado** horizontal y vertical con opción de vincular

### Estilos de imagen (global y por imagen)

**Formas disponibles:**
- Rectángulo, Redondeado, Circular, Hexágono, Estrella

**Opciones de estilo:**
- Borde configurable (ancho y color)
- Radio de esquinas
- Sombra (ninguna, suave, media, fuerte)
- Ajuste de imagen: Cubrir, Contener, Estirar
- Color de fondo por celda
- Alineación horizontal y vertical

### Títulos / Captions
- **Posición:** Debajo, arriba o superpuesto sobre la imagen
- **Fuentes:** Arial, Georgia, Courier, Times New Roman, Verdana, Impact
- **Personalización:** Tamaño, color de texto, color de fondo, sombra
- **Fuentes de texto:** Nombre del archivo, numeración automática, texto manual

### Impresión nativa
- Selección de impresora del sistema (locales y de red)
- Acceso directo a configuración de impresora de Windows
- Ajuste de número de copias
- Renderizado a JPEG de alta calidad
- Impresión nativa vía Windows GDI+ (desde Rust)

### Navegación y zoom
- Controles de zoom: 100%, +, −, Ajustar a ventana
- Navegación de páginas: Primera, anterior, siguiente, última
- Indicador visual de página actual

### Persistencia
- Configuración guardada automáticamente en `AppData` (vía Tauri FS)
- Fallback a `localStorage` si no hay acceso al sistema de archivos

### Actualizaciones automáticas
- Verificación automática al iniciar la aplicación
- Descarga e instalación silenciosa del instalador NSIS
- Verificación de firma digital para seguridad

---

## 🛠️ Stack tecnológico

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
| Rust | Backend nativo (impresión, sistema de archivos) |
| tauri-plugin-fs | Acceso al sistema de archivos |
| tauri-plugin-updater | Actualizaciones automáticas |
| tauri-plugin-process | Gestión de procesos |

### Servidor de actualizaciones
| Tecnología | Uso |
|-----------|-----|
| Python / Flask | API REST y página de descarga |
| MySQL (PyMySQL) | Almacenamiento de presets personalizados |
| Gunicorn | Servidor WSGI de producción |
| Docker | Contenedorización del servidor |

---

## 📁 Estructura del proyecto

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
│   │   └── printing.rs         # Módulo de impresión nativa (GDI+)
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
├── deploy.ps1                  # Script de despliegue
├── latest.json                 # Metadatos de última versión
└── package.json                # Scripts npm
```

---

## 🚀 Desarrollo

### Requisitos previos
- [Node.js](https://nodejs.org/) (v18+)
- [Rust](https://www.rust-lang.org/tools/install) (stable)
- [Tauri CLI](https://tauri.app/start/) v2
- Windows 10/11 (para impresión nativa GDI+)

### Instalación

```bash
# Clonar el repositorio
git clone https://github.com/carloslopezhn/imprime-plus.git
cd imprime-plus

# Instalar dependencias
npm install
```

### Modo desarrollo

```bash
npm run dev
```

Esto inicia la aplicación con recarga en caliente para el frontend.

### Compilar para producción

```bash
# Establecer la clave de firma para el actualizador
$env:TAURI_SIGNING_PRIVATE_KEY = (Get-Content ".\.tauri\keys.key" -Raw)
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""

# Compilar
npx tauri build
```

**Archivos generados:**
- `src-tauri/target/release/bundle/nsis/Imprime+_1.4.2_x64-setup.exe` — Instalador NSIS
- `src-tauri/target/release/bundle/nsis/Imprime+_1.4.2_x64-setup.nsis.zip.sig` — Firma digital

---

## 🌐 Servidor de actualizaciones

El servidor de actualizaciones se ejecuta en Docker y provee:

- **Página de descarga:** `https://imprime.utp.hn`
- **API de actualización:** `GET /api/update/{target}/{arch}/{version}`
- **API de presets:** `GET/POST/DELETE /api/presets`
- **Descargas directas:** `GET /downloads/{filename}`

### Despliegue del servidor

```bash
cd server
docker compose build web
docker compose up -d
```

---

## 📦 Despliegue completo

El proceso de release incluye:

1. **Incrementar versión** en `tauri.conf.json` y `Cargo.toml`
2. **Compilar** con firma digital (`npx tauri build`)
3. **Subir archivos** al servidor (instalador + firma + `latest.json`)
4. **Reconstruir contenedor** Docker del servidor
5. **Commit y push** a GitHub

---

## 🖥️ Capturas de pantalla

La interfaz cuenta con un diseño de tres paneles:

- **Panel izquierdo:** Configuración de página, layout, estilos y modo póster
- **Canvas central:** Vista previa en tiempo real de las páginas
- **Panel derecho:** Inspector de imagen seleccionada o vista previa de póster

---

## 📄 Licencia

Este proyecto está bajo la licencia MIT. Ver el archivo [LICENSE](LICENSE) para más detalles.

---

## 👥 Autores

**UTP Honduras** — [utp.hn](https://utp.hn)

---

<p align="center">
  Hecho con ❤️ en Honduras 🇭🇳
</p>
