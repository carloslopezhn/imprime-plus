# Firma de código Windows — opciones y decisión pendiente

> Estado: **PENDIENTE DE DECISIÓN** (A vs B, ver abajo). Documentado 2026-10-18 para retomar después.
> Hoy el instalador se distribuye **sin firma de editor** (solo el updater va firmado con minisign, que
> es otra cosa: ver más abajo). Windows SmartScreen muestra "editor desconocido" y Defender puede marcar
> falso positivo.

## El problema son DOS cosas distintas

1. **SmartScreen** ("Windows protegió su PC / editor desconocido") → es por **reputación**, no solo por
   tener firma. Un certificado barato (OV) o Azure Trusted Signing **igual advierte** hasta que el binario
   acumula descargas. Solo un cert **EV** daba reputación instantánea.
2. **Defender lo marca como "virus"** → **falso positivo heurístico** (los instaladores NSIS de Tauri lo
   disparan seguido). Se arregla aparte y **gratis** reportándolo a Microsoft.

"Otros no pagan y les funciona" = usan una vía gratis de abajo **+ reputación**, no un cert pago.

## Firma de updater ≠ firma de editor (OJO, no confundir)

- El **updater de Tauri** ya está firmado con **minisign** (clave en `~/.secrets/imprime-updater.key` del T40
  y como repo secrets `TAURI_SIGNING_PRIVATE_KEY` / `..._PASSWORD`). Eso solo sirve para que la app valide
  que un update viene de nosotros. **NO** tiene nada que ver con SmartScreen/Defender.
- La **firma de editor** (Authenticode, la que quita la advertencia de Windows) es lo que falta y lo que
  trata este documento.

## Opciones evaluadas (datos a 2026-10-18)

| Opción | Costo | Sirve para | Estado para nosotros |
|---|---|---|---|
| **EV certificate** | ~$300-600/año + token HSM | trust público **instantáneo** | Pago. Única vía de trust instantáneo público. |
| **Azure Trusted Signing** | ~$9.99/mes | público (reputación, no instantáneo) | **VETADO**: solo orgs/individuos de EE.UU. y Canadá. UTP = Honduras → no elegible. |
| **SignPath Foundation (OSS)** | **Gratis** | público (cert OV real) | **BLOQUEADO** por dependencia propietaria (ver abajo). |
| **Autofirmado + Trusted Publishers** | **Gratis** | **solo máquinas que administramos** | Viable ya. 0 advertencias en PCs donde instalemos el `.cer`. Inútil para público anónimo. |
| **Reportar falso positivo a Microsoft** | **Gratis** | quita el "es virus" de Defender (todos) | Hacer siempre. Formulario Microsoft Security Intelligence. |
| **Reputación SmartScreen** | Gratis | público (con el tiempo) | Binario estable + misma identidad → la advertencia se va con descargas. |

## Bloqueador de SignPath (el cert público gratis)

`@imgly/background-removal` (función "quitar fondo" del editor) tiene **licencia propietaria**
(`"SEE LICENSE IN LICENSE.md"`, SDK comercial de img.ly). SignPath Foundation exige "sin componentes
propietarios no-open-source" → **mientras esté esa dependencia, no calificamos**. El repo ya es público y
MIT; el único componente que descalifica es ese.

- Se usa en: `bundle-bg-removal.js` + `src/js/editor.js` (`window.imglyRemoveBackground`, ~líneas 1314-1336)
  + `<script src="js/bg-removal.js">` en `src/index.html`. Es **una sola feature opcional**, removible.

## Decisión pendiente (para distribución libre / público)

- **Opción A — soltar `@imgly`** (perder "quitar fondo", o reemplazarla por alternativa OSS) → repo 100% OSS
  → aplicar a **SignPath Foundation** → **firma pública gratis** que cubre máquinas propias **y** público con
  un solo instalador. Requisitos SignPath: build automatizado (ya lo tenemos en Actions ✅), página con el
  término **"Code signing policy"** + atribución *"Free code signing provided by SignPath.io, certificate by
  SignPath Foundation"*, y disclosure de roles del equipo. La aprobación es manual (días).
- **Opción B — mantener `@imgly`** → para público: (1) reportar falso positivo a Microsoft + (2) construir
  reputación SmartScreen con el tiempo; trust instantáneo público solo con **EV** (pago).

## Lo que se puede hacer YA (gratis, independiente de A/B, pendiente de ejecutar)

1. **Firmar el `.exe` con cert autofirmado en el CI** + **script/GPO** para confiar el `.cer` en
   "Editores de confianza" de las máquinas de UTP → arregla por completo las **máquinas propias**.
   - Generar PFX autofirmado, guardarlo como repo secret, y agregar un paso `signtool` tras `npx tauri build`
     en `.github/workflows/build-windows.yml` (o `bundle.windows.certificateThumbprint` / `signCommand`).
2. **Reportar el instalador a Microsoft** como falso positivo (Microsoft Security Intelligence) → quita el
   "es virus" de Defender para todos.

## Cómo retomar

- Si A: quitar `@imgly` del bundle + build, publicar `docs/code-signing-policy` en el sitio, aplicar en
  https://about.signpath.io/product/open-source, y cuando aprueben cambiar el paso de firma del workflow.
- Si B / interino: implementar los puntos 1 y 2 de arriba (gratis).

## Fuentes

- SignPath OSS: https://about.signpath.io/product/open-source · https://signpath.org/terms
- Azure Trusted Signing: https://azure.microsoft.com/products/trusted-signing
- Microsoft code signing options: https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options
