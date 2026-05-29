-- Patrocinador Gold: Itxas Mendi (Montemar) Bar — Pobeña, Muskiz
INSERT INTO public.sponsors (name, logo_url, tier, website_url)
SELECT
  'Itxas Mendi (Montemar) Bar',
  '/patrocinadores/itxas-mendi-montemar.png',
  'Gold',
  'https://www.disfrutabizkaia.com/establecimiento/itxas-mendi-montemar-bar/'
WHERE NOT EXISTS (
  SELECT 1 FROM public.sponsors WHERE name = 'Itxas Mendi (Montemar) Bar'
);
