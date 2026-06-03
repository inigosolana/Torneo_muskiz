-- Intercambio grupos Senior Masculino: Bitxi Pare Bihurri (B→C), Blue Flow (C→B)
UPDATE public.teams SET competition_group = 'C' WHERE id = '510dfdbb-e92a-4655-92a0-9a27e711cf8f';
UPDATE public.teams SET competition_group = 'B' WHERE id = 'b813b5aa-c50e-450b-92f4-a81824cd295f';

CREATE OR REPLACE FUNCTION public.swap_sm_bitxi_blue_flow_groups()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.teams SET competition_group = 'C' WHERE id = '510dfdbb-e92a-4655-92a0-9a27e711cf8f';
  UPDATE public.teams SET competition_group = 'B' WHERE id = 'b813b5aa-c50e-450b-92f4-a81824cd295f';
END;
$$;

REVOKE ALL ON FUNCTION public.swap_sm_bitxi_blue_flow_groups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.swap_sm_bitxi_blue_flow_groups() TO anon, authenticated, service_role;
