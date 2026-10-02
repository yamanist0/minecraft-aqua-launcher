use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::Mutex;

const DEFAULT_SERVERS_URL: &str =
    "https://raw.githubusercontent.com/yamanist0/aqua-launcher/refs/heads/main/servers.json";
const PAGE_SIZE: usize = 30;
const PING_TIMEOUT_MS: u64 = 2000;
const PING_CONCURRENCY: usize = 6;

// sunucu veri modeli
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerItem {
    pub name: Option<String>,
    pub ip: String,
    pub description: Option<String>,
    pub banner: Option<String>,
    pub version: Option<String>,
    #[serde(default)]
    pub players: Option<String>,
    #[serde(default)]
    pub online: Option<bool>,
    #[serde(default)]
    pub live: Option<bool>,
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServersPageResult {
    pub servers: Vec<ServerItem>,
    pub page: usize,
    #[serde(rename = "totalPages")]
    pub total_pages: usize,
    #[serde(rename = "totalServers")]
    pub total_servers: usize,
    #[serde(rename = "pageSize")]
    pub page_size: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerPlayerUpdate {
    pub page: usize,
    pub ip: String,
    pub players: Option<String>,
    pub online: bool,
    pub live: bool,
    pub version: Option<String>,
}

// sunucu listesi onbellegi
pub struct ServerCache {
    pub url: String,
    pub data: Vec<ServerItem>,
    pub timestamp: std::time::Instant,
}

pub struct ServerManager {
    pub cache: Mutex<Option<ServerCache>>,
    pub ping_generation: AtomicU64,
}

impl ServerManager {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(None),
            ping_generation: AtomicU64::new(0),
        }
    }
}

// varint byte dizisi yazar
fn write_varint(mut value: i32) -> Vec<u8> {
    let mut bytes = Vec::new();
    loop {
        if (value & !0x7F) == 0 {
            bytes.push(value as u8);
            return bytes;
        }
        bytes.push(((value & 0x7F) | 0x80) as u8);
        value = (value as u32 >> 7) as i32;
    }
}

// buffer dan varint okur
fn read_varint(buffer: &[u8], offset: &mut usize) -> Result<i32, String> {
    let mut num_read = 0;
    let mut result = 0;

    loop {
        if *offset >= buffer.len() {
            return Err("eksik varint verisi".to_string());
        }
        let read = buffer[*offset];
        *offset += 1;
        result |= ((read & 0x7F) as i32) << (7 * num_read);
        num_read += 1;
        if num_read > 5 {
            return Err("varint boyutu cok buyuk".to_string());
        }
        if (read & 0x80) == 0 {
            break;
        }
    }
    Ok(result)
}

// buffer dan string okur
fn read_string(buffer: &[u8], offset: &mut usize) -> Result<String, String> {
    let length = read_varint(buffer, offset)? as usize;
    if *offset + length > buffer.len() {
        return Err("eksik string verisi".to_string());
    }
    let s = String::from_utf8_lossy(&buffer[*offset..*offset + length]).to_string();
    *offset += length;
    Ok(s)
}

// paket olusturur
fn create_packet(packet_id: i32, data: &[u8]) -> Vec<u8> {
    let mut payload = write_varint(packet_id);
    payload.extend_from_slice(data);
    let mut packet = write_varint(payload.len() as i32);
    packet.extend_from_slice(&payload);
    packet
}

// sunucuyu tcp uzerinden pingler
pub async fn ping_server(address: &str) -> (bool, Option<String>, Option<String>) {
    let parts: Vec<&str> = address.trim().split(':').collect();
    let host = parts[0];
    let port: u16 = if parts.len() > 1 {
        parts[1].parse().unwrap_or(25565)
    } else {
        25565
    };

    let target = format!("{}:{}", host, port);
    let connect_fut = TcpStream::connect(&target);
    let mut stream = match tokio::time::timeout(Duration::from_millis(PING_TIMEOUT_MS), connect_fut).await {
        Ok(Ok(s)) => s,
        _ => return (false, None, None),
    };

    // handshake paketi
    let mut hs_data = Vec::new();
    hs_data.extend(write_varint(765));
    let host_bytes = host.as_bytes();
    hs_data.extend(write_varint(host_bytes.len() as i32));
    hs_data.extend_from_slice(host_bytes);
    hs_data.extend_from_slice(&port.to_be_bytes());
    hs_data.extend(write_varint(1)); // durum sorgulama

    let handshake_packet = create_packet(0x00, &hs_data);
    let status_request_packet = create_packet(0x00, &[]);

    let write_fut = async {
        stream.write_all(&handshake_packet).await?;
        stream.write_all(&status_request_packet).await?;
        stream.flush().await
    };

    if tokio::time::timeout(Duration::from_millis(PING_TIMEOUT_MS), write_fut).await.is_err() {
        return (false, None, None);
    }

    // yaniti oku
    let mut buffer = Vec::new();
    let mut temp = [0u8; 1024];

    let read_fut = async {
        loop {
            let n = stream.read(&mut temp).await.map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            buffer.extend_from_slice(&temp[..n]);

            let mut offset = 0;
            if let Ok(_len) = read_varint(&buffer, &mut offset) {
                if let Ok(packet_id) = read_varint(&buffer, &mut offset) {
                    if packet_id == 0x00 {
                        if let Ok(json_str) = read_string(&buffer, &mut offset) {
                            return Ok::<String, String>(json_str);
                        }
                    }
                }
            }
        }
        Err("yanit alinamadi".to_string())
    };

    match tokio::time::timeout(Duration::from_millis(PING_TIMEOUT_MS), read_fut).await {
        Ok(Ok(json_str)) => {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&json_str) {
                let online_players = val["players"]["online"].as_i64().unwrap_or(0);
                let max_players = val["players"]["max"].as_i64().unwrap_or(0);
                let version_name = val["version"]["name"].as_str().map(|s| s.to_string());
                let players_str = format!("{}/{}", online_players, max_players);
                return (true, Some(players_str), version_name);
            }
            (true, None, None)
        }
        _ => (false, None, None),
    }
}

