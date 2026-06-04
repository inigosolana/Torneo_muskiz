import React from 'react';
import { useRotatingIndex } from '../hooks/useRotatingIndex';
import { useTournamentSponsors } from '../hooks/useTournamentSponsors';

type Variant = 'strip' | 'hero' | 'compact';

interface RotatingSponsorSpotlightProps {
    variant?: Variant;
    className?: string;
    intervalMs?: number;
}

function SponsorLogo({ logoUrl, name, variant }: { logoUrl: string; name: string; variant: Variant }) {
    const isIcon = !logoUrl.includes('/') && !logoUrl.includes('.');
    const sizeClass =
        variant === 'strip'
            ? 'h-14 sm:h-16 max-w-[240px]'
            : variant === 'hero'
              ? 'h-20 sm:h-24 max-w-[280px]'
              : 'h-10 sm:h-11 max-w-[160px]';

    if (isIcon) {
        return (
            <span className={`material-symbols-outlined text-slate-300 ${variant === 'compact' ? 'text-3xl' : 'text-5xl'}`}>
                {logoUrl}
            </span>
        );
    }
    return <img src={logoUrl} alt={name} className={`w-auto object-contain ${sizeClass}`} />;
}

export const RotatingSponsorSpotlight: React.FC<RotatingSponsorSpotlightProps> = ({
    variant = 'hero',
    className = '',
    intervalMs = 5000,
}) => {
    const sponsors = useTournamentSponsors();
    const index = useRotatingIndex(sponsors.length, intervalMs);
    const current = sponsors[index];

    if (!current) {
        return null;
    }

    const inner = (
        <div
            key={current.id}
            className="flex flex-col items-center justify-center gap-2 animate-in fade-in duration-500"
        >
            <SponsorLogo logoUrl={current.logoUrl} name={current.name} variant={variant} />
            {variant !== 'compact' && (
                <span
                    className={`font-bold text-slate-300 text-center ${
                        variant === 'strip' ? 'text-xs sm:text-sm' : 'text-sm'
                    }`}
                >
                    {current.name}
                </span>
            )}
        </div>
    );

    if (variant === 'strip') {
        return (
            <div
                className={`bg-slate-900/95 border-b border-white/10 text-white ${className}`}
                role="region"
                aria-label="Patrocinadores del torneo"
                aria-live="polite"
            >
                <div className="max-w-[1440px] mx-auto px-4 py-3 sm:py-4 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-6">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary shrink-0">
                        Patrocinador oficial
                    </span>
                    {current.websiteUrl ? (
                        <a
                            href={current.websiteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:opacity-90 transition-opacity"
                            title={current.name}
                        >
                            {inner}
                        </a>
                    ) : (
                        inner
                    )}
                </div>
            </div>
        );
    }

    if (variant === 'compact') {
        const logo = current.websiteUrl ? (
            <a
                href={current.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center min-w-[120px] hover:opacity-90"
                title={current.name}
            >
                {inner}
            </a>
        ) : (
            inner
        );
        return (
            <div className={className} aria-live="polite" aria-label="Patrocinador">
                {logo}
            </div>
        );
    }

    // hero — panel lateral home
    return (
        <div className={`w-full ${className}`} aria-live="polite" aria-label="Patrocinadores">
            {current.websiteUrl ? (
                <a
                    href={current.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block hover:opacity-90 transition-opacity"
                    title={current.name}
                >
                    {inner}
                </a>
            ) : (
                inner
            )}
        </div>
    );
};
