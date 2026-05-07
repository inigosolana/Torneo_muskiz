-- Borra TODO lo operativo / de pruebas. Conserva solo configuración y admin.
-- Ejecutar en Supabase → SQL Editor.
--
-- SE CONSERVA:
--   public.profiles donde role = 'staff' (acceso panel admin)
--   public.categories (categorías y precios del torneo)
--   public.sponsors (patrocinadores del panel admin)
--   public.site_content (textos / bloques de la web)
--   public.category_limits (límites si los usas; suele estar vacío o 1 fila)
--
-- SE BORRA:
--   player_stats, matches, players, teams, registrations
--   telegram_pending_rejections
--   gallery (imágenes de galería en BBDD; los ficheros en Storage hay que borrarlos aparte)
--   profiles con role = 'manager'
--
-- NO borra: archivos en Storage (receipts, player-documents, public-assets).
--   Para vaciar buckets: Dashboard → Storage → seleccionar bucket → vaciar,
--   o supabase storage rm --recursive ...

begin;

delete from public.player_stats;
delete from public.telegram_pending_rejections;
delete from public.matches;
delete from public.players;
delete from public.teams;
delete from public.registrations;
delete from public.gallery;
delete from public.profiles where role = 'manager';

commit;