// sunucu listesini ceker
pub async fn load_servers(manager: &ServerManager, url: Option<String>) -> Result<Vec<ServerItem>, String> {
    let target_url = url.unwrap_or_else(|| DEFAULT_SERVERS_URL.to_string());
    let mut cache_guard = manager.cache.lock().await;

    if let Some(ref c) = *cache_guard {
        if c.url == target_url && c.timestamp.elapsed() < Duration::from_secs(300) {
            return Ok(c.data.clone());
        }
    }

    let client = reqwest::Client::new();
    let res = client
        .get(&target_url)
        .header("User-Agent", "Aqua-Launcher/2.0")
        .send()
        .await
        .map_err(|e| format!("sunucu listesi alinamadi: {}", e))?;

    let servers: Vec<ServerItem> = res
        .json()
        .await
        .map_err(|e| format!("sunucu json parse hatasi: {}", e))?;

    *cache_guard = Some(ServerCache {
        url: target_url,
        data: servers.clone(),
        timestamp: std::time::Instant::now(),
    });

    Ok(servers)
}

// sunucu sayfasini ve arama sonuclarini dondurur
#[tauri::command]
pub async fn get_servers_page(
    app: AppHandle,
    state: tauri::State<'_, Arc<ServerManager>>,
    page: Option<usize>,
    server_list_url: Option<String>,
    query: Option<String>,
) -> Result<ServersPageResult, String> {
    let mut all_servers = load_servers(&state, server_list_url).await?;

    if let Some(ref q) = query {
        let lower = q.to_lowercase();
        if !lower.trim().is_empty() {
            all_servers.retain(|s| {
                let name_match = s.name.as_ref().map(|n| n.to_lowercase().contains(&lower)).unwrap_or(false);
                let desc_match = s.description.as_ref().map(|d| d.to_lowercase().contains(&lower)).unwrap_or(false);
                name_match || desc_match
            });
        }
    }

    let total_servers = all_servers.len();
    let total_pages = 1.max((total_servers + PAGE_SIZE - 1) / PAGE_SIZE);
    let safe_page = page.unwrap_or(1).clamp(1, total_pages);
    let start = (safe_page - 1) * PAGE_SIZE;
    let end = (start + PAGE_SIZE).min(total_servers);

    let page_servers: Vec<ServerItem> = if start < total_servers {
        all_servers[start..end]
            .iter()
            .map(|s| {
                let mut item = s.clone();
                item.live = Some(false);
                item.online = None;
                item
            })
            .collect()
    } else {
        Vec::new()
    };

    // arkaplanda canli ping guncellemelerini baslat
    let generation = state.ping_generation.fetch_add(1, Ordering::SeqCst) + 1;
    let servers_to_ping = page_servers.clone();
    let ping_state = state.inner().clone();
    let app_handle = app.clone();

    tokio::spawn(async move {
        let semaphore = Arc::new(tokio::sync::Semaphore::new(PING_CONCURRENCY));
        let mut handles = Vec::new();

        for server in servers_to_ping {
            let sem = semaphore.clone();
            let app_h = app_handle.clone();
            let ping_mgr = ping_state.clone();

            let handle = tokio::spawn(async move {
                let _permit = sem.acquire().await;
                if ping_mgr.ping_generation.load(Ordering::SeqCst) != generation {
                    return;
                }

                let (online, players, version) = ping_server(&server.ip).await;
                if ping_mgr.ping_generation.load(Ordering::SeqCst) != generation {
                    return;
                }

                let update = ServerPlayerUpdate {
                    page: safe_page,
                    ip: server.ip.clone(),
                    players: if online { players } else { server.players.clone() },
                    online,
                    live: true,
                    version: version.or(server.version),
                };

                let _ = app_h.emit("server-players-update", update);
            });

            handles.push(handle);
        }

        for h in handles {
            let _ = h.await;
        }
    });

    Ok(ServersPageResult {
        servers: page_servers,
        page: safe_page,
        total_pages,
        total_servers,
        page_size: PAGE_SIZE,
    })
}

// tum sunuculari dondurur
#[tauri::command]
pub async fn get_all_servers(
    state: tauri::State<'_, Arc<ServerManager>>,
    server_list_url: Option<String>,
) -> Result<Vec<ServerItem>, String> {
    let servers = load_servers(&state, server_list_url).await?;
    Ok(servers
        .into_iter()
        .map(|mut s| {
            s.live = Some(false);
            s.online = None;
            s
        })
        .collect())
}
