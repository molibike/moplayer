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

async fn search_tencent(client: &Client, keyword: &str) -> Vec<TrackPayload> {
    let mut tracks = Vec::new();
    let body = json!({
        "comm": { "ct": "19", "cv": "1859", "uin": "0" },
        "req": {
            "method": "DoSearchForQQMusicDesktop",
            "module": "music.search.SearchCgiService",
            "param": {
                "grp": 1,
                "num_per_page": 15,
                "page_num": 1,
                "query": keyword,
                "search_type": 0
            }
        }
    });

    if let Ok(resp) = client.post("https://u.y.qq.com/cgi-bin/musicu.fcg")
        .header("User-Agent", "Mozilla/5.0")
        .header("Accept", "application/json, text/plain, */*")
        .header("Content-Type", "application/json;charset=utf-8")
        .json(&body)
        .send().await 
    {
        if let Ok(json) = resp.json::<serde_json::Value>().await {
            if let Some(list) = json.pointer("/req/data/body/song/list").and_then(|v| v.as_array()) {
                for item in list {
                    if let Some(mid) = item["mid"].as_str() {
                        let title = item["title"].as_str().unwrap_or_default().to_string();
                        let mut artist_list = Vec::new();
                        if let Some(singers) = item["singer"].as_array() {
                            for singer in singers {
                                if let Some(name) = singer["name"].as_str() {
                                    artist_list.push(name.to_string());
                                }
                            }
                        }
                        let artist = artist_list.join(" ");
                        let album = item.pointer("/album/title").or_else(|| item.pointer("/album/name"))
                            .and_then(|v| v.as_str()).unwrap_or_default().to_string();
                        let album_mid = item.pointer("/album/mid").or_else(|| item.pointer("/album/pmid"))
                            .and_then(|v| v.as_str()).unwrap_or_default();
                        
                        let cover = if album_mid.is_empty() {
                            String::new()
                        } else {
                            format!("https://y.gtimg.cn/music/photo_new/T002R300x300M000{}.jpg?max_age=2592000", album_mid)
                        };
                        
                        let duration_ms = item["interval"].as_u64().map(|s| s * 1000);
                        let id = mid.to_string();
                        let source = "tencent".to_string();
                        
                        tracks.push(TrackPayload {
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
                            source: source.clone(),
                            source_label: get_source_label(&source).to_string(),
                            duration_ms,
                            url: format!("https://y.qq.com/n/ryqq/songDetail/{}", id),
                            stream_url: format!("/api/music/stream?id={}&source={}", urlencoding::encode(&id), urlencoding::encode(&source)),
                            lyric_url: format!("/api/music/lyric?id={}&source={}", urlencoding::encode(&id), urlencoding::encode(&source)),
                            song_id: id,
                        });
                    }
                }
            }
        }
    }
    tracks
}

