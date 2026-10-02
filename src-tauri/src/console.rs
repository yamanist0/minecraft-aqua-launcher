use chrono::Local;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;

use crate::settings::{get_app_data_dir, get_mc_root};

// oyun konsol servisi
pub struct GameConsole {
    pub log_path: PathBuf,
}

impl GameConsole {
    pub fn new() -> Self {
        let mc_root = get_mc_root();
        let logs_dir = mc_root.join("logs");
        let _ = fs::create_dir_all(&logs_dir);

        let stamp = Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
        let log_path = logs_dir.join(format!("launcher-{}.log", stamp));

        let console = Self { log_path };
        console.write_line("======================================================");
        console.write_line(&format!(
            "Aqua Launcher console | {}",
            Local::now().format("%Y-%m-%d %H:%M:%S")
        ));
        console.write_line("Java output and errors show up here when the game starts.");
        console.write_line("Type exit to close the window.");
        console.write_line(&format!("Log file: {}", console.log_path.display()));
        console.write_line("======================================================");

        console
    }

    pub fn write_line(&self, line: &str) {
        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_path)
        {
            let _ = writeln!(file, "{}", line);
        }
    }

    pub fn write_chunk(&self, chunk: &str) {
        if let Ok(mut file) = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.log_path)
        {
            for line in chunk.lines() {
                let _ = writeln!(file, "{}", line);
            }
        }
    }

    pub fn open_tail_window(&self) {
        let user_data = get_app_data_dir();
        let bat_path = user_data.join("console-starter.bat");
        let log_path_str = self.log_path.to_string_lossy().replace('\'', "''");
        let ps_tail = format!(
            "Get-Content -LiteralPath '{}' -Encoding UTF8 -Wait -Tail 300",
            log_path_str
        );

        let bat_content = format!(
            "@echo off\r\nmode con: cols=130 lines=55\r\ntitle Aqua Launcher - Game Console\r\npowershell -NoExit -NoProfile -ExecutionPolicy Bypass -Command \"{}\"\r\n",
            ps_tail
        );

        if fs::write(&bat_path, bat_content).is_ok() {
            let _ = Command::new("cmd.exe")
                .args(["/c", "start", "", bat_path.to_str().unwrap_or("")])
                .spawn();
        }
    }
}
