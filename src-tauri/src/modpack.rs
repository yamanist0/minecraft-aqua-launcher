use std::fs::{self, File};
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

use crate::settings::get_mc_root;

const MODRINTH_API: &str = "https://api.modrinth.com/v2";
const USER_AGENT: &str = "AquaLauncher/2.0 (https://github.com/Yaman-the-coder/aqua-launcher)";

// modpack dizin ve manifest yollari
pub fn get_modpacks_dir() -> PathBuf {
    let dir = get_mc_root().join("aqua-modpacks");
    let _ = fs::create_dir_all(&dir);
    dir
}

pub fn get_manifest_path() -> PathBuf {
    get_modpacks_dir().join("installed_modpacks.json")
}

// pack kimligini normalize eder
pub fn normalize_pack_id(pack_id: &str) -> String {
    let s = pack_id
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '_' || c == '-' { c } else { '-' })
        .collect::<String>();
    let trimmed = s.trim_matches('-');
    if trimmed.is_empty() {
        "pack".to_string()
    } else {
        trimmed.to_string()
    }
}

// yuklu modpack manifestini okur
#[tauri::command]
pub fn get_installed_modpacks() -> serde_json::Value {
    let path = get_manifest_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                return val;
            }
        }
    }
    serde_json::json!({})
}

// manifesti kaydeder
pub fn save_installed_modpack_entry(pack_id: &str, entry: serde_json::Value) {
    let mut manifest = get_installed_modpacks();
    if let Some(obj) = manifest.as_object_mut() {
        obj.insert(pack_id.to_string(), entry);
    }
    let path = get_manifest_path();
    let _ = fs::write(path, serde_json::to_string_pretty(&manifest).unwrap_or_default());
}

// bir klasorun icini baska klasore kopyalar
pub fn copy_directory_contents(src: &Path, dest: &Path) {
    if !src.exists() {
        return;
    }
    for entry in WalkDir::new(src).into_iter().flatten() {
        let path = entry.path();
        if let Ok(rel) = path.strip_prefix(src) {
            let target = dest.join(rel);
            if entry.file_type().is_dir() {
                let _ = fs::create_dir_all(&target);
            } else if entry.file_type().is_file() {
                if let Some(parent) = target.parent() {
                    let _ = fs::create_dir_all(parent);
                }
                let _ = fs::copy(path, &target);
            }
        }
    }
}

// secili paketin modlarini mc mods klasorune senkronize eder
pub fn sync_pack_mods_to_game(pack_id: &str) {
    let pack_mods_dir = get_modpacks_dir().join(normalize_pack_id(pack_id)).join("mods");
    let mc_mods_dir = get_mc_root().join("mods");

    let _ = fs::remove_dir_all(&mc_mods_dir);
    let _ = fs::create_dir_all(&mc_mods_dir);

    if pack_mods_dir.exists() {
        copy_directory_contents(&pack_mods_dir, &mc_mods_dir);
    }
}

// modrinth arama
#[tauri::command]
pub async fn search_modrinth(
    query: String,
    facets: Option<serde_json::Value>,
    offset: Option<usize>,
    limit: Option<usize>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let mut params = vec![
        ("query", query),
        ("limit", limit.unwrap_or(20).to_string()),
        ("offset", offset.unwrap_or(0).to_string()),
    ];

    let mut all_facets = vec![vec!["project_type:modpack".to_string()]];
    if let Some(f_val) = facets {
        if let Ok(custom_facets) = serde_json::from_value::<Vec<Vec<String>>>(f_val) {
            all_facets.extend(custom_facets);
        }
    }
    let facets_str = serde_json::to_string(&all_facets).unwrap_or_default();
    params.push(("facets", facets_str));

    let res = client
        .get(format!("{}/search", MODRINTH_API))
        .header("User-Agent", USER_AGENT)
        .query(&params)
        .send()
        .await
        .map_err(|e| format!("modrinth arama hatasi: {}", e))?;

    res.json().await.map_err(|e| format!("modrinth json hatasi: {}", e)) }

