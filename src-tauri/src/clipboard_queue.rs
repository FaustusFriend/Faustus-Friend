//! "Copy Trade Pair" clipboard queue.
//!
//! Copies the first value to the clipboard immediately, then watches for the
//! user's next two `Ctrl+V` presses *anywhere on the system* (the user will
//! be tabbed into a Path of Exile trade field, not this app's window) and
//! swaps the clipboard to the second value after the first paste.
//!
//! This never sends keyboard/mouse input and never blocks or consumes the
//! `Ctrl+V` keystroke — it only observes it via a passive low-level keyboard
//! hook (`WH_KEYBOARD_LL`) and always calls `CallNextHookEx` so the paste
//! reaches whatever window is focused (e.g. the PoE trade window) exactly as
//! if the hook were not installed.
//!
//! The hook is installed once, for the lifetime of the app, on a dedicated
//! thread running a Win32 message loop (required for low-level hooks to
//! receive events). It stays inert — doing nothing but forwarding events —
//! until a queue is armed via [`start_clipboard_queue`].
//!
//! ## Swap timing (Task 2D)
//!
//! The clipboard is swapped to the second value when the *V key is released*
//! after the first paste, not on a fixed delay after key-down. Key-up is
//! strictly ordered after key-down for the same physical press, and Windows
//! dispatches keyboard input to the focused window's message queue in the
//! same order it was generated — so by the time a human (or even a fast
//! script) releases V, the target application has already had its message
//! loop turn to process the paste's `WM_KEYDOWN`. This makes the swap
//! effectively event-driven rather than a guess at "how long a paste takes".
//! A small fixed safety margin (see `SWAP_SAFETY_MARGIN` below) remains
//! after key-up, to cover the (uncommon) case of an application that reads
//! the clipboard asynchronously rather than inline while handling the key
//! event. That margin is far smaller than the old fixed post-keydown delay
//! because it only has to outlast in-flight processing, not the entire
//! human reaction time to a second keystroke.

#[cfg(windows)]
mod windows_impl {
    use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
    use std::sync::mpsc::{self, Sender};
    use std::sync::{Mutex, OnceLock};
    use std::time::Duration;

