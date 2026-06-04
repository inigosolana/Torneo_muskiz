import { SiteContent } from '../types';
import { OFFICIAL_SPONSORS_2026 } from './officialSponsors';

export const siteContent: SiteContent = {
  heroTitle: "II Torneo Muskizko Udala",
  heroSubtitle: "El evento principal de balonmano playa en Muskiz. Vive la adrenalina, la arena y la gloria en nuestra costa.",

  // History
  aboutTitle: "Sobre el Torneo",
  aboutText: "Tras el éxito del I Torneo Muskizko Udala celebrado el año pasado, volvemos con más fuerza. Este torneo está organizado por Kolosaurios, un club creado en 2022 por jugadores apasionados del Muskiz Eskubaloia. Conjuntamente con el propio Muskiz Eskubaloia y el apoyo fundamental del Ayuntamiento de Muskiz, hemos hecho realidad esta segunda edición.\n\nNuestro objetivo sigue siendo el mismo: disfrutar del mejor balonmano en un entorno inmejorable. Contamos con equipos que vienen desde todos los rincones del norte de España, abarcando todas las categorías desde Benjamín hasta Senior, garantizando un fin de semana lleno de deporte, competición y buen ambiente.",
  aboutImageUrl: "/la_arena.jpg",
  aboutStats: [
    { value: "2022", label: "Fundación Kolosaurios" },
    { value: "Norte", label: "Equipos de toda la zona" },
    { value: "2ª", label: "Edición del Torneo" }
  ],

  // Venue
  venue: {
    title: "La Sede: Playa de La Arena",
    description: "Situada en un entorno natural privilegiado, la Playa de La Arena ofrece las condiciones perfectas para la práctica del balonmano playa. Su arena fina y compacta permite un juego rápido y espectacular.",
    imageUrl: "/kolosaurios.jpg",
    features: [
      "Orientación perfecta para el sol",
      "Más de 2000 plazas de aparcamiento",
      "Amplia oferta gastronómica local"
    ]
  },

  // Socials
  socials: {
    instagramKolosaurios: { handle: "@kolosaurios_muskiz", url: "https://www.instagram.com/kolosaurios_muskiz/" },
    instagramMuskiz: { handle: "@muskiz_eskubaloia", url: "https://www.instagram.com/muskiz_eskubaloia/" },
    tiktok: { handle: "@kolosaurios_muskiz", url: "https://www.tiktok.com/@kolosaurios_muskiz?lang=es" },
    youtube: { handle: "@KolosauriosMuskiz", url: "https://www.youtube.com/@KolosauriosMuskiz" },
    website: { handle: "balonmanomuskiz.com", url: "https://www.balonmanomuskiz.com/" }
  },

  // Tournament Info
  tournamentInfoTitle: "Información y Reglamento",
  tournamentInfoText: "El torneo se desarrollará en dos fases: una Fase de Grupos seguida de la fase final (solo la gran final por categoría, sin cuartos ni semifinales). Garantizamos que cada equipo juegue un mínimo de 3 partidos.\n\nHorarios por categorías:\n• CADETE: Viernes 5 de Junio, desde las 17:00h.\n• JUVENIL Y SENIOR: Sábado 6 de Junio (todo el día).\n• INFANTIL: Domingo 7 de Junio.\n\nNormativa de plantilla:\n• SENIOR: Mínimo 6 / Máximo 12 jugadores inscritos; en cada partido se convocan hasta 10.\n• JUVENIL, CADETE E INFANTIL: Mínimo 6 / Máximo 14 jugadores inscritos; en cada partido se convocan hasta 12.\n• Además, cada equipo puede dar de alta 1 entrenador y 1 oficial (no cuentan como jugadores).\n\nLas inscripciones de equipos están cerradas; no es posible apuntarse.",
  tournamentInfoImageUrl: "/campos.jpg",

  contactEmail: "torneo@muskiz.com",
  isScheduleActive: false,

  // Patrocinadores oficiales 2026 (fallback; Supabase debe coincidir — ver officialSponsors.ts)
  sponsors: OFFICIAL_SPONSORS_2026,

  // Gallery
  gallery: [
    { id: 'g7', url: '/galeria/PHOTO-2025-11-13-12-40-07.jpg', title: 'Torneo 2025 - Arena', year: 2025 },
    { id: 'g6', url: '/galeria/PHOTO-2025-11-13-12-40-07 (2).jpg', title: 'Torneo 2025 - Acción', year: 2025 },
    { id: 'g5', url: '/galeria/PHOTO-2025-11-13-12-40-07 (1).jpg', title: 'Torneo 2025 - Equipos', year: 2025 },
    { id: 'g4', url: '/galeria/PHOTO-2025-11-13-12-40-06.jpg', title: 'Torneo 2025 - Jugada', year: 2025 },
    { id: 'g3', url: '/galeria/PHOTO-2025-11-13-12-40-06 (2).jpg', title: 'Torneo 2025 - Ambiente', year: 2025 },
    { id: 'g2', url: '/galeria/PHOTO-2025-11-13-12-40-06 (1).jpg', title: 'Torneo 2025 - Muskiz', year: 2025 },
    { id: 'g1', url: '/galeria/PHOTO-2025-11-13-12-40-05.jpg', title: 'Torneo 2025 - Inicio', year: 2025 },
  ]
};
