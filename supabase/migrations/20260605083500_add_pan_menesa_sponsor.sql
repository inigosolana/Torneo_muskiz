-- Patrocinador Gold: Pan Menesa

INSERT INTO public.sponsors (name, logo_url, tier, website_url)
SELECT
  'Pan Menesa',
  '/patrocinadores/pan-menesa.png',
  'Gold',
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM public.sponsors WHERE name = 'Pan Menesa'
);

UPDATE public.sponsors
SET
  logo_url = '/patrocinadores/pan-menesa.png',
  tier = 'Gold'
WHERE name = 'Pan Menesa';
