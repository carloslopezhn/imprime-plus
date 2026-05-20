#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod printing;
mod archive;

use tauri::{Emitter, Manager};
use base64::{Engine as _, engine::general_purpose};
use tauri_plugin_updater::UpdaterExt;

// ─── Version ─────────────────────────────────────────────────────────────────

#[tauri::command]
fn get_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

// ─── Updater ─────────────────────────────────────────────────────────────────

/// Consulta el servidor directamente (Rust HTTP, sin CORS) y compara versiones.
/// Devuelve el JSON del servidor si hay actualización, null si está al día,
/// o lanza error con mensaje legible si hay problema de red.
#[tauri::command]
async fn check_update(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
    // Usamos el UpdaterExt de Tauri que ya tiene la URL y pubkey configuradas.
    // Hacemos el check desde Rust para obtener errores reales (el wrapper JS los traga).
    let updater = app.updater().map_err(|e| e.to_string())?;

    match updater.check().await {
        Ok(Some(update)) => Ok(Some(serde_json::json!({
            "version":         update.version.to_string(),
            "current_version": update.current_version.to_string(),
            "notes":           update.body.clone().unwrap_or_default(),
        }))),
        Ok(None) => Ok(None),
        Err(e) => {
            let msg = e.to_string();
            // Detectar error de red para mensaje amigable
            if msg.contains("dns") || msg.contains("connect") || msg.contains("timeout")
                || msg.contains("network") || msg.contains("tcp")
            {
                Err("sin_conexion".to_string())
            } else {
                Err(msg)
            }
        }
    }
}

/// Descarga e instala la actualización emitiendo eventos de progreso al frontend.
/// Usa el motor oficial de Tauri (verifica firma minisign automáticamente).
#[tauri::command]
async fn do_install_update(app: tauri::AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;

    let update = updater
        .check()
        .await
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "No hay actualización disponible".to_string())?;

    let handle = app.clone();
    let handle2 = app.clone();
    let downloaded = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
    let downloaded2 = downloaded.clone();

    update
        .download_and_install(
            move |chunk, content_length| {
                let d = downloaded.fetch_add(chunk as u64, std::sync::atomic::Ordering::Relaxed)
                    + chunk as u64;
                let pct = content_length
                    .map(|t| if t > 0 { (d * 100 / t).min(99) as u8 } else { 0 })
                    .unwrap_or(0);
                let _ = handle.emit(
                    "update-progress",
                    serde_json::json!({ "percent": pct, "downloaded": d }),
                );
            },
            move || {
                let _ = handle2
                    .emit("update-progress", serde_json::json!({ "percent": 100, "done": true }));
            },
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

/// Abre una URL en el navegador predeterminado del sistema.
#[tauri::command]
fn open_url(url: String) {
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("cmd")
        .args(["/c", "start", "", &url])
        .spawn();
}

// ─── Startup files ───────────────────────────────────────────────────────────

#[tauri::command]
fn get_startup_files() -> Vec<String> {
    std::env::args()
        .skip(1)
        .filter(|a| !a.starts_with("--"))
        .collect()
}

#[tauri::command]
fn read_image_files(paths: Vec<String>) -> Vec<serde_json::Value> {
    const IMAGE_EXTS: &[&str] = &["jpg", "jpeg", "png", "gif", "bmp", "webp", "tiff", "tif"];
    let mut result = Vec::new();
    for path in paths {
        let p = std::path::Path::new(&path);
        let ext = p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();
        if !IMAGE_EXTS.contains(&ext.as_str()) {
            continue;
        }
        if let Ok(bytes) = std::fs::read(&path) {
            let mime = match ext.as_str() {
                "jpg" | "jpeg" => "image/jpeg",
                "png"          => "image/png",
                "gif"          => "image/gif",
                "bmp"          => "image/bmp",
                "webp"         => "image/webp",
                "tiff" | "tif" => "image/tiff",
                _              => "image/jpeg",
            };
            let b64 = general_purpose::STANDARD.encode(&bytes);
            let name = p
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("imagen")
                .to_string();
            result.push(serde_json::json!({
                "name":     name,
                "data_url": format!("data:{};base64,{}", mime, b64),
            }));
        }
    }
    result
}

// ─── Entry point ─────────────────────────────────────────────────────────────

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _cwd| {
            let files: Vec<String> = args
                .into_iter()
                .skip(1)
                .filter(|a| !a.starts_with("--"))
                .collect();
            if !files.is_empty() {
                let _ = app.emit("open-files", &files);
            }
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            printing::list_printers,
            printing::print_pages,
            printing::open_printer_config,
            archive::extract_archive,
            get_version,
            get_startup_files,
            read_image_files,
            check_update,
            do_install_update,
            open_url,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