// modrinth proje detaylari
#[tauri::command]
pub async fn get_modrinth_project(id_or_slug: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let url = format!("{}/project/{}", MODRINTH_API, urlencoding::encode(&id_or_slug));
    let res = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("modrinth proje hatasi: {}", e))?;

    res.json().await.map_err(|e| format!("modrinth proje json hatasi: {}", e))
}

// modrinth proje surumleri
#[tauri::command]
pub async fn get_modrinth_versions(
    project_id: String,
    loaders: Option<Vec<String>>,
    game_versions: Option<Vec<String>>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let mut params = Vec::new();

    if let Some(l) = loaders {
        params.push(("loaders", serde_json::to_string(&l).unwrap_or_default()));
    }
    if let Some(gv) = game_versions {
        params.push(("game_versions", serde_json::to_string(&gv).unwrap_or_default()));
    }

    let url = format!("{}/project/{}/version", MODRINTH_API, urlencoding::encode(&project_id));
    let res = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .query(&params)
        .send()
        .await
        .map_err(|e| format!("modrinth surumler hatasi: {}", e))?;

    res.json().await.map_err(|e| format!("modrinth surumler json hatasi: {}", e))
}

// zip arsivinden belirli bir klasoru cikarir
fn extract_overrides_from_zip(zip_path: &Path, prefix: &str, output_dir: &Path) {
    let file = match File::open(zip_path) {
        Ok(f) => f,
        Err(_) => return,
    };
    let mut archive = match zip::ZipArchive::new(BufReader::new(file)) {
        Ok(a) => a,
        Err(_) => return,
    };

    let norm_prefix = prefix.trim_matches('/').to_string() + "/";
    for i in 0..archive.len() {
        if let Ok(mut entry) = archive.by_index(i) {
            let name = entry.name().replace('\\', "/");
            if name.starts_with(&norm_prefix) && !entry.is_dir() {
                let rel = &name[norm_prefix.len()..];
                if !rel.is_empty() {
                    let dest = output_dir.join(rel);
                    if let Some(parent) = dest.parent() {
                        let _ = fs::create_dir_all(parent);
                    }
                    if let Ok(mut out_file) = File::create(&dest) {
                        let _ = std::io::copy(&mut entry, &mut out_file);
                    }
                }
            }
        }
    }
}

// mrpack kurulumu
#[tauri::command]
pub async fn install_mrpack(
    app: AppHandle,
    pack_id: String,
    version_data: serde_json::Value,
    meta: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let norm_id = normalize_pack_id(&pack_id);
    let pack_dir = get_modpacks_dir().join(&norm_id);
    let pack_mods_dir = pack_dir.join("mods");
    let temp_dir = std::env::temp_dir().join(format!("aqua-mrpack-{}", chrono::Utc::now().timestamp_millis()));
    let _ = fs::create_dir_all(&temp_dir);

    let _ = app.emit(
        "modpack-status",
        serde_json::json!({
            "state": "downloading",
            "message": "Modpack arsivi indiriliyor...",
            "progress": { "completed": 0, "total": 1 }
        }),
    );

    let files_arr = version_data["files"].as_array().ok_or_else(|| "dosya bilgisi yok".to_string())?;
    let primary_file = files_arr
        .iter()
        .find(|f| f["primary"].as_bool() == Some(true))
        .or_else(|| files_arr.first())
        .ok_or_else(|| "mrpack dosyasi bulunamadi".to_string())?;

    let mrpack_url = primary_file["url"].as_str().ok_or_else(|| "indirme linki yok".to_string())?;
    let client = reqwest::Client::new();
    let mrpack_bytes = client
        .get(mrpack_url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("mrpack indirilemedi: {}", e))?
        .bytes()
        .await
        .map_err(|e| format!("mrpack verisi alinamadi: {}", e))?;

    let mrpack_path = temp_dir.join("pack.mrpack");
    fs::write(&mrpack_path, &mrpack_bytes).map_err(|e| format!("gecici mrpack yazilamadi: {}", e))?;

    // modrinth.index.json oku
    let index_str = {
        let file = File::open(&mrpack_path).map_err(|e| format!("mrpack acilamadi: {}", e))?;
        let mut archive = zip::ZipArchive::new(BufReader::new(file)).map_err(|e| format!("zip hatasi: {}", e))?;
        let mut index_entry = archive.by_name("modrinth.index.json").map_err(|_| "gecersiz mrpack: modrinth.index.json yok".to_string())?;
        let mut s = String::new();
        index_entry.read_to_string(&mut s).map_err(|e| format!("index okunamadi: {}", e))?;
        s
    };
    let metadata: serde_json::Value = serde_json::from_str(&index_str).map_err(|e| format!("index json hatasi: {}", e))?;

    let _ = fs::remove_dir_all(&pack_mods_dir);
    let _ = fs::create_dir_all(&pack_mods_dir);

    let files = metadata["files"].as_array().cloned().unwrap_or_default();
    let total = files.len();
    let mut completed = 0;

    let _ = app.emit(
        "modpack-status",
        serde_json::json!({
            "state": "downloading",
            "message": format!("Modlar indiriliyor (0/{})...", total),
            "progress": { "completed": 0, "total": total }
        }),
    );

    // modlari paralel indir
    let semaphore = Arc::new(tokio::sync::Semaphore::new(5));
    let mut handles = Vec::new();

    for file_info in files {
        let sem = semaphore.clone();
        let p_dir = pack_dir.clone();
        let app_h = app.clone();

        let handle = tokio::spawn(async move {
            let _permit = sem.acquire().await;
            if let Some(downloads) = file_info["downloads"].as_array() {
                if let Some(first_url) = downloads.first().and_then(|u| u.as_str()) {
                    if let Some(rel_path) = file_info["path"].as_str() {
                        let dest_path = p_dir.join(rel_path);
                        if let Some(parent) = dest_path.parent() {
                            let _ = fs::create_dir_all(parent);
                        }

                        let c = reqwest::Client::new();
                        if let Ok(res) = c.get(first_url).header("User-Agent", USER_AGENT).send().await {
                            if let Ok(bytes) = res.bytes().await {
                                let _ = fs::write(&dest_path, &bytes);
                            }
                        }
                    }
                }
            }
            app_h
        });
        handles.push(handle);
    }

    for h in handles {
        if let Ok(app_h) = h.await {
            completed += 1;
            let _ = app_h.emit(
                "modpack-status",
                serde_json::json!({
                    "state": "downloading",
                    "message": format!("Modlar indiriliyor ({}/{})...", completed, total),
                    "progress": { "completed": completed, "total": total }
                }),
            );
        }
    }

    let _ = app.emit(
        "modpack-status",
        serde_json::json!({
            "state": "preparing",
            "message": "Ek dosyalar kuruluyor..."
        }),
    );

    extract_overrides_from_zip(&mrpack_path, "overrides", &pack_dir);
    extract_overrides_from_zip(&mrpack_path, "client-overrides", &pack_dir);
    let _ = fs::remove_dir_all(temp_dir);

    let pack_name = meta
        .as_ref()
        .and_then(|m| m["name"].as_str())
        .or_else(|| metadata["name"].as_str())
        .unwrap_or(&pack_id);

    let deps = &metadata["dependencies"];
    let mc_ver = deps["minecraft"].as_str().unwrap_or("1.20.4");
    let mut mod_loaders = Vec::new();
    if let Some(fab) = deps["fabric-loader"].as_str() {
        mod_loaders.push(format!("fabric-{}", fab));
    }
    if let Some(fg) = deps["forge"].as_str() {
        mod_loaders.push(format!("forge-{}", fg));
    }

    let entry = serde_json::json!({
        "version": version_data["version_number"].as_str().unwrap_or("1.0"),
        "folder": norm_id,
        "type": "modrinth",
        "name": pack_name,
        "description": meta.as_ref().and_then(|m| m["description"].as_str()).unwrap_or(""),
        "iconUrl": meta.as_ref().and_then(|m| m["iconUrl"].as_str()).unwrap_or(""),
        "mcVersion": mc_ver,
        "modLoaders": mod_loaders,
        "fileCount": total
    });
    save_installed_modpack_entry(&pack_id, entry);
    sync_pack_mods_to_game(&pack_id);

    let _ = app.emit(
        "modpack-status",
        serde_json::json!({
            "state": "done",
            "message": format!("{} basariyla kuruldu.", pack_name)
        }),
    );

    Ok(serde_json::json!({ "success": true, "name": pack_name }))
}

