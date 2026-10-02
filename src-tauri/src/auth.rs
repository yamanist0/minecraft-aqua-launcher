use md5::{Digest, Md5};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::net::TcpListener;
use std::path::PathBuf;
use uuid::Uuid;

use crate::settings::get_app_data_dir;

// hesap bilgi yapisi
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthData {
    #[serde(default)]
    pub access_token: Option<String>,
    #[serde(default)]
    pub client_token: Option<String>,
    pub uuid: String,
    pub name: String,
    #[serde(default)]
    pub user_properties: Option<String>,
    #[serde(default)]
    pub meta: Option<AuthMeta>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthMeta {
    #[serde(rename = "type")]
    pub auth_type: String,
    #[serde(default)]
    pub demo: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountInfo {
    pub username: String,
    pub uuid: String,
    #[serde(rename = "type")]
    pub account_type: String,
}

pub fn get_auth_path() -> PathBuf {
    get_app_data_dir().join("auth.json")
}

// cevrimdisi oyuncu icin uuid olusturur
fn generate_offline_uuid(username: &str) -> String {
    let mut hasher = Md5::new();
    hasher.update(format!("OfflinePlayer:{}", username).as_bytes());
    let hash = hasher.finalize();

    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&hash[..16]);
    // uuid v3 bayraklari
    bytes[6] = (bytes[6] & 0x0f) | 0x30;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    Uuid::from_bytes(bytes).hyphenated().to_string()
}

// kayitli hesabi dondurur
#[tauri::command]
pub fn get_account() -> Option<AccountInfo> {
    let path = get_auth_path();
    if path.exists() {
        if let Ok(content) = fs::read_to_string(&path) {
            if let Ok(auth) = serde_json::from_str::<AuthData>(&content) {
                let acc_type = auth
                    .meta
                    .as_ref()
                    .map(|m| m.auth_type.clone())
                    .unwrap_or_else(|| "offline".to_string());
                return Some(AccountInfo {
                    username: auth.name,
                    uuid: auth.uuid,
                    account_type: acc_type,
                });
            }
        }
    }
    None
}

// cevrimdisi giris yapar
#[tauri::command]
pub fn login_offline(username: String) -> Result<AccountInfo, String> {
    let trimmed = username.trim();
    if trimmed.is_empty() {
        return Err("kullanici adi bos olamaz".to_string());
    }

    let uuid_str = generate_offline_uuid(trimmed);
    let auth = AuthData {
        access_token: Some("dummy_token".to_string()),
        client_token: Some("dummy_client".to_string()),
        uuid: uuid_str.clone(),
        name: trimmed.to_string(),
        user_properties: Some("{}".to_string()),
        meta: Some(AuthMeta {
            auth_type: "offline".to_string(),
            demo: false,
        }),
    };

    let path = get_auth_path();
    let json_str = serde_json::to_string_pretty(&auth)
        .map_err(|e| format!("auth json hatasi: {}", e))?;
    fs::write(path, json_str).map_err(|e| format!("auth dosyasi yazilamadi: {}", e))?;

    Ok(AccountInfo {
        username: trimmed.to_string(),
        uuid: uuid_str,
        account_type: "offline".to_string(),
    })
}

// microsoft oauth ile giris yapar
#[tauri::command]
pub async fn login_microsoft() -> Result<AccountInfo, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("yerel port acilamadi: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("port adresi alinamadi: {}", e))?
        .port();

    let client_id = "00000000402b5328";
    let redirect_uri = format!("http://127.0.0.1:{}/callback", port);
    let auth_url = format!(
        "https://login.live.com/oauth20_authorize.srf?client_id={}&response_type=code&scope=service::user.auth.xboxlive.com::MBI_SSL&redirect_uri={}",
        client_id,
        urlencoding::encode(&redirect_uri)
    );

    // tarayicida oauth sayfasini acar
    open::that(&auth_url).map_err(|e| format!("tarayici acilamadi: {}", e))?;

    // gelen istekten kod bilgisini yakalar
    let mut code_opt = None;
    for stream in listener.incoming() {
        if let Ok(mut stream) = stream {
            let mut buffer = [0; 2048];
            let bytes_read = stream.read(&mut buffer).unwrap_or(0);
            let req_str = String::from_utf8_lossy(&buffer[..bytes_read]);

            if let Some(pos) = req_str.find("code=") {
                let code_part = &req_str[pos + 5..];
                let end_pos = code_part.find('&').or_else(|| code_part.find(' ')).unwrap_or(code_part.len());
                code_opt = Some(code_part[..end_pos].to_string());

                let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<!DOCTYPE html><html><body style='background:#131315;color:#87CEFA;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;'><h2>Giris basarili! Bu sekmeyi kapatabilirsiniz.</h2></body></html>";
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.flush();
                break;
            }
        }
    }

    let code = code_opt.ok_or_else(|| "oauth authorization code alinamadi".to_string())?;
    let client = reqwest::Client::new();

    // 1. live access token al
    let token_res = client
        .post("https://login.live.com/oauth20_token.srf")
        .form(&[
            ("client_id", client_id),
            ("code", &code),
            ("grant_type", "authorization_code"),
            ("redirect_uri", &redirect_uri),
        ])
        .send()
        .await
        .map_err(|e| format!("live token istegi basarisiz: {}", e))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("live token json hatasi: {}", e))?;

    let live_access_token = token_res["access_token"]
        .as_str()
        .ok_or_else(|| "live access token bulunamadi".to_string())?;

    // 2. xbox live kimlik dogrulamasi
    let xbox_body = serde_json::json!({
        "Properties": {
            "AuthMethod": "RPS",
            "SiteName": "user.auth.xboxlive.com",
            "RpsTicket": format!("d={}", live_access_token)
        },
        "RelyingParty": "http://auth.xboxlive.com",
        "TokenType": "JWT"
    });

    let xbox_res = client
        .post("https://user.auth.xboxlive.com/user/authenticate")
        .json(&xbox_body)
        .send()
        .await
        .map_err(|e| format!("xbox auth basarisiz: {}", e))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("xbox json hatasi: {}", e))?;

    let xbox_token = xbox_res["Token"]
        .as_str()
        .ok_or_else(|| "xbox token bulunamadi".to_string())?;
    let uhs = xbox_res["DisplayClaims"]["xui"][0]["uhs"]
        .as_str()
        .ok_or_else(|| "xbox uhs bulunamadi".to_string())?;

    // 3. xsts token al
    let xsts_body = serde_json::json!({
        "Properties": {
            "SandboxId": "RETAIL",
            "UserTokens": [xbox_token]
        },
        "RelyingParty": "rp://api.minecraftservices.com/",
        "TokenType": "JWT"
    });

    let xsts_res = client
        .post("https://xsts.auth.xboxlive.com/xsts/authorize")
        .json(&xsts_body)
        .send()
        .await
        .map_err(|e| format!("xsts istegi basarisiz: {}", e))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("xsts json hatasi: {}", e))?;

    let xsts_token = xsts_res["Token"]
        .as_str()
        .ok_or_else(|| "xsts token bulunamadi".to_string())?;

    // 4. minecraft access token al
    let mc_auth_body = serde_json::json!({
        "identityToken": format!("XBL3.0 x={};{}", uhs, xsts_token)
    });

    let mc_auth_res = client
        .post("https://api.minecraftservices.com/authentication/login_with_xbox")
        .json(&mc_auth_body)
        .send()
        .await
        .map_err(|e| format!("mc login basarisiz: {}", e))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("mc auth json hatasi: {}", e))?;

    let mc_access_token = mc_auth_res["access_token"]
        .as_str()
        .ok_or_else(|| "mc access token alinamadi".to_string())?;

    // 5. profil bilgilerini al
    let profile_res = client
        .get("https://api.minecraftservices.com/minecraft/profile")
        .bearer_auth(mc_access_token)
        .send()
        .await
        .map_err(|e| format!("mc profile istegi basarisiz: {}", e))?
        .json::<serde_json::Value>()
        .await
        .map_err(|e| format!("mc profile json hatasi: {}", e))?;

    let username = profile_res["name"]
        .as_str()
        .ok_or_else(|| "minecraft kullanici adi bulunamadi".to_string())?;
    let uuid_str = profile_res["id"]
        .as_str()
        .ok_or_else(|| "minecraft uuid bulunamadi".to_string())?;

    let auth = AuthData {
        access_token: Some(mc_access_token.to_string()),
        client_token: Some(Uuid::new_v4().to_string()),
        uuid: uuid_str.to_string(),
        name: username.to_string(),
        user_properties: Some("{}".to_string()),
        meta: Some(AuthMeta {
            auth_type: "msa".to_string(),
            demo: false,
        }),
    };

    let path = get_auth_path();
    let json_str = serde_json::to_string_pretty(&auth)
        .map_err(|e| format!("auth json hatasi: {}", e))?;
    fs::write(path, json_str).map_err(|e| format!("auth dosyasi yazilamadi: {}", e))?;

    Ok(AccountInfo {
        username: username.to_string(),
        uuid: uuid_str.to_string(),
        account_type: "msa".to_string(),
    })
}

// cikis yapar
#[tauri::command]
pub fn logout() -> Result<(), String> {
    let path = get_auth_path();
    if path.exists() {
        let _ = fs::remove_file(path);
    }
    Ok(())
}
