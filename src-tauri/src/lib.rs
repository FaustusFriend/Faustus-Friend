use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, WindowEvent};
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

/// Unlike `toggle_main_window`, always ends in the visible state — used by
/// the tray's Settings item and second-instance activation, where "make
/// sure the user sees this" is the intent, not "flip whatever it currently is".
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
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
        // Must be the first plugin registered (see tauri-plugin-single-instance
        // docs) — its callback runs in the *original* process whenever a second
        // instance is launched, so a second launch just surfaces the existing
        // window instead of starting a redundant overlay.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .setup(|app| {
            clipboard_queue::init(&app.handle().clone());

            let show_hide = MenuItemBuilder::with_id("show_hide", "Show/Hide").build(app)?;
            let settings = MenuItemBuilder::with_id("settings", "Settings").build(app)?;
            let exit = MenuItemBuilder::with_id("exit", "Exit").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&show_hide)
                .item(&settings)
                .separator()
                .item(&exit)
                .build()?;

            let mut tray_builder = TrayIconBuilder::new()
                .menu(&tray_menu)
                // Left-click activates the app directly; the menu above is
                // reserved for right-click, matching standard Windows tray
                // convention.
                .show_menu_on_left_click(false)
                .tooltip("Faustus Friend")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show_hide" => toggle_main_window(app),
                    "settings" => {
                        show_main_window(app);
                        let _ = app.emit("open-settings", ());
                    }
                    "exit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Windows-only event (see TrayIconEvent docs) — matches this
                    // app's Windows-only scope and the classic Windows tray
                    // convention of double-click-to-restore.
                    if let TrayIconEvent::DoubleClick { .. } = event {
                        show_main_window(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray_builder = tray_builder.icon(icon.clone());
            }
            tray_builder.build(app)?;

            Ok(())
        })
        // Closing the window (the OS "X" button) hides it instead of exiting —
        // the app keeps running via the tray icon and the toggle-overlay
        // hotkey. Only the tray's Exit item (`app.exit`) actually terminates.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            register_hotkey,
            start_clipboard_queue,
            cancel_clipboard_queue
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
