use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewOptions {
    pub loader: String,
    pub mc_version: String,
    pub loader_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewResult {
    pub label: String,
    pub loader_version: Option<String>,
    pub available: bool,
}

// surum karsilastirmasi icin sayisal segmentleri ayirir
fn compare_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let a_nums: Vec<i64> = a.split('.').filter_map(|s| s.parse().ok()).collect();
    let b_nums: Vec<i64> = b.split('.').filter_map(|s| s.parse().ok()).collect();
    let max_len = a_nums.len().max(b_nums.len());

    for i in 0..max_len {
        let a_val = a_nums.get(i).copied().unwrap_or(0);
        let b_val = b_nums.get(i).copied().unwrap_or(0);
        if a_val != b_val {
            return a_val.cmp(&b_val);
        }
    }
    a.cmp(b)
}

// mojang surum listesini ceker
#[tauri::command]
pub async fn get_versions() -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let manifest: serde_json::Value = client
        .get("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json")
        .send()
        .await
        .map_err(|e| format!("mojang manifest alinamadi: {}", e))?
        .json()
        .await
        .map_err(|e| format!("mojang manifest json hatasi: {}", e))?;

    let mut versions = Vec::new();
    if let Some(arr) = manifest["versions"].as_array() {
        for v in arr {
            if v["type"].as_str() == Some("release") {
                if let Some(id) = v["id"].as_str() {
                    versions.push(id.to_string());
                }
            }
        }
    }
    Ok(versions)
}

// fabric surumlerini ceker
pub async fn get_fabric_loaders(mc_version: &str) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let url = format!("https://meta.fabricmc.net/v2/versions/loader/{}", mc_version);
    let loaders: serde_json::Value = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("fabric surumleri alinamadi: {}", e))?
        .json()
        .await
        .map_err(|e| format!("fabric json hatasi: {}", e))?;

    let mut list = Vec::new();
    if let Some(arr) = loaders.as_array() {
        for entry in arr {
            if let Some(ver) = entry["loader"]["version"].as_str() {
                list.push(ver.to_string());
            }
        }
    }
    list.sort_by(|a, b| compare_versions(b, a));
    Ok(list)
}

// forge surumlerini ceker
pub async fn get_forge_loaders(mc_version: &str) -> Result<Vec<String>, String> {
    let client = reqwest::Client::new();
    let xml = client
        .get("https://files.minecraftforge.net/maven/net/minecraftforge/forge/maven-metadata.xml")
        .send()
        .await
        .map_err(|e| format!("forge metadata alinamadi: {}", e))?
        .text()
        .await
        .map_err(|e| format!("forge text okunamadi: {}", e))?;

    let re = Regex::new(r"<version>([^<]+)</version>").map_err(|e| e.to_string())?;
    let prefix = format!("{}-", mc_version);
    let mut list = Vec::new();

    for cap in re.captures_iter(&xml) {
        if let Some(matched) = cap.get(1) {
            let ver = matched.as_str();
            if ver.starts_with(&prefix) {
                list.push(ver[prefix.len()..].to_string());
            }
        }
    }

    list.sort_by(|a, b| compare_versions(b, a));
    Ok(list)
}

// loader surumlerini dondurur
#[tauri::command]
pub async fn get_loader_versions(mc_version: String, loader: String) -> Result<Vec<String>, String> {
    match loader.to_lowercase().as_str() {
        "fabric" => get_fabric_loaders(&mc_version).await,
        "forge" => get_forge_loaders(&mc_version).await,
        _ => Ok(Vec::new()),
    }
}

// surum onizleme etiketi olusturur
#[tauri::command]
pub async fn preview_version(options: PreviewOptions) -> Result<PreviewResult, String> {
    let mut resolved_loader_version = options.loader_version.clone();
    let loader = options.loader.to_lowercase();

    if loader == "fabric" && resolved_loader_version.is_none() {
        if let Ok(loaders) = get_fabric_loaders(&options.mc_version).await {
            resolved_loader_version = loaders.first().cloned();
        }
    } else if loader == "forge" && resolved_loader_version.is_none() {
        if let Ok(loaders) = get_forge_loaders(&options.mc_version).await {
            resolved_loader_version = loaders.first().cloned();
        }
    }

    let available = loader == "vanilla" || resolved_loader_version.is_some();
    let label = match loader.as_str() {
        "vanilla" => format!("Vanilla {}", options.mc_version),
        "fabric" => {
            if let Some(ref lv) = resolved_loader_version {
                format!("Fabric {} ({})", options.mc_version, lv)
            } else {
                format!("Fabric {}", options.mc_version)
            }
        }
        "forge" => {
            if let Some(ref lv) = resolved_loader_version {
                format!("Forge {} ({})", options.mc_version, lv)
            } else {
                format!("Forge {}", options.mc_version)
            }
        }
        _ => options.mc_version.clone(),
    };

    Ok(PreviewResult {
        label,
        loader_version: resolved_loader_version,
        available,
    })
}
