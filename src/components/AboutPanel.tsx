import { useEffect, useState } from "react";
import appIcon from "../assets/app-icon.png";
import { exportDiagnostics, getBuildInfo, type BuildInfo } from "../lib/diagnostics";
import { GITHUB_ISSUES_URL, GITHUB_RELEASES_URL, GITHUB_REPO_URL, KOFI_URL, openExternal, PAYPAL_URL } from "../lib/links";

interface AboutPanelProps {
  onClose: () => void;
}

export function AboutPanel({ onClose }: AboutPanelProps) {
  const [buildInfo, setBuildInfo] = useState<BuildInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBuildInfo()
      .then((info) => {
        if (!cancelled) setBuildInfo(info);
      })
      .catch(() => {
        // Leave buildInfo null — the fields below fall back to placeholders.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="section">
      <div className="button-row">
        <button className="secondary-button" onClick={onClose}>
          ← Back
        </button>
      </div>

      <h2 className="section-heading">About</h2>
      <div className="about-header">
        <img src={appIcon} alt="" className="about-logo" />
        <div className="about-header-text">
          <p className="about-app-name">Faustus Friend</p>
          <p className="about-version-line">
            Version {buildInfo?.app_version ?? "…"} · Commit {buildInfo?.git_commit ?? "…"} · Built{" "}
            {buildInfo?.build_date ?? "…"}
          </p>
        </div>
      </div>
      <p className="hint">
        Faustus Friend is a Windows companion utility for Path of Exile that provides fast trading calculations and
        comparison tools without gameplay automation.
      </p>
      <p className="hint">Copyright © 2026 Nick Earls. Licensed under the MIT License.</p>

      <h2 className="section-heading section-heading-divider">Support</h2>
      <div className="button-row">
        <button className="secondary-button" onClick={() => void openExternal(GITHUB_REPO_URL)}>
          View Source &amp; Documentation
        </button>
      </div>
      <div className="button-row">
        <button className="secondary-button" onClick={() => void openExternal(GITHUB_ISSUES_URL)}>
          Report an Issue
        </button>
      </div>
      <div className="button-row">
        <button className="secondary-button" onClick={() => void openExternal(GITHUB_RELEASES_URL)}>
          Check for Updates
        </button>
      </div>
      <ExportDiagnosticsField />

      <h2 className="section-heading section-heading-divider">Support Development</h2>
      <p className="hint">Support Faustus Friend — it's free and will stay that way.</p>
      <div className="button-row">
        <button className="primary-button" onClick={() => void openExternal(KOFI_URL)}>
          ☕ Support on Ko-fi
        </button>
      </div>
      <div className="button-row">
        <button className="secondary-button" onClick={() => void openExternal(PAYPAL_URL)}>
          💙 Donate with PayPal
        </button>
      </div>

      <h2 className="section-heading section-heading-divider">Privacy</h2>
      <p className="hint">
        Faustus Friend collects no telemetry, no analytics, and never uploads anything automatically. It does not
        monitor your gameplay. Diagnostics stay on your computer unless you choose to export and share them yourself.
      </p>
    </div>
  );
}

/** Moved here from Settings — same underlying `export_diagnostics` command, same behavior. */
function ExportDiagnosticsField() {
  const [status, setStatus] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    setStatus(null);
    try {
      const path = await exportDiagnostics();
      setStatus(`Diagnostics saved to ${path}`);
      setIsError(false);
    } catch (err) {
      setStatus(`Could not export diagnostics: ${err}`);
      setIsError(true);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <>
      <p className="hint">
        Export a local diagnostics bundle (logs, settings, app info) to share when reporting a problem. Nothing is
        sent anywhere automatically — this only writes a ZIP file to your computer.
      </p>
      <div className="button-row">
        <button className="secondary-button" onClick={handleExport} disabled={isExporting}>
          {isExporting ? "Exporting…" : "Export Diagnostics"}
        </button>
      </div>
      {status && <p className={isError ? "error" : "status"}>{status}</p>}
    </>
  );
}
