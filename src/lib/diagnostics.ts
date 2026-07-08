import { invoke } from "@tauri-apps/api/core";

export type DiagnosticsLevel = "info" | "warn" | "error";

/**
 * Bridges a frontend event into the same local events.ndjson the Rust side
 * writes to. Best-effort and silent on failure — logging must never surface
 * as a user-facing error or interrupt whatever the caller was doing.
 */
export async function logEvent(
  event: string,
  level: DiagnosticsLevel,
  fields: Record<string, unknown> = {},
): Promise<void> {
  try {
    await invoke("log_frontend_event", { event, level, fields });
  } catch {
    // Diagnostics logging must never break the app.
  }
}

/** Builds the local diagnostics ZIP and returns the path it was written to. */
export async function exportDiagnostics(): Promise<string> {
  return invoke<string>("export_diagnostics");
}

export interface BuildInfo {
  app_version: string;
  git_commit: string;
  build_date: string;
  platform: string;
  arch: string;
}

/** App version/commit/build-date, populated automatically at compile time. */
export async function getBuildInfo(): Promise<BuildInfo> {
  return invoke<BuildInfo>("get_build_info");
}
