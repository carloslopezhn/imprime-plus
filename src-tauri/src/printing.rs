use serde::{Deserialize, Serialize};
use base64::Engine as Base64Engine;
use base64::engine::general_purpose::STANDARD as BASE64;
use std::ffi::c_void;

// ---- Windows FFI types ----

type DWORD = u32;

#[repr(C)]
struct DOCINFOW {
    cb_size: i32,
    doc_name: *const u16,
    output: *const u16,
    datatype: *const u16,
    fw_type: DWORD,
}

#[repr(C)]
struct PRINTER_INFO_1W {
    flags: DWORD,
    description: *mut u16,
    name: *mut u16,
    comment: *mut u16,
}

#[repr(C)]
struct BITMAPINFOHEADER {
    size: DWORD,
    width: i32,
    height: i32,
    planes: u16,
    bit_count: u16,
    compression: DWORD,
    size_image: DWORD,
    x_pels: i32,
    y_pels: i32,
    clr_used: DWORD,
    clr_important: DWORD,
}

const BI_RGB: DWORD = 0;
const SRCCOPY: DWORD = 0x00CC0020;
const DIB_RGB_COLORS: u32 = 0;
const HORZRES: i32 = 8;
const VERTRES: i32 = 10;
const PRINTER_ENUM_LOCAL: DWORD = 2;
const PRINTER_ENUM_CONNECTIONS: DWORD = 4;

#[link(name = "gdi32")]
extern "system" {
    fn CreateDCW(driver: *const u16, device: *const u16, output: *const u16, initdata: *const c_void) -> isize;
    fn DeleteDC(hdc: isize) -> i32;
    fn StartDocW(hdc: isize, lpdi: *const DOCINFOW) -> i32;
    fn EndDoc(hdc: isize) -> i32;
    fn StartPage(hdc: isize) -> i32;
    fn EndPage(hdc: isize) -> i32;
    fn GetDeviceCaps(hdc: isize, index: i32) -> i32;
    fn StretchDIBits(
        hdc: isize, x_dest: i32, y_dest: i32, dest_w: i32, dest_h: i32,
        x_src: i32, y_src: i32, src_w: i32, src_h: i32,
        bits: *const c_void, bmi: *const BITMAPINFOHEADER,
        usage: u32, rop: DWORD,
    ) -> i32;
}

#[link(name = "winspool")]
extern "system" {
    fn EnumPrintersW(
        flags: DWORD, name: *const u16, level: DWORD,
        buf: *mut u8, cb_buf: DWORD,
        needed: *mut DWORD, returned: *mut DWORD,
    ) -> i32;
    fn GetDefaultPrinterW(buf: *mut u16, size: *mut DWORD) -> i32;
}

// ---- Helpers ----

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

unsafe fn pwstr_to_string(p: *mut u16) -> String {
    if p.is_null() { return String::new(); }
    let len = (0..).take_while(|&i| *p.add(i) != 0).count();
    String::from_utf16_lossy(std::slice::from_raw_parts(p, len))
}

// ---- Tauri Commands ----

#[derive(Serialize, Clone)]
pub struct PrinterInfo {
    pub name: String,
    pub is_default: bool,
}

#[tauri::command]
pub fn list_printers() -> Vec<PrinterInfo> {
    unsafe {
        let flags = PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS;
        let mut needed: DWORD = 0;
        let mut returned: DWORD = 0;

        EnumPrintersW(flags, std::ptr::null(), 1, std::ptr::null_mut(), 0, &mut needed, &mut returned);
        if needed == 0 { return vec![]; }

        let mut buffer = vec![0u8; needed as usize];
        let ok = EnumPrintersW(flags, std::ptr::null(), 1, buffer.as_mut_ptr(), needed, &mut needed, &mut returned);
        if ok == 0 { return vec![]; }

        let printers = std::slice::from_raw_parts(
            buffer.as_ptr() as *const PRINTER_INFO_1W,
            returned as usize,
        );

        let mut def_buf = [0u16; 256];
        let mut def_size = def_buf.len() as DWORD;
        let default_name = if GetDefaultPrinterW(def_buf.as_mut_ptr(), &mut def_size) != 0 {
            String::from_utf16_lossy(&def_buf[..def_size.saturating_sub(1) as usize])
        } else {
            String::new()
        };

        printers.iter().map(|p| {
            let name = pwstr_to_string(p.name);
            PrinterInfo { is_default: name == default_name, name }
        }).collect()
    }
}

