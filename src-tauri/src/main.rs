// Tauri doesn't have a Node.js server to do hot reloading on its own. You can use the `tauri dev` command though, which makes use of the `beforeDevCommand` and `devPath` on tauri.conf.json for a full development experience.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::thread;
use std::time::Duration;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::{command, Manager, State};

mod music_server;
pub mod kuwo_crypto;

static DIST_PREVIEW_SERVER: OnceLock<()> = OnceLock::new();

// ============== HEIC/HEIF 解码命令 ==============
// 使用 libheif-rs 原生解码 HEIC/HEIF，返回 JPEG 字节流
// 相比前端的 heic2any（WASM）快 5-10 倍，且不阻塞 UI 线程
#[command]
async fn decode_heic_to_jpeg(path: String, quality: Option<u8>) -> Result<Vec<u8>, String> {
    // 在 blocking 线程池中执行 CPU 密集型解码，避免阻塞 tokio 运行时
    let q = quality.unwrap_or(82);
    tokio::task::spawn_blocking(move || decode_heic_impl(&path, q))
        .await
        .map_err(|e| format!("解码任务 join 失败: {}", e))?
}

// ============== RAW 相机格式解码命令 ==============
// 使用 rawloader + imagepipe 原生解码 RAW（CR2/NEF/ARW/DNG/RW2/ORF/RAF 等），返回 JPEG 字节流
// 比仅展示嵌入缩略图（通常仅 320x240~1024x768）画质好几个数量级
#[command]
async fn decode_raw_to_jpeg(path: String, quality: Option<u8>) -> Result<Vec<u8>, String> {
    let q = quality.unwrap_or(82);
    tokio::task::spawn_blocking(move || decode_raw_impl(&path, q))
        .await
        .map_err(|e| format!("RAW 解码任务 join 失败: {}", e))?
}

fn decode_raw_impl(path: &str, quality: u8) -> Result<Vec<u8>, String> {
    use imagepipe::Pipeline;
    use image::{codecs::jpeg::JpegEncoder, ColorType};

    // Pipeline::new_from_file 会完成：文件解析 → Bayer 提取 → 去马赛克 → 白平衡 → 色彩变换 → 伽马
    // 参数：(path, max_size=0 表示全分辨率, linear=false 表示应用 sRGB 伽马)
    let mut pipeline = Pipeline::new_from_file(path)
        .map_err(|e| format!("RAW 文件解析失败: {}", e))?;

    // 输出 8bit sRGB RGB 图像
    let decoded = pipeline
        .output_8bit(None)
        .map_err(|e| format!("RAW 管线处理失败: {}", e))?;

    let width = decoded.width as u32;
    let height = decoded.height as u32;
    let data = &decoded.data; // 紧凑 RGB，无 stride padding

    // 编码为 JPEG
    let mut jpeg_bytes: Vec<u8> = Vec::with_capacity((width as usize) * (height as usize) * 3 / 4);
    let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_bytes, quality);
    encoder
        .encode(data, width, height, ColorType::Rgb8.into())
        .map_err(|e| format!("RAW JPEG 编码失败: {}", e))?;

    Ok(jpeg_bytes)
}

fn decode_heic_impl(path: &str, quality: u8) -> Result<Vec<u8>, String> {
    use libheif_rs::{ColorSpace, HeifContext, LibHeif, RgbChroma};
    use image::{codecs::jpeg::JpegEncoder, ColorType};

    let lib_heif = LibHeif::new();
    let ctx = HeifContext::read_from_file(path)
        .map_err(|e| format!("读取 HEIC 文件失败: {}", e))?;
    let handle = ctx
        .primary_image_handle()
        .map_err(|e| format!("获取主图像句柄失败: {}", e))?;

    // 解码为 RGB（无 Alpha，节省空间；若需透明度可改 RgbChroma::Rgba）
    let image = lib_heif
        .decode(&handle, ColorSpace::Rgb(RgbChroma::Rgb), None)
        .map_err(|e| format!("libheif 解码失败: {}", e))?;

    let width = image.width();
    let height = image.height();

    let planes = image.planes();
    let interleaved = planes
        .interleaved
        .ok_or_else(|| "解码结果缺少交错平面".to_string())?;

    let data = interleaved.data;
    let stride = interleaved.stride;

    // libheif 返回的 stride 可能大于 width*3（行对齐 padding），需紧凑处理
    let row_bytes = (width as usize) * 3;
    let mut tight: Vec<u8> = Vec::with_capacity(row_bytes * (height as usize));
    for row in 0..(height as usize) {
        let start = row * stride;
        let end = start + row_bytes;
        if end > data.len() {
            return Err(format!(
                "像素数据越界: row={} end={} data.len()={}",
                row,
                end,
                data.len()
            ));
        }
        tight.extend_from_slice(&data[start..end]);
    }

    // 编码为 JPEG
    let mut jpeg_bytes: Vec<u8> = Vec::with_capacity(row_bytes * (height as usize) / 4);
    let mut encoder = JpegEncoder::new_with_quality(&mut jpeg_bytes, quality);
    encoder
        .encode(&tight, width, height, ColorType::Rgb8.into())
        .map_err(|e| format!("JPEG 编码失败: {}", e))?;

    Ok(jpeg_bytes)
}



fn normalize_search_text(input: &str) -> String {
    input
        .to_lowercase()
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .filter(|ch| {
            !matches!(
                ch,
                '-'
                    | '_'
                    | '·'
                    | '/'
                    | '\\'
                    | '|'
                    | '('
                    | ')'
                    | '['
                    | ']'
                    | '【'
                    | '】'
                    | '（'
                    | '）'
                    | ','
                    | '，'
                    | '.'
                    | '。'
                    | ':'
                    | '：'
                    | '!'
                    | '！'
                    | '?'
                    | '？'
                    | '\''
                    | '"'
            )
        })
        .collect()
}

