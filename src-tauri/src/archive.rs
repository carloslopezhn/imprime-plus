use base64::Engine as Base64Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use serde::Serialize;
use std::io::Read;
use std::path::Path;

#[derive(Serialize)]
pub struct ArchiveEntry {
    pub name: String,
    pub data_url: String,
}

const IMAGE_EXTS: &[&str] = &[
    "jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "avif", "heic", "heif",
];

fn is_image_filename(name: &str) -> bool {
    let lower = name.to_lowercase();
    let base = lower.split('/').last().unwrap_or(&lower)
                    .split('\\').last().unwrap_or(&lower);
    if base.starts_with('.') { return false; }
    if lower.contains("__macosx/") { return false; }
    let ext = base.rsplit('.').next().unwrap_or("");
    IMAGE_EXTS.contains(&ext)
}

fn mime_type(name: &str) -> &'static str {
    match name.to_lowercase().rsplit('.').next().unwrap_or("") {
        "png"         => "image/png",
        "gif"         => "image/gif",
        "webp"        => "image/webp",
        "bmp"         => "image/bmp",
        "tiff" | "tif"=> "image/tiff",
        _             => "image/jpeg",
    }
}

fn make_data_url(bytes: &[u8], name: &str) -> String {
    format!("data:{};base64,{}", mime_type(name), BASE64.encode(bytes))
}

fn path_basename(s: &str) -> String {
    s.replace('\\', "/")
     .split('/')
     .filter(|p| !p.is_empty())
     .last()
     .unwrap_or(s)
     .to_string()
}

fn unique_id() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}

// ---- ZIP ----
fn extract_zip(data: &[u8]) -> Result<Vec<ArchiveEntry>, String> {
    let cursor = std::io::Cursor::new(data);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        if file.is_dir() { continue; }
        let raw_name = file.name().to_string();
        if !is_image_filename(&raw_name) { continue; }
        let mut bytes = Vec::new();
        file.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        let bn = path_basename(&raw_name);
        entries.push(ArchiveEntry { data_url: make_data_url(&bytes, &bn), name: bn });
    }
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(entries)
}

// ---- TAR variants ----
fn extract_tar_entries<R: Read>(mut archive: tar::Archive<R>) -> Result<Vec<ArchiveEntry>, String> {
    let mut entries = Vec::new();
    for entry in archive.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        let raw = entry.path().map_err(|e| e.to_string())?.to_string_lossy().to_string();
        if !is_image_filename(&raw) { continue; }
        let mut bytes = Vec::new();
        entry.read_to_end(&mut bytes).map_err(|e| e.to_string())?;
        let bn = path_basename(&raw);
        entries.push(ArchiveEntry { data_url: make_data_url(&bytes, &bn), name: bn });
    }
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(entries)
}

fn extract_tar(data: &[u8]) -> Result<Vec<ArchiveEntry>, String> {
    extract_tar_entries(tar::Archive::new(std::io::Cursor::new(data)))
}

fn extract_tar_gz(data: &[u8]) -> Result<Vec<ArchiveEntry>, String> {
    let dec = flate2::read::GzDecoder::new(std::io::Cursor::new(data));
    extract_tar_entries(tar::Archive::new(dec))
}

fn extract_tar_bz2(data: &[u8]) -> Result<Vec<ArchiveEntry>, String> {
    let dec = bzip2::read::BzDecoder::new(std::io::Cursor::new(data));
    extract_tar_entries(tar::Archive::new(dec))
}

fn extract_tar_xz(data: &[u8]) -> Result<Vec<ArchiveEntry>, String> {
    let mut decompressed = Vec::new();
    lzma_rs::xz_decompress(&mut std::io::Cursor::new(data), &mut decompressed)
        .map_err(|e| e.to_string())?;
    extract_tar_entries(tar::Archive::new(std::io::Cursor::new(decompressed)))
}

// ---- Directory walker (used by 7Z and RAR) ----
fn collect_from_dir(dir: &Path, entries: &mut Vec<ArchiveEntry>) {
    let Ok(read) = std::fs::read_dir(dir) else { return; };
    for item in read.flatten() {
        let path = item.path();
        if path.is_dir() {
            collect_from_dir(&path, entries);
        } else {
            let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            if is_image_filename(&name) {
                if let Ok(bytes) = std::fs::read(&path) {
                    entries.push(ArchiveEntry { data_url: make_data_url(&bytes, &name), name });
                }
            }
        }
    }
}

// ---- 7Z ----
fn extract_7z(data: &[u8]) -> Result<Vec<ArchiveEntry>, String> {
    let id = unique_id();
    let tmp = std::env::temp_dir();
    let arc = tmp.join(format!("imprime_{}.7z", id));
    let out = tmp.join(format!("imprime_{}_out", id));

    std::fs::write(&arc, data).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;

    let result: Result<Vec<ArchiveEntry>, String> = (|| {
        sevenz_rust::decompress_file(&arc, &out).map_err(|e| e.to_string())?;
        let mut entries = Vec::new();
        collect_from_dir(&out, &mut entries);
        entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(entries)
    })();

    let _ = std::fs::remove_file(&arc);
    let _ = std::fs::remove_dir_all(&out);
    result
}

// ---- RAR ----
fn extract_rar(data: &[u8]) -> Result<Vec<ArchiveEntry>, String> {
    let id = unique_id();
    let tmp = std::env::temp_dir();
    let arc = tmp.join(format!("imprime_{}.rar", id));
    let out = tmp.join(format!("imprime_{}_out", id));

    std::fs::write(&arc, data).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;

    let result: Result<Vec<ArchiveEntry>, String> = (|| {
        let mut archive = unrar::Archive::new(&arc)
            .open_for_processing()
            .map_err(|e| format!("RAR: {:?}", e))?;

        loop {
            match archive.read_header() {
                Ok(Some(header)) => {
                    let fname = header.entry().filename.to_string_lossy().to_string();
                    archive = if header.entry().is_file() && is_image_filename(&fname) {
                        header.extract_to(&out).map_err(|e| format!("RAR extract: {:?}", e))?
                    } else {
                        header.skip().map_err(|e| format!("RAR skip: {:?}", e))?
                    };
                }
                Ok(None) => break,
                Err(e) => return Err(format!("RAR header: {:?}", e)),
            }
        }

        let mut entries = Vec::new();
        collect_from_dir(&out, &mut entries);
        entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        Ok(entries)
    })();

    let _ = std::fs::remove_file(&arc);
    let _ = std::fs::remove_dir_all(&out);
    result
}

// ---- Tauri command ----
#[tauri::command]
pub fn extract_archive(path: String) -> Result<Vec<ArchiveEntry>, String> {
    let data = std::fs::read(&path)
        .map_err(|e| format!("No se pudo leer el archivo: {}", e))?;

    let lower = path.to_lowercase();

    if lower.ends_with(".zip") {
        extract_zip(&data)
    } else if lower.ends_with(".tar.gz") || lower.ends_with(".tgz") {
        extract_tar_gz(&data)
    } else if lower.ends_with(".tar.bz2") || lower.ends_with(".tbz2") {
        extract_tar_bz2(&data)
    } else if lower.ends_with(".tar.xz") || lower.ends_with(".txz") {
        extract_tar_xz(&data)
    } else if lower.ends_with(".tar") {
        extract_tar(&data)
    } else if lower.ends_with(".7z") {
        extract_7z(&data)
    } else if lower.ends_with(".rar") {
        extract_rar(&data)
    } else {
        Err(format!("Formato no soportado. Usa ZIP, RAR, 7Z, TAR, TAR.GZ, TAR.BZ2 o TAR.XZ."))
    }
}
