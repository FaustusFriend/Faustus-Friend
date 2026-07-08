import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { logEvent } from "./lib/diagnostics";

// Catch-all for unexpected frontend errors so a beta user's diagnostics
// export has some record of what went wrong, even for failures outside any
// try/catch (a render error, a rejected promise nobody awaited).
window.addEventListener("error", (event) => {
  void logEvent("unhandled_error", "error", {
    message: event.message,
    source: event.filename,
    line: event.lineno,
    column: event.colno,
  });
});

window.addEventListener("unhandledrejection", (event) => {
  void logEvent("unhandled_rejection", "error", { reason: String(event.reason) });
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
