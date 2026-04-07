use axum::{
    body::Body,
    extract::Query,
    http::HeaderMap,
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use reqwest::Client;
use serde::Serialize;
use serde_json::json;
use std::collections::HashMap;
use url::Url;

const METING_API_BASE: &str = "https://meting-api-omega.vercel.app/api";

#[derive(Clone)]
struct AppState {
    client: Client,
}

#[derive(Serialize)]
struct TrackPayload {
    id: String,
    title: String,
    name: String,
    artist: String,
    #[serde(rename = "artistList")]
    artist_list: Vec<String>,
    artists: Vec<String>,
    album: String,
    #[serde(rename = "albumName")]
    album_name: String,
    cover: String,
    pic: String,
    image: String,
    source: String,
    #[serde(rename = "sourceLabel")]
    source_label: String,
    #[serde(rename = "durationMs")]
    duration_ms: Option<u64>,
    url: String,
    #[serde(rename = "streamUrl")]
    stream_url: String,
    #[serde(rename = "lyricUrl")]
    lyric_url: String,
    #[serde(rename = "songId")]
    song_id: String,
}

fn get_source_label(source: &str) -> &str {
    match source.to_lowercase().as_str() {
        "netease" => "网易云",
        "tencent" | "qq" | "qqmusic" => "QQ音乐",
        "kugou" => "酷狗",
        "kuwo" => "酷我",
        "migu" => "咪咕",
        "bilibili" => "哔哩哔哩",
        "youtube" => "YouTube",
        _ => source,
    }
}

fn extract_id_from_meting_url(url_str: &str) -> String {
    if let Ok(url) = Url::parse(url_str) {
        for (k, v) in url.query_pairs() {
            if k == "id" || k == "songid" {
                return v.into_owned();
            }
        }
    }
    String::new()
}

async fn health() -> impl IntoResponse {
    Json(json!({
        "ok": true,
        "port": 31999,
        "supportedSources": ["netease", "tencent", "kugou", "kuwo"],
        "endpoints": [
            "/api/music/health",
            "/api/music/search",
            "/api/music/song",
            "/api/music/lyric",
            "/api/music/stream",
            "/api/music/stream-info"
        ]
    }))
}

async fn search(
    axum::extract::State(state): axum::extract::State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let keyword = params.get("keyword").cloned().unwrap_or_default();
    let sources_str = params.get("sources").cloned().unwrap_or_else(|| "netease".to_string());
    let source_list: Vec<&str> = sources_str.split(',').collect();
    
    if keyword.is_empty() {
        return Json(json!({ "message": "缺少搜索关键词" })).into_response();
    }

    let mut tracks = Vec::new();
    
    // Create futures for all sources to fetch concurrently
    let mut futures = Vec::new();
    for source in source_list {
        let src = source.trim().to_string();
        if src.is_empty() { continue; }
        
        let req_url = format!(
            "{}?server={}&type=search&id={}",
            METING_API_BASE,
            urlencoding::encode(&src),
            urlencoding::encode(&keyword)
        );
        
        let client = state.client.clone();
        futures.push(async move {
            let mut source_tracks = Vec::new();
            if let Ok(resp) = client.get(&req_url).send().await {
                if let Ok(items) = resp.json::<Vec<serde_json::Value>>().await {
                    for item in items {
                        let url = item["url"].as_str().unwrap_or_default().to_string();
                        let id = extract_id_from_meting_url(&url);
                        if id.is_empty() {
                            continue;
                        }
                        
                        let title = item["title"].as_str().unwrap_or_default().to_string();
                        let artist = item["author"].as_str().unwrap_or_default().to_string();
                        let cover = item["pic"].as_str().unwrap_or_default().to_string();
                        let album = String::new();
                        
                        let artist_list = vec![artist.clone()];

                        source_tracks.push(TrackPayload {
                            id: id.clone(),
                            title: title.clone(),
                            name: title.clone(),
                            artist: artist.clone(),
                            artist_list: artist_list.clone(),
                            artists: artist_list,
                            album: album.clone(),
                            album_name: album,
                            cover: cover.clone(),
                            pic: cover.clone(),
                            image: cover,
                            source: src.clone(),
                            source_label: get_source_label(&src).to_string(),
                            duration_ms: None,
                            url: url.clone(),
                            stream_url: format!("/api/music/stream?id={}&source={}", urlencoding::encode(&id), urlencoding::encode(&src)),
                            lyric_url: format!("/api/music/lyric?id={}&source={}", urlencoding::encode(&id), urlencoding::encode(&src)),
                            song_id: id,
                        });
                    }
                }
            }
            source_tracks
        });
    }

    // Await all futures concurrently
    let results = futures_util::future::join_all(futures).await;
    for mut source_tracks in results {
        tracks.append(&mut source_tracks);
    }

    Json(json!({
        "results": tracks,
        "data": tracks,
        "total": tracks.len(),
        "keyword": keyword,
        "sources": sources_str
    })).into_response()
}

async fn song(
    axum::extract::State(_state): axum::extract::State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    // For single song, we just construct the TrackPayload based on id and optional title/artist
    let id = params.get("id").cloned().unwrap_or_default();
    let source = params.get("source").cloned().unwrap_or_else(|| "netease".to_string());
    let title = params.get("title").cloned().unwrap_or_default();
    let artist = params.get("artist").cloned().unwrap_or_default();

    if id.is_empty() {
        return Json(json!({ "message": "缺少歌曲ID" })).into_response();
    }

    let track = TrackPayload {
        id: id.clone(),
        title: title.clone(),
        name: title.clone(),
        artist: artist.clone(),
        artist_list: vec![artist.clone()],
        artists: vec![artist.clone()],
        album: String::new(),
        album_name: String::new(),
        cover: String::new(),
        pic: String::new(),
        image: String::new(),
        source: source.clone(),
        source_label: get_source_label(&source).to_string(),
        duration_ms: None,
        url: format!("{}?server={}&type=url&id={}", METING_API_BASE, urlencoding::encode(&source), urlencoding::encode(&id)),
        stream_url: format!("/api/music/stream?id={}&source={}", urlencoding::encode(&id), urlencoding::encode(&source)),
        lyric_url: format!("/api/music/lyric?id={}&source={}", urlencoding::encode(&id), urlencoding::encode(&source)),
        song_id: id,
    };

    Json(json!({
        "song": track,
        "data": track
    })).into_response()
}

async fn lyric(
    axum::extract::State(state): axum::extract::State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let id = params.get("id").cloned().unwrap_or_default();
    let source = params.get("source").cloned().unwrap_or_else(|| "netease".to_string());

    let req_url = format!(
        "{}?server={}&type=lyric&id={}",
        METING_API_BASE,
        urlencoding::encode(&source),
        urlencoding::encode(&id)
    );

    if let Ok(resp) = state.client.get(&req_url).send().await {
        if let Ok(text) = resp.text().await {
            // Meting API returns JSON like {"lyric":"...", "tlyric":"..."} or plain text
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(lyric) = json["lyric"].as_str() {
                    return lyric.to_string().into_response();
                }
            }
            return text.into_response();
        }
    }
    String::new().into_response()
}

