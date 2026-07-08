//! Local-only diagnostics: a plain-text app log, a structured NDJSON event
//! log, and an on-demand ZIP export for beta support requests.
//!
//! Nothing here ever makes a network call. Every function is best-effort —
//! a failure to write a log line must never crash or destabilize the app,
//! so all of them swallow their own errors after recording what they can.

use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Manager};

/// Managed Tauri state holding this session's log paths and identity.
/// `write_lock` just serializes append calls across threads (hotkey
/// callbacks, the clipboard hook thread, the main thread) — the log files
/// themselves are reopened in append mode on every write rather than kept
/// open, which is simpler and durable across the file being moved/deleted
/// out from under a long-running handle.
pub struct DiagnosticsState {
    session_id: String,
    app_data_dir: PathBuf,
    app_log_path: PathBuf,
    events_path: PathBuf,
    write_lock: Mutex<()>,
}

/// Version/commit/build-date, populated automatically at compile time (see
/// `build.rs`) rather than hand-edited per release. Shared by the startup
/// log, the diagnostics export, and the About & Support dialog's
/// `get_build_info` command — one source of truth for all three.
#[derive(Serialize, Clone)]
pub struct BuildInfo {
    pub app_version: String,
    pub git_commit: String,
    pub build_date: String,
    pub platform: String,
    pub arch: String,
}

fn collect_build_info() -> BuildInfo {
    BuildInfo {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        git_commit: option_env!("FAUSTUS_GIT_COMMIT").unwrap_or("unknown").to_string(),
        build_date: option_env!("FAUSTUS_BUILD_DATE").unwrap_or("unknown").to_string(),
        platform: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    }
}

/// Exposes build metadata to the frontend for the About & Support dialog.
#[tauri::command]
pub fn get_build_info() -> BuildInfo {
    collect_build_info()
}

#[derive(Serialize)]
struct AppMetadata {
    session_id: String,
    #[serde(flatten)]
    build: BuildInfo,
    // Cargo.toml currently pins the `tauri` crate to major version 2;
    // there's no runtime API to read the exact resolved crate version.
    tauri_major_version: String,
    webview2_version: String,
}

fn collect_metadata(session_id: &str) -> AppMetadata {
    AppMetadata {
        session_id: session_id.to_string(),
        build: collect_build_info(),
        tauri_major_version: "2".to_string(),
        webview2_version: tauri::webview_version().unwrap_or_else(|_| "unknown".to_string()),
    }
}

fn generate_session_id() -> String {
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let pid = std::process::id();
    format!("{millis:x}-{pid:x}-{:x}", random_u64())
}

/// Not cryptographic — just enough entropy to disambiguate two sessions
/// that started in the same millisecond. `RandomState`'s keys are seeded
/// from OS randomness at construction, so hashing nothing still yields a
/// value that varies run to run without pulling in a `rand` dependency.
fn random_u64() -> u64 {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hasher};
    RandomState::new().build_hasher().finish()
}

fn now_rfc3339() -> String {
    time::OffsetDateTime::now_utc()
        .format(&time::format_description::well_known::Rfc3339)
        .unwrap_or_else(|_| "unknown-time".to_string())
}

fn now_filename_timestamp() -> String {
    use time::macros::format_description;
    let format = format_description!("[year][month][day]-[hour][minute][second]");
    time::OffsetDateTime::now_utc()
        .format(&format)
        .unwrap_or_else(|_| "unknown-time".to_string())
}

fn append_to_file(path: &Path, contents: &str) {
    let file = OpenOptions::new().create(true).append(true).open(path);
    if let Ok(mut file) = file {
        let _ = file.write_all(contents.as_bytes());
    }
}

/// Initializes diagnostics for this run: resolves the log directory,
/// generates a session ID, writes the startup log line/event, and installs
/// a panic hook. Failures here are returned so the caller can decide
/// whether to continue (they should — diagnostics is never load-bearing),
/// but nothing panics.
pub fn init(app: &AppHandle) -> Result<(), String> {
    let log_dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&log_dir).map_err(|e| e.to_string())?;
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    let session_id = generate_session_id();
    let state = DiagnosticsState {
        session_id: session_id.clone(),
        app_data_dir,
        app_log_path: log_dir.join("app.log"),
        events_path: log_dir.join("events.ndjson"),
        write_lock: Mutex::new(()),
    };
    app.manage(state);

    install_panic_hook(app.clone());

    let metadata = collect_metadata(&session_id);
    log_line(
        app,
        "info",
        &format!(
            "Faustus Friend v{} starting (session {session_id}, commit {}, built {}, {}/{})",
            metadata.build.app_version,
            metadata.build.git_commit,
            metadata.build.build_date,
            metadata.build.platform,
            metadata.build.arch
        ),
    );
    log_event(
        app,
        "startup",
        "info",
        serde_json::to_value(&metadata).unwrap_or(serde_json::Value::Null),
    );

    Ok(())
}

