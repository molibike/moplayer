// Tauri doesn't have a Node.js server to do hot reloading on its own. You can use the `tauri dev` command though, which makes use of the `beforeDevCommand` and `devPath` on tauri.conf.json for a full development experience.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::command;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerStatus {
    pub is_playing: bool,
    pub current_time: f64,
    pub duration: f64,
    pub volume: f64,
}

impl Default for PlayerStatus {
    fn default() -> Self {
        Self {
            is_playing: false,
            current_time: 0.0,
            duration: 0.0,
            volume: 1.0,
        }
    }
}

#[command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[command]
fn get_player_status() -> PlayerStatus {
    PlayerStatus::default()
}

#[command]
fn seek_to(time: f64) -> Result<(), String> {
    // TODO: 实现播放器定位功能
    println!("Seeking to time: {}", time);
    Ok(())
}

#[command]
fn list_images_in_dir(file_path: String) -> Vec<String> {
    use std::path::Path;
    use std::fs;
    
    println!("list_images_in_dir called with: {}", file_path);
    
    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        println!("Parent directory: {:?}", parent);
        
        let mut images = vec![];
        let exts = ["jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "ico"];
        
        if let Ok(entries) = fs::read_dir(parent) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                        let ext_lower = ext.to_lowercase();
                        if exts.contains(&ext_lower.as_str()) {
                            let full_path = p.to_string_lossy().to_string();
                            println!("Found image: {}", full_path);
                            images.push(full_path);
                        }
                    }
                }
            }
        }
        
        // 排序保证一致
        images.sort();
        println!("Returning {} images", images.len());
        images
    } else {
        println!("No parent directory found");
        vec![]
    }
}

#[command]
fn set_window_size(width: u32, height: u32) -> Result<(), String> {
    println!("Setting window size: {}x{}", width, height);
    
    // 窗口大小调整需要在窗口上下文中处理，这里先记录日志
    println!("Window resize requested: {}x{}", width, height);
    
    Ok(())
}

fn main() {
    env_logger::init();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_player_status,
            seek_to,
            list_images_in_dir,
            set_window_size
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}