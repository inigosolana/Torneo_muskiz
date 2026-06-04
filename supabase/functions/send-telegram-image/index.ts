import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BOT_TOKEN = () => Deno.env.get("TELEGRAM_NOTIFICATIONS_BOT_TOKEN")?.trim() ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function parseChatIds(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const token = BOT_TOKEN();
    if (!token) {
      return new Response(JSON.stringify({ error: "TELEGRAM_NOTIFICATIONS_BOT_TOKEN no configurado" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({})) as {
      imageBase64?: string;
      image?: string;
      caption?: string;
      chatIds?: string[];
    };

    const raw = String(body.imageBase64 ?? body.image ?? "").trim();
    const b64 = raw.replace(/^data:image\/\w+;base64,/, "");
    if (!b64) {
      return new Response(JSON.stringify({ error: "imageBase64 requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const caption = String(body.caption ?? "").slice(0, 1024);
    const chatIds = Array.isArray(body.chatIds) && body.chatIds.length
      ? body.chatIds.map(String)
      : parseChatIds(Deno.env.get("TELEGRAM_ADMIN_CHAT_IDS"));

    if (!chatIds.length) {
      return new Response(JSON.stringify({ error: "TELEGRAM_ADMIN_CHAT_IDS vacío" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isPng = bytes[0] === 0x89 && bytes[1] === 0x50;
    const mime = isPng ? "image/png" : "image/jpeg";
    const filename = isPng ? "torneo-post.png" : "torneo-post.jpg";

    const results: { chatId: string; ok: boolean; error?: string }[] = [];

    for (const chatId of chatIds) {
      const form = new FormData();
      form.append("chat_id", chatId);
      form.append("photo", new Blob([bytes], { type: mime }), filename);
      if (caption) form.append("caption", caption);

      let res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
        method: "POST",
        body: form,
      });
      let data = await res.json().catch(() => ({})) as { ok?: boolean; description?: string };

      if (!data.ok) {
        const form2 = new FormData();
        form2.append("chat_id", chatId);
        form2.append("document", new Blob([bytes], { type: mime }), filename);
        if (caption) form2.append("caption", caption);
        res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
          method: "POST",
          body: form2,
        });
        data = await res.json().catch(() => ({})) as { ok?: boolean; description?: string };
      }

      results.push({ chatId, ok: !!data.ok, error: data.description });
    }

    const ok = results.some((r) => r.ok);
    return new Response(JSON.stringify({ ok, results }), {
      status: ok ? 200 : 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