/// Call once, right before the app actually exits (see the `RunEvent::Exit`
/// handler in `lib.rs`) so every exit path — tray Exit, OS session end —
/// is covered from one place instead of scattering calls at each trigger.
pub fn log_shutdown(app: &AppHandle) {
    log_line(app, "info", "Faustus Friend shutting down");
    log_event(app, "shutdown", "info", serde_json::json!({}));
}

/// Appends a plain-text line to `app.log`. No-ops if diagnostics failed to
/// initialize — logging must never be something callers have to guard.
pub fn log_line(app: &AppHandle, level: &str, message: &str) {
    let Some(state) = app.try_state::<DiagnosticsState>() else {
        return;
    };
    let _guard = state.write_lock.lock().unwrap_or_else(|e| e.into_inner());
    let line = format!("[{}] [{}] session={} {}\n", now_rfc3339(), level.to_uppercase(), state.session_id, message);
    append_to_file(&state.app_log_path, &line);
}

/// Appends one JSON object to `events.ndjson`. `fields` is arbitrary
/// event-specific data — pass `serde_json::json!({})` if there's none.
pub fn log_event(app: &AppHandle, event: &str, level: &str, fields: serde_json::Value) {
    let Some(state) = app.try_state::<DiagnosticsState>() else {
        return;
    };
    let _guard = state.write_lock.lock().unwrap_or_else(|e| e.into_inner());
    let record = serde_json::json!({
        "ts": now_rfc3339(),
        "session_id": state.session_id,
        "event": event,
        "level": level,
        "fields": fields,
    });
    if let Ok(line) = serde_json::to_string(&record) {
        append_to_file(&state.events_path, &format!("{line}\n"));
    }
}

fn install_panic_hook(app: AppHandle) {
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        log_line(&app, "error", &format!("panic: {info}"));
        log_event(&app, "panic", "error", serde_json::json!({ "message": info.to_string() }));
        default_hook(info);
    }));
}

const SENSITIVE_KEY_MARKERS: [&str; 5] = ["password", "token", "secret", "apikey", "api_key"];

/// Recursively blanks any object value whose key looks credential-shaped.
/// Nothing in the current settings schema (just hotkey bindings) matches
/// this, but it's cheap insurance against a future settings field that does.
fn redact_sensitive(value: &mut serde_json::Value) {
    match value {
        serde_json::Value::Object(map) => {
            for (key, v) in map.iter_mut() {
                let lower = key.to_lowercase();
                if SENSITIVE_KEY_MARKERS.iter().any(|marker| lower.contains(marker)) {
                    *v = serde_json::Value::String("[redacted]".to_string());
                } else {
                    redact_sensitive(v);
                }
            }
        }
        serde_json::Value::Array(items) => items.iter_mut().for_each(redact_sensitive),
        _ => {}
    }
}

fn read_redacted_settings(app_data_dir: &Path) -> String {
    let path = app_data_dir.join("settings.json");
    match std::fs::read_to_string(&path) {
        Ok(raw) => match serde_json::from_str::<serde_json::Value>(&raw) {
            Ok(mut value) => {
                redact_sensitive(&mut value);
                serde_json::to_string_pretty(&value).unwrap_or(raw)
            }
            Err(_) => raw,
        },
        Err(_) => "{\n  \"note\": \"settings.json was not found\"\n}\n".to_string(),
    }
}

/// `tauri-plugin-store` silently swallows a read/parse failure on its
/// initial load (`let _ = store_inner.load();` in the plugin's own source)
/// and just falls back to an empty in-memory store — from the JS side, a
/// corrupted `settings.json` is indistinguishable from one that never
/// existed. This reads the file directly so the frontend can tell the two
/// apart when logging *why* it fell back to defaults.
///
/// Returns `"missing"` (no file — first run, expected), `"valid"` (parses
/// fine; the frontend just didn't find the keys it was looking for), or
/// `"corrupted"` (exists but isn't valid JSON, including an empty file —
/// nothing legitimate writes an empty store).
#[tauri::command]
pub fn settings_store_status(app: AppHandle) -> String {
    let Ok(app_data_dir) = app.path().app_data_dir() else {
        return "unknown".to_string();
    };
    let path = app_data_dir.join("settings.json");
    match std::fs::read_to_string(&path) {
        Ok(raw) if raw.trim().is_empty() => "corrupted".to_string(),
        Ok(raw) => {
            if serde_json::from_str::<serde_json::Value>(&raw).is_ok() {
                "valid".to_string()
            } else {
                "corrupted".to_string()
            }
        }
        Err(_) => "missing".to_string(),
    }
}

