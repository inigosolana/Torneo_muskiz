-- II Torneo Muskiz 2026: solo patrocinadores oficiales actuales.

DELETE FROM public.sponsors
WHERE name NOT IN (
  'Ayuntamiento de Muskiz',
  'Petronor',
  'DELCOI S.A.',
  'Itxas Mendi (Montemar) Bar',
  'XbotGo',
  'Baratza'
);

INSERT INTO public.sponsors (name, logo_url, tier, website_url)
SELECT 'Ayuntamiento de Muskiz', '/patrocinadores/muskizko_udala.png', 'Platinum', 'https://www.muskiz.eus/'
WHERE NOT EXISTS (SELECT 1 FROM public.sponsors WHERE name = 'Ayuntamiento de Muskiz');

INSERT INTO public.sponsors (name, logo_url, tier, website_url)
SELECT 'Petronor', '/patrocinadores/petronor.jpg', 'Platinum', 'https://www.petronor.eus/'
WHERE NOT EXISTS (SELECT 1 FROM public.sponsors WHERE name = 'Petronor');

INSERT INTO public.sponsors (name, logo_url, tier, website_url)
SELECT 'DELCOI S.A.', '/patrocinadores/delcoi.png', 'Gold', 'https://www.delcoi.biz/'
WHERE NOT EXISTS (SELECT 1 FROM public.sponsors WHERE name = 'DELCOI S.A.');

INSERT INTO public.sponsors (name, logo_url, tier, website_url)
SELECT 'Itxas Mendi (Montemar) Bar', '/patrocinadores/itxas-mendi-montemar.png', 'Gold', 'https://www.disfrutabizkaia.com/establecimiento/itxas-mendi-montemar-bar/'
WHERE NOT EXISTS (SELECT 1 FROM public.sponsors WHERE name = 'Itxas Mendi (Montemar) Bar');

INSERT INTO public.sponsors (name, logo_url, tier, website_url)
SELECT 'XbotGo', '/patrocinadores/xbotgo.png', 'Gold', 'https://www.xbotgo.com/'
WHERE NOT EXISTS (SELECT 1 FROM public.sponsors WHERE name = 'XbotGo');

INSERT INTO public.sponsors (name, logo_url, tier, website_url)
SELECT 'Baratza', '/patrocinadores/baratza.png', 'Gold', NULL
WHERE NOT EXISTS (SELECT 1 FROM public.sponsors WHERE name = 'Baratza');

UPDATE public.sponsors SET logo_url = '/patrocinadores/muskizko_udala.png', tier = 'Platinum', website_url = 'https://www.muskiz.eus/' WHERE name = 'Ayuntamiento de Muskiz';
UPDATE public.sponsors SET logo_url = '/patrocinadores/petronor.jpg', tier = 'Platinum', website_url = 'https://www.petronor.eus/' WHERE name = 'Petronor';
UPDATE public.sponsors SET logo_url = '/patrocinadores/delcoi.png', tier = 'Gold', website_url = 'https://www.delcoi.biz/' WHERE name = 'DELCOI S.A.';
UPDATE public.sponsors SET logo_url = '/patrocinadores/itxas-mendi-montemar.png', tier = 'Gold', website_url = 'https://www.disfrutabizkaia.com/establecimiento/itxas-mendi-montemar-bar/' WHERE name = 'Itxas Mendi (Montemar) Bar';
UPDATE public.sponsors SET logo_url = '/patrocinadores/xbotgo.png', tier = 'Gold', website_url = 'https://www.xbotgo.com/' WHERE name = 'XbotGo';
UPDATE public.sponsors SET logo_url = '/patrocinadores/baratza.png', tier = 'Gold' WHERE name = 'Baratza';
