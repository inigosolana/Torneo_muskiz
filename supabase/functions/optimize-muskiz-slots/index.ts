import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { GoogleGenAI, Type } from "npm:@google/genai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Payload = {
  day: string;
  slotDurationMins: number;
  playStart: string;
  playEndExclusive: string;
  courts: string[];
  lunch?: { start: string; end: string };
  slots: string[];
  placed: { id: string; time: string; court: string; teamA: string; teamB: string }[];
  pending: { id: string; teamA: string; teamB: string; round: string }[];
  organizerNotes?: string;
  rulesSummary?: string;
};

type Assignment = { id: string; time: string; court: string };

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function occupied(payload: Payload, accepted: Assignment[]) {
  const out = payload.placed.map((p) => ({
    time: p.time,
    court: p.court,
    teamA: p.teamA,
    teamB: p.teamB,
  }));
  for (const a of accepted) {
    const p = payload.pending.find((x) => x.id === a.id);
    if (!p) continue;
    out.push({ time: a.time, court: a.court, teamA: p.teamA, teamB: p.teamB });
  }
  return out;
}

function isValid(payload: Payload, assignment: Assignment, accepted: Assignment[]): boolean {
  if (!payload.slots.includes(assignment.time)) return false;
  if (!payload.courts.includes(assignment.court)) return false;
  const pending = payload.pending.find((p) => p.id === assignment.id);
  if (!pending) return false;

  const slotMins = payload.slotDurationMins;
  const tStart = timeToMinutes(assignment.time);
  const tEnd = tStart + slotMins;
  const teams = [pending.teamA, pending.teamB];

  for (const other of occupied(payload, accepted)) {
    const oStart = timeToMinutes(other.time);
    const oEnd = oStart + slotMins;
    if (tStart >= oEnd || tEnd <= oStart) continue;
    if (other.court === assignment.court) return false;
    if (teams.some((t) => [other.teamA, other.teamB].includes(t))) return false;
  }
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as Payload;
    if (!payload?.pending?.length) {
      return new Response(JSON.stringify({ assignments: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

    const occupiedSummary = payload.placed
      .slice(0, 80)
      .map((p) => `${p.time} ${p.court}: ${p.teamA} vs ${p.teamB}`)
      .join("\n");

    const pendingList = payload.pending
      .map((p) => `- id=${p.id}: ${p.teamA} vs ${p.teamB} (${p.round})`)
      .join("\n");

    const organizerBlock = payload.organizerNotes?.trim()
      ? `\nINSTRUCCIONES DEL ORGANIZADOR (prioridad alta, sin romper solapes):\n${payload.organizerNotes.trim()}\n`
      : "";

    const rulesBlock = payload.rulesSummary?.trim()
      ? `\nFormato torneo Muskiz (ya aplicado en partidos; respétalo al colocar huecos):\n${payload.rulesSummary.trim()}\n`
      : "";

    const prompt = `Eres un asistente de horarios de torneo. NO inventes partidos, equipos ni fases nuevas.

Día: ${payload.day}
Franjas válidas (inicio de bloque ${payload.slotDurationMins} min): ${payload.slots.join(", ")}
Pistas: ${payload.courts.join(", ")}
Horario: ${payload.playStart}–${payload.playEndExclusive}${payload.lunch ? ` (sin jugar ${payload.lunch.start}–${payload.lunch.end})` : ""}
${rulesBlock}${organizerBlock}
Ya ocupado:
${occupiedSummary || "(ninguno)"}

Coloca SOLO estos partidos sin hueco (usa id exacto, time de la lista, court de la lista):
${pendingList}

Reglas técnicas: misma pista no dos partidos a la misma hora; ningún equipo en dos pistas a la vez; prioriza dar descanso entre partidos del mismo equipo.
Devuelve JSON array con {id, time, court} para los que encuentres hueco. Omite los imposibles.`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
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
            },
            required: ["id", "time", "court"],
          },
        },
      },
    });

    const raw = JSON.parse(response.text || "[]") as Assignment[];
    const accepted: Assignment[] = [];
    for (const a of raw) {
      if (!a?.id || !a?.time || !a?.court) continue;
      if (!isValid(payload, a, accepted)) continue;
      accepted.push(a);
    }

    return new Response(JSON.stringify({ assignments: accepted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("optimize-muskiz-slots error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({ error: message, assignments: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
