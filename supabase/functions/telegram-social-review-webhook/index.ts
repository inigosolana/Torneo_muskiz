import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";
import {
  answerCallback,
  formatReviewTelegramText,
  getDraft,
  getPendingRevisionDraftId,
  loadReviewState,
  notifyDraftUpdated,
  registerReviewChatId,
  resolveReviewChatIds,
  sendDraftToReviewTelegram,
  sendPlainReviewMessage,
  setPendingRevision,
  setPendingMediaEdit,
  getPendingMediaEdit,
  updateDraftCaption,
} from "../_shared/socialTelegramReview.ts";
import {
  compositeImageWithText,
  downloadTelegramFile,
  extractPhotoFileId,
  parseMediaFormat,
  parseOverlayText,
  sendTelegramPhoto,
  type MediaFormat,
} from "../_shared/telegramMediaEdit.ts";
import {
  parseSocialBotCommand,
  socialBotHelpText,
  socialBotListaText,
} from "../_shared/socialBotCommands.ts";
import { generateFromSocialBotCommand } from "../_shared/socialBotGenerate.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const SERVICE_ROLE = SUPABASE_SERVICE_ROLE_KEY?.trim() ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

async function regenerateCaption(
  draft: { payload: Record<string, unknown>; caption: string },
  userNotes?: string,
): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return draft.caption;

  let prompt = `Mejora este borrador para Instagram (${draft.payload.template ?? "post"}), tono deportivo, español, máx 900 caracteres:\n\n${draft.caption}`;
  if (userNotes?.trim()) {
    prompt = `Texto actual:\n${draft.caption}\n\nCambios pedidos por el organizador:\n${userNotes}\n\nReescribe el post de Instagram aplicando esos cambios. Español, máx 900 caracteres, emojis moderados.`;
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    },
  );
  if (!res.ok) return draft.caption;
  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === "string" && text.trim() ? text.trim() : draft.caption;
}

