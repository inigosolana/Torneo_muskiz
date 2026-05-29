-- Patrocinador Gold DELCOI S.A. + URL web en sponsors
ALTER TABLE public.sponsors ADD COLUMN IF NOT EXISTS website_url text;

INSERT INTO public.sponsors (name, logo_url, tier, website_url)
SELECT 'DELCOI S.A.', '/patrocinadores/delcoi.png', 'Gold', 'https://www.delcoi.biz/'
WHERE NOT EXISTS (
  SELECT 1 FROM public.sponsors WHERE name = 'DELCOI S.A.'
);
