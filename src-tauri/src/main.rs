// Tauri doesn't have a Node.js server to do hot reloading on its own. You can use the `tauri dev` command though, which makes use of the `beforeDevCommand` and `devPath` on tauri.conf.json for a full development experience.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::thread;
use std::time::Duration;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use tauri::{command, Manager, State};
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

static DIST_PREVIEW_SERVER: OnceLock<()> = OnceLock::new();
static MUSIC_SERVER_CHILD: OnceLock<Mutex<Option<Child>>> = OnceLock::new();

fn resolve_node_command() -> Option<String> {
    let candidates = ["node", "node.exe"];
    for candidate in candidates {
        let mut command = Command::new(candidate);
        #[cfg(target_os = "windows")]
        {
            command.creation_flags(0x08000000);
        }
        let result = command
            .arg("--version")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
        if matches!(result, Ok(status) if status.success()) {
            return Some(candidate.to_string());
        }
    }
    None
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

    let mut score = 0;

    if !normalized_title.is_empty() {
        if normalized_song_name == normalized_title {
            score += 100;
        } else if normalized_song_name.contains(&normalized_title)
            || normalized_title.contains(&normalized_song_name)
        {
            score += 60;
        }
    }

    if !normalized_artist.is_empty() {
        if normalized_song_artist == normalized_artist {
            score += 80;
        } else if normalized_song_artist.contains(&normalized_artist)
            || normalized_artist.contains(&normalized_song_artist)
        {
            score += 40;
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

fn extract_song_id(song: &serde_json::Value) -> Option<String> {
    song.get("id").and_then(|id| {
        id.as_i64()
            .map(|value| value.to_string())
            .or_else(|| id.as_str().map(|value| value.to_string()))
    })
}

fn extract_song_name(song: &serde_json::Value) -> String {
    song.get("name")
        .or_else(|| song.get("title"))
        .and_then(|v| v.as_str())
        .unwrap_or_default()
        .to_string()
}

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
        "netease" => score += 18,
        "lrclib" => score += 12,
        "tencent" => score += 10,
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

async fn collect_lyrics_candidates(title: &str, artist: &str) -> Result<Vec<LyricsCandidate>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("创建客户端失败: {}", e))?;

    let mut results: Vec<LyricsCandidate> = Vec::new();
    let mut search_plans: Vec<(String, String)> = Vec::new();
    if !artist.trim().is_empty() && artist != "未知艺术家" {
        search_plans.push((format!("{} {}", title, artist), artist.to_string()));
    }
    search_plans.push((title.to_string(), String::new()));

    for (index, (keywords, current_artist)) in search_plans.iter().enumerate() {
        println!(
            "[歌词搜索] 开始第{}轮搜索，关键词: {}，匹配艺术家: {}",
            index + 1,
            keywords,
            current_artist
        );

        let search_url = format!(
            "https://music.163.com/api/search/get/web?type=1&offset=0&total=true&limit=10&s={}",
            urlencoding::encode(keywords)
        );

        println!("[歌词搜索] 搜索URL: {}", search_url);

        let search_resp = client
            .get(&search_url)
            .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
            .header("Referer", "https://music.163.com")
            .send()
            .await
            .map_err(|e| format!("搜索请求失败: {}", e))?;

        let search_body = search_resp
            .text()
            .await
            .map_err(|e| format!("读取搜索响应失败: {}", e))?;

        println!("[歌词搜索] 搜索响应长度: {} 字节", search_body.len());

        let search_json: serde_json::Value = serde_json::from_str(&search_body)
            .map_err(|e| format!("解析搜索响应失败: {}", e))?;

        let songs = match search_json
            .get("result")
            .and_then(|result| result.get("songs"))
            .and_then(|songs| songs.as_array())
        {
            Some(songs) if !songs.is_empty() => songs,
            _ => {
                println!("[歌词搜索] 第{}轮未找到歌曲，继续下一轮", index + 1);
                continue;
            }
        };

        let mut candidates: Vec<(i32, i64, String, String)> = songs
            .iter()
            .filter_map(|song| {
                let song_id = song
                    .get("id")
                    .and_then(|id| id.as_i64())
                    .or_else(|| {
                        song.get("id")
                            .and_then(|id| id.as_str())
                            .and_then(|value| value.parse::<i64>().ok())
                    })?;

                let song_name = song
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or_default()
                    .to_string();

                let artist_name = song
                    .get("artists")
                    .and_then(|v| v.as_array())
                    .map(|artists| {
                        artists
                            .iter()
                            .filter_map(|artist_item| artist_item.get("name").and_then(|v| v.as_str()))
                            .collect::<Vec<_>>()
                            .join(" / ")
                    })
                    .unwrap_or_default();

                Some((
                    song_match_score(song, title, current_artist),
                    song_id,
                    song_name,
                    artist_name,
                ))
            })
            .collect();

        candidates.sort_by(|a, b| b.0.cmp(&a.0));

        for (score, song_id, song_name, artist_name) in candidates {
            println!(
                "[歌词搜索] 尝试候选歌曲: id={}, score={}, title={}, artist={}",
                song_id, score, song_name, artist_name
            );

            let lrc_url = format!(
                "https://api.injahow.cn/meting/?type=lrc&id={}&server=netease",
                song_id
            );
            println!("[歌词搜索] 歌词URL: {}", lrc_url);

            let lrc_resp = match client
                .get(&lrc_url)
                .header("User-Agent", "MoPlayer/1.0")
                .send()
                .await
            {
                Ok(response) => response,
                Err(error) => {
                    println!("[歌词搜索] 歌词请求失败，继续下一个候选: {}", error);
                    continue;
                }
            };

            let lrc_body = match lrc_resp.text().await {
                Ok(body) => body,
                Err(error) => {
                    println!("[歌词搜索] 读取歌词响应失败，继续下一个候选: {}", error);
                    continue;
                }
            };

            println!("[歌词搜索] 歌词响应长度: {} 字节", lrc_body.len());

            if !is_valid_lyrics_text(&lrc_body) {
                println!("[歌词搜索] 当前候选歌词无效，继续下一个候选");
                continue;
            }

            if !results.iter().any(|item| item.lyrics == lrc_body) {
                results.push(LyricsCandidate {
                    source: "netease".to_string(),
                    title: song_name,
                    artist: artist_name,
                    lyrics: lrc_body,
                });
            }
        }
    }

    let mut lrclib_plans: Vec<String> = Vec::new();
    if !artist.trim().is_empty() && artist != "未知艺术家" {
        lrclib_plans.push(artist.to_string());
    }
    lrclib_plans.push(String::new());

    for current_artist in lrclib_plans {
        match search_lyrics_from_lrclib(&client, title, &current_artist).await {
            Ok(Some(lyrics)) => {
                if !results.iter().any(|item| item.lyrics == lyrics) {
                    results.push(LyricsCandidate {
                        source: "lrclib".to_string(),
                        title: title.to_string(),
                        artist: if current_artist.is_empty() {
                            artist.to_string()
                        } else {
                            current_artist.clone()
                        },
                        lyrics,
                    });
                }
            }
            Ok(None) => {}
            Err(error) => println!("[歌词搜索] lrclib搜索失败: {}", error),
        }
    }

    match search_lyrics_from_tencent(&client, title, artist).await {
        Ok(Some(lyrics)) => {
            if !results.iter().any(|item| item.lyrics == lyrics) {
                results.push(LyricsCandidate {
                    source: "tencent".to_string(),
                    title: title.to_string(),
                    artist: artist.to_string(),
                    lyrics,
                });
            }
        }
        Ok(None) => {}
        Err(error) => println!("[歌词搜索] QQ音乐搜索失败: {}", error),
    }

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

    results.sort_by(|a, b| {
        let score_a = lyrics_quality_score(a, title, artist);
        let score_b = lyrics_quality_score(b, title, artist);
        score_b.cmp(&score_a)
    });

    for candidate in &results {
        println!(
            "[歌词搜索] 候选排序结果: source={}, score={}, title={}, artist={}",
            candidate.source,
            lyrics_quality_score(candidate, title, artist),
            candidate.title,
            candidate.artist
        );
    }

    Ok(results)
}

#[command]
async fn search_lyrics_candidates(title: String, artist: String) -> Result<Vec<LyricsCandidate>, String> {
    println!("[歌词搜索] 开始收集歌词候选 - 标题: {}, 艺术家: {}", title, artist);
    collect_lyrics_candidates(&title, &artist).await
}

#[command]
async fn search_lyrics(title: String, artist: String) -> Result<Option<String>, String> {
    println!("[歌词搜索] 开始搜索 - 标题: {}, 艺术家: {}", title, artist);

    let candidates = collect_lyrics_candidates(&title, &artist).await?;
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

fn is_music_server_running() -> bool {
    is_port_open("127.0.0.1:31999")
}

fn music_server_child() -> &'static Mutex<Option<Child>> {
    MUSIC_SERVER_CHILD.get_or_init(|| Mutex::new(None))
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

fn resolve_music_server_script_path(app: &tauri::AppHandle) -> Option<PathBuf> {
    let mut script_candidates: Vec<PathBuf> = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        script_candidates.push(resource_dir.join("local-music-server.mjs"));
        script_candidates.push(resource_dir.join("resources").join("local-music-server.mjs"));
    }

    if let Ok(current_dir) = std::env::current_dir() {
        script_candidates.push(current_dir.join("scripts").join("local-music-server.mjs"));
        script_candidates.push(current_dir.join("..").join("scripts").join("local-music-server.mjs"));
        if let Some(found) = find_upwards(&current_dir, "scripts\\local-music-server.mjs", 8) {
            script_candidates.push(found);
        }
        if let Some(found) = find_upwards(&current_dir, "scripts/local-music-server.mjs", 8) {
            script_candidates.push(found);
        }
    }

    if let Some(exe_dir) = std::env::current_exe().ok().and_then(|path| path.parent().map(|parent| parent.to_path_buf())) {
        script_candidates.push(exe_dir.join("local-music-server.mjs"));
        script_candidates.push(exe_dir.join("resources").join("local-music-server.mjs"));
        script_candidates.push(exe_dir.join("..").join("resources").join("local-music-server.mjs"));
        if let Some(found) = find_upwards(&exe_dir, "scripts\\local-music-server.mjs", 8) {
            script_candidates.push(found);
        }
        if let Some(found) = find_upwards(&exe_dir, "scripts/local-music-server.mjs", 8) {
            script_candidates.push(found);
        }
    }

    script_candidates.into_iter().find(|path| path.exists())
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

fn start_music_server_process(app: &tauri::AppHandle) -> Result<bool, String> {
    if let Ok(mut guard) = music_server_child().lock() {
        if let Some(child) = guard.as_mut() {
            match child.try_wait() {
                Ok(Some(_)) => {
                    *guard = None;
                }
                Ok(None) => {
                    return Ok(true);
                }
                Err(error) => {
                    return Err(format!("检查在线音乐服务进程状态失败: {}", error));
                }
            }
        }
    } else {
        return Err("无法锁定在线音乐服务进程状态".to_string());
    }

    if is_music_server_running() {
        println!("[music-server] 检测到本地在线音乐服务已在运行，复用现有服务");
        return Ok(true);
    }

    let Some(script_path) = resolve_music_server_script_path(app) else {
        return Err("未找到 local-music-server.mjs，无法启动在线音乐服务".to_string());
    };

    let script_display = script_path.to_string_lossy().to_string();
    let script_parent = script_path.parent().map(|p| p.to_path_buf());

    let Some(node_command) = resolve_node_command() else {
        return Err("未找到 Node.js 运行环境，请先安装 Node.js 或将其加入系统 PATH".to_string());
    };

    let mut command = Command::new(&node_command);
    command
        .arg(&script_display)
        .stdin(Stdio::null());
    if cfg!(debug_assertions) {
        command.stdout(Stdio::inherit()).stderr(Stdio::inherit());
    } else {
        command.stdout(Stdio::null()).stderr(Stdio::null());
    }
    if let Some(parent) = &script_parent {
        command.current_dir(parent);
    }
    #[cfg(target_os = "windows")]
    if !cfg!(debug_assertions) {
        command.creation_flags(0x08000000);
    }

    let child = command
        .spawn()
        .map_err(|error| format!("启动在线音乐服务失败: {}", error))?;

    if let Ok(mut guard) = music_server_child().lock() {
        *guard = Some(child);
    } else {
        return Err("在线音乐服务已启动，但无法记录进程句柄".to_string());
    }

    println!("[music-server] 使用 {} 启动本地在线音乐服务脚本: {}", node_command, script_path.display());
    for _ in 0..30 {
        if is_music_server_running() {
            return Ok(true);
        }
        thread::sleep(Duration::from_millis(100));
    }

    if let Ok(mut guard) = music_server_child().lock() {
        if let Some(mut child) = guard.take() {
            match child.try_wait() {
                Ok(Some(status)) => {
                    eprintln!("[music-server] 在线音乐服务进程已提前退出: {}", status);
                }
                Ok(None) => {
                    let _ = child.kill();
                    let _ = child.wait();
                }
                Err(error) => {
                    eprintln!("[music-server] 检查在线音乐服务进程状态失败: {}", error);
                }
            }
        }
    }

    Err("在线音乐服务启动超时，请稍后重试".to_string())
}

fn stop_music_server_process() -> Result<bool, String> {
    let Ok(mut guard) = music_server_child().lock() else {
        return Err("无法锁定在线音乐服务进程状态".to_string());
    };

    let Some(mut child) = guard.take() else {
        return Ok(false);
    };

    match child.try_wait() {
        Ok(Some(_)) => {
            return Ok(false);
        }
        Ok(None) => {}
        Err(error) => {
            return Err(format!("检查在线音乐服务进程状态失败: {}", error));
        }
    }

    child
        .kill()
        .map_err(|error| format!("停止在线音乐服务失败: {}", error))?;
    let _ = child.wait();
    println!("[music-server] 已停止本地在线音乐服务");
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
            stop_music_server
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
