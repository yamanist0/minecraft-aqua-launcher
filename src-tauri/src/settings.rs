use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

// ayarlar veri yapisi
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherSettings {
    #[serde(default = "default_modpack_urls")]
    pub modpack_urls: Vec<String>,
    #[serde(default)]
    pub java_args: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub open_console: bool,
    #[serde(default = "default_server_list_url")]
    pub server_list_url: String,
    #[serde(default = "default_curseforge_proxy_url")]
    pub curseforge_proxy_url: Option<String>,
    #[serde(default)]
    pub memory: Option<u32>,
    #[serde(default)]
    pub active_modpack_id: Option<String>,
    #[serde(default)]
    pub mc_version: Option<String>,
    #[serde(default)]
    pub loader: Option<String>,
    #[serde(default)]
    pub loader_version: Option<String>,
    #[serde(default)]
    pub free_panorama: Option<bool>,
    #[serde(default)]
    pub panorama_dim: Option<u32>,
    #[serde(flatten)]
    pub extra: std::collections::HashMap<String, serde_json::Value>,
}

fn default_modpack_urls() -> Vec<String> {
    vec!["https://raw.githubusercontent.com/Yaman-the-coder/aqua-launcher/refs/heads/main/modpacks.json".to_string()]
}

fn default_server_list_url() -> String {
    "https://raw.githubusercontent.com/Yaman-the-coder/aqua-launcher/refs/heads/main/servers.json".to_string()
}

fn default_curseforge_proxy_url() -> Option<String> {
    Some("https://patient-darkness-1364.yaman26.workers.dev/".to_string())
}

impl Default for LauncherSettings {
    fn default() -> Self {
        Self {
            modpack_urls: default_modpack_urls(),
            java_args: String::new(),
            password: String::new(),
            open_console: false,
            server_list_url: default_server_list_url(),
            curseforge_proxy_url: default_curseforge_proxy_url(),
            memory: None,
            active_modpack_id: None,
            mc_version: None,
            loader: None,
            loader_version: None,
            free_panorama: None,
            panorama_dim: None,
            extra: std::collections::HashMap::new(),
        }
    }
}

// app data dizinini dondurur
pub fn get_app_data_dir() -> PathBuf {
    if let Some(config_dir) = dirs::config_dir() {
        let path = config_dir.join("aqua-launcher");
        let _ = fs::create_dir_all(&path);
        path
    } else {
        PathBuf::from("./data")
    }
}

// minecraft calisma dizinini dondurur
pub fn get_mc_root() -> PathBuf {
    let dir = get_app_data_dir().join(".minecraft");
    let _ = fs::create_dir_all(&dir);
    dir
}

// ayar dosyasinin tam yolu
pub fn get_settings_path() -> PathBuf {
    get_app_data_dir().join("settings.json")
}

// ayarlari okur
#[tauri::command]
pub fn get_settings() -> LauncherSettings {
    let path = get_settings_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str::<LauncherSettings>(&content) {
                return settings;
            }
        }
    }
    LauncherSettings::default()
}

// ayarlari kaydeder
#[tauri::command]
pub fn save_settings(settings: serde_json::Value) -> Result<(), String> {
    let path = get_settings_path();
    let json_str = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("ayarlar json yapilamadi: {}", e))?;
    fs::write(path, json_str).map_err(|e| format!("ayarlar kaydedilemedi: {}", e))?;
    Ok(())
}

// toplam fiziksel ram miktarini byte olarak dondurur
#[cfg(target_os = "windows")]
fn total_ram_bytes() -> u64 {
    unsafe {
        #[repr(C)]
        struct MemoryStatusEx {
            dw_length: u32,
            dw_memory_load: u32,
            ull_total_phys: u64,
            ull_avail_phys: u64,
            ull_total_page_file: u64,
            ull_avail_page_file: u64,
            ull_total_virtual: u64,
            ull_avail_virtual: u64,
            ull_avail_extended_virtual: u64,
        }
        extern "system" {
            fn GlobalMemoryStatusEx(lp_buffer: *mut MemoryStatusEx) -> i32;
        }
        let mut ms = MemoryStatusEx {
            dw_length: std::mem::size_of::<MemoryStatusEx>() as u32,
            dw_memory_load: 0,
            ull_total_phys: 0,
            ull_avail_phys: 0,
            ull_total_page_file: 0,
            ull_avail_page_file: 0,
            ull_total_virtual: 0,
            ull_avail_virtual: 0,
            ull_avail_extended_virtual: 0,
        };
        if GlobalMemoryStatusEx(&mut ms) != 0 {
            ms.ull_total_phys
        } else {
            0
        }
    }
}

// windows disinda /proc/meminfo dan okur (linux)
#[cfg(not(target_os = "windows"))]
fn total_ram_bytes() -> u64 {
    if let Ok(content) = fs::read_to_string("/proc/meminfo") {
        for line in content.lines() {
            if let Some(rest) = line.strip_prefix("MemTotal:") {
                let kb: u64 = rest.split_whitespace().next().and_then(|v| v.parse().ok()).unwrap_or(0);
                return kb * 1024;
            }
        }
    }
    0
}

// toplam ram i gb olarak dondurur (ram secici icin)
#[tauri::command]
pub fn get_system_memory() -> serde_json::Value {
    let gb = (total_ram_bytes() as f64 / (1024.0 * 1024.0 * 1024.0)).round() as u64;
    serde_json::json!({ "totalGb": gb })
}
