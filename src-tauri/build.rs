use time::macros::format_description;

fn main() {
    tauri_build::build();

    // Best-effort — a shallow clone, a source tarball without `.git`, or no
    // `git` on PATH should never fail the build. Diagnostics just reports
    // "unknown" for the commit in that case.
    let git_commit = std::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown".to_string());
    println!("cargo:rustc-env=FAUSTUS_GIT_COMMIT={git_commit}");

    let format = format_description!("[year]-[month]-[day]");
    let build_date = time::OffsetDateTime::now_utc()
        .format(&format)
        .unwrap_or_else(|_| "unknown".to_string());
    println!("cargo:rustc-env=FAUSTUS_BUILD_DATE={build_date}");

    // Re-run when HEAD moves so the embedded commit hash stays current
    // across incremental builds, without forcing a rebuild on every commit
    // in the repo's history.
    println!("cargo:rerun-if-changed=../.git/HEAD");
}