async function processPhotoWithText(
  supabase: ReturnType<typeof createClient>,
  chatId: string,
  fileId: string,
  overlayRaw: string,
  fixedFormat?: MediaFormat,
): Promise<void> {
  const format = fixedFormat ?? parseMediaFormat(overlayRaw);
  const overlayText = parseOverlayText(overlayRaw);
  if (!overlayText) {
    await setPendingMediaEdit(supabase, chatId, {
      fileId,
      format,
      receivedAt: new Date().toISOString(),
    });
    await sendPlainReviewMessage(
      chatId,
      "📷 Foto recibida.\nEscribe el texto que quieres poner encima (puedes incluir «feed» para post 1080×1080).",
    );
    return;
  }

  await sendPlainReviewMessage(chatId, `⏳ Editando imagen (${format === "story" ? "Story 9:16" : "Feed 1:1"})…`);
  const t0 = Date.now();
  const bytes = await downloadTelegramFile(fileId);
  const edited = await compositeImageWithText(bytes, overlayText, format);
  const ok = await sendTelegramPhoto(
    chatId,
    edited,
    `✅ Listo en ${((Date.now() - t0) / 1000).toFixed(1)}s · ${format === "story" ? "1080×1920" : "1080×1080"}\n\n${overlayText}`,
  );
  await setPendingMediaEdit(supabase, chatId, null);
  if (!ok) {
    await sendPlainReviewMessage(chatId, "❌ No se pudo enviar la imagen editada.");
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return new Response(JSON.stringify({ error: "Missing configuration" }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const update = await req.json();
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const callback = update.callback_query;
    if (callback?.data && callback.message?.chat?.id != null) {
      const chatId = String(callback.message.chat.id);
      const data = String(callback.data);
      const cqId = String(callback.id ?? "");

      if (data.startsWith("sr:")) {
        const [, action, draftId] = data.split(":");
        const draft = draftId ? await getDraft(supabase, draftId) : null;

        if (!draft) {
          await answerCallback(cqId, "Borrador expirado");
          return new Response(JSON.stringify({ ok: true }), {
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }

        if (action === "ok") {
          await updateDraftCaption(supabase, draftId, draft.caption, "approved");
          await setPendingRevision(supabase, chatId, null);
          await answerCallback(cqId, "Aprobado");
          await sendPlainReviewMessage(
            chatId,
            `✅ Aprobado (${draftId}). Puedes publicar en Instagram o disparar n8n.\n\n${draft.caption.slice(0, 500)}`,
          );
        } else if (action === "rev") {
          await updateDraftCaption(supabase, draftId, draft.caption, "revising");
          await setPendingRevision(supabase, chatId, draftId);
          await answerCallback(cqId, "Escribe los cambios");
          await sendPlainReviewMessage(
            chatId,
            `✏️ Borrador ${draftId}\nResponde en un mensaje con lo que quieres cambiar (tono, hashtags, nombres, etc.).`,
          );
        } else if (action === "gen") {
          const newCap = await regenerateCaption(draft);
          const updated = await updateDraftCaption(supabase, draftId, newCap, "pending");
          await answerCallback(cqId, "Texto regenerado");
          if (updated) {
            const state = await loadReviewState(supabase);
            const ids = resolveReviewChatIds(Deno.env.get("TELEGRAM_SOCIAL_REVIEW_CHAT_IDS"), state.chatIds);
            await notifyDraftUpdated(ids.length ? ids : [chatId], updated);
          }
        }
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const msg = update.message;
    if (!msg?.chat?.id) {
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const chatId = String(msg.chat.id);
    const text = String(msg.text ?? msg.caption ?? "").trim();

    await registerReviewChatId(supabase, chatId);

    const video = msg.video as { file_id?: string } | undefined;
    if (video?.file_id) {
      await sendPlainReviewMessage(
        chatId,
        "🎬 Los vídeos aún no se editan en el bot.\nEnvía una **foto** (captura del vídeo) con el texto en el pie de foto, o usa un editor y sube la imagen final.",
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const photoId = extractPhotoFileId(msg as Record<string, unknown>);
    if (photoId) {
      await processPhotoWithText(supabase, chatId, photoId, text);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const botCmd = parseSocialBotCommand(text);
    if (botCmd?.type === "help" || text === "/start") {
      await sendPlainReviewMessage(chatId, socialBotHelpText(chatId));
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (botCmd?.type === "lista") {
      await sendPlainReviewMessage(chatId, socialBotListaText());
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (botCmd?.type === "editar") {
      await sendPlainReviewMessage(
        chatId,
        [
          "📷 **Editar foto para Instagram**",
          "",
          "• Envía la foto con el **texto en el pie de foto** (leyenda).",
          "• O manda la foto y después otro mensaje solo con el texto.",
          `• Formato por defecto: **story** 1080×1920. Escribe «feed» para 1080×1080.`,
          "",
          "Ejemplo pie de foto:",
          "¡Gran partido en Muskiz! 🏐 #TorneoMuskiz",
        ].join("\n"),
      );
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    if (botCmd && botCmd.type !== "help" && botCmd.type !== "lista" && botCmd.type !== "editar") {
      await sendPlainReviewMessage(chatId, "⏳ Generando borrador… (5–15 s)");
      const t0 = Date.now();
      const gen = await generateFromSocialBotCommand(supabase, botCmd);
      if ("error" in gen) {
        await sendPlainReviewMessage(chatId, `❌ ${gen.error}`);
        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
      const fmt = gen.payload.format as { label?: string } | undefined;
      const tg = await sendDraftToReviewTelegram(supabase, gen.payload);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      await sendPlainReviewMessage(
        chatId,
        tg.sent
          ? `✅ Borrador en ${elapsed}s (${fmt?.label ?? "formato automático"}). ID: ${tg.draftId ?? "—"}`
          : `❌ Tras ${elapsed}s: ${tg.error ?? "No se pudo enviar"}`,
      );
      return new Response(JSON.stringify({ ok: true, telegram: tg }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const pendingMedia = await getPendingMediaEdit(supabase, chatId);
    if (pendingMedia && text && !text.startsWith("/")) {
      try {
        await processPhotoWithText(supabase, chatId, pendingMedia.fileId, text, pendingMedia.format);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        await sendPlainReviewMessage(chatId, `❌ Error al editar: ${err}`);
        await setPendingMediaEdit(supabase, chatId, null);
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const pendingId = await getPendingRevisionDraftId(supabase, chatId);
    if (pendingId && text && !text.startsWith("/")) {
      const draft = await getDraft(supabase, pendingId);
      if (draft) {
        const newCap = await regenerateCaption(draft, text);
        const updated = await updateDraftCaption(supabase, pendingId, newCap, "pending");
        await setPendingRevision(supabase, chatId, null);
        if (updated) {
          await sendPlainReviewMessage(chatId, "📝 Versión revisada:\n\n" + updated.caption);
          const state = await loadReviewState(supabase);
          const ids = resolveReviewChatIds(Deno.env.get("TELEGRAM_SOCIAL_REVIEW_CHAT_IDS"), state.chatIds);
          await notifyDraftUpdated(ids.length ? ids : [chatId], updated);
        }
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : (typeof e === "object" && e && "message" in e)
      ? String((e as { message: unknown }).message)
      : String(e);
    console.error("telegram-social-review-webhook", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
