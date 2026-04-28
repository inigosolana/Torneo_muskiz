/**
 * geminiService.ts
 *
 * SEGURIDAD: Ninguna llamada directa a la API de Google desde el frontend.
 * Todas las llamadas a Gemini se hacen a través de Supabase Edge Functions
 * para mantener la clave GEMINI_API_KEY únicamente en el servidor.
 */
import { supabase } from './supabaseClient';
import { Match, Team } from '../types';

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
    const { data, error } = await supabase.functions.invoke('generate-bracket', {
      body: { teams, config }
    });

    if (error) throw error;
    return (data?.matches ?? []) as Match[];
  } catch (error) {
    console.error('Bracket Generation Error:', error);
    return [];
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
    return data?.reply ?? 'No pude generar una respuesta.';
  } catch (error) {
    console.error('Chat Error:', error);
    return 'Lo siento, tengo problemas para conectarme a la radio del árbitro en este momento.';
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