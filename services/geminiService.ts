/**
 * geminiService.ts
 *
 * SEGURIDAD: Ninguna llamada directa a la API de Google desde el frontend.
 * Todas las llamadas a Gemini se hacen a través de Supabase Edge Functions
 * para mantener la clave GEMINI_API_KEY únicamente en el servidor.
 */
import { supabase } from './supabaseClient';
import { Match, Team } from '../types';

const getLocalChatFallback = (newMessage: string, realTimeData: string): string => {
  const normalized = newMessage.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (normalized.includes('inscrib')) {
    return 'Para inscribirte, entra en la sección "Inscripción", rellena los datos del responsable y del equipo, y sube el justificante si aplica. Si ya tienes equipo aprobado, puedes completar jugadores desde "Gestión de equipo".';
  }

  if (normalized.includes('jugador') || normalized.includes('dni') || normalized.includes('seguro')) {
    return 'Para jugadores: el DNI se indica como número en el formulario y el seguro sí se sube como documento. Si el equipo está aprobado, el mánager puede gestionarlo en "Gestión de equipo".';
  }

  if (normalized.includes('regla') || normalized.includes('reglamento') || normalized.includes('norma')) {
    return 'Las reglas principales están en "Calendario/Reglamento": fase de grupos, gran final por categoría y formato de 2 sets de 10 minutos.';
  }

  if (normalized.includes('horario') || normalized.includes('partido') || normalized.includes('calendario')) {
    if (realTimeData && !realTimeData.includes('No hay partidos programados')) {
      return `Ahora mismo tengo estos partidos en contexto:\n${realTimeData}\nSi quieres, dime una categoría y te lo resumo.`;
    }
    return 'Todavía no tengo partidos cargados en tiempo real. Revisa la pestaña de calendario/resultados para ver actualizaciones cuando estén disponibles.';
  }

  if (normalized.includes('bano') || normalized.includes('baño') || normalized.includes('ducha') || normalized.includes('ubicacion')) {
    return 'Para ubicaciones (baños, duchas, pistas), revisa la sección de información del evento o consulta con organización en mesa de control.';
  }

  return 'Ahora mismo la IA no está disponible, pero puedo ayudarte con inscripción, reglamento, horarios y gestión de jugadores. Prueba con: "cómo me inscribo", "reglas", o "horarios".';
};

// --- Bracket Generation ---

function parseBracketError(raw: string): string {
  if (raw.includes('API key expired') || raw.includes('API_KEY_INVALID')) {
    return 'La clave GEMINI_API_KEY del servidor ha caducado. Renueva el secret en Supabase Edge Functions, o usa el simulador determinístico («Generar Viernes» / «Generar los 3 días»).';
  }
  if (raw.includes('GEMINI_API_KEY not configured')) {
    return 'Falta configurar GEMINI_API_KEY en los secrets de Supabase.';
  }
  try {
    const inner = JSON.parse(raw);
    const msg = inner?.error?.message ?? inner?.message ?? inner?.error;
    if (typeof msg === 'string' && msg.length > 0) return parseBracketError(msg);
  } catch {
    /* texto plano */
  }
  return raw.length > 280 ? `${raw.slice(0, 280)}…` : raw;
}

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
): Promise<{ matches: Match[]; error?: string }> => {
  try {
    const { data, error } = await supabase.functions.invoke('generate-bracket', {
      body: { teams, config }
    });

    const payload = data as { matches?: Match[]; error?: string } | null;

    if (payload?.error) {
      return { matches: [], error: parseBracketError(payload.error) };
    }

    if (error) {
      const msg = payload?.error ?? error.message ?? 'Error al invocar generate-bracket';
      return { matches: [], error: parseBracketError(String(msg)) };
    }

    const raw = (payload?.matches ?? []) as Match[];
    return {
      matches: raw.map((m) => ({ ...m, isPublic: m.isPublic ?? true })),
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('Bracket Generation Error:', error);
    return { matches: [], error: parseBracketError(msg) };
  }
};

// --- Text Generation (Chat) ---
export const sendChatMessage = async (
  history: { role: string; parts: { text: string }[] }[],
  newMessage: string,
  realTimeData: string = ''
): Promise<string> => {
  try {
    const { data, error } = await supabase.functions.invoke('chat-message', {
      body: { history, newMessage, realTimeData }
    });

    if (error) throw error;
    return data?.reply ?? getLocalChatFallback(newMessage, realTimeData);
  } catch (error) {
    console.error('Chat Error:', error);
    return getLocalChatFallback(newMessage, realTimeData);
  }
};

// --- Image Analysis (Roster ID) ---
export const analyzePlayerId = async (base64Image: string, mimeType: string = 'image/jpeg'): Promise<{ nombre?: string; apellidos?: string; dni?: string; fechaNacimiento?: string }> => {
  try {
    const { data, error } = await supabase.functions.invoke('analyze-player-id', {
      body: { base64Image, mimeType }
    });

    if (error) throw error;
    return data ?? {};
  } catch (error) {
    console.error('Vision Error:', error);
    return {};
  }
};

// --- Search Grounding ---
export const searchRules = async (query: string): Promise<{ text: string, links: { title: string, uri: string }[] }> => {
  try {
    const { data, error } = await supabase.functions.invoke('search-rules', {
      body: { query }
    });

    if (error) throw error;
    return data ?? { text: 'No se encontró respuesta.', links: [] };
  } catch (e) {
    console.error(e);
    return { text: 'Error buscando reglas.', links: [] };
  }
};

// --- Marketing / Social Media Generator ---
export const generateSocialMediaPost = async (match: Match): Promise<string> => {
  try {
    const { data, error } = await supabase.functions.invoke('generate-social-post', {
      body: { match }
    });

    if (error) throw error;
    return data?.post ?? '¡Increíble partido en Muskiz! 🔥 #BalonmanoPlaya';
  } catch (error) {
    console.error('Social Media Post Error:', error);
    return '¡Partidazo! 🏖️ #TorneoMuskiz';
  }
};

// --- Video Generation ---
// La generación de video (Veo) requiere acceso especial a AI Studio.
// Mantenemos una referencia pero delegamos la UI a VideoGenerator.tsx
export const generateHighlightVideo = async (_prompt: string): Promise<string | null> => {
  console.warn('generateHighlightVideo: Se debe implementar via Edge Function cuando esté disponible.');
  return null;
};