/// Scans `events.ndjson` for `level: "error"` entries and returns the most
/// recent `limit`, newline-joined. Parses each line independently so one
/// malformed line (e.g. from a future format change) doesn't lose the rest.
fn extract_recent_errors(events_path: &Path, limit: usize) -> String {
    let Ok(content) = std::fs::read_to_string(events_path) else {
        return "No events log found for this install.\n".to_string();
    };
    let error_lines: Vec<&str> = content
        .lines()
        .filter(|line| {
            serde_json::from_str::<serde_json::Value>(line)
                .ok()
                .and_then(|v| v.get("level").and_then(|l| l.as_str()).map(|s| s == "error"))
                .unwrap_or(false)
        })
        .collect();
    if error_lines.is_empty() {
        return "No error-level events recorded.\n".to_string();
    }
    let start = error_lines.len().saturating_sub(limit);
    format!("{}\n", error_lines[start..].join("\n"))
}

fn build_readme(session_id: &str, app_version: &str) -> String {
    format!(
        "Faustus Friend Diagnostics Bundle\n\
         ==================================\n\
         \n\
         Generated: {ts}\n\
         App version: {app_version}\n\
         Session ID: {session_id}\n\
         \n\
         This bundle was created locally on your machine for troubleshooting.\n\
         It has not been uploaded anywhere — Faustus Friend does not send\n\
         telemetry, analytics, or crash reports over the network. Nothing\n\
         leaves your computer unless you choose to share this file yourself.\n\
         \n\
         Contents\n\
         --------\n\
         - app.log                Plain-text application log.\n\
         - events.ndjson          Structured event log (one JSON object per\n\
         \x20                        line), each tagged with the session ID that\n\
         \x20                        generated it.\n\
         - settings-snapshot.json A copy of your current settings. Fields that\n\
         \x20                        look like a credential (password/token/secret/\n\
         \x20                        API key) are redacted before export; as of this\n\
         \x20                        version, settings only contain hotkey bindings.\n\
         - metadata.json          App version, build info, platform/architecture,\n\
         \x20                        and Tauri/WebView2 runtime versions.\n\
         - recent-errors.ndjson   The most recent error-level events, for quick\n\
         \x20                        triage.\n\
         \n\
         Sharing this bundle\n\
         --------------------\n\
         If you're sharing this with a maintainer for support, attach the whole\n\
         ZIP to your GitHub issue or support email. Feel free to review the\n\
         contents first — nothing here should contain game account credentials\n\
         or trade chat content, but redact anything further you're unsure about\n\
         before sending it.\n",
        ts = now_rfc3339(),
    )
}

fn zip_add(
    zip: &mut zip::ZipWriter<std::fs::File>,
    options: zip::write::SimpleFileOptions,
    name: &str,
    contents: &[u8],
) -> Result<(), String> {
    zip.start_file(name, options).map_err(|e| e.to_string())?;
    zip.write_all(contents).map_err(|e| e.to_string())
}

fn zip_add_file_or_placeholder(
    zip: &mut zip::ZipWriter<std::fs::File>,
    options: zip::write::SimpleFileOptions,
    path: &Path,
    name: &str,
) -> Result<(), String> {
    match std::fs::read(path) {
        Ok(bytes) => zip_add(zip, options, name, &bytes),
        Err(_) => zip_add(
            zip,
            options,
            name,
            format!("{name} was not found — nothing has been logged to it yet.\n").as_bytes(),
        ),
    }
}

/// Builds the diagnostics ZIP and returns its path. Written to the user's
/// Downloads folder when resolvable (easiest to find and attach to a
/// support email/issue), falling back to the app data directory.
pub fn export(app: &AppHandle) -> Result<PathBuf, String> {
    let state = app
        .try_state::<DiagnosticsState>()
        .ok_or_else(|| "diagnostics were not initialized for this session".to_string())?;

    let out_dir = app
        .path()
        .download_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&out_dir).map_err(|e| e.to_string())?;
    let zip_path = out_dir.join(format!("faustus-friend-diagnostics-{}.zip", now_filename_timestamp()));

    let file = std::fs::File::create(&zip_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    zip_add_file_or_placeholder(&mut zip, options, &state.app_log_path, "app.log")?;
    zip_add_file_or_placeholder(&mut zip, options, &state.events_path, "events.ndjson")?;
    zip_add(
        &mut zip,
        options,
        "settings-snapshot.json",
        read_redacted_settings(&state.app_data_dir).as_bytes(),
    )?;

    let metadata = collect_metadata(&state.session_id);
    zip_add(
        &mut zip,
        options,
        "metadata.json",
        serde_json::to_string_pretty(&metadata).unwrap_or_default().as_bytes(),
    )?;
    zip_add(
        &mut zip,
        options,
        "recent-errors.ndjson",
        extract_recent_errors(&state.events_path, 50).as_bytes(),
    )?;
    zip_add(
        &mut zip,
        options,
        "README.txt",
        build_readme(&state.session_id, &metadata.build.app_version).as_bytes(),
    )?;

    zip.finish().map_err(|e| e.to_string())?;
    drop(state);

    log_event(
        app,
        "diagnostics_export",
        "info",
        serde_json::json!({ "path": zip_path.display().to_string() }),
    );

    Ok(zip_path)
}
