import { supabase } from "./supabaseClient";

type OpsAlertPayload = {
  source: string;
  severity?: "info" | "warning" | "error" | "critical";
  message: string;
  details?: string;
};

export async function reportOpsAlert(payload: OpsAlertPayload) {
  try {
    await supabase.functions.invoke("notify-ops-alert", {
      body: payload,
    });
  } catch (error) {
    console.warn("notify-ops-alert failed:", error);
  }
}