async fn stream_info(
    axum::extract::State(_state): axum::extract::State<AppState>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let id = params.get("id").cloned().unwrap_or_default();
    let source = params.get("source").cloned().unwrap_or_else(|| "netease".to_string());

    let req_url = format!(
        "{}?server={}&type=url&id={}",
        METING_API_BASE,
        urlencoding::encode(&source),
        urlencoding::encode(&id)
    );

    // Create a client that doesn't follow redirects to grab the Location header
    let no_redirect_client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap();

    if let Ok(resp) = no_redirect_client.get(&req_url).send().await {
        if resp.status().is_redirection() {
            if let Some(loc) = resp.headers().get("location") {
                if let Ok(loc_str) = loc.to_str() {
                    // Check if it's a 404 URL or invalid
                    if loc_str.contains("404") || loc_str.is_empty() {
                        return Json(json!({
                            "ok": false,
                            "reason": "播放地址无效"
                        })).into_response();
                    }
                    return Json(json!({
                        "ok": true,
                        "url": loc_str,
                        "statusCode": 200,
                        "contentType": "audio/mpeg"
                    })).into_response();
                }
            }
        } else if resp.status().is_success() {
            // Might be a direct stream
            return Json(json!({
                "ok": true,
                "url": req_url,
                "statusCode": 200,
                "contentType": "audio/mpeg"
            })).into_response();
        }
    }

    Json(json!({
        "ok": false,
        "reason": "获取播放地址失败"
    })).into_response()
}

