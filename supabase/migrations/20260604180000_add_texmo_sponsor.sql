-- Patrocinador Gold: Texmo (instalaciones industriales)

INSERT INTO public.sponsors (name, logo_url, tier, website_url)
SELECT
  'Texmo',
  '/patrocinadores/texmo.png',
  'Gold',
  'https://www.texmoindustrial.com/'
WHERE NOT EXISTS (
  SELECT 1 FROM public.sponsors WHERE name = 'Texmo'
);

UPDATE public.sponsors
SET
  logo_url = '/patrocinadores/texmo.png',
  tier = 'Gold',
  website_url = 'https://www.texmoindustrial.com/'
WHERE name = 'Texmo';