#[allow(dead_code)]
fn song_match_score(song: &serde_json::Value, title: &str, artist: &str) -> i32 {
    let normalized_title = normalize_search_text(title);
    let normalized_artist = normalize_search_text(artist);

    let song_name = song
        .get("name")
        .or_else(|| song.get("title"))
        .and_then(|v| v.as_str())
        .unwrap_or_default();
    let normalized_song_name = normalize_search_text(song_name);

    let artist_names = if let Some(artist_name) = song.get("artist").and_then(|v| v.as_str()) {
        artist_name.to_string()
    } else if let Some(artists) = song.get("artists").and_then(|v| v.as_array()) {
        artists
            .iter()
            .filter_map(|artist_item| artist_item.get("name").and_then(|v| v.as_str()))
            .collect::<Vec<_>>()
            .join(" ")
    } else if let Some(artists) = song.get("ar").and_then(|v| v.as_array()) {
        artists
            .iter()
            .filter_map(|artist_item| artist_item.get("name").and_then(|v| v.as_str()))
            .collect::<Vec<_>>()
            .join(" ")
    } else {
        String::new()
    };

    let normalized_song_artist = normalize_search_text(&artist_names);

    let mut score = 10; // 基础分数，确保至少会返回结果

    if !normalized_title.is_empty() {
        if normalized_song_name == normalized_title {
            score += 100;
        } else if normalized_song_name.contains(&normalized_title)
            || normalized_title.contains(&normalized_song_name)
        {
            score += 60;
        } else {
            // 宽松的匹配：检查是否有共同的子串（至少3个字符）
            let min_len = normalized_song_name.len().min(normalized_title.len());
            if min_len >= 3 {
                let short = if normalized_song_name.len() <= normalized_title.len() {
                    &normalized_song_name
                } else {
                    &normalized_title
                };
                let long = if normalized_song_name.len() > normalized_title.len() {
                    &normalized_song_name
                } else {
                    &normalized_title
                };
                // 如果短字符串是长字符串的一部分，给分
                if long.contains(short) {
                    score += 40;
                } else {
                    // 检查是否有一些字符匹配（简单的相似度检查）
                    let matching_chars = normalized_song_name
                        .chars()
                        .filter(|c| normalized_title.contains(*c))
                        .count();
                    if matching_chars >= 3 {
                        score += 20;
                    }
                }
            }
        }
    }

    if !normalized_artist.is_empty() {
        if normalized_song_artist == normalized_artist {
            score += 80;
        } else if normalized_song_artist.contains(&normalized_artist)
            || normalized_artist.contains(&normalized_song_artist)
        {
            score += 40;
        } else if !normalized_song_artist.is_empty() {
            // 检查艺术家名字中是否有部分匹配
            let artist_words: Vec<&str> = normalized_artist.split_whitespace().collect();
            for word in artist_words {
                if word.len() >= 2 && normalized_song_artist.contains(word) {
                    score += 20;
                    break;
                }
            }
        }
    }

    score
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerStatus {
    pub is_playing: bool,
    pub current_time: f64,
    pub duration: f64,
    pub volume: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct LyricsCandidate {
    source: String,
    title: String,
    artist: String,
    lyrics: String,
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
    println!("Seeking to time: {}", time);
    Ok(())
}

#[command]
fn list_images_in_dir(file_path: String) -> Vec<String> {
    use std::fs;
    use std::path::Path;

    println!("list_images_in_dir called with: {}", file_path);

    let path = Path::new(&file_path);
    if let Some(parent) = path.parent() {
        println!("Parent directory: {:?}", parent);

        let mut images = vec![];
        let exts = [
            "jpg", "jpeg", "png", "gif", "bmp", "webp", "svg", "ico", "tif", "tiff", "heic", "heif", "raw", "cr2", "nef", "arw", "dng", "rw2", "orf", "raf", "sr2", "wmf",
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
    use std::fs;
    use std::path::Path;

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
            window
                .set_size(tauri::Size::Physical(tauri::PhysicalSize { width, height }))
                .map_err(|e| format!("Failed to set window size: {}", e))?;
            Ok(())
        }
        None => Err("Main window not found".to_string()),
    }
}

#[command]
async fn get_screen_size(app_handle: tauri::AppHandle) -> Result<(u32, u32), String> {
    if let Some(window) = app_handle.get_webview_window("main") {
        match window.primary_monitor() {
            Ok(Some(monitor)) => {
                let size = monitor.size();
                return Ok((size.width, size.height));
            }
            Ok(None) => {}
            Err(error) => {
                eprintln!("获取主显示器失败: {}", error);
            }
        }
    }

    Ok((1920, 1080))
}

#[command]
fn open_file(file_path: String) -> Result<(), String> {
    println!("[FILE] ==========================================");
    println!("[FILE] 打开文件: {}", file_path);
    println!("[FILE] ==========================================");
    Ok(())
}

#[command]
async fn http_get(url: String) -> Result<String, String> {
    println!("[HTTP] ==========================================");
    println!("[HTTP] 请求URL: {}", url);

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建客户端失败: {}", e))?;

    println!("[HTTP] 发送请求...");
    let response = client
        .get(&url)
        .header("User-Agent", "MoPlayer/1.0")
        .send()
        .await
        .map_err(|e| format!("请求失败: {}", e))?;

    let status = response.status();
    println!("[HTTP] 收到响应，状态码: {}", status);

    let body = response
        .text()
        .await
        .map_err(|e| format!("读取响应体失败: {}", e))?;

    let preview = if body.len() > 150 { &body[..150] } else { &body };
    println!("[HTTP] 响应内容: {}", preview.replace('\n', " "));
    println!("[HTTP] 响应长度: {} 字节", body.len());
    println!("[HTTP] ==========================================");

    if status.is_success() {
        Ok(body)
    } else {
        Err(format!("HTTP {}: {}", status, body))
    }
}

fn is_valid_lyrics_text(text: &str) -> bool {
    let value = text.trim();
    !value.is_empty() && !value.contains("纯音乐")
}

#[allow(dead_code)]
fn extract_search_result_songs<'a>(search_json: &'a serde_json::Value) -> Vec<&'a serde_json::Value> {
    if let Some(songs) = search_json.get("data").and_then(|v| v.as_array()) {
        return songs.iter().collect();
    }

    if let Some(songs) = search_json
        .get("result")
        .and_then(|result| result.get("songs"))
        .and_then(|songs| songs.as_array())
    {
        return songs.iter().collect();
    }

    if let Some(songs) = search_json.as_array() {
        return songs.iter().collect();
    }

    Vec::new()
}

#[allow(dead_code)]
fn extract_song_id(song: &serde_json::Value) -> Option<String> {
    song.get("id").and_then(|id| {
        id.as_i64()
            .map(|value| value.to_string())
            .or_else(|| id.as_str().map(|value| value.to_string()))
    })
}

