import { supabase } from "./supabaseClient";

type OpsAlertPayload = {
  source: string;
  severity?: "info" | "warning" | "error" | "critical";
  message: string;
  details?: string;
};

/** Evita ráfagas idénticas (p. ej. bucles de render o el mismo fallo repetido). */
let _lastFingerprint = "";
let _lastFingerprintAt = 0;

/** Mismo mensaje repetido ≤1 vez cada 60 s (los avisos a Telegram pueden venir también del backend por otro canal). */
const DEFAULT_THROTTLE_MS = 60_000;

function shouldThrottle(fingerprint: string, windowMs: number): boolean {
  const now = Date.now();
  if (fingerprint === _lastFingerprint && now - _lastFingerprintAt < windowMs) return true;
  _lastFingerprint = fingerprint;
  _lastFingerprintAt = now;
  return false;
}

export async function reportOpsAlert(payload: OpsAlertPayload) {
  const fingerprint = `${payload.source}|${payload.message}|${(payload.details ?? "").slice(0, 200)}`;
  if (shouldThrottle(fingerprint, DEFAULT_THROTTLE_MS)) return;

  try {
    const { error } = await supabase.functions.invoke("notify-ops-alert", {
      body: {
        source: payload.source,
        severity: payload.severity ?? "error",
        message: payload.message,
        details: payload.details,
      },
    });
    if (error) {
      console.warn("notify-ops-alert invoke error:", error.message);
    }
  } catch (error) {
    console.warn("notify-ops-alert failed:", error);
  }
}

/** Errores JS globales y promesas no capturadas → mismo bot de fallos. */
export function installGlobalFrontendErrorReporting(): void {
  if (typeof window === "undefined") return;
  if ((window as unknown as { __opsGlobalErrors?: boolean }).__opsGlobalErrors) return;
  (window as unknown as { __opsGlobalErrors?: boolean }).__opsGlobalErrors = true;

  window.addEventListener("error", (ev) => {
    const msg = ev.message || "window.error";
    const details = [
      ev.filename ? `file=${ev.filename}:${ev.lineno}:${ev.colno}` : "",
      ev.error instanceof Error ? ev.error.stack : String(ev.error ?? ""),
    ]
      .filter(Boolean)
      .join("\n")
      .slice(0, 3500);
    void reportOpsAlert({
      source: "frontend.global.window-error",
      severity: "error",
      message: msg,
      details: details || undefined,
    });
  });

  window.addEventListener("unhandledrejection", (ev) => {
    const reason = ev.reason;
    const msg = reason instanceof Error ? reason.message : String(reason ?? "unhandledrejection");
    const stack = reason instanceof Error ? reason.stack : "";
    void reportOpsAlert({
      source: "frontend.global.unhandledrejection",
      severity: "error",
      message: msg,
      details: stack?.slice(0, 3500),
    });
  });
}
