-- Tabla auxiliar para guardar la denegación a la espera del motivo que el admin
-- escribirá en el chat de Telegram tras pulsar el botón "❌ Denegar".
-- Idempotente: ejecutable varias veces sin dañar nada.

create table if not exists public.telegram_pending_rejections (
  chat_id text not null,
  user_id text not null,
  entity text not null check (entity in ('team', 'player-doc')),
  entity_id uuid not null,
  doc_type text check (doc_type in ('dni', 'insurance')),
  prompt_message_id bigint,
  source_message_id bigint,
  source_chat_id bigint,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '15 minutes',
  primary key (chat_id, user_id)
);

comment on table public.telegram_pending_rejections is
  'Denegaciones desde Telegram pendientes de motivo. Se borra al recibir el motivo o al expirar.';

-- Índice para limpiar expiradas eficientemente.
create index if not exists telegram_pending_rejections_expires_at_idx
  on public.telegram_pending_rejections (expires_at);

-- RLS desactivada explícitamente: solo se accede con service role desde
-- la edge function telegram-bot-webhook.
alter table public.telegram_pending_rejections enable row level security;

drop policy if exists telegram_pending_rejections_no_anon on public.telegram_pending_rejections;
create policy telegram_pending_rejections_no_anon
  on public.telegram_pending_rejections
  for all
  to anon, authenticated
  using (false)
  with check (false);