#[allow(dead_code)]
fn extract_song_name(song: &serde_json::Value) -> String {
    song.get("name")
        .or_else(|| song.get("title"))
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

#[allow(dead_code)]
fn extract_song_artist(song: &serde_json::Value) -> String {
    if let Some(artist_name) = song.get("artist").and_then(|v| v.as_str()) {
        return artist_name.to_string();
    }

    if let Some(artists) = song.get("artists").and_then(|v| v.as_array()) {
        return artists
            .iter()
            .filter_map(|artist_item| artist_item.get("name").and_then(|v| v.as_str()))
            .collect::<Vec<_>>()
            .join(" / ");
    }

    if let Some(artists) = song.get("ar").and_then(|v| v.as_array()) {
        return artists
            .iter()
            .filter_map(|artist_item| artist_item.get("name").and_then(|v| v.as_str()))
            .collect::<Vec<_>>()
            .join(" / ");
    }

    String::new()
}

fn format_lyrics_text(raw: &str) -> String {
    raw.lines()
        .filter(|line| {
            !line.trim_start().starts_with("[ti:")
                && !line.trim_start().starts_with("[ar:")
                && !line.trim_start().starts_with("[al:")
                && !line.trim_start().starts_with("[by:")
                && !line.trim_start().starts_with("[offset:")
        })
        .collect::<Vec<_>>()
        .join("\n")
        .trim()
        .to_string()
}

fn lyrics_has_timestamps(text: &str) -> bool {
    text.lines().any(|line| {
        let trimmed = line.trim_start();
        trimmed.starts_with('[')
            && trimmed.len() >= 6
            && trimmed
                .chars()
                .nth(1)
                .map(|ch| ch.is_ascii_digit())
                .unwrap_or(false)
    })
}

fn lyrics_quality_score(candidate: &LyricsCandidate, title: &str, artist: &str) -> i32 {
    let normalized_candidate_title = normalize_search_text(&candidate.title);
    let normalized_candidate_artist = normalize_search_text(&candidate.artist);
    let normalized_title = normalize_search_text(title);
    let normalized_artist = normalize_search_text(artist);

    let mut score = 0;

    if !normalized_title.is_empty() {
        if normalized_candidate_title == normalized_title {
            score += 120;
        } else if normalized_candidate_title.contains(&normalized_title)
            || normalized_title.contains(&normalized_candidate_title)
        {
            score += 70;
        }
    }

    if !normalized_artist.is_empty() && !normalized_candidate_artist.is_empty() {
        if normalized_candidate_artist == normalized_artist {
            score += 90;
        } else if normalized_candidate_artist.contains(&normalized_artist)
            || normalized_artist.contains(&normalized_candidate_artist)
        {
            score += 45;
        }
    }

    if lyrics_has_timestamps(&candidate.lyrics) {
        score += 80;
    }

    let line_count = candidate
        .lyrics
        .lines()
        .filter(|line| !line.is_empty())
        .count() as i32;
    score += line_count.min(40);

    match candidate.source.as_str() {
        "lrclib" => score += 20,      // lrclib 通常提供最准确的歌词
        "netease" => score += 15,
        "tencent" => score += 12,
        "kugou" => score += 10,       // 添加酷狗支持
        "kuwo" => score += 8,         // 添加酷我支持
        "lrc_cx" => score += 6,
        _ => {}
    }

    score
}

async fn search_lyrics_from_lrclib(
    client: &reqwest::Client,
    title: &str,
    artist: &str,
) -> Result<Option<String>, String> {
    let query = if artist.trim().is_empty() || artist == "未知艺术家" {
        title.trim().to_string()
    } else {
        format!("{} {}", title.trim(), artist.trim())
    };

    let url = format!("https://lrclib.net/api/search?q={}", urlencoding::encode(&query));
    println!("[歌词搜索] 尝试lrclib，URL: {}", url);

    let body = client
        .get(&url)
        .header("User-Agent", "MoPlayer/1.0")
        .send()
        .await
        .map_err(|e| format!("lrclib请求失败: {}", e))?
        .text()
        .await
        .map_err(|e| format!("读取lrclib响应失败: {}", e))?;

    let items: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("解析lrclib响应失败: {}", e))?;

    if let Some(array) = items.as_array() {
        for item in array {
            let synced = item
                .get("syncedLyrics")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            let plain = item
                .get("plainLyrics")
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            let raw = if !synced.trim().is_empty() { synced } else { plain };
            let formatted = format_lyrics_text(raw);
            if is_valid_lyrics_text(&formatted) {
                return Ok(Some(formatted));
            }
        }
    }

    Ok(None)
}

#[allow(dead_code)]
async fn search_lyrics_from_tencent(
    client: &reqwest::Client,
    title: &str,
    artist: &str,
) -> Result<Option<String>, String> {
    let keywords = if artist.trim().is_empty() || artist == "未知艺术家" {
        title.trim().to_string()
    } else {
        format!("{} {}", title.trim(), artist.trim())
    };

    let search_url = format!(
        "https://meting-api.vercel.app/api/search?server=tencent&type=song&format=json&keyword={}",
        urlencoding::encode(&keywords)
    );
    println!("[歌词搜索] 尝试QQ音乐搜索，URL: {}", search_url);

    let search_body = client
        .get(&search_url)
        .header("User-Agent", "MoPlayer/1.0")
        .send()
        .await
        .map_err(|e| format!("QQ音乐搜索请求失败: {}", e))?
        .text()
        .await
        .map_err(|e| format!("读取QQ音乐搜索响应失败: {}", e))?;

    let search_json: serde_json::Value = serde_json::from_str(&search_body)
        .map_err(|e| format!("解析QQ音乐搜索响应失败: {}", e))?;
    let songs = extract_search_result_songs(&search_json);
    let mut ranked_songs = songs
        .into_iter()
        .map(|song| (song_match_score(song, title, artist), song))
        .collect::<Vec<_>>();
    ranked_songs.sort_by(|a, b| b.0.cmp(&a.0));

    for (_score, song) in ranked_songs {
        let Some(song_id) = extract_song_id(song) else {
            continue;
        };

        let lrc_url = format!(
            "https://meting-api.vercel.app/api?server=tencent&type=lrc&id={}",
            urlencoding::encode(&song_id)
        );
        println!("[歌词搜索] 尝试QQ歌词，URL: {}", lrc_url);

        let lrc_body = client
            .get(&lrc_url)
            .header("User-Agent", "MoPlayer/1.0")
            .send()
            .await
            .map_err(|e| format!("QQ歌词请求失败: {}", e))?
            .text()
            .await
            .map_err(|e| format!("读取QQ歌词响应失败: {}", e))?;

        let formatted = format_lyrics_text(&lrc_body);
        if is_valid_lyrics_text(&formatted) {
            println!(
                "[歌词搜索] 命中QQ歌词候选: title={}, artist={}",
                extract_song_name(song),
                extract_song_artist(song)
            );
            return Ok(Some(formatted));
        }
    }

    Ok(None)
}

