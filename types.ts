export enum View {
  HOME = 'HOME',
  INFO = 'INFO',
  SCHEDULE = 'SCHEDULE',
  ADMIN = 'ADMIN',
  REGISTRATION = 'REGISTRATION',
  TEAM = 'TEAM',
  MEDIA = 'MEDIA',
  SPONSORS = 'SPONSORS'
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
      instagram: SocialConfig;
      twitter: SocialConfig;
      tiktok: SocialConfig;
      youtube: SocialConfig;
  };

  contactEmail: string;

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
  name: string; // Used as display name (Nombre + Apellidos)
  surnames?: string;
  dniNumber?: string;
  birthDate?: string;
  number: number;
  verified: boolean;
  position?: string; // Playing position (Portero, etc.)
  avatarUrl?: string;
  dniUrl?: string; 
  insuranceUrl?: string;
  dniStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EMPTY';
  insuranceStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EMPTY';
}

export interface Team {
  id: string;
  name: string;
  city: string;
  division: 'Elite' | 'Amateur' | 'Juvenil';
  logoUrl?: string; // Team Logo
  paymentStatus: 'PAID' | 'PENDING';
  paymentMethod?: 'CARD' | 'PAYPAL' | 'TRANSFER' | 'CASH' | 'MANUAL';
  players: Player[];
  fee: number;
}

export interface CategoryLimits {
  Elite: number;
  Amateur: number;
  Juvenil: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}