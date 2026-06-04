import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured", post: "" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const match = body.match ?? body.payload?.match;
    const captionDraft = body.captionDraft ?? body.payload?.captionDraft;
    const template = body.template ?? body.payload?.template ?? "match_result_feed";

    let prompt: string;
    if (captionDraft && typeof captionDraft === "string") {
      prompt = `Mejora este borrador para Instagram (${template}), tono deportivo y cercano, en español, máx 900 caracteres, con emojis moderados:\n\n${captionDraft}`;
    } else if (match) {
      prompt = `Escribe un post de Instagram en español para un torneo de balonmano playa en Muskiz.
Partido: ${match.teamA ?? match.team_a_name} vs ${match.teamB ?? match.team_b_name}.
Resultado: ${match.scoreA ?? match.score_a}:${match.scoreB ?? match.score_b}.
Hora: ${match.time}. Campo: ${match.court}.
Incluye 3-5 hashtags (#TorneoMuskiz #BalonmanoPlaya). Máximo 800 caracteres.`;
    } else {
      return new Response(JSON.stringify({ error: "match o captionDraft requerido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, maxOutputTokens: 512 },
        }),
      },
    );

    if (!res.ok) {
      const errText = await res.text();
      console.error("Gemini error", errText);
      return new Response(
        JSON.stringify({ post: typeof captionDraft === "string" ? captionDraft : "¡Partidazo en Muskiz! 🏖️ #TorneoMuskiz" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const json = await res.json();
    const post =
      json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ??
      (typeof captionDraft === "string" ? captionDraft : "¡Increíble jornada en Muskiz! 🏐 #TorneoMuskiz");

    return new Response(JSON.stringify({ post }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg, post: "" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
