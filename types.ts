export enum View {
  HOME = 'HOME',
  INFO = 'INFO',
  SCHEDULE = 'SCHEDULE',
  ADMIN = 'ADMIN',
  REGISTRATION = 'REGISTRATION',
  TEAM = 'TEAM',
  MEDIA = 'MEDIA',
  SPONSORS = 'SPONSORS',
  PLAYER_SELF_REGISTRATION = 'PLAYER_SELF_REGISTRATION',
  MANAGER_LOGIN = 'MANAGER_LOGIN'
}

export interface Sponsor {
  id: string;
  name: string;
  logoUrl: string; // Can be a URL or a material icon name for demo purposes
  tier: 'Platinum' | 'Gold' | 'Silver' | 'Collaborator';
}

export interface GalleryItem {
  id: string;
  url: string;
  title: string;
  year: number;
  category?: 'Goles' | 'Ambiente' | 'Entrevistas';
}

export interface SocialConfig {
  handle: string;
  url: string;
}

export interface VenueInfo {
  title: string;
  description: string;
  imageUrl: string;
  features: string[]; // Array of strings for bullet points
}

export interface SiteContent {
  heroTitle: string;
  heroSubtitle: string;

  // Information Page - History
  aboutTitle: string;
  aboutText: string;
  aboutImageUrl: string;
  aboutStats: { value: string; label: string }[];

  // Information Page - Venue & Socials
  venue: VenueInfo;
  socials: {
    instagramKolosaurios: SocialConfig;
    instagramMuskiz: SocialConfig;
    tiktok: SocialConfig;
    youtube: SocialConfig;
    website: SocialConfig;
  };

  // Tournament Info (New section)
  tournamentInfoTitle: string;
  tournamentInfoText: string;
  tournamentInfoImageUrl: string;

  contactEmail: string;

  // App Settings
  isScheduleActive?: boolean;

  // Lists
  sponsors: Sponsor[];
  gallery: GalleryItem[];
}

export interface PlayerStat {
  playerId: string;
  goals: number;
  yellowCards: number;
  redCards: number;
}

export interface MatchReport {
  type: 'DIGITAL' | 'IMAGE';
  imageUri?: string; // For photo of physical report
  playerStats?: PlayerStat[]; // For digital report
  observations?: string;
}

export interface Match {
  id: string;
  time: string;
  court: string;
  teamA: string;
  teamB: string;
  scoreA: number | null;
  scoreB: number | null;
  status: 'SCHEDULED' | 'LIVE' | 'FINISHED';
  round?: string;
  report?: MatchReport; // New field for the Acta
}

export interface Player {
  id: string;
  teamId: string;
  name: string; // Used as display name (Nombre + Apellidos)
  surnames?: string;
  dniNumber?: string;
  birthDate?: string;
  number: number;
  verified: boolean;
  position?: string; // Playing position (Portero, etc.)
  role: 'PLAYER' | 'COACH' | 'OFFICIAL';
  avatarUrl?: string;
  dniUrl?: string;
  signatureUrl?: string; // Evidence of electronic signature
  insuranceUrl?: string;
  dniStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EMPTY';
  insuranceStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EMPTY';
}

export interface Team {
  id: string;
  name: string;
  city: string;
  division: 'Infantil Femenino' | 'Infantil Masculino' | 'Cadete Femenino' | 'Cadete Masculino' | 'Juvenil Femenino' | 'Juvenil Masculino' | 'Senior Femenino' | 'Senior Masculino';
  logoUrl?: string; // Team Logo
  paymentStatus: 'PAID' | 'PENDING' | 'WAITING_VALIDATION' | 'EXPIRED';
  paymentMethod?: 'TRANSFER';
  paymentExpiresAt?: number;
  receiptUrl?: string;
  players: Player[];
  fee: number;
  managerName: string;
  managerEmail: string;
  paymentFeedback?: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface CategoryLimits {
  [key: string]: number;
  'Infantil Femenino': number;
  'Infantil Masculino': number;
  'Cadete Femenino': number;
  'Cadete Masculino': number;
  'Juvenil Femenino': number;
  'Juvenil Masculino': number;
  'Senior Femenino': number;
  'Senior Masculino': number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}