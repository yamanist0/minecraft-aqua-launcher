use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader as TokioBufReader};
use tokio::process::Command as TokioCommand;
use crate::auth::get_auth_path;
use crate::console::GameConsole;
use crate::java::{download_java, get_java_info};
use crate::loaders::get_fabric_loaders;
use crate::settings::get_mc_root;

// baslatma secenekleri
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchOptions {
    pub loader: String,
    pub mc_version: String,
    pub memory: Option<u32>,
    pub forge_version: Option<String>,
    pub fabric_loader_version: Option<String>,
    pub java_args: Option<String>,
    pub open_console: Option<bool>,
}

pub struct LaunchManager {
    pub is_launching: AtomicBool,
}

impl LaunchManager {
    pub fn new() -> Self {
        Self {
            is_launching: AtomicBool::new(false),
        }
    }
}

// dosya indirir
async fn download_file(url: &str, dest: &Path) -> Result<(), String> {
    if dest.exists() {
        return Ok(());
    }
    if let Some(parent) = dest.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let client = reqwest::Client::new();
    let res = client
        .get(url)
        .header("User-Agent", "AquaLauncher/2.0")
        .send()
        .await
        .map_err(|e| format!("indirme basarisiz ({}): {}", url, e))?;

    let bytes = res.bytes().await.map_err(|e| format!("veri alinamadi: {}", e))?;
    fs::write(dest, bytes).map_err(|e| format!("dosya yazilamadi: {}", e))?;
    Ok(())
}

// kural kontrolu (windows icin)
fn is_rule_allowed(rule: &serde_json::Value) -> bool {
    let action = rule["action"].as_str().unwrap_or("allow");
    if let Some(os) = rule.get("os") {
        let name = os["name"].as_str().unwrap_or("");
        if action == "allow" {
            name == "windows"
        } else {
            name != "windows"
        }
    } else {
        action == "allow"
    }
}

fn are_rules_allowed(rules: Option<&Vec<serde_json::Value>>) -> bool {
    if let Some(rules_arr) = rules {
        if rules_arr.is_empty() {
            return true;
        }
        let mut allowed = false;
        for r in rules_arr {
            let action = r["action"].as_str().unwrap_or("allow");
            if let Some(os) = r.get("os") {
                let name = os["name"].as_str().unwrap_or("");
                if name == "windows" {
                    allowed = action == "allow";
                }
            } else {
                allowed = action == "allow";
            }
        }
        allowed
    } else {
        true
    }
}

// minecraft surum json ini ceker ve indirir
async fn prepare_version_json(mc_root: &Path, mc_version: &str) -> Result<serde_json::Value, String> {
    let version_dir = mc_root.join("versions").join(mc_version);
    let version_json_path = version_dir.join(format!("{}.json", mc_version));
    let _ = fs::create_dir_all(&version_dir);

    if version_json_path.exists() {
        if let Ok(content) = fs::read_to_string(&version_json_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                return Ok(json);
            }
        }
    }

    let client = reqwest::Client::new();
    let manifest: serde_json::Value = client
        .get("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json")
        .send()
        .await
        .map_err(|e| format!("manifest alinamadi: {}", e))?
        .json()
        .await
        .map_err(|e| format!("manifest json hatasi: {}", e))?;

    let version_entry = manifest["versions"]
        .as_array()
        .and_then(|arr| arr.iter().find(|v| v["id"].as_str() == Some(mc_version)))
        .ok_or_else(|| format!("Minecraft {} surumu bulunamadi", mc_version))?;

    let version_url = version_entry["url"].as_str().ok_or_else(|| "surum url yok".to_string())?;
    let version_json: serde_json::Value = client
        .get(version_url)
        .send()
        .await
        .map_err(|e| format!("surum json alinamadi: {}", e))?
        .json()
        .await
        .map_err(|e| format!("surum json hatasi: {}", e))?;

    let _ = fs::write(&version_json_path, serde_json::to_string_pretty(&version_json).unwrap_or_default());
    Ok(version_json)
}