#[derive(Deserialize)]
pub struct PrintRequest {
    pub printer: String,
    pub copies: u32,
    pub pages: Vec<String>,
}

#[tauri::command]
pub fn print_pages(request: PrintRequest) -> Result<String, String> {
    if request.pages.is_empty() {
        return Err("No hay paginas para imprimir".into());
    }
    if request.printer.is_empty() {
        return Err("No se especifico impresora".into());
    }

    let mut decoded: Vec<image::RgbaImage> = Vec::new();
    for (i, b64) in request.pages.iter().enumerate() {
        let bytes = BASE64.decode(b64)
            .map_err(|e| format!("Error base64 pagina {}: {}", i + 1, e))?;
        let img = image::load_from_memory_with_format(&bytes, image::ImageFormat::Jpeg)
            .map_err(|e| format!("Error JPEG pagina {}: {}", i + 1, e))?;
        decoded.push(img.to_rgba8());
    }

    let copies = request.copies.max(1);

    unsafe {
        let printer_w = to_wide(&request.printer);
        let hdc = CreateDCW(std::ptr::null(), printer_w.as_ptr(), std::ptr::null(), std::ptr::null());
        if hdc == 0 {
            return Err(format!("No se pudo abrir '{}'", request.printer));
        }

        let paper_w = GetDeviceCaps(hdc, HORZRES);
        let paper_h = GetDeviceCaps(hdc, VERTRES);

        let doc_name_w = to_wide("Imprime+");
        let doc_info = DOCINFOW {
            cb_size: std::mem::size_of::<DOCINFOW>() as i32,
            doc_name: doc_name_w.as_ptr(),
            output: std::ptr::null(),
            datatype: std::ptr::null(),
            fw_type: 0,
        };

        for _ in 0..copies {
            if StartDocW(hdc, &doc_info) <= 0 {
                DeleteDC(hdc);
                return Err("Error al iniciar documento".into());
            }

            for (pi, page_img) in decoded.iter().enumerate() {
                if StartPage(hdc) <= 0 {
                    EndDoc(hdc);
                    DeleteDC(hdc);
                    return Err(format!("Error pagina {}", pi + 1));
                }

                let iw = page_img.width() as i32;
                let ih = page_img.height() as i32;

                let bmi = BITMAPINFOHEADER {
                    size: std::mem::size_of::<BITMAPINFOHEADER>() as DWORD,
                    width: iw,
                    height: -ih,
                    planes: 1,
                    bit_count: 32,
                    compression: BI_RGB,
                    size_image: 0,
                    x_pels: 0,
                    y_pels: 0,
                    clr_used: 0,
                    clr_important: 0,
                };

                let mut bgra = Vec::with_capacity((iw as usize) * (ih as usize) * 4);
                for px in page_img.pixels() {
                    bgra.push(px[2]);
                    bgra.push(px[1]);
                    bgra.push(px[0]);
                    bgra.push(px[3]);
                }

                StretchDIBits(
                    hdc, 0, 0, paper_w, paper_h,
                    0, 0, iw, ih,
                    bgra.as_ptr() as *const c_void,
                    &bmi, DIB_RGB_COLORS, SRCCOPY,
                );

                EndPage(hdc);
            }

            EndDoc(hdc);
        }

        DeleteDC(hdc);
    }

    let total = request.pages.len() * copies as usize;
    Ok(format!("{} pagina(s) enviadas a '{}'", total, request.printer))
}

#[tauri::command]
pub fn open_printer_config(printer: String) -> Result<String, String> {
    if printer.is_empty() {
        return Err("No se especifico impresora".into());
    }
    std::process::Command::new("rundll32")
        .args(&["printui.dll,PrintUIEntry", "/e", "/n", &printer])
        .status()
        .map_err(|e| format!("Error al abrir configuracion: {}", e))?;
    Ok("ok".into())
}
