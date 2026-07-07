use tauri::Manager;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

mod clipboard_queue;
use clipboard_queue::{cancel_clipboard_queue, start_clipboard_queue};

fn toggle_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let visible = window.is_visible().unwrap_or(false);
        if visible {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

/// Re-applies the global toggle-overlay shortcut. `None` (or a
/// whitespace-only string) disables it — the previous binding is still
/// unregistered, but nothing new is registered and this returns `Ok`, since
/// "no hotkey configured" isn't an error condition.
#[tauri::command]
fn register_hotkey(app: tauri::AppHandle, shortcut: Option<String>) -> Result<(), String> {
    let gs = app.global_shortcut();
    gs.unregister_all().map_err(|e| e.to_string())?;

    let shortcut = match shortcut {
        Some(s) if !s.trim().is_empty() => s,
        _ => return Ok(()),
    };

    let parsed: Shortcut = shortcut.parse().map_err(|e| format!("Invalid shortcut '{shortcut}': {e:?}"))?;
    gs.on_shortcut(parsed, move |app, _shortcut, event| {
        if event.state() == ShortcutState::Pressed {
            toggle_main_window(app);
        }
    })
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            clipboard_queue::init(&app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            register_hotkey,
            start_clipboard_queue,
            cancel_clipboard_queue
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