    use tauri::{AppHandle, Emitter};
    use tauri_plugin_clipboard_manager::ClipboardExt;
    use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::Threading::GetCurrentThreadId;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_CONTROL};
    use windows::Win32::UI::WindowsAndMessaging::{
        CallNextHookEx, DispatchMessageW, GetMessageW, SetWindowsHookExW, TranslateMessage,
        KBDLLHOOKSTRUCT, MSG, WH_KEYBOARD_LL, WM_KEYDOWN, WM_KEYUP, WM_SYSKEYDOWN, WM_SYSKEYUP,
    };

    const VK_V: u32 = 0x56;
    /// Small safety margin applied *after* the V key-up that follows the
    /// first paste, before the clipboard is actually swapped. Not a guess at
    /// paste duration (key-up already implies the paste's key-down was
    /// dispatched and, for essentially all real text fields, processed) —
    /// just a buffer for the rare app that defers its clipboard read.
    /// Chosen empirically: verified against a rapid-fire Ctrl+V, Ctrl+V test
    /// (key presses spaced only by the time between two separate hook
    /// events, far faster than a human) with no duplicate paste observed.
    const SWAP_SAFETY_MARGIN: Duration = Duration::from_millis(20);
    const QUEUE_TIMEOUT: Duration = Duration::from_secs(30);

    static ARMED: AtomicBool = AtomicBool::new(false);
    static GENERATION: AtomicU64 = AtomicU64::new(0);
    static V_HELD: AtomicBool = AtomicBool::new(false);
    static PASTE_TX: OnceLock<Mutex<Option<Sender<PasteSignal>>>> = OnceLock::new();
    static QUEUE_DATA: OnceLock<Mutex<QueueData>> = OnceLock::new();

    #[derive(Clone, Copy)]
    enum PasteSignal {
        /// V pressed down (a fresh press, not key-repeat) while armed.
        Down(u64),
        /// V released after having been pressed down while armed.
        Up(u64),
    }

    #[derive(Default)]
    struct QueueData {
        second_value: String,
        paste_count: u32,
        swapped: bool,
    }

    fn queue_data() -> &'static Mutex<QueueData> {
        QUEUE_DATA.get_or_init(|| Mutex::new(QueueData::default()))
    }

    fn send_signal(signal: PasteSignal) {
        if let Some(tx) = PASTE_TX.get().and_then(|m| m.lock().ok()) {
            if let Some(tx) = tx.as_ref() {
                let _ = tx.send(signal);
            }
        }
    }

    /// Runs on the dedicated hook thread. Kept minimal and non-blocking:
    /// only atomic reads and (when armed) a channel send, then always
    /// forwards the event via `CallNextHookEx`.
    unsafe extern "system" fn keyboard_hook_proc(
        code: i32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if code >= 0 {
            let kb = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
            let msg = wparam.0 as u32;
            if kb.vkCode == VK_V {
                if msg == WM_KEYDOWN || msg == WM_SYSKEYDOWN {
                    let ctrl_down = (GetAsyncKeyState(VK_CONTROL.0 as i32) as u16 & 0x8000) != 0;
                    if ctrl_down && !V_HELD.swap(true, Ordering::SeqCst) && ARMED.load(Ordering::SeqCst) {
                        send_signal(PasteSignal::Down(GENERATION.load(Ordering::SeqCst)));
                    }
                } else if msg == WM_KEYUP || msg == WM_SYSKEYUP {
                    let was_held = V_HELD.swap(false, Ordering::SeqCst);
                    if was_held && ARMED.load(Ordering::SeqCst) {
                        send_signal(PasteSignal::Up(GENERATION.load(Ordering::SeqCst)));
                    }
                }
            }
        }
        CallNextHookEx(None, code, wparam, lparam)
    }

    fn spawn_hook_thread(app: AppHandle) {
        std::thread::spawn(move || unsafe {
            let _thread_id = GetCurrentThreadId();
            let hook = match SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_hook_proc), None, 0) {
                Ok(hook) => hook,
                Err(e) => {
                    // Distinct from the (unlogged) normal-shutdown exit below,
                    // which only happens after this hook installed
                    // successfully and its message loop later ends —
                    // "clipboard_hook_install" only ever fires here, at
                    // startup, and only on failure. Without this, a failed
                    // install (e.g. blocked by security software or a
                    // locked-down Group Policy) left Copy Trade Pair's
                    // paste-swap silently non-functional with zero trace in
                    // diagnostics.
                    crate::diagnostics::log_event(
                        &app,
                        "clipboard_hook_install",
                        "error",
                        serde_json::json!({ "error": e.to_string() }),
                    );
                    return;
                }
            };
            let mut msg = MSG::default();
            // Low-level keyboard hooks require their installing thread to
            // pump messages for the app's lifetime.
            while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                let _ = TranslateMessage(&msg);
                DispatchMessageW(&msg);
            }
            let _ = windows::Win32::UI::WindowsAndMessaging::UnhookWindowsHookEx(hook);
        });
    }

    fn spawn_consumer_thread(app: AppHandle, rx: mpsc::Receiver<PasteSignal>) {
        std::thread::spawn(move || {
            for signal in rx {
                match signal {
                    PasteSignal::Down(generation) => {
                        if GENERATION.load(Ordering::SeqCst) != generation || !ARMED.load(Ordering::SeqCst) {
                            continue;
                        }
                        let paste_count = {
                            let mut data = match queue_data().lock() {
                                Ok(data) => data,
                                Err(_) => continue,
                            };
                            data.paste_count += 1;
                            data.paste_count
                        };
                        // The first press only arms the "swap on key-up"
                        // step below. The second press clears the queue
                        // immediately — there's no further value to protect.
                        if paste_count >= 2 {
                            ARMED.store(false, Ordering::SeqCst);
                            let _ = app.emit("clipboard-queue-cleared", serde_json::json!({}));
                        }
                    }
                    PasteSignal::Up(generation) => {
                        if GENERATION.load(Ordering::SeqCst) != generation || !ARMED.load(Ordering::SeqCst) {
                            continue;
                        }
                        let second_value = {
                            let mut data = match queue_data().lock() {
                                Ok(data) => data,
                                Err(_) => continue,
                            };
                            if data.paste_count != 1 || data.swapped {
                                continue;
                            }
                            data.swapped = true;
                            data.second_value.clone()
                        };
                        std::thread::sleep(SWAP_SAFETY_MARGIN);
                        if GENERATION.load(Ordering::SeqCst) == generation && ARMED.load(Ordering::SeqCst) {
                            let _ = app.clipboard().write_text(second_value.clone());
                            let _ = app.emit("clipboard-queue-advanced", serde_json::json!({ "next": second_value }));
                        }
                    }
                }
            }
        });
    }

    /// Called once at app startup. Installs the passive hook and its
    /// consumer thread; both are inert until a queue is armed.
    pub fn init(app: &AppHandle) {
        let (tx, rx) = mpsc::channel::<PasteSignal>();
        PASTE_TX.get_or_init(|| Mutex::new(Some(tx)));
        spawn_hook_thread(app.clone());
        spawn_consumer_thread(app.clone(), rx);
    }

    pub fn start(app: &AppHandle, first: String, second: String) -> Result<(), String> {
        ARMED.store(false, Ordering::SeqCst);
        let generation = GENERATION.fetch_add(1, Ordering::SeqCst) + 1;

        {
            let mut data = queue_data().lock().map_err(|_| "clipboard queue state poisoned")?;
            data.second_value = second;
            data.paste_count = 0;
            data.swapped = false;
        }

        app.clipboard().write_text(first).map_err(|e| e.to_string())?;
        ARMED.store(true, Ordering::SeqCst);

        let app_clone = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(QUEUE_TIMEOUT);
            if GENERATION.load(Ordering::SeqCst) == generation && ARMED.load(Ordering::SeqCst) {
                ARMED.store(false, Ordering::SeqCst);
                let _ = app_clone.emit("clipboard-queue-timeout", serde_json::json!({}));
            }
        });

        Ok(())
    }

    pub fn cancel() {
        ARMED.store(false, Ordering::SeqCst);
        GENERATION.fetch_add(1, Ordering::SeqCst);
    }
}

#[cfg(windows)]
pub use windows_impl::{cancel as cancel_impl, init, start as start_impl};

#[cfg(not(windows))]
pub fn init(_app: &tauri::AppHandle) {}

#[tauri::command]
pub fn start_clipboard_queue(app: tauri::AppHandle, first: String, second: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        start_impl(&app, first, second)
    }
    #[cfg(not(windows))]
    {
        let _ = (app, first, second);
        Err("Clipboard trade-pair queue is only supported on Windows.".into())
    }
}

#[tauri::command]
pub fn cancel_clipboard_queue() {
    #[cfg(windows)]
    {
        cancel_impl();
    }
}
