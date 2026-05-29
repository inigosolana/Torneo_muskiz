-- Patrocinador Gold: XbotGo
INSERT INTO public.sponsors (name, logo_url, tier, website_url)
SELECT
  'XbotGo',
  '/patrocinadores/xbotgo.png',
  'Gold',
  'https://www.xbotgo.com/'
WHERE NOT EXISTS (
  SELECT 1 FROM public.sponsors WHERE name = 'XbotGo'
);
