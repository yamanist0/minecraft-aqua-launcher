use regex::Regex;
use serde::{Deserialize, Serialize};
use std::fs::{self, File};
use std::io::BufReader;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

use crate::settings::get_mc_root;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JavaInstall {
    pub version: u32,
    pub path: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JavaInfo {
    pub required: u32,
    pub selected: Option<JavaInstall>,
    pub installed: Vec<JavaInstall>,
}

// mc surumune gore gereken java surumunu bulur
pub fn get_required_java_version(mc_version: &str) -> u32 {
    let parts: Vec<&str> = mc_version.split('.').collect();
    let major: u32 = parts.get(0).and_then(|s| s.parse().ok()).unwrap_or(1);
    let minor: u32 = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
    let patch: u32 = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);

    if major >= 1 && minor >= 21 {
        return 21;
    }
    if major >= 1 && minor == 20 && patch >= 5 {
        return 21;
    }
    if major >= 1 && minor >= 18 {
        return 17;
    }
    if major >= 1 && minor == 17 {
        return 16;
    }
    8
}

// java ciktisindan surum numarasini cozer
fn parse_java_version(output: &str) -> Option<u32> {
    let re = Regex::new(r#"version "([^"]+)""#).ok()?;
    if let Some(caps) = re.captures(output) {
        if let Some(ver_str) = caps.get(1) {
            let ver_text = ver_str.as_str();
            let segments: Vec<&str> = ver_text.split('.').collect();
            if let Some(first) = segments.get(0) {
                if *first == "1" {
                    if let Some(second) = segments.get(1) {
                        return second.parse().ok();
                    }
                } else {
                    return first.parse().ok();
                }
            }
        }
    }
    None
}

// belirli bir java dosyasini calistirip surumunu sorgular
pub fn probe_java(java_path: &Path) -> Option<JavaInstall> {
    if !java_path.exists() {
        return None;
    }

    let output = Command::new(java_path).arg("-version").output().ok()?;
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let combined = format!("{}\n{}", stderr, stdout);

    let version = parse_java_version(&combined)?;
    let first_line = combined
        .lines()
        .find(|l| l.contains("version"))
        .unwrap_or("Java")
        .trim()
        .to_string();

    Some(JavaInstall {
        version,
        path: java_path.to_string_lossy().to_string(),
        label: first_line,
    })
}

// sistemdeki java kurulumlarini tarar
pub fn find_installed_javas() -> Vec<JavaInstall> {
    let mut discovered = std::collections::HashMap::new();
    let mut candidate_roots = Vec::new();

    // ortam degiskenleri
    if let Ok(jh) = std::env::var("JAVA_HOME") {
        candidate_roots.push(PathBuf::from(jh));
    }
    if let Ok(jh) = std::env::var("JDK_HOME") {
        candidate_roots.push(PathBuf::from(jh));
    }

    // program files klasorleri
    let program_files = [
        std::env::var("ProgramFiles").ok(),
        std::env::var("ProgramFiles(x86)").ok(),
        std::env::var("LOCALAPPDATA").ok(),
    ];

    let vendors = [
        "Java",
        "Eclipse Adoptium",
        "Microsoft",
        "Zulu",
        "BellSoft",
        "Amazon Corretto",
        "Temurin",
    ];

    for pf in program_files.into_iter().flatten() {
        let pf_path = PathBuf::from(pf);
        for vendor in &vendors {
            candidate_roots.push(pf_path.join(vendor));
        }
    }

    // mc runtime klasoru
    candidate_roots.push(get_mc_root().join("runtime"));

    for root in candidate_roots {
        if !root.exists() {
            continue;
        }

        // dogrudan bin/javaw.exe kontrolu
        let direct_javaw = root.join("bin").join("javaw.exe");
        if let Some(info) = probe_java(&direct_javaw) {
            discovered.entry(info.version).or_insert(info);
        }

        // alt klasorlerde arama
        if let Ok(entries) = fs::read_dir(&root) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_dir() {
                    let sub_javaw = p.join("bin").join("javaw.exe");
                    if let Some(info) = probe_java(&sub_javaw) {
                        discovered.entry(info.version).or_insert(info);
                    }
                }
            }
        }
    }

    // path uzerinden where java kontrolu
    if let Ok(output) = Command::new("where").arg("javaw").output() {
        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            let p = PathBuf::from(line.trim());
            if let Some(info) = probe_java(&p) {
                discovered.entry(info.version).or_insert(info);
            }
        }
    }

    let mut list: Vec<JavaInstall> = discovered.into_values().collect();
    list.sort_by(|a, b| b.version.cmp(&a.version));
    list
}

