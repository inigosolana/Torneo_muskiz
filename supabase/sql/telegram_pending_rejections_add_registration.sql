-- Permite denegación por Telegram de toda una inscripción (varios equipos) en dos pasos.
alter table public.telegram_pending_rejections
  drop constraint if exists telegram_pending_rejections_entity_check;

alter table public.telegram_pending_rejections
  add constraint telegram_pending_rejections_entity_check
  check (entity in ('team', 'player-doc', 'registration'));
