import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";

export interface ClipboardQueueStatus {
  /** Which section (e.g. "buy" / "sell") currently owns the armed queue, if any. */
  armedForSection: string | null;
  /** What's currently sitting on the clipboard, ready for the next paste. */
  nextValue: string | null;
}

const IDLE_STATUS: ClipboardQueueStatus = { armedForSection: null, nextValue: null };

/**
 * Drives the "Copy Trade Pair" clipboard queue backed by the Rust-side
 * passive Ctrl+V watcher. Only one queue can be armed at a time; arming a
 * new one or cancelling always supersedes whatever was armed before.
 */
export function useClipboardQueue() {
  const [status, setStatus] = useState<ClipboardQueueStatus>(IDLE_STATUS);
  const sectionRef = useRef<string | null>(null);

  useEffect(() => {
    const unlistenPromises = [
      listen<{ next: string }>("clipboard-queue-advanced", (event) => {
        setStatus({ armedForSection: sectionRef.current, nextValue: event.payload.next });
      }),
      listen("clipboard-queue-cleared", () => {
        sectionRef.current = null;
        setStatus(IDLE_STATUS);
      }),
      listen("clipboard-queue-timeout", () => {
        sectionRef.current = null;
        setStatus(IDLE_STATUS);
      }),
    ];

    return () => {
      unlistenPromises.forEach((p) => {
        p.then((unlisten) => unlisten());
      });
    };
  }, []);

  const cancel = useCallback(async () => {
    const wasArmed = sectionRef.current !== null;
    sectionRef.current = null;
    setStatus(IDLE_STATUS);
    if (wasArmed) {
      try {
        await invoke("cancel_clipboard_queue");
      } catch {
        // Best-effort — nothing actionable if this fails.
      }
    }
  }, []);

  const start = useCallback(async (sectionId: string, first: string, second: string) => {
    sectionRef.current = sectionId;
    setStatus({ armedForSection: sectionId, nextValue: first });
    try {
      await invoke("start_clipboard_queue", { first, second });
    } catch (err) {
      sectionRef.current = null;
      setStatus(IDLE_STATUS);
      throw err;
    }
  }, []);

  /** Cancels any active queue, then copies a single value directly. */
  const copySingle = useCallback(
    async (value: string) => {
      await cancel();
      await writeText(value);
    },
    [cancel],
  );

  /** Cancels the queue only if it's currently armed for the given section. */
  const cancelIfOwnedBy = useCallback(
    (sectionId: string) => {
      if (sectionRef.current === sectionId) {
        void cancel();
      }
    },
    [cancel],
  );

  return { status, start, cancel, copySingle, cancelIfOwnedBy };
}
