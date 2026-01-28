import { GoogleGenAI, Type } from "@google/genai";
import { Match, Team } from "../types";

// We check for the API key in the environment
const apiKey = process.env.API_KEY || '';

// --- Initialization ---
const getAiClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY || apiKey });

// --- Bracket Generation ---
export const generateBracketAI = async (
    teams: Team[], 
    config: {
        startTime: string,
        endTime: string,
        intervalMins: number,
        courts: string[],
        lunchBreak: boolean,
        customPrompt: string
    }
): Promise<Match[]> => {
    try {
        const ai = getAiClient();
        
        // Prepare team data string for context
        const teamsContext = teams.map(t => `${t.name} (${t.division})`).join(', ');

        const systemPrompt = `
            Actúa como un organizador experto de torneos deportivos.
            Tu tarea es generar un calendario de partidos en formato JSON.
            
            DATOS DE EQUIPOS DISPONIBLES (Usa estos nombres exactos):
            ${teamsContext}
            
            RESTRICCIONES HORARIAS Y DE PISTA:
            1. Horario de juego: Desde las ${config.startTime} hasta las ${config.endTime}.
            2. Duración de partido + descanso: ${config.intervalMins} minutos exactos entre el inicio de un partido y el siguiente.
            3. Pistas disponibles: ${config.courts.join(', ')}.
            4. ${config.lunchBreak ? 'IMPRESCINDIBLE: Dejar una hora libre sin partidos entre las 13:00 y las 15:00 para comer.' : 'Sin parada para comer.'}
            
            INSTRUCCIONES ESPECÍFICAS DEL USUARIO (PRIORIDAD ALTA):
            "${config.customPrompt}"
            
            REGLAS DE GENERACIÓN:
            - Genera los partidos necesarios según el prompt del usuario (grupos, eliminatorias, etc).
            - Asigna horas y pistas evitando coincidencias.
            - Devuelve SOLO el array JSON.
        `;

        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
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
                            status: { type: Type.STRING, enum: ['SCHEDULED'] },
                            scoreA: { type: Type.NUMBER, nullable: true },
                            scoreB: { type: Type.NUMBER, nullable: true },
                        }
                    }
                }
            }
        });

        // Ensure IDs are unique strings if AI generates duplicates or numbers
        const matches = (JSON.parse(response.text || '[]') as Match[]).map((m, i) => ({
            ...m,
            scoreA: 0,
            scoreB: 0,
            id: `match-ai-${Date.now()}-${i}`
        }));
        
        return matches;
    } catch (error) {
        console.error("Bracket Generation Error:", error);
        return [];
    }
};

// --- Text Generation (Chat) ---
export const sendChatMessage = async (
  history: { role: string; parts: { text: string }[] }[],
  newMessage: string
): Promise<string> => {
  try {
    const ai = getAiClient();
    const chat = ai.chats.create({
      model: 'gemini-3-pro-preview', // Good for reasoning/chat
      history: history,
      config: {
        systemInstruction: "Eres el asistente oficial de IA para 'Summer Slam 2024', un torneo de balonmano playa. Ayudas con reglas, horarios y localización de canchas. Responde siempre en español. Mantén las respuestas concisas y con energía positiva.",
      }
    });

    const result = await chat.sendMessage({ message: newMessage });
    return result.text || "No pude generar una respuesta.";
  } catch (error) {
    console.error("Chat Error:", error);
    return "Lo siento, tengo problemas para conectarme a la radio del árbitro en este momento.";
  }
};

// --- Image Analysis (Roster ID) ---
export const analyzePlayerId = async (base64Image: string, mimeType: string = 'image/jpeg'): Promise<{ name?: string; number?: number }> => {
  try {
    const ai = getAiClient();
    const result = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Image } },
          { text: "Extrae el nombre del jugador y el número de camiseta de esta tarjeta de identificación o foto. Devuelve un JSON." }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            number: { type: Type.INTEGER }
          }
        }
      }
    });

    return JSON.parse(result.text || '{}');
  } catch (error) {
    console.error("Vision Error:", error);
    return {};
  }
};

// --- Video Generation (Veo) ---
export const generateHighlightVideo = async (
  prompt: string, 
  imageBytes?: string, 
  mimeType: string = 'image/png'
): Promise<string | null> => {
  // 1. Check/Request Key
  const win = window as any;
  if (win.aistudio) {
    const hasKey = await win.aistudio.hasSelectedApiKey();
    if (!hasKey) {
       await win.aistudio.openSelectKey();
    }
  }

  try {
    // Re-init client to ensure we pick up the injected key
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    console.log("Starting video generation...");
    let operation;

    if (imageBytes) {
      operation = await ai.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        image: {
          imageBytes,
          mimeType,
        },
        config: {
          numberOfVideos: 1,
          resolution: '720p', // fast-generate supports 720p/1080p
          aspectRatio: '16:9'
        }
      });
    } else {
        // Text only
        operation = await ai.models.generateVideos({
            model: 'veo-3.1-fast-generate-preview',
            prompt: prompt,
            config: {
              numberOfVideos: 1,
              resolution: '720p',
              aspectRatio: '16:9'
            }
          });
    }

    console.log("Video operation started. Polling...", operation);

    // Poll for completion
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 10000)); // Poll every 10s
      operation = await ai.operations.getVideosOperation({ operation: operation });
      console.log("Polling status:", operation.metadata);
    }

    const uri = operation.response?.generatedVideos?.[0]?.video?.uri;
    if (uri) {
      // Append key for download
      return `${uri}&key=${process.env.API_KEY}`;
    }
    return null;

  } catch (error) {
    console.error("Veo Error:", error);
    // If entity not found, might need to re-select key
    if (win.aistudio && String(error).includes("Requested entity was not found")) {
         await win.aistudio.openSelectKey();
    }
    throw error;
  }
};

// --- Search Grounding ---
export const searchRules = async (query: string): Promise<{text: string, links: {title: string, uri: string}[]}> => {
    try {
        const ai = getAiClient();
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: `Responde a esta pregunta sobre las reglas de Balonmano Playa o localización: ${query}`,
            config: {
                tools: [{googleSearch: {}}],
            },
        });
        
        const text = response.text || "No se encontró respuesta.";
        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        
        const links: {title: string, uri: string}[] = [];
        groundingChunks.forEach((chunk: any) => {
            if (chunk.web?.uri) {
                links.push({
                    title: chunk.web.title || "Fuente",
                    uri: chunk.web.uri
                });
            }
        });

        return { text, links };
    } catch (e) {
        console.error(e);
        return { text: "Error buscando reglas.", links: [] };
    }
}