// curseforge arama
#[tauri::command]
pub async fn search_curseforge(
    query: String,
    proxy_base_url: String,
    index: Option<usize>,
    page_size: Option<usize>,
) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let base = proxy_base_url.trim_end_matches('/');
    let url = format!("{}/v1/mods/search", base);

    let params = [
        ("gameId", "432"),
        ("classId", "4471"),
        ("searchFilter", &query),
        ("pageSize", &page_size.unwrap_or(20).to_string()),
        ("index", &index.unwrap_or(0).to_string()),
        ("sortField", "2"),
        ("sortOrder", "desc"),
    ];

    let res = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .query(&params)
        .send()
        .await
        .map_err(|e| format!("curseforge arama hatasi: {}", e))?;

    res.json().await.map_err(|e| format!("curseforge json hatasi: {}", e))
}

// curseforge proje detaylari
#[tauri::command]
pub async fn get_curseforge_project(mod_id: serde_json::Value, proxy_base_url: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let base = proxy_base_url.trim_end_matches('/');
    let id_str = mod_id.to_string().replace('"', "");
    let url = format!("{}/v1/mods/{}", base, id_str);

    let res = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("curseforge detay hatasi: {}", e))?;

    res.json().await.map_err(|e| format!("curseforge detay json hatasi: {}", e))
}

// curseforge dosya listesi
#[tauri::command]
pub async fn get_curseforge_files(mod_id: serde_json::Value, proxy_base_url: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let base = proxy_base_url.trim_end_matches('/');
    let id_str = mod_id.to_string().replace('"', "");
    let url = format!("{}/v1/mods/{}/files?pageSize=50", base, id_str);

    let res = client
        .get(&url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("curseforge dosya listesi hatasi: {}", e))?;

    res.json().await.map_err(|e| format!("curseforge dosyalar json hatasi: {}", e))
}