async fn search_lyrics_from_lrc_cx(
    client: &reqwest::Client,
    title: &str,
) -> Result<Option<String>, String> {
    let url = format!("https://api.lrc.cx/api/search?q={}", urlencoding::encode(title.trim()));
    println!("[歌词搜索] 尝试api.lrc.cx，URL: {}", url);

    let body = client
        .get(&url)
        .header("User-Agent", "MoPlayer/1.0")
        .send()
        .await
        .map_err(|e| format!("api.lrc.cx请求失败: {}", e))?
        .text()
        .await
        .map_err(|e| format!("读取api.lrc.cx响应失败: {}", e))?;

    let json: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("解析api.lrc.cx响应失败: {}", e))?;

    if let Some(items) = json.as_array() {
        for item in items {
            let raw = item
                .get("lyric")
                .or_else(|| item.get("lyrics"))
                .or_else(|| item.get("lrc"))
                .and_then(|v| v.as_str())
                .unwrap_or_default();
            let formatted = format_lyrics_text(raw);
            if is_valid_lyrics_text(&formatted) {
                return Ok(Some(formatted));
            }
        }
    }

    if let Some(raw) = json
        .get("lyric")
        .or_else(|| json.get("lyrics"))
        .or_else(|| json.get("lrc"))
        .and_then(|v| v.as_str())
    {
        let formatted = format_lyrics_text(raw);
        if is_valid_lyrics_text(&formatted) {
            return Ok(Some(formatted));
        }
    }

    println!("[歌词搜索] api.lrc.cx未找到有效歌词");
    Ok(None)
}