async fn stream(
    axum::extract::State(_state): axum::extract::State<AppState>,
    headers: HeaderMap,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let id = params.get("id").cloned().unwrap_or_default();
    let source = params.get("source").cloned().unwrap_or_else(|| "netease".to_string());

    let req_url = format!(
        "{}?server={}&type=url&id={}",
        METING_API_BASE,
        urlencoding::encode(&source),
        urlencoding::encode(&id)
    );

    let no_redirect_client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .unwrap();

    let mut current_url = req_url.clone();
    let mut redirect_count = 0;

    // Follow redirects manually up to 5 times to preserve headers like Range
    while redirect_count < 5 {
        let mut req = no_redirect_client.get(&current_url);
        if let Some(range) = headers.get("range") {
            req = req.header("Range", range);
        }
        
        if let Ok(resp) = req.send().await {
            if resp.status().is_redirection() {
                if let Some(loc) = resp.headers().get("location") {
                    if let Ok(loc_str) = loc.to_str() {
                        current_url = loc_str.to_string();
                        redirect_count += 1;
                        continue;
                    }
                }
            } else {
                // Not a redirect, we found the final stream
                let status = resp.status();
                let mut builder = Response::builder().status(status);
                
                if let Some(ct) = resp.headers().get("content-type") {
                    builder = builder.header("Content-Type", ct);
                }
                if let Some(cl) = resp.headers().get("content-length") {
                    builder = builder.header("Content-Length", cl);
                }
                if let Some(ar) = resp.headers().get("accept-ranges") {
                    builder = builder.header("Accept-Ranges", ar);
                }
                if let Some(cr) = resp.headers().get("content-range") {
                    builder = builder.header("Content-Range", cr);
                }
                
                builder = builder.header("Cache-Control", "no-cache");
                builder = builder.header("Access-Control-Allow-Origin", "*");
                builder = builder.header("Access-Control-Allow-Methods", "GET, OPTIONS");
                builder = builder.header("Access-Control-Allow-Headers", "Content-Type, Range");

                let stream = resp.bytes_stream();
                let body = Body::from_stream(stream);
                return builder.body(body).unwrap().into_response();
            }
        }
        break;
    }

    Json(json!({ "error": "无法代理播放流" })).into_response()
}

pub async fn start_server() {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .unwrap();

    let state = AppState { client };

    let cors = tower_http::cors::CorsLayer::permissive();

    let app = Router::new()
        .route("/api/music/health", get(health))
        .route("/api/music/search", get(search))
        .route("/api/music/song", get(song))
        .route("/api/music/lyric", get(lyric))
        .route("/api/music/stream-info", get(stream_info))
        .route("/api/music/stream", get(stream))
        .layer(cors)
        .with_state(state);

    if let Ok(listener) = tokio::net::TcpListener::bind("127.0.0.1:31999").await {
        println!("[music-server-rust] 服务已启动: http://127.0.0.1:31999");
        let _ = axum::serve(listener, app).await;
    } else {
        eprintln!("[music-server-rust] 端口 31999 被占用或绑定失败");
    }
}
