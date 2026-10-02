// ana pencereyi gosterir ve odaklanir
#[tauri::command]
pub fn show_window(window: tauri::Window) -> Result<(), String> {
    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}
