import { openUrl } from "@tauri-apps/plugin-opener";

export const GITHUB_REPO_URL = "https://github.com/FaustusFriend/Faustus-Friend";

// Routes to the template chooser (Bug report / Feature request / Ko-fi &
// PayPal contact links — see .github/ISSUE_TEMPLATE/config.yml) rather than
// straight to a blank issue form.
export const GITHUB_ISSUES_URL = `${GITHUB_REPO_URL}/issues/new/choose`;
export const GITHUB_RELEASES_URL = `${GITHUB_REPO_URL}/releases`;

export const KOFI_URL = "https://ko-fi.com/faustusfriend";
export const PAYPAL_URL = "https://paypal.me/FaustusFriend";

/** Opens a URL in the user's default browser. Never throws into the caller. */
export async function openExternal(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    // Best-effort — nothing sensible to do in-app if the OS can't hand off
    // to a browser (e.g. no default browser configured).
  }
}