// client jar indirir
async fn prepare_client_jar(mc_root: &Path, mc_version: &str, version_json: &serde_json::Value) -> Result<PathBuf, String> {
    let version_dir = mc_root.join("versions").join(mc_version);
    let client_jar_path = version_dir.join(format!("{}.jar", mc_version));

    if client_jar_path.exists() {
        return Ok(client_jar_path);
    }

    let client_url = version_json["downloads"]["client"]["url"]
        .as_str()
        .ok_or_else(|| "client jar indirme linki yok".to_string())?;

    download_file(client_url, &client_jar_path).await?;
    Ok(client_jar_path)
}

// kutuphaneleri indirir ve classpath olusturur
async fn prepare_libraries_and_natives(
    mc_root: &Path,
    mc_version: &str,
    version_json: &serde_json::Value,
    _app: &AppHandle,
) -> Result<(Vec<PathBuf>, PathBuf), String> {
    let libs_root = mc_root.join("libraries");
    let natives_dir = mc_root.join("natives").join(mc_version);
    let _ = fs::create_dir_all(&libs_root);
    let _ = fs::create_dir_all(&natives_dir);

    let mut classpath = Vec::new();
    let libraries = version_json["libraries"].as_array().cloned().unwrap_or_default();

    for lib in libraries {
        let rules_opt = lib["rules"].as_array();
        if !are_rules_allowed(rules_opt) {
            continue;
        }

        // standart kutuphane
        if let Some(artifact) = lib["downloads"]["artifact"].as_object() {
            if let (Some(rel_path), Some(url)) = (artifact["path"].as_str(), artifact["url"].as_str()) {
                let dest = libs_root.join(rel_path);
                let _ = download_file(url, &dest).await;
                if dest.exists() {
                    classpath.push(dest);
                }
            }
        } else if let Some(name) = lib["name"].as_str() {
            // maven name den yol olustur
            let parts: Vec<&str> = name.split(':').collect();
            if parts.len() >= 3 {
                let group = parts[0].replace('.', "/");
                let artifact = parts[1];
                let ver = parts[2];
                let jar_name = format!("{}-{}.jar", artifact, ver);
                let rel_path = format!("{}/{}/{}/{}", group, artifact, ver, jar_name);
                let dest = libs_root.join(&rel_path);

                if let Some(url) = lib["url"].as_str() {
                    let full_url = format!("{}/{}", url.trim_end_matches('/'), rel_path);
                    let _ = download_file(&full_url, &dest).await;
                }
                if dest.exists() {
                    classpath.push(dest);
                }
            }
        }

        // native dll ler
        if let Some(classifiers) = lib["downloads"]["classifiers"].as_object() {
            if let Some(natives_win) = classifiers.get("natives-windows") {
                if let (Some(rel_path), Some(url)) = (natives_win["path"].as_str(), natives_win["url"].as_str()) {
                    let dest = libs_root.join(rel_path);
                    let _ = download_file(url, &dest).await;
                    if dest.exists() {
                        if let Ok(file) = File::open(&dest) {
                            if let Ok(mut archive) = zip::ZipArchive::new(BufReader::new(file)) {
                                for i in 0..archive.len() {
                                    if let Ok(mut entry) = archive.by_index(i) {
                                        let entry_name = entry.name().to_string();
                                        if entry_name.ends_with(".dll") && !entry.is_dir() {
                                            let out_path = natives_dir.join(&entry_name);
                                            if let Ok(mut out_file) = File::create(&out_path) {
                                                let _ = std::io::copy(&mut entry, &mut out_file);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok((classpath, natives_dir))
}

// fabric profili hazirlar
async fn prepare_fabric_profile(
    mc_root: &Path,
    mc_version: &str,
    loader_ver_opt: Option<&str>,
) -> Result<(String, Vec<PathBuf>), String> {
    let resolved_loader = if let Some(v) = loader_ver_opt {
        v.to_string()
    } else {
        let loaders = get_fabric_loaders(mc_version).await?;
        loaders.first().cloned().ok_or_else(|| "fabric surumu bulunamadi".to_string())?
    };

    let client = reqwest::Client::new();
    let url = format!(
        "https://meta.fabricmc.net/v2/versions/loader/{}/{}/profile/json",
        mc_version, resolved_loader
    );

    let profile: serde_json::Value = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("fabric profil istegi basarisiz: {}", e))?
        .json()
        .await
        .map_err(|e| format!("fabric profil json hatasi: {}", e))?;

    let main_class = profile["mainClass"]
        .as_str()
        .unwrap_or("net.fabricmc.loader.impl.launch.knot.KnotClient")
        .to_string();

    let libs_root = mc_root.join("libraries");
    let mut fabric_cp = Vec::new();

    if let Some(libs) = profile["libraries"].as_array() {
        for lib in libs {
            if let Some(name) = lib["name"].as_str() {
                let parts: Vec<&str> = name.split(':').collect();
                if parts.len() >= 3 {
                    let group = parts[0].replace('.', "/");
                    let artifact = parts[1];
                    let ver = parts[2];
                    let jar_name = format!("{}-{}.jar", artifact, ver);
                    let rel_path = format!("{}/{}/{}/{}", group, artifact, ver, jar_name);
                    let dest = libs_root.join(&rel_path);

                    let base_url = lib["url"].as_str().unwrap_or("https://maven.fabricmc.net/");
                    let full_url = format!("{}{}", base_url, rel_path);
                    let _ = download_file(&full_url, &dest).await;
                    if dest.exists() {
                        fabric_cp.push(dest);
                    }
                }
            }
        }
    }

    Ok((main_class, fabric_cp))
}

// oyunu baslatir
#[tauri::command]
pub async fn launch(
    app: AppHandle,
    state: tauri::State<'_, Arc<LaunchManager>>,
    options: LaunchOptions,
) -> Result<(), String> {
    if state.is_launching.swap(true, Ordering::SeqCst) {
        return Err("Zaten devam eden bir baslatma islemi var".to_string());
    }

    let mc_root = get_mc_root();
    let console = Arc::new(GameConsole::new());

    if options.open_console.unwrap_or(false) {
        console.open_tail_window();
        console.write_line(&format!(
            "[BASLATILIYOR] loader={} mcVersion={} loaderVersion={:?}",
            options.loader, options.mc_version, options.fabric_loader_version
        ));
    }

    let _ = app.emit(
        "launch-status",
        serde_json::json!({
            "state": "preparing",
            "message": "Dosyalar hazirlaniyor..."
        }),
    );

    // auth bilgilerini oku
    let auth_path = get_auth_path();
    let auth_content = fs::read_to_string(&auth_path)
        .map_err(|_| "Lutfen baslatmadan once giris yapin".to_string())?;
    let auth_data: serde_json::Value = serde_json::from_str(&auth_content)
        .map_err(|e| format!("auth dosyasi okunamadi: {}", e))?;

    let player_name = auth_data["name"].as_str().unwrap_or("Player");
    let player_uuid = auth_data["uuid"].as_str().unwrap_or("00000000-0000-0000-0000-000000000000");
    let access_token = auth_data["access_token"].as_str().unwrap_or("0");
    let user_type = auth_data["meta"]["type"].as_str().unwrap_or("mojang");

    // java surumunu bul veya indir
    let java_info = get_java_info(&options.mc_version).await;
    let java_exe = if let Some(selected) = java_info.selected {
        selected.path
    } else {
        download_java(java_info.required, Some(&app)).await?
    };

    console.write_line(&format!("[JAVA] Kullanilan Java: {}", java_exe));
    let _ = app.emit(
        "launch-status",
        serde_json::json!({
            "state": "preparing",
            "message": "Minecraft dosyalari hazirlaniyor..."
        }),
    );

    // surum json ve client jar
    let version_json = prepare_version_json(&mc_root, &options.mc_version).await?;
    let client_jar = prepare_client_jar(&mc_root, &options.mc_version, &version_json).await?;
    let (mut classpath, natives_dir) = prepare_libraries_and_natives(&mc_root, &options.mc_version, &version_json, &app).await?;

    let mut main_class = version_json["mainClass"]
        .as_str()
        .unwrap_or("net.minecraft.client.main.Main")
        .to_string();

    // loader ozel yapilandirmasi
    let loader = options.loader.to_lowercase();
    if loader == "fabric" {
        let (fab_main, fab_cp) = prepare_fabric_profile(
            &mc_root,
            &options.mc_version,
            options.fabric_loader_version.as_deref(),
        ).await?;
        main_class = fab_main;
        classpath.extend(fab_cp);
    }

    classpath.push(client_jar);

    // jvm ve oyun argumanlari
    let memory = options.memory.unwrap_or(4);
    let min_memory = 1.max(memory / 2);
    let cp_str = classpath
        .iter()
        .map(|p| p.to_string_lossy().to_string())
        .collect::<Vec<String>>()
        .join(";");

    let mut cmd_args = Vec::new();
    cmd_args.push(format!("-Xmx{}G", memory));
    cmd_args.push(format!("-Xms{}G", min_memory));
    cmd_args.push(format!("-Djava.library.path={}", natives_dir.display()));
    cmd_args.push("-cp".to_string());
    cmd_args.push(cp_str);

    if let Some(custom) = options.java_args {
        for arg in custom.split_whitespace() {
            if !arg.trim().is_empty() {
                cmd_args.push(arg.trim().to_string());
            }
        }
    }

    cmd_args.push(main_class);

    // standart minecraft parametreleri
    cmd_args.extend(vec![
        "--username".to_string(),
        player_name.to_string(),
        "--version".to_string(),
        options.mc_version.clone(),
        "--gameDir".to_string(),
        mc_root.to_string_lossy().to_string(),
        "--assetsDir".to_string(),
        mc_root.join("assets").to_string_lossy().to_string(),
        "--assetIndex".to_string(),
        version_json["assetIndex"]["id"].as_str().unwrap_or(&options.mc_version).to_string(),
        "--uuid".to_string(),
        player_uuid.to_string(),
        "--accessToken".to_string(),
        access_token.to_string(),
        "--userType".to_string(),
        user_type.to_string(),
        "--versionType".to_string(),
        "release".to_string(),
    ]);

    let _ = app.emit(
        "launch-status",
        serde_json::json!({
            "state": "launching",
            "message": "Minecraft baslatiliyor..."
        }),
    );

    let sanitized_args: Vec<String> = cmd_args
        .iter()
        .map(|a| {
            if a == &access_token || a == &player_uuid {
                "[REDACTED]".to_string()
            } else {
                a.clone()
            }
        })
        .collect();

    let _ = app.emit(
        "launch-event",
        serde_json::json!({
            "type": "arguments",
            "data": sanitized_args
        }),
    );
    console.write_line(&format!("[ARGUMENTLER] java {}", sanitized_args.join(" ")));

    // java surecini baslat
    let mut child = TokioCommand::new(&java_exe)
        .args(&cmd_args)
        .current_dir(&mc_root)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("oyun baslatilamadi: {}", e))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let _ = app.emit(
        "launch-status",
        serde_json::json!({
            "state": "running",
            "message": "Minecraft calisiyor."
        }),
    );
    console.write_line("[DURUM] Oyun sureci baslatildi.");

    let app_handle = app.clone();
    let console_clone = console.clone();
    let state_clone = state.inner().clone();

    tokio::spawn(async move {
        // stdout dinle
        if let Some(out) = stdout {
            let app_h = app_handle.clone();
            let con = console_clone.clone();
            tokio::spawn(async move {
                let mut reader = TokioBufReader::new(out).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    con.write_line(&line);
                    let _ = app_h.emit(
                        "launch-event",
                        serde_json::json!({ "type": "data", "data": line }),
                    );
                }
            });
        }

        // stderr dinle
        if let Some(err) = stderr {
            let app_h = app_handle.clone();
            let con = console_clone.clone();
            tokio::spawn(async move {
                let mut reader = TokioBufReader::new(err).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    con.write_line(&format!("[STDERR] {}", line));
                    let _ = app_h.emit(
                        "launch-event",
                        serde_json::json!({ "type": "data", "data": line }),
                    );
                }
            });
        }

        // oyunun kapanmasini bekle
        let exit_status = child.wait().await;
        state_clone.is_launching.store(false, Ordering::SeqCst);

        let code = exit_status.ok().and_then(|s| s.code()).unwrap_or(0);
        console_clone.write_line(&format!("[INFO] Oyun kapandi. Cikis kodu: {}", code));

        let _ = app_handle.emit(
            "launch-event",
            serde_json::json!({ "type": "close", "data": code }),
        );
        let _ = app_handle.emit(
            "launch-status",
            serde_json::json!({
                "state": "idle",
                "message": "Minecraft kapandi."
            }),
        );
    });

    Ok(())
}