// curseforge modpack kurulumu
#[tauri::command]
pub async fn install_curseforge_pack(
    app: AppHandle,
    pack_id: String,
    file_data: serde_json::Value,
    proxy_base_url: String,
    meta: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    let norm_id = normalize_pack_id(&pack_id);
    let pack_dir = get_modpacks_dir().join(&norm_id);
    let pack_mods_dir = pack_dir.join("mods");
    let temp_dir = std::env::temp_dir().join(format!("aqua-cf-{}", chrono::Utc::now().timestamp_millis()));
    let _ = fs::create_dir_all(&temp_dir);

    let download_url = file_data["downloadUrl"].as_str().ok_or_else(|| "indirme linki yok".to_string())?;

    let _ = app.emit(
        "modpack-status",
        serde_json::json!({
            "state": "downloading",
            "message": "CurseForge modpack arsivi indiriliyor...",
            "progress": { "completed": 0, "total": 1 }
        }),
    );

    let client = reqwest::Client::new();
    let zip_bytes = client
        .get(download_url)
        .header("User-Agent", USER_AGENT)
        .send()
        .await
        .map_err(|e| format!("cf zip indirilemedi: {}", e))?
        .bytes()
        .await
        .map_err(|e| format!("cf zip verisi alinamadi: {}", e))?;

    let zip_path = temp_dir.join("modpack.zip");
    fs::write(&zip_path, &zip_bytes).map_err(|e| format!("gecici zip yazilamadi: {}", e))?;

    // manifest.json oku
    let manifest_str = {
        let file = File::open(&zip_path).map_err(|e| format!("zip acilamadi: {}", e))?;
        let mut archive = zip::ZipArchive::new(BufReader::new(file)).map_err(|e| format!("zip hatasi: {}", e))?;
        let mut manifest_entry = archive.by_name("manifest.json").map_err(|_| "gecersiz cf paketi: manifest.json yok".to_string())?;
        let mut s = String::new();
        manifest_entry.read_to_string(&mut s).map_err(|e| format!("manifest okunamadi: {}", e))?;
        s
    };
    let manifest: serde_json::Value = serde_json::from_str(&manifest_str).map_err(|e| format!("manifest json hatasi: {}", e))?;

    let _ = fs::remove_dir_all(&pack_mods_dir);
    let _ = fs::create_dir_all(&pack_mods_dir);

    let mod_files = manifest["files"].as_array().cloned().unwrap_or_default();
    let file_ids: Vec<i64> = mod_files.iter().filter_map(|f| f["fileID"].as_i64()).collect();
    let total = file_ids.len();

    let _ = app.emit(
        "modpack-status",
        serde_json::json!({
            "state": "preparing",
            "message": "Mod indirme baglantilari cozuluyor..."
        }),
    );

    // 50 serli gruplarla url leri al
    let base = proxy_base_url.trim_end_matches('/');
    let mut resolved_files = Vec::new();
    for chunk in file_ids.chunks(50) {
        let body = serde_json::json!({ "fileIds": chunk });
        if let Ok(res) = client
            .post(format!("{}/v1/mods/files", base))
            .header("User-Agent", USER_AGENT)
            .json(&body)
            .send()
            .await
        {
            if let Ok(val) = res.json::<serde_json::Value>().await {
                if let Some(arr) = val["data"].as_array() {
                    resolved_files.extend(arr.clone());
                }
            }
        }
    }

    let mut completed = 0;
    let _ = app.emit(
        "modpack-status",
        serde_json::json!({
            "state": "downloading",
            "message": format!("Modlar indiriliyor (0/{})...", total),
            "progress": { "completed": 0, "total": total }
        }),
    );

    let semaphore = Arc::new(tokio::sync::Semaphore::new(5));
    let mut handles = Vec::new();

    for file_info in resolved_files {
        let sem = semaphore.clone();
        let p_dir = pack_dir.clone();
        let app_h = app.clone();

        let handle = tokio::spawn(async move {
            let _permit = sem.acquire().await;
            if let Some(d_url) = file_info["downloadUrl"].as_str() {
                let file_name = file_info["fileName"].as_str().unwrap_or("mod.jar");
                let sub_dir = if file_name.ends_with(".zip") { "resourcepacks" } else { "mods" };
                let target_dir = p_dir.join(sub_dir);
                let _ = fs::create_dir_all(&target_dir);
                let dest_path = target_dir.join(file_name);

                let c = reqwest::Client::new();
                if let Ok(res) = c.get(d_url).header("User-Agent", USER_AGENT).send().await {
                    if let Ok(bytes) = res.bytes().await {
                        let _ = fs::write(dest_path, bytes);
                    }
                }
            }
            app_h
        });
        handles.push(handle);
    }

    for h in handles {
        if let Ok(app_h) = h.await {
            completed += 1;
            let _ = app_h.emit(
                "modpack-status",
                serde_json::json!({
                    "state": "downloading",
                    "message": format!("Modlar indiriliyor ({}/{})...", completed, total),
                    "progress": { "completed": completed, "total": total }
                }),
            );
        }
    }

    let overrides_folder = manifest["overrides"].as_str().unwrap_or("overrides");
    extract_overrides_from_zip(&zip_path, overrides_folder, &pack_dir);
    let _ = fs::remove_dir_all(temp_dir);

    let pack_name = meta
        .as_ref()
        .and_then(|m| m["name"].as_str())
        .or_else(|| manifest["name"].as_str())
        .unwrap_or(&pack_id);

    let mc_ver = manifest["minecraft"]["version"].as_str().unwrap_or("1.20.4");
    let mod_loaders: Vec<String> = manifest["minecraft"]["modLoaders"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|l| l["id"].as_str().map(|s| s.to_string())).collect())
        .unwrap_or_default();

    let entry = serde_json::json!({
        "version": file_data["id"].to_string(),
        "folder": norm_id,
        "type": "curseforge",
        "name": pack_name,
        "description": meta.as_ref().and_then(|m| m["description"].as_str()).unwrap_or(""),
        "iconUrl": meta.as_ref().and_then(|m| m["iconUrl"].as_str()).unwrap_or(""),
        "mcVersion": mc_ver,
        "modLoaders": mod_loaders,
        "fileCount": total
    });
    save_installed_modpack_entry(&pack_id, entry);
    sync_pack_mods_to_game(&pack_id);

    let _ = app.emit(
        "modpack-status",
        serde_json::json!({
            "state": "done",
            "message": format!("{} basariyla kuruldu.", pack_name)
        }),
    );

    Ok(serde_json::json!({ "success": true, "name": pack_name }))
}