// 使用网易云音乐直接API搜索歌词
async fn search_lyrics_from_netease(
    client: &reqwest::Client,
    title: &str,
    artist: &str,
) -> Result<Vec<LyricsCandidate>, String> {
    let mut candidates = Vec::new();
    
    let keywords = if artist.trim().is_empty() || artist == "未知艺术家" {
        title.trim().to_string()
    } else {
        format!("{} {}", title.trim(), artist.trim())
    };
    
    // 网易云音乐搜索API（GET方式）
    let search_url = format!(
        "http://music.163.com/api/search/get?type=1&limit=5&s={}",
        urlencoding::encode(&keywords)
    );
    println!("[歌词搜索] [netease] 搜索URL: {}", search_url);
    
    let search_body = match client
        .get(&search_url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
    {
        Ok(resp) => match resp.text().await {
            Ok(text) => text,
            Err(e) => {
                println!("[歌词搜索] [netease] 读取搜索响应失败: {}", e);
                return Ok(candidates);
            }
        },
        Err(e) => {
            println!("[歌词搜索] [netease] 搜索请求失败: {}", e);
            return Ok(candidates);
        }
    };
    
    let search_json: serde_json::Value = match serde_json::from_str(&search_body) {
        Ok(json) => json,
        Err(e) => {
            println!("[歌词搜索] [netease] 解析搜索响应失败: {}", e);
            return Ok(candidates);
        }
    };
    
    // 解析网易云返回格式: {"result":{"songs":[...]}}
    let songs = search_json
        .get("result")
        .and_then(|r| r.get("songs"))
        .and_then(|s| s.as_array())
        .cloned()
        .unwrap_or_default();
    
    if songs.is_empty() {
        println!("[歌词搜索] [netease] 未找到歌曲");
        return Ok(candidates);
    }
    
    println!("[歌词搜索] [netease] 找到 {} 首歌曲", songs.len());
    
    // 遍历搜索结果获取歌词
    for song in songs.iter().take(5) {
        let song_id = song.get("id")
            .and_then(|v| v.as_i64())
            .map(|id| id.to_string())
            .unwrap_or_default();
        
        if song_id.is_empty() { continue; }
        
        let song_name = song.get("name")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        
        // 提取艺术家（网易云格式: artists: [{name: "xxx"}, ...]）
        let artist_names = song.get("artists")
            .and_then(|v| v.as_array())
            .map(|arr| arr.iter()
                .filter_map(|a| a.get("name").and_then(|n| n.as_str()))
                .collect::<Vec<_>>()
                .join(" / "))
            .unwrap_or_default();
        
        println!("[歌词搜索] [netease] 尝试: id={}, title={}, artist={}", song_id, song_name, artist_names);
        
        // 获取歌词
        let lrc_url = format!(
            "http://music.163.com/api/song/lyric?id={}&lv=1&tv=1",
            song_id
        );
        
        let lrc_body = match client
            .get(&lrc_url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
        {
            Ok(resp) => match resp.text().await {
                Ok(text) => text,
                Err(e) => {
                    println!("[歌词搜索] [netease] 读取歌词失败: {}", e);
                    continue;
                }
            },
            Err(e) => {
                println!("[歌词搜索] [netease] 歌词请求失败: {}", e);
                continue;
            }
        };
        
        // 解析网易云歌词格式: {"lrc":{"lyric":"..."}}
        let lrc_json: serde_json::Value = match serde_json::from_str(&lrc_body) {
            Ok(json) => json,
            Err(_) => continue,
        };
        
        let raw_lrc = lrc_json
            .get("lrc")
            .and_then(|l| l.get("lyric"))
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        
        let formatted = format_lyrics_text(raw_lrc);
        if !is_valid_lyrics_text(&formatted) {
            println!("[歌词搜索] [netease] 歌词无效，跳过");
            continue;
        }
        
        if !candidates.iter().any(|item: &LyricsCandidate| item.lyrics == formatted) {
            println!("[歌词搜索] [netease] 成功获取歌词: {} 字节", formatted.len());
            candidates.push(LyricsCandidate {
                source: "netease".to_string(),
                title: song_name,
                artist: artist_names,
                lyrics: formatted,
            });
        }
    }
    
    Ok(candidates)
}

// 使用酷狗音乐直接API搜索歌词
async fn search_lyrics_from_kugou(
    client: &reqwest::Client,
    title: &str,
    artist: &str,
) -> Result<Vec<LyricsCandidate>, String> {
    let mut candidates = Vec::new();
    
    let keywords = if artist.trim().is_empty() || artist == "未知艺术家" {
        title.trim().to_string()
    } else {
        format!("{} {}", title.trim(), artist.trim())
    };
    
    // 酷狗搜索API
    let search_url = format!(
        "http://mobilecdn.kugou.com/api/v3/search/song?keyword={}&page=1&pagesize=5&format=json",
        urlencoding::encode(&keywords)
    );
    println!("[歌词搜索] [kugou] 搜索URL: {}", search_url);
    
    let search_body = match client
        .get(&search_url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
    {
        Ok(resp) => match resp.text().await {
            Ok(text) => text,
            Err(e) => {
                println!("[歌词搜索] [kugou] 读取搜索响应失败: {}", e);
                return Ok(candidates);
            }
        },
        Err(e) => {
            println!("[歌词搜索] [kugou] 搜索请求失败: {}", e);
            return Ok(candidates);
        }
    };
    
    let search_json: serde_json::Value = match serde_json::from_str(&search_body) {
        Ok(json) => json,
        Err(e) => {
            println!("[歌词搜索] [kugou] 解析搜索响应失败: {}", e);
            return Ok(candidates);
        }
    };
    
    // 酷狗返回格式: {"data":{"info":[{"hash":"...", "songname":"...", "singername":"..."}]}}
    let songs = search_json
        .get("data")
        .and_then(|d| d.get("info"))
        .and_then(|i| i.as_array())
        .cloned()
        .unwrap_or_default();
    
    if songs.is_empty() {
        println!("[歌词搜索] [kugou] 未找到歌曲");
        return Ok(candidates);
    }
    
    println!("[歌词搜索] [kugou] 找到 {} 首歌曲", songs.len());
    
    for song in songs.iter().take(5) {
        let hash = song.get("hash")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        
        if hash.is_empty() { continue; }
        
        let song_name = song.get("songname")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        
        let singer_name = song.get("singername")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string();
        
        println!("[歌词搜索] [kugou] 尝试: hash={}, title={}, artist={}", hash, song_name, singer_name);
        
        // 第一步：用hash搜索歌词候选
        let lrc_search_url = format!(
            "http://krcs.kugou.com/search?keyword={}&ver=1&man=yes&client=pc&hash={}",
            urlencoding::encode(&format!("{} {}", song_name, singer_name)),
            hash
        );
        
        let lrc_search_body = match client
            .get(&lrc_search_url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
        {
            Ok(resp) => match resp.text().await {
                Ok(text) => text,
                Err(e) => {
                    println!("[歌词搜索] [kugou] 歌词搜索失败: {}", e);
                    continue;
                }
            },
            Err(e) => {
                println!("[歌词搜索] [kugou] 歌词搜索请求失败: {}", e);
                continue;
            }
        };
        
        let lrc_search_json: serde_json::Value = match serde_json::from_str(&lrc_search_body) {
            Ok(json) => json,
            Err(_) => continue,
        };
        
        // 获取第一个歌词候选的id和accesskey
        let lrc_candidates = lrc_search_json
            .get("candidates")
            .and_then(|c| c.as_array())
            .cloned()
            .unwrap_or_default();
        
        if lrc_candidates.is_empty() {
            println!("[歌词搜索] [kugou] 无歌词候选");
            continue;
        }
        
        let first_candidate = &lrc_candidates[0];
        let lrc_id = first_candidate.get("id")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        let accesskey = first_candidate.get("accesskey")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        
        if lrc_id.is_empty() || accesskey.is_empty() { continue; }
        
        // 第二步：下载歌词（返回base64编码的LRC）
        let lrc_dl_url = format!(
            "http://lyrics.kugou.com/download?id={}&accesskey={}&fmt=lrc&ver=1&client=pc",
            lrc_id, accesskey
        );
        
        let lrc_dl_body = match client
            .get(&lrc_dl_url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .timeout(std::time::Duration::from_secs(10))
            .send()
            .await
        {
            Ok(resp) => match resp.text().await {
                Ok(text) => text,
                Err(e) => {
                    println!("[歌词搜索] [kugou] 歌词下载失败: {}", e);
                    continue;
                }
            },
            Err(e) => {
                println!("[歌词搜索] [kugou] 歌词下载请求失败: {}", e);
                continue;
            }
        };
        
        let lrc_dl_json: serde_json::Value = match serde_json::from_str(&lrc_dl_body) {
            Ok(json) => json,
            Err(_) => continue,
        };
        
        // 酷狗歌词下载返回base64编码的content字段
        let content_b64 = lrc_dl_json.get("content")
            .and_then(|v| v.as_str())
            .unwrap_or_default();
        
        if content_b64.is_empty() { continue; }
        
        // 解码base64
        use base64::Engine;
        let raw_lrc = match base64::engine::general_purpose::STANDARD.decode(content_b64) {
            Ok(bytes) => String::from_utf8_lossy(&bytes).to_string(),
            Err(e) => {
                println!("[歌词搜索] [kugou] base64解码失败: {}", e);
                continue;
            }
        };
        
        let formatted = format_lyrics_text(&raw_lrc);
        if !is_valid_lyrics_text(&formatted) {
            println!("[歌词搜索] [kugou] 歌词无效，跳过");
            continue;
        }
        
        if !candidates.iter().any(|item: &LyricsCandidate| item.lyrics == formatted) {
            println!("[歌词搜索] [kugou] 成功获取歌词: {} 字节", formatted.len());
            candidates.push(LyricsCandidate {
                source: "kugou".to_string(),
                title: song_name,
                artist: singer_name,
                lyrics: formatted,
            });
        }
    }
    
    Ok(candidates)
}

async fn collect_lyrics_candidates(title: &str, artist: &str, preferred_source: &str) -> Result<Vec<LyricsCandidate>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("创建客户端失败: {}", e))?;

    let mut results: Vec<LyricsCandidate> = Vec::new();
    
    println!("[歌词搜索] 开始多源搜索 - 标题: {}, 艺术家: {}, 优先源: {}", title, artist, preferred_source);

    // 如果有优先源，先搜索该源
    if !preferred_source.is_empty() {
        println!("[歌词搜索] 优先搜索来源: {}", preferred_source);
        let preferred_result = match preferred_source {
            "netease" => search_lyrics_from_netease(&client, title, artist).await,
            "kugou" => search_lyrics_from_kugou(&client, title, artist).await,
            // tencent/kuwo 暂时映射到已有的源
            "tencent" => search_lyrics_from_netease(&client, title, artist).await,
            "kuwo" => search_lyrics_from_kugou(&client, title, artist).await,
            _ => Ok(Vec::new()),
        };
        match preferred_result {
            Ok(candidates) => {
                println!("[歌词搜索] 优先源 [{}] 返回 {} 个候选", preferred_source, candidates.len());
                for candidate in candidates {
                    if !results.iter().any(|item| item.lyrics == candidate.lyrics) {
                        results.push(candidate);
                    }
                }
            }
            Err(e) => println!("[歌词搜索] 优先源 [{}] 搜索失败: {}", preferred_source, e),
        }
    }

    // 1. 尝试 lrclib - 通常提供最准确的歌词
    let mut lrclib_plans: Vec<String> = Vec::new();
    if !artist.trim().is_empty() && artist != "未知艺术家" {
        lrclib_plans.push(artist.to_string());
    }
    lrclib_plans.push(String::new());
    
    for current_artist in lrclib_plans {
        match search_lyrics_from_lrclib(&client, title, &current_artist).await {
            Ok(Some(lyrics)) => {
                let artist_name = if current_artist.is_empty() {
                    artist.to_string()
                } else {
                    current_artist.clone()
                };
                if !results.iter().any(|item| item.lyrics == lyrics) {
                    results.push(LyricsCandidate {
                        source: "lrclib".to_string(),
                        title: title.to_string(),
                        artist: artist_name,
                        lyrics,
                    });
                }
            }
            Ok(None) => {}
            Err(error) => println!("[歌词搜索] lrclib搜索失败: {}", error),
        }
    }
    
    // 2. 网易云音乐（如果不是优先源才搜索，避免重复）
    if preferred_source != "netease" && preferred_source != "tencent" {
        match search_lyrics_from_netease(&client, title, artist).await {
            Ok(netease_candidates) => {
                for candidate in &netease_candidates {
                    if !results.iter().any(|item| item.lyrics == candidate.lyrics) {
                        results.push(candidate.clone());
                    }
                }
                println!("[歌词搜索] 网易云音乐返回 {} 个候选", netease_candidates.len());
            }
            Err(e) => println!("[歌词搜索] 网易云音乐搜索失败: {}", e),
        }
    }
    
    // 3. 酷狗音乐（如果不是优先源才搜索，避免重复）
    if preferred_source != "kugou" && preferred_source != "kuwo" {
        match search_lyrics_from_kugou(&client, title, artist).await {
            Ok(kugou_candidates) => {
                for candidate in &kugou_candidates {
                    if !results.iter().any(|item| item.lyrics == candidate.lyrics) {
                        results.push(candidate.clone());
                    }
                }
                println!("[歌词搜索] 酷狗音乐返回 {} 个候选", kugou_candidates.len());
            }
            Err(e) => println!("[歌词搜索] 酷狗音乐搜索失败: {}", e),
        }
    }
    
    // 4. 备用：尝试 api.lrc.cx
    match search_lyrics_from_lrc_cx(&client, title).await {
        Ok(Some(lyrics)) => {
            if !results.iter().any(|item| item.lyrics == lyrics) {
                results.push(LyricsCandidate {
                    source: "lrc_cx".to_string(),
                    title: title.to_string(),
                    artist: artist.to_string(),
                    lyrics,
                });
            }
        }
        Ok(None) => {}
        Err(error) => println!("[歌词搜索] api.lrc.cx搜索失败: {}", error),
    }

    // 按质量评分排序，优先源额外加分确保排在最前
    let preferred = preferred_source.to_string();
    // 判断候选来源是否匹配优先源（包括映射关系）
    let is_preferred = |source: &str| -> bool {
        if preferred.is_empty() { return false; }
        match preferred.as_str() {
            "netease" => source == "netease",
            "tencent" => source == "netease" || source == "tencent",
            "kugou" => source == "kugou",
            "kuwo" => source == "kugou" || source == "kuwo",
            _ => source == preferred,
        }
    };
    results.sort_by(|a, b| {
        let mut score_a = lyrics_quality_score(a, title, artist);
        let mut score_b = lyrics_quality_score(b, title, artist);
        // 优先源额外加500分，确保排在最前
        if is_preferred(&a.source) { score_a += 500; }
        if is_preferred(&b.source) { score_b += 500; }
        score_b.cmp(&score_a)
    });

    println!("[歌词搜索] 总共找到 {} 个歌词候选", results.len());
    for candidate in &results {
        let mut score = lyrics_quality_score(candidate, title, artist);
        if is_preferred(&candidate.source) { score += 500; }
        println!(
            "[歌词搜索] 候选: source={}, score={}, title={}, artist={}",
            candidate.source,
            score,
            candidate.title,
            candidate.artist
        );
    }

    Ok(results)
}

#[command]
async fn search_lyrics_candidates(title: String, artist: String, source: Option<String>) -> Result<Vec<LyricsCandidate>, String> {
    let preferred_source = source.unwrap_or_default();
    println!("[歌词搜索] 开始收集歌词候选 - 标题: {}, 艺术家: {}, 优先源: {}", title, artist, preferred_source);
    collect_lyrics_candidates(&title, &artist, &preferred_source).await
}

#[command]
async fn search_lyrics(title: String, artist: String, source: Option<String>) -> Result<Option<String>, String> {
    let preferred_source = source.unwrap_or_default();
    println!("[歌词搜索] 开始搜索 - 标题: {}, 艺术家: {}, 优先源: {}", title, artist, preferred_source);

    let candidates = collect_lyrics_candidates(&title, &artist, &preferred_source).await?;
    if let Some(first) = candidates.into_iter().next() {
        println!("[歌词搜索] 成功获取歌词，来源: {}", first.source);
        Ok(Some(first.lyrics))
    } else {
        println!("[歌词搜索] 所有搜索轮次均未获取到有效歌词");
        Ok(None)
    }
}

#[command]
fn load_local_lyrics(audio_path: String) -> Result<Option<String>, String> {
    let path = PathBuf::from(&audio_path);
    if !path.exists() {
        return Ok(None);
    }

    let lrc_path = path.with_extension("lrc");
    if !lrc_path.exists() {
        return Ok(None);
    }

    let content = std::fs::read_to_string(&lrc_path)
        .map_err(|e| format!("读取本地歌词失败: {}", e))?;
    if content.trim().is_empty() {
        return Ok(None);
    }

    println!("[歌词搜索] 命中本地歌词文件: {}", lrc_path.display());
    Ok(Some(content))
}

#[command]
fn save_local_lyrics(audio_path: String, lyrics: String) -> Result<String, String> {
    if lyrics.trim().is_empty() {
        return Err("歌词内容为空，无法保存".to_string());
    }

    let path = PathBuf::from(&audio_path);
    let parent = path
        .parent()
        .ok_or_else(|| "音频文件路径无效，无法定位目录".to_string())?;
    if !parent.exists() {
        return Err("音频所在目录不存在，无法保存歌词".to_string());
    }

    let lrc_path = path.with_extension("lrc");
    std::fs::write(&lrc_path, lyrics).map_err(|e| format!("保存本地歌词失败: {}", e))?;

    let saved_path = lrc_path.to_string_lossy().to_string();
    println!("[歌词搜索] 已保存本地歌词: {}", saved_path);
    Ok(saved_path)
}

#[derive(Debug, Default)]
struct StartupState {
    file_path: Mutex<Option<String>>,
}

#[command]
fn get_startup_file(state: State<StartupState>) -> Option<String> {
    state.file_path.lock().ok().and_then(|mut path| path.take())
}

fn is_port_open(addr: &str) -> bool {
    TcpStream::connect(addr).is_ok()
}



fn is_vite_dev_server_running() -> bool {
    is_port_open("127.0.0.1:5173")
}

fn is_dist_preview_server_running() -> bool {
    is_port_open("127.0.0.1:4173")
}

fn guess_mime_type(path: &Path) -> &'static str {
    match path.extension().and_then(|ext| ext.to_str()).unwrap_or_default().to_ascii_lowercase().as_str() {
        "html" => "text/html; charset=utf-8",
        "js" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "json" => "application/json; charset=utf-8",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "ico" => "image/x-icon",
        "webp" => "image/webp",
        "map" => "application/json; charset=utf-8",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

fn start_dist_preview_server(dist_dir: PathBuf) -> Option<String> {
    if is_dist_preview_server_running() {
        return Some("http://127.0.0.1:4173/".to_string());
    }

    if DIST_PREVIEW_SERVER.get().is_none() {
        let listener = match std::net::TcpListener::bind("127.0.0.1:4173") {
            Ok(listener) => listener,
            Err(error) => {
                eprintln!("[dev] 本地 dist 预览服务启动失败: {}", error);
                return None;
            }
        };

        let _ = DIST_PREVIEW_SERVER.set(());

        thread::spawn(move || {
            for stream in listener.incoming() {
                let Ok(mut stream) = stream else {
                    continue;
                };

                let mut buffer = [0_u8; 4096];
                let Ok(size) = stream.read(&mut buffer) else {
                    continue;
                };
                if size == 0 {
                    continue;
                }

                let request = String::from_utf8_lossy(&buffer[..size]);
                let mut lines = request.lines();
                let request_line = lines.next().unwrap_or_default();
                let mut parts = request_line.split_whitespace();
                let method = parts.next().unwrap_or_default();
                let raw_path = parts.next().unwrap_or("/");
                if method != "GET" && method != "HEAD" {
                    let _ = stream.write_all(b"HTTP/1.1 405 Method Not Allowed\r\nConnection: close\r\n\r\n");
                    continue;
                }

                let path_without_query = raw_path.split('?').next().unwrap_or("/");
                let trimmed = path_without_query.trim_start_matches('/');
                let safe_path = trimmed.replace('\\', "/");
                let has_traversal = safe_path.split('/').any(|segment| segment == "..");

                let target_path = if safe_path.is_empty() || safe_path == "/" || has_traversal {
                    dist_dir.join("index.html")
                } else {
                    dist_dir.join(&safe_path)
                };

                let response_path = if target_path.is_file() {
                    target_path
                } else {
                    dist_dir.join("index.html")
                };

                let Ok(body) = fs::read(&response_path) else {
                    let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n");
                    continue;
                };

                let mime = guess_mime_type(&response_path);
                let header = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n",
                    mime,
                    body.len()
                );
                if stream.write_all(header.as_bytes()).is_err() {
                    continue;
                }
                if method != "HEAD" {
                    let _ = stream.write_all(&body);
                }
            }
        });
    }

    for _ in 0..20 {
        if is_dist_preview_server_running() {
            return Some("http://127.0.0.1:4173/".to_string());
        }
        thread::sleep(Duration::from_millis(100));
    }

    None
}

fn find_upwards(start: &Path, relative: &str, max_depth: usize) -> Option<PathBuf> {
    let mut cursor = start.to_path_buf();
    for _ in 0..=max_depth {
        let candidate = cursor.join(relative);
        if candidate.exists() {
            return Some(candidate);
        }
        if !cursor.pop() {
            break;
        }
    }
    None
}

#[allow(dead_code)]
fn resolve_music_server_exe_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let mut exe_candidates: Vec<PathBuf> = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        exe_candidates.push(resource_dir.join("music-server.exe"));
    }

    if let Ok(current_dir) = std::env::current_dir() {
        exe_candidates.push(current_dir.join("music-server.exe"));
        exe_candidates.push(current_dir.join("src-tauri").join("music-server.exe"));
    }

    if let Some(exe_dir) = std::env::current_exe().ok().and_then(|path| path.parent().map(|parent| parent.to_path_buf())) {
        exe_candidates.push(exe_dir.join("music-server.exe"));
    }

    exe_candidates.into_iter().find(|path| path.exists())
}

fn try_fallback_to_dist(app: &tauri::AppHandle) {
    if !cfg!(debug_assertions) {
        return;
    }
    if is_vite_dev_server_running() {
        return;
    }

    let mut start_dirs: Vec<PathBuf> = Vec::new();
    if let Ok(current_dir) = std::env::current_dir() {
        start_dirs.push(current_dir);
    }
    if let Some(exe_dir) = std::env::current_exe().ok().and_then(|path| path.parent().map(|parent| parent.to_path_buf())) {
        start_dirs.push(exe_dir);
    }

    let dist_index = start_dirs
        .into_iter()
        .filter_map(|dir| {
            let win_style = find_upwards(&dir, "dist\\index.html", 8);
            let unix_style = find_upwards(&dir, "dist/index.html", 8);
            win_style.or(unix_style)
        })
        .next();

    let Some(dist_index) = dist_index else {
        eprintln!("[dev] 未检测到 Vite 开发服务，同时未找到 dist/index.html，页面将显示 localhost 拒绝连接");
        return;
    };

    let Some(window) = app.get_webview_window("main") else {
        eprintln!("[dev] 未找到主窗口，无法回退到 dist/index.html");
        return;
    };

    let Some(dist_dir) = dist_index.parent().map(|parent| parent.to_path_buf()) else {
        eprintln!("[dev] dist/index.html 不存在父目录，无法启动本地预览服务: {}", dist_index.display());
        return;
    };

    let Some(preview_url) = start_dist_preview_server(dist_dir) else {
        eprintln!("[dev] 本地 dist 预览服务启动失败，无法回退加载: {}", dist_index.display());
        return;
    };

    let url = match tauri::Url::parse(&preview_url) {
        Ok(url) => url,
        Err(error) => {
            eprintln!("[dev] 本地 dist 预览地址无效 {}: {}", preview_url, error);
            return;
        }
    };

    println!("[dev] 未检测到 Vite 开发服务，已回退到本地预览服务: {} -> {}", dist_index.display(), preview_url);
    let _ = window.navigate(url);
}

fn start_music_server_process(_app: &tauri::AppHandle) -> Result<bool, String> {
    tauri::async_runtime::spawn(async {
        music_server::start_server().await;
    });
    Ok(true)
}

fn stop_music_server_process() -> Result<bool, String> {
    // Rust server runs in background, stopping not required for now
    Ok(true)
}

#[command]
fn start_music_server(app: tauri::AppHandle) -> Result<bool, String> {
    start_music_server_process(&app)
}

#[command]
fn stop_music_server() -> Result<bool, String> {
    stop_music_server_process()
}

#[command]
fn get_app_version(app: tauri::AppHandle) -> Result<String, String> {
    // 直接从 Tauri 的 package_info 读取版本号
    // 该值编译时由 tauri.conf.json 注入，安装后无需依赖源码路径
    Ok(app.package_info().version.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReleaseInfo {
    pub version: String,
    pub windows_url: String,
    pub macos_url: String,
    pub linux_url: String,
    pub release_notes: String,
}

#[command]
async fn check_latest_version() -> Result<ReleaseInfo, String> {
    // 从 GitHub Releases 列表 API 获取最新版本
    // 注意：不使用 /releases/latest（它会过滤掉 draft 和 prerelease），
    // 而是遍历 /releases，跳过 draft 后取最新一个。这样可以兼容 tauri-action 默认的 releaseDraft: true
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))?;

    let url = "https://api.github.com/repos/molibike/moplayer/releases?per_page=20";
    let response = client
        .get(url)
        .header("User-Agent", "MoPlayer")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| format!("请求 GitHub API 失败: {}", e))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("GitHub API 返回错误状态: {}", status));
    }

    let releases: Vec<serde_json::Value> = response
        .json()
        .await
        .map_err(|e| format!("解析 GitHub API 响应失败: {}", e))?;

    // 过滤掉 draft（未公开发布的草稿），保留正式发布和预发布版本
    // GitHub 返回的列表默认按 created_at 降序，所以首个非 draft 即最新版本
    let release = releases
        .iter()
        .find(|r| !r.get("draft").and_then(|v| v.as_bool()).unwrap_or(false))
        .ok_or_else(|| "未找到已发布的版本（仅存在草稿）".to_string())?;

    let tag_name = release
        .get("tag_name")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "未找到 tag_name".to_string())?;

    // 兼容两种 tag 格式：v1.2.3 和 moplayer-v1.2.3
    let version = tag_name
        .trim_start_matches("moplayer-")
        .trim_start_matches('v')
        .to_string();

    // 获取下载链接
    let assets = release
        .get("assets")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "未找到 assets".to_string())?;

    let mut windows_url = String::new();
    let mut macos_url = String::new();
    let mut linux_url = String::new();

    for asset in assets {
        if let Some(name) = asset.get("name").and_then(|v| v.as_str()) {
            let lower = name.to_lowercase();
            let download_url = asset
                .get("browser_download_url")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            if lower.ends_with(".exe") || lower.ends_with(".msi") || lower.contains("windows") {
                windows_url = download_url.to_string();
            } else if lower.ends_with(".dmg") || lower.contains("macos") || lower.contains("darwin") {
                macos_url = download_url.to_string();
            } else if lower.ends_with(".appimage") || lower.ends_with(".deb") || lower.contains("linux") {
                linux_url = download_url.to_string();
            }
        }
    }
    
    // 获取发布说明
    let release_notes = release.get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    
    Ok(ReleaseInfo {
        version,
        windows_url,
        macos_url,
        linux_url,
        release_notes,
    })
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
            get_startup_file,
            http_get,
            search_lyrics,
            search_lyrics_candidates,
            load_local_lyrics,
            save_local_lyrics,
            start_music_server,
            stop_music_server,
            decode_heic_to_jpeg,
            decode_raw_to_jpeg,
            get_app_version,
            check_latest_version
        ])
        .setup(|app| {
            try_fallback_to_dist(&app.handle());

            let args: Vec<String> = std::env::args().collect();
            println!("Command line arguments: {:?}", args);

            if args.len() > 1 {
                let file_path = &args[1];
                if PathBuf::from(file_path).exists() {
                    println!("Opening file from command line: {}", file_path);
                    if let Some(state) = app.try_state::<StartupState>() {
                        if let Ok(mut path) = state.file_path.lock() {
                            *path = Some(file_path.to_string());
                        }
                    }
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