async fn search_kuwo(client: &Client, keyword: &str) -> Vec<TrackPayload> {
    let mut tracks = Vec::new();
    let req_url = format!(
        "http://search.kuwo.cn/r.s?all={}&ft=music&itemset=web_2013&client=kt&pn=0&rn=15&rformat=json&encoding=utf8",
        urlencoding::encode(keyword)
    );

    if let Ok(resp) = client.get(&req_url)
        .header("User-Agent", "Mozilla/5.0")
        .send().await 
    {
        if let Ok(text) = resp.text().await {
            let json_str = text.replace("&nbsp;", " ").replace("&#39;", "'").replace("&#34;", "\"");
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&json_str) {
                if let Some(list) = json["abslist"].as_array() {
                    for item in list {
                        let raw_id = item["DC_TARGETID"].as_str().or_else(|| item["MUSICRID"].as_str()).unwrap_or_default();
                        let id = raw_id.replace("MUSIC_", "");
                        if id.is_empty() { continue; }
                        
                        let title = item["NAME"].as_str().or_else(|| item["SONGNAME"].as_str()).unwrap_or_default().to_string();
                        let artist = item["ARTIST"].as_str().unwrap_or_default().to_string();
                        let album = item["ALBUM"].as_str().unwrap_or_default().to_string();
                        let duration_ms = item["DURATION"].as_str().and_then(|s| s.parse::<u64>().ok()).map(|s| s * 1000);
                        let source = "kuwo".to_string();
                        let artist_list = vec![artist.clone()];

                        tracks.push(TrackPayload {
                            id: id.clone(),
                            title: title.clone(),
                            name: title.clone(),
                            artist: artist.clone(),
                            artist_list: artist_list.clone(),
                            artists: artist_list,
                            album: album.clone(),
                            album_name: album,
                            cover: String::new(),
                            pic: String::new(),
                            image: String::new(),
                            source: source.clone(),
                            source_label: get_source_label(&source).to_string(),
                            duration_ms,
                            url: format!("http://www.kuwo.cn/play_detail/{}", id),
                            stream_url: format!("/api/music/stream?id={}&source={}", urlencoding::encode(&id), urlencoding::encode(&source)),
                            lyric_url: format!("/api/music/lyric?id={}&source={}", urlencoding::encode(&id), urlencoding::encode(&source)),
                            song_id: id,
                        });
                    }
                }
            }
        }
    }
    tracks
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
        let keyword_clone = keyword.clone();
        
        futures.push(async move {
            let mut source_tracks = Vec::new();
            
            if src == "tencent" || src == "qq" {
                source_tracks = search_tencent(&client, &keyword_clone).await;
                return source_tracks;
            } else if src == "kuwo" {
                source_tracks = search_kuwo(&client, &keyword_clone).await;
                return source_tracks;
            }
            
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

async fn get_tencent_url(client: &Client, id: &str) -> Option<String> {
    let variants = vec![
        ("M500", "mp3"),
        ("C400", "m4a"),
        ("M800", "mp3"),
    ];

    for (prefix, suffix) in variants {
        let filename = format!("{}{}{}.{}", prefix, id, id, suffix);
        let body = json!({
            "req_1": {
                "module": "vkey.GetVkeyServer",
                "method": "CgiGetVkey",
                "param": {
                    "filename": [filename],
                    "guid": "10000",
                    "songmid": [id],
                    "songtype": [0],
                    "uin": "0",
                    "loginflag": 1,
                    "platform": "20"
                }
            },
            "loginUin": "0",
            "comm": {
                "uin": "0",
                "format": "json",
                "ct": 24,
                "cv": 0
            }
        });

        if let Ok(resp) = client.post("https://u.y.qq.com/cgi-bin/musicu.fcg")
            .header("User-Agent", "Mozilla/5.0")
            .header("Accept", "application/json, text/plain, */*")
            .header("Content-Type", "application/json;charset=utf-8")
            .json(&body)
            .send().await
        {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(sip) = json.pointer("/req_1/data/sip/0").and_then(|v| v.as_str()) {
                    if let Some(purl) = json.pointer("/req_1/data/midurlinfo/0/purl").and_then(|v| v.as_str()) {
                        if !purl.is_empty() {
                            return Some(format!("{}{}", sip, purl));
                        }
                    }
                }
            }
        }
    }
    None
}

async fn get_kuwo_url(client: &Client, id: &str) -> Option<String> {
    let req_url = format!("http://www.kuwo.cn/api/v1/www/music/playUrl?mid={}&type=convert_url3&br=320kmp3", id);
    if let Ok(resp) = client.get(&req_url)
        .header("User-Agent", "Mozilla/5.0")
        .send().await
    {
        if let Ok(json) = resp.json::<serde_json::Value>().await {
            if let Some(url) = json.pointer("/data/url").and_then(|v| v.as_str()) {
                if !url.is_empty() {
                    return Some(url.to_string());
                }
            }
        }
    }
    None
}

async fn stream_info(
    axum::extract::State(state): axum::extract::State<AppState>,
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

    let mut resolved_url = None;

    if source == "tencent" || source == "qq" {
        if let Some(url) = get_tencent_url(&state.client, &id).await {
            resolved_url = Some(url.clone());
        }
    } else if source == "kuwo" {
        if let Some(url) = get_kuwo_url(&state.client, &id).await {
            resolved_url = Some(url.clone());
        }
    }

    if resolved_url.is_none() {
        if let Ok(resp) = no_redirect_client.get(&req_url).send().await {
            if resp.status().is_redirection() {
                if let Some(loc) = resp.headers().get("location") {
                    if let Ok(loc_str) = loc.to_str() {
                        resolved_url = Some(loc_str.to_string());
                    }
                }
            } else if resp.status().is_success() {
                resolved_url = Some(req_url.clone());
            }
        }
    }

    if let Some(final_url) = resolved_url {
        if !final_url.contains("404") && !final_url.is_empty() {
            return Json(json!({
                "ok": true,
                "url": final_url,
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
    axum::extract::State(state): axum::extract::State<AppState>,
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

    if source == "tencent" || source == "qq" {
        if let Some(url) = get_tencent_url(&state.client, &id).await {
            current_url = url;
        }
    } else if source == "kuwo" {
        if let Some(url) = get_kuwo_url(&state.client, &id).await {
            current_url = url;
        }
    }

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
