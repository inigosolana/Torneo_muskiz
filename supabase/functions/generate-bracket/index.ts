import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { GoogleGenAI, Type } from "npm:@google/genai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { teams, config } = await req.json();
    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

    const ai = new GoogleGenAI({ apiKey });
    const teamsContext = teams.map((t: { name: string; division: string }) =>
      `${t.name} (${t.division})`
    ).join(", ");

    const systemPrompt = `
      Actúa como un organizador experto de torneos deportivos.
      Tu tarea es generar un calendario de partidos en formato JSON.
      
      DATOS DE EQUIPOS DISPONIBLES (Usa estos nombres exactos):
      ${teamsContext}
      
      RESTRICCIONES HORARIAS Y DE PISTA:
      1. Horario de juego: Desde las ${config.startTime} hasta las ${config.endTime}.
      2. Duración de partido + descanso: ${config.intervalMins} minutos exactos entre el inicio de un partido y el siguiente.
      3. Pistas disponibles: ${config.courts.join(", ")}.
      4. ${config.lunchBreak ? "IMPRESCINDIBLE: Dejar una hora libre sin partidos entre las 13:00 y las 15:00 para comer." : "Sin parada para comer."}
      
      INSTRUCCIONES ESPECÍFICAS DEL USUARIO (PRIORIDAD ALTA):
      "${config.customPrompt}"
      
      REGLAS DE GENERACIÓN:
      - Genera los partidos necesarios según el prompt del usuario.
      - No añadas rondas de eliminatoria (cuartos, semifinales, etc.) salvo que el prompt del usuario las pida de forma explícita.
      - Si el prompt habla de fase final única, gran final o sin cuartos/semifinales, incluye solo fase de grupos (o lo que pida) y un partido final por categoría; usa round descriptivo (ej. "Gran final", "Fase de grupos").
      - Asigna horas y pistas evitando coincidencias.
      - Devuelve SOLO el array JSON.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: systemPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              time: { type: Type.STRING },
              court: { type: Type.STRING },
              teamA: { type: Type.STRING },
              teamB: { type: Type.STRING },
              round: { type: Type.STRING },
              status: { type: Type.STRING, enum: ["SCHEDULED"] },
              scoreA: { type: Type.NUMBER, nullable: true },
              scoreB: { type: Type.NUMBER, nullable: true },
            },
          },
        },
      },
    });

    const matches = (JSON.parse(response.text || "[]")).map((m: Record<string, unknown>, i: number) => ({
      ...m,
      scoreA: 0,
      scoreB: 0,
      id: `match-ai-${Date.now()}-${i}`,
    }));

    return new Response(JSON.stringify({ matches }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("generate-bracket error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