// java bilgilerini dondurur
pub async fn get_java_info(mc_version: &str) -> JavaInfo {
    let required = get_required_java_version(mc_version);
    let installed = find_installed_javas();
    let selected = installed.iter().find(|j| j.version >= required).cloned();

    JavaInfo {
        required,
        selected,
        installed,
    }
}

// runtime altinda calistirilabilir java dosyasini bulur
pub fn find_executable_in_dir(dir: &Path) -> Option<PathBuf> {
    if !dir.exists() {
        return None;
    }

    for entry in WalkDir::new(dir).into_iter().flatten() {
        let p = entry.path();
        if p.is_file() {
            let file_name = p.file_name().and_then(|n| n.to_str()).unwrap_or("");
            if file_name.eq_ignore_ascii_case("javaw.exe") || file_name.eq_ignore_ascii_case("java.exe") {
                if let Some(parent) = p.parent() {
                    if parent.ends_with("bin") {
                        return Some(p.to_path_buf());
                    }
                }
            }
        }
    }
    None
}

// adoptium api uzerinden java indirir ve cikartir
pub async fn download_java(version: u32, app: Option<&AppHandle>) -> Result<String, String> {
    let mc_root = get_mc_root();
    let runtimes_dir = mc_root.join("runtime");
    let extract_folder = runtimes_dir.join(format!("java-{}", version));
    let _ = fs::create_dir_all(&runtimes_dir);

    // onceden kurulmussa dogrudan kullan
    if let Some(exe) = find_executable_in_dir(&extract_folder) {
        return Ok(exe.to_string_lossy().to_string());
    }

    if let Some(h) = app {
        let _ = h.emit(
            "launch-status",
            serde_json::json!({
                "state": "preparing",
                "message": format!("Java {} bilgileri aliniyor...", version)
            }),
        );
    }

    let client = reqwest::Client::new();
    let url = format!(
        "https://api.adoptium.net/v3/assets/latest/{}/hotspot?os=windows&architecture=x64&image_type=jdk",
        version
    );

    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("adoptium api istegi basarisiz: {}", e))?;

    let json: serde_json::Value = res
        .json()
        .await
        .map_err(|e| format!("adoptium json okunamadi: {}", e))?;

    let package_info = json
        .as_array()
        .and_then(|arr| arr.first())
        .and_then(|item| item["binary"]["package"].as_object())
        .ok_or_else(|| format!("Java {} icin paket bulunamadi", version))?;

    let download_url = package_info["link"]
        .as_str()
        .ok_or_else(|| "indirme linki yok".to_string())?;
    let file_name = package_info["name"]
        .as_str()
        .unwrap_or("java.zip");
    let size_mb = package_info["size"].as_f64().unwrap_or(0.0) / 1024.0 / 1024.0;

    if let Some(h) = app {
        let _ = h.emit(
            "launch-status",
            serde_json::json!({
                "state": "preparing",
                "message": format!("Java {} indiriliyor ({:.1} MB)...", version, size_mb)
            }),
        );
    }

    let zip_dest = runtimes_dir.join(file_name);
    let bytes = client
        .get(download_url)
        .send()
        .await
        .map_err(|e| format!("java indirme basarisiz: {}", e))?
        .bytes()
        .await
        .map_err(|e| format!("java paket verisi alinamadi: {}", e))?;

    fs::write(&zip_dest, &bytes).map_err(|e| format!("zip dosyasi yazilamadi: {}", e))?;

    if let Some(h) = app {
        let _ = h.emit(
            "launch-status",
            serde_json::json!({
                "state": "preparing",
                "message": format!("Java {} cikariliyor...", version)
            }),
        );
    }

    // zip dosyasini cikar
    let file = File::open(&zip_dest).map_err(|e| format!("zip acilamadi: {}", e))?;
    let mut archive = zip::ZipArchive::new(BufReader::new(file))
        .map_err(|e| format!("zip arsiv hatasi: {}", e))?;
    archive
        .extract(&extract_folder)
        .map_err(|e| format!("zip cikarilamadi: {}", e))?;

    let _ = fs::remove_file(zip_dest);

    let exe_path = find_executable_in_dir(&extract_folder)
        .ok_or_else(|| format!("Java {} calistirilabilir dosyasi bulunamadi", version))?;

    if let Some(h) = app {
        let _ = h.emit(
            "launch-status",
            serde_json::json!({
                "state": "preparing",
                "message": format!("Java {} basariyla kuruldu.", version)
            }),
        );
    }

    Ok(exe_path.to_string_lossy().to_string())
}
