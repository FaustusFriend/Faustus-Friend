use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

mod clipboard_queue;
mod diagnostics;
use clipboard_queue::{cancel_clipboard_queue, start_clipboard_queue};

/// True only when the window is genuinely on-screen for the user — visible
/// *and* not minimized. Windows treats "hidden" and "minimized" as
/// independent states: `is_visible()` wraps Win32's `IsWindowVisible`, which
/// reflects the `WS_VISIBLE` style bit and stays set while a window is
/// merely minimized (`IsIconic`, a separate flag). Checking `is_visible()`
/// alone was the bug — a native minimize left `WS_VISIBLE` set, so the next
/// toggle saw "visible" and called `hide()` on an already-minimized window,
/// leaving it hidden *and* minimized. The following `show()` cleared hidden
/// but never un-minimized it, and with `skipTaskbar: true` there was no
/// taskbar thumbnail left to manually restore it from — the window became
/// permanently unrestorable via hotkey or tray.
fn is_shown_to_user(window: &tauri::WebviewWindow) -> bool {
    window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false)
}

fn toggle_main_window(app: &tauri::AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if is_shown_to_user(&window) {
        let _ = window.hide();
        diagnostics::log_event(app, "window_hidden", "info", serde_json::json!({ "reason": "toggle" }));
    } else {
        show_main_window(app);
    }
}

/// Unlike `toggle_main_window`, always ends in the visible (and un-minimized)
/// state — used by the tray's Settings item and second-instance activation,
/// where "make sure the user sees this" is the intent, not "flip whatever
/// it currently is". Also what `toggle_main_window` calls to restore, so
/// the hidden/minimized/both-handling logic lives in exactly one place.
fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let was_minimized = window.is_minimized().unwrap_or(false);
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        diagnostics::log_event(
            app,
            "window_shown",
            "info",
            serde_json::json!({ "restored_from_minimized": was_minimized }),
        );
    }
}

/// Re-applies the global toggle-overlay shortcut. `None` (or a
/// whitespace-only string) disables it — the previous binding is still
/// unregistered, but nothing new is registered and this returns `Ok`, since
/// "no hotkey configured" isn't an error condition.
#[tauri::command]
fn register_hotkey(app: tauri::AppHandle, shortcut: Option<String>) -> Result<(), String> {
    let gs = app.global_shortcut();
    if let Err(e) = gs.unregister_all() {
        let msg = e.to_string();
        diagnostics::log_event(
            &app,
            "hotkey_register",
            "error",
            serde_json::json!({ "stage": "unregister_all", "error": msg }),
        );
        return Err(msg);
    }

    let shortcut = match shortcut {
        Some(s) if !s.trim().is_empty() => s,
        _ => {
            diagnostics::log_event(&app, "hotkey_register", "info", serde_json::json!({ "disabled": true }));
            return Ok(());
        }
    };

    let parsed: Shortcut = match shortcut.parse() {
        Ok(p) => p,
        Err(e) => {
            let msg = format!("Invalid shortcut '{shortcut}': {e:?}");
            diagnostics::log_event(
                &app,
                "hotkey_register",
                "error",
                serde_json::json!({ "shortcut": shortcut, "error": msg }),
            );
            return Err(msg);
        }
    };

    if let Err(e) = gs.on_shortcut(parsed, move |app, _shortcut, event| {
        if event.state() == ShortcutState::Pressed {
            toggle_main_window(app);
        }
    }) {
        let msg = e.to_string();
        diagnostics::log_event(
            &app,
            "hotkey_register",
            "error",
            serde_json::json!({ "shortcut": shortcut, "error": msg }),
        );
        return Err(msg);
    }

    diagnostics::log_event(&app, "hotkey_register", "info", serde_json::json!({ "shortcut": shortcut }));
    Ok(())
}

/// Bridges frontend-originated diagnostics (settings load/save outcomes,
/// uncaught JS errors/rejections) into the same `events.ndjson` used by the
/// Rust side, so support exports have one unified timeline.
#[tauri::command]
fn log_frontend_event(app: tauri::AppHandle, event: String, level: String, fields: serde_json::Value) {
    diagnostics::log_event(&app, &event, &level, fields);
}

/// Builds the local diagnostics ZIP and returns its path. Never touches the
/// network — see `diagnostics::export`.
#[tauri::command]
fn export_diagnostics(app: tauri::AppHandle) -> Result<String, String> {
    diagnostics::export(&app).map(|path| path.display().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
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
            let handle = app.handle().clone();

            // Diagnostics is a support convenience, never load-bearing — a
            // failure to initialize it (e.g. an unwritable app data
            // directory) must not stop the app from starting.
            if let Err(e) = diagnostics::init(&handle) {
                eprintln!("Faustus Friend: failed to initialize diagnostics: {e}");
            }

            clipboard_queue::init(&handle);

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

            match tray_builder.build(app) {
                Ok(_) => diagnostics::log_event(&handle, "tray_init", "info", serde_json::json!({})),
                Err(e) => {
                    diagnostics::log_event(&handle, "tray_init", "error", serde_json::json!({ "error": e.to_string() }));
                    return Err(e.into());
                }
            }

            Ok(())
        })
        // Closing the window (the OS "X" button) hides it instead of exiting —
        // the app keeps running via the tray icon and the toggle-overlay
        // hotkey. Only the tray's Exit item (`app.exit`) actually terminates.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
                diagnostics::log_event(
                    window.app_handle(),
                    "window_hidden",
                    "info",
                    serde_json::json!({ "reason": "close_requested" }),
                );
            }
        })
        .invoke_handler(tauri::generate_handler![
            register_hotkey,
            start_clipboard_queue,
            cancel_clipboard_queue,
            log_frontend_event,
            export_diagnostics,
            diagnostics::settings_store_status,
            diagnostics::get_build_info
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            diagnostics::log_shutdown(app_handle);
        }
    });
}
