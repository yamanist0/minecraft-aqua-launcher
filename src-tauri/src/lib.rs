pub mod auth;
pub mod console;
pub mod java;
pub mod launch;
pub mod loaders;
pub mod modpack;
pub mod news;
pub mod servers;
pub mod settings;
pub mod win;

use std::sync::Arc;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let server_manager = Arc::new(servers::ServerManager::new());
    let launch_manager = Arc::new(launch::LaunchManager::new());

    tauri::Builder::default()
        .manage(server_manager)
        .manage(launch_manager)
        .invoke_handler(tauri::generate_handler![
            win::show_window,
            settings::get_settings,
            settings::save_settings,
            settings::get_system_memory,
            auth::get_account,
            auth::login_offline,
            auth::login_microsoft,
            auth::logout,
            loaders::get_versions,
            loaders::get_loader_versions,
            loaders::preview_version,
            launch::launch,
            modpack::get_installed_modpacks,
            modpack::download_modpack,
            modpack::reinstall_modpack,
            modpack::search_modrinth,
            modpack::get_modrinth_project,
            modpack::get_modrinth_versions,
            modpack::install_mrpack,
            modpack::search_curseforge,
            modpack::get_curseforge_project,
            modpack::get_curseforge_files,
            modpack::install_curseforge_pack,
            servers::get_servers_page,
            servers::get_all_servers,
            news::get_news,
        ])
        .run(tauri::generate_context!())
        .expect("tauri uygulamasi baslatilamadi");
}