// ozel modpack indirme ve guncelleme
#[tauri::command]
pub async fn download_modpack(
    app: AppHandle,
    pack_id: String,
    data: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let norm_id = normalize_pack_id(&pack_id);
    let pack_dir = get_modpacks_dir().join(&norm_id);
    let pack_mods_dir = pack_dir.join("mods");
    let _ = fs::create_dir_all(&pack_mods_dir);

    let mut mod_urls: Vec<String> = Vec::new();
    let client = reqwest::Client::new();

    if let Some(json_url) = data["modpackJsonUrl"].as_str() {
        if let Ok(res) = client.get(json_url).send().await {
            if let Ok(val) = res.json::<serde_json::Value>().await {
                if let Some(arr) = val.as_array() {
                    for item in arr {
                        if let Some(s) = item.as_str() {
                            mod_urls.push(s.to_string());
                        }
                    }
                } else if let Some(arr) = val["mods"].as_array() {
                    for item in arr {
                        if let Some(s) = item.as_str() {
                            mod_urls.push(s.to_string());
                        }
                    }
                }
            }
        }
    }

    if mod_urls.is_empty() {
        if let Some(arr) = data["mods"].as_array().or_else(|| data["modUrls"].as_array()) {
            for item in arr {
                if let Some(s) = item.as_str() {
                    mod_urls.push(s.to_string());
                }
            }
        }
    }

    let total = mod_urls.len();
    if total > 0 {
        let _ = app.emit(
            "modpack-status",
            serde_json::json!({
                "state": "downloading",
                "message": format!("Modlar indiriliyor (0/{})...", total),
                "progress": { "completed": 0, "total": total }
            }),
        );

        let mut completed = 0;
        for url in mod_urls {
            if let Ok(res) = client.get(&url).header("User-Agent", USER_AGENT).send().await {
                if let Ok(bytes) = res.bytes().await {
                    let file_name = url.split('/').last().unwrap_or("mod.jar").split('?').next().unwrap_or("mod.jar");
                    let dest = pack_mods_dir.join(file_name);
                    let _ = fs::write(dest, bytes);
                }
            }
            completed += 1;
            let _ = app.emit(
                "modpack-status",
                serde_json::json!({
                    "state": "downloading",
                    "message": format!("Modlar indiriliyor ({}/{})...", completed, total),
                    "progress": { "completed": completed, "total": total }
                }),
            );
        }
    }

    let entry = serde_json::json!({
        "version": data["version"].as_str().unwrap_or("1.0"),
        "folder": norm_id,
        "name": data["name"].as_str().unwrap_or(&pack_id)
    });
    save_installed_modpack_entry(&pack_id, entry);
    sync_pack_mods_to_game(&pack_id);

    let _ = app.emit(
        "modpack-status",
        serde_json::json!({
            "state": "done",
            "message": "Modpack basariyla yuklendi."
        }),
    );

    Ok(serde_json::json!({ "success": true }))
}

// ozel modpack i yeniden kurar
#[tauri::command]
pub async fn reinstall_modpack(
    app: AppHandle,
    pack_id: String,
    data: serde_json::Value,
) -> Result<serde_json::Value, String> {
    download_modpack(app, pack_id, data).await
}
