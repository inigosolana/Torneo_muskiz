import muskizLogo from '../assets/patrocinadores/muskizko_udala.png';
import petronorLogo from '../assets/patrocinadores/petronor.jpg';
import delcoiLogo from '../assets/patrocinadores/delcoi.png';
import itxasMendiLogo from '../assets/patrocinadores/itxas-mendi-montemar.png';
import xbotgoLogo from '../assets/patrocinadores/xbotgo.png';
import baratzaLogo from '../assets/patrocinadores/baratza.png';
import texmoLogo from '../assets/patrocinadores/texmo.png';
import panMenesaLogo from '../assets/patrocinadores/pan-menesa.png';

/** Logos empaquetados en el build (no dependen de /public en el servidor). */
export const SPONSOR_LOGO_BY_NAME: Record<string, string> = {
  'Ayuntamiento de Muskiz': muskizLogo,
  Petronor: petronorLogo,
  'DELCOI S.A.': delcoiLogo,
  'Itxas Mendi (Montemar) Bar': itxasMendiLogo,
  XbotGo: xbotgoLogo,
  Baratza: baratzaLogo,
  Texmo: texmoLogo,
  'Pan Menesa': panMenesaLogo,
};

export function resolveSponsorLogo(name: string, logoFromDb?: string | null): string {
  const known = SPONSOR_LOGO_BY_NAME[name];
  if (known) return known;
  return (logoFromDb ?? '').trim();
}
