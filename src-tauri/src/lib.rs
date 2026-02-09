use filetime::{FileTime, set_file_mtime};
use tauri::Emitter;
use base64::{Engine as _, engine::general_purpose};
use std::fs;
use std::path::Path;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn set_file_times(files: Vec<String>, timestamp: i64) -> Result<(), String> {
    let time = FileTime::from_unix_time(timestamp, 0);
    for file_path in files {
        set_file_mtime(&file_path, time).map_err(|e| format!("Failed to set time for {}: {}", file_path, e))?;
    }
    Ok(())
}

#[tauri::command]
fn set_file_times_with_interval(files: Vec<String>, base_timestamp: i64, interval_seconds: i64) -> Result<(), String> {
    for (index, file_path) in files.iter().enumerate() {
        let offset = (index as i64) * interval_seconds;
        let timestamp = base_timestamp + offset;
        let time = FileTime::from_unix_time(timestamp, 0);
        set_file_mtime(&file_path, time).map_err(|e| format!("Failed to set time for {}: {}", file_path, e))?;
    }
    Ok(())
}

#[tauri::command]
fn get_image_data(file_path: String) -> Result<String, String> {
    // Read the file
    let data = fs::read(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    // Determine MIME type based on extension
    let path = Path::new(&file_path);
    let mime_type = match path.extension().and_then(|s| s.to_str()) {
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("gif") => "image/gif",
        Some("bmp") => "image/bmp",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    };
    
    // Encode to base64
    let encoded = general_purpose::STANDARD.encode(&data);
    
    // Return as data URL
    Ok(format!("data:{};base64,{}", mime_type, encoded))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::DragDrop(event) = event {
                 if let tauri::DragDropEvent::Drop { paths, position: _ } = event {
                     window.emit("file-dropped-custom", paths).unwrap();
                 }
            }
        })
        .invoke_handler(tauri::generate_handler![greet, set_file_times, set_file_times_with_interval, get_image_data])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
