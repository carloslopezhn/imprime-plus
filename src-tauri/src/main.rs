#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod printing;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            printing::list_printers,
            printing::print_pages,
            printing::open_printer_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
