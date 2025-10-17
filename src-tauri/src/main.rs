// Tauri doesn't have a Node.js server to do hot reloading on its own. You can use the `tauri dev` command though, which makes use of the `beforeDevCommand` and `devPath` on tauri.conf.json for a full development experience.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{command, Manager, State};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

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
        // 仅图片类扩展（不包含 PDF）
        let exts = [
            "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "ico",
            "tif", "tiff", "heic", "heif",
            "raw", "cr2", "nef", "arw", "dng", "rw2", "orf", "raf", "sr2",
            "wmf"
        ];
        
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
fn list_pdfs_in_dir(file_path: String) -> Vec<String> {
    use std::path::Path;
    use std::fs;

    println!("list_pdfs_in_dir called with: {}", file_path);

    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        let mut pdfs = vec![];
        if let Ok(entries) = fs::read_dir(parent) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                        if ext.to_lowercase() == "pdf" {
                            let full_path = p.to_string_lossy().to_string();
                            println!("Found pdf: {}", full_path);
                            pdfs.push(full_path);
                        }
                    }
                }
            }
        }
        pdfs.sort();
        println!("Returning {} pdfs", pdfs.len());
        pdfs
    } else {
        println!("No parent directory found");
        vec![]
    }
}

#[command]
async fn set_window_size(app_handle: tauri::AppHandle, width: u32, height: u32) -> Result<(), String> {
    println!("Setting window size: {}x{}", width, height);
    
    match app_handle.get_webview_window("main") {
        Some(window) => {
            window.set_size(tauri::Size::Physical(tauri::PhysicalSize { width, height }))
                .map_err(|e| format!("Failed to set window size: {}", e))?;
            Ok(())
        },
        None => Err("Main window not found".to_string())
    }
}

#[command]
async fn get_screen_size(app_handle: tauri::AppHandle) -> Result<(u32, u32), String> {
    // 优先通过主窗口获取主显示器尺寸
    if let Some(window) = app_handle.get_webview_window("main") {
        match window.primary_monitor() {
            Ok(Some(monitor)) => {
                let size = monitor.size();
                return Ok((size.width, size.height));
            }
            Ok(None) => {
                // 未找到主显示器，继续回退
            }
            Err(e) => {
                eprintln!("获取主显示器失败: {}", e);
            }
        }
    }
    // 回退：返回默认分辨率
    Ok((1920, 1080))
}

#[command]
fn open_file(file_path: String) -> Result<(), String> {
    println!("Opening file: {}", file_path);
    // 这里可以添加文件打开逻辑
    Ok(())
}

#[derive(Debug, Default)]
struct StartupState {
    file_path: Mutex<Option<String>>, // 保存启动时传入的文件路径
}

#[command]
fn get_startup_file(state: State<StartupState>) -> Option<String> {
    // 读取并清空，避免重复打开
    state.file_path.lock().ok().and_then(|mut p| p.take())
}

fn main() {
    env_logger::init();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(StartupState::default())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_player_status,
            seek_to,
            list_images_in_dir,
            list_pdfs_in_dir,
            set_window_size,
            get_screen_size,
            open_file,
            get_startup_file
        ])
        .setup(|app| {
            // 处理命令行参数
            let args: Vec<String> = std::env::args().collect();
            println!("Command line arguments: {:?}", args);
            
            // 如果有文件路径参数，发送到前端
            if args.len() > 1 {
                let file_path = &args[1];
                if PathBuf::from(file_path).exists() {
                    println!("Opening file from command line: {}", file_path);
                    // 保存启动路径，前端初始化完成后主动拉取
                    if let Some(state) = app.try_state::<StartupState>() {
                        if let Ok(mut p) = state.file_path.lock() {
                            *p = Some(file_path.to_string());
                        }
                    }
                }
            }
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}