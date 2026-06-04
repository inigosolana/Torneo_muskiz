/** Render profesional de fase de grupos (estilo torneo playa Lacanau). */

export type SocialCanvasFormat = 'story' | 'square';

export interface GroupTeamRow {
    name: string;
    shieldUrl?: string;
    flag?: string;
}

export interface GroupBlock {
    key: string;
    teams: GroupTeamRow[];
}

export interface SponsorLogo {
    name: string;
    logoUrl: string;
}

export interface GroupsCanvasPalette {
    primary: string;
    secondary: string;
    accent: string;
}

export interface RenderGroupsCanvasOptions {
    width: number;
    height: number;
    tournamentName: string;
    categoryLabel: string;
    /** Ej. "GRUPO A" — se muestra destacado en cabecera (una publicación por grupo). */
    groupTitle?: string;
    groups: GroupBlock[];
    sponsors: SponsorLogo[];
    logoImage?: HTMLImageElement | null;
    shieldImages: Map<string, HTMLImageElement>;
    sponsorImages: Map<string, HTMLImageElement>;
    palette?: GroupsCanvasPalette;
}

export function canvasSizeForFormat(format: SocialCanvasFormat): { width: number; height: number } {
    return format === 'story' ? { width: 1080, height: 1920 } : { width: 1080, height: 1080 };
}

export function paletteForCategory(categoryLabel: string): GroupsCanvasPalette {
    const n = categoryLabel.toLowerCase();
    if (n.includes('femenin')) {
        return { primary: '#E11D48', secondary: '#312E81', accent: '#F472B6' };
    }
    if (n.includes('infantil') || n.includes('cadete')) {
        return { primary: '#EA580C', secondary: '#1E40AF', accent: '#FBBF24' };
    }
    return { primary: '#DC2626', secondary: '#1D4ED8', accent: '#0DF2F2' };
}

function parseHex(hex: string): { r: number; g: number; b: number } {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return {
        r: parseInt(full.slice(0, 2), 16),
        g: parseInt(full.slice(2, 4), 16),
        b: parseInt(full.slice(4, 6), 16),
    };
}

function mix(c1: string, c2: string, t: number): string {
    const a = parseHex(c1);
    const b = parseHex(c2);
    const r = Math.round(a.r + (b.r - a.r) * t);
    const g = Math.round(a.g + (b.g - a.g) * t);
    const bl = Math.round(a.b + (b.b - a.b) * t);
    return `rgb(${r},${g},${bl})`;
}

function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
): void {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
}

function drawDiagonalBackground(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    palette: GroupsCanvasPalette,
): void {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, palette.secondary);
    g.addColorStop(0.45, mix(palette.secondary, palette.primary, 0.35));
    g.addColorStop(1, mix(palette.secondary, '#020617', 0.55));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
}

function drawAbstractShapes(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    palette: GroupsCanvasPalette,
): void {
    ctx.save();

    ctx.globalAlpha = 0.18;
    ctx.fillStyle = palette.primary;
    ctx.beginPath();
    ctx.arc(w * 0.88, h * 0.12, w * 0.42, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = palette.accent;
    ctx.translate(w * 0.08, h * 0.38);
    ctx.rotate(-0.35);
    ctx.fillRect(0, 0, w * 0.55, h * 0.22);
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    ctx.fillStyle = palette.secondary;
    ctx.beginPath();
    ctx.moveTo(w * 0.72, h * 0.72);
    ctx.lineTo(w * 1.05, h * 0.58);
    ctx.lineTo(w * 0.95, h * 0.98);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(w * 0.2, h * 0.78, w * 0.28, 0, Math.PI * 1.2);
    ctx.stroke();

    ctx.restore();
}

function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const v = ctx.createRadialGradient(w / 2, h / 2, w * 0.25, w / 2, h / 2, w * 0.78);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
}

function drawHeader(
    ctx: CanvasRenderingContext2D,
    w: number,
    opts: RenderGroupsCanvasOptions,
    palette: GroupsCanvasPalette,
    headerBottom: number,
): number {
    let y = 48;

    if (opts.logoImage) {
        const max = 96;
        const img = opts.logoImage;
        const scale = max / Math.max(img.width, img.height);
        const lw = img.width * scale;
        const lh = img.height * scale;
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.45)';
        ctx.shadowBlur = 16;
        ctx.drawImage(img, (w - lw) / 2, y, lw, lh);
        ctx.restore();
        y += lh + 20;
    }

    const titleLines = opts.tournamentName.toUpperCase().split(/\s+/).reduce<string[]>((acc, word) => {
        const last = acc[acc.length - 1];
        if (!last || (last + ' ' + word).length > 14) acc.push(word);
        else acc[acc.length - 1] = `${last} ${word}`;
        return acc;
    }, []);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 52px Impact, "Arial Black", sans-serif';
    ctx.letterSpacing = '2px';
    for (const line of titleLines.slice(0, 3)) {
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = 8;
        ctx.fillText(line, w / 2, y);
        y += 56;
    }
    ctx.shadowBlur = 0;

    const pill = opts.categoryLabel.toUpperCase();
    const pillW = Math.min(w - 80, ctx.measureText(pill).width + 56);
    const pillH = 44;
    const pillX = (w - pillW) / 2;
    y += 12;
    roundRect(ctx, pillX, y, pillW, pillH, 22);
    ctx.fillStyle = palette.primary;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px Arial, sans-serif';
    ctx.letterSpacing = '3px';
    ctx.fillText(pill, w / 2, y + 30);
    y += pillH + 16;

    if (opts.groupTitle) {
        const gt = opts.groupTitle.toUpperCase();
        ctx.font = '900 40px Impact, "Arial Black", sans-serif';
        const gtW = Math.min(w - 60, ctx.measureText(gt).width + 48);
        const gtH = 52;
        const gtX = (w - gtW) / 2;
        roundRect(ctx, gtX, y, gtW, gtH, 12);
        ctx.fillStyle = palette.accent;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#0f172a';
        ctx.font = '900 36px Impact, "Arial Black", sans-serif';
        ctx.fillText(gt, w / 2, y + 38);
        y += gtH + 12;
    }

    return Math.max(headerBottom, y + 8);
}

function teamInitials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase();
}

function drawTeamRow(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    rowW: number,
    team: GroupTeamRow,
    shieldImg: HTMLImageElement | undefined,
    accent: string,
    alt: boolean,
): number {
    const rowH = 52;
    if (alt) {
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        roundRect(ctx, x, y, rowW, rowH, 8);
        ctx.fill();
    }

    const cx = x + 36;
    const cy = y + rowH / 2;
    const r = 22;

    const shieldGrad = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, r);
    shieldGrad.addColorStop(0, 'rgba(255,255,255,0.35)');
    shieldGrad.addColorStop(1, 'rgba(255,255,255,0.08)');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = shieldGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r - 3, 0, Math.PI * 2);
    ctx.clip();
    if (shieldImg) {
        const s = (r * 2 - 6) / Math.max(shieldImg.width, shieldImg.height);
        const sw = shieldImg.width * s;
        const sh = shieldImg.height * s;
        ctx.drawImage(shieldImg, cx - sw / 2, cy - sh / 2, sw, sh);
    } else {
        ctx.fillStyle = accent;
        ctx.font = 'bold 16px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(teamInitials(team.name), cx, cy + 1);
    }
    ctx.restore();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px Arial, sans-serif';
    const name = team.name.length > 28 ? `${team.name.slice(0, 26)}…` : team.name;
    ctx.fillText(name.toUpperCase(), x + 72, cy);

    if (team.flag) {
        ctx.font = '22px Arial, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(team.flag, x + rowW - 14, cy);
    }

    return rowH + 6;
}

function estimateGroupCardHeight(group: GroupBlock, showGroupLabel: boolean): number {
    const pad = 16;
    const titleH = showGroupLabel ? 44 : 0;
    const rowH = 58;
    return pad * 2 + titleH + group.teams.length * rowH;
}

function drawGroupCard(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    cardW: number,
    group: GroupBlock,
    opts: RenderGroupsCanvasOptions,
    palette: GroupsCanvasPalette,
    showGroupLabel = true,
): number {
    const pad = 16;
    const titleH = showGroupLabel ? 44 : 8;
    const rowH = 58;
    const cardH = pad * 2 + titleH + group.teams.length * rowH;

    ctx.save();
    roundRect(ctx, x, y, cardW, cardH, 14);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 4;

    const innerGrad = ctx.createLinearGradient(x, y, x, y + cardH);
    innerGrad.addColorStop(0, 'rgba(255,255,255,0.06)');
    innerGrad.addColorStop(1, 'rgba(0,0,0,0.15)');
    roundRect(ctx, x + 2, y + 2, cardW - 4, cardH - 4, 12);
    ctx.fillStyle = innerGrad;
    ctx.fill();

    ctx.fillStyle = palette.accent;
    ctx.fillRect(x, y, cardW, 4);

    let ty = y + pad;
    if (showGroupLabel) {
        ctx.fillStyle = palette.accent;
        ctx.font = 'bold 24px Impact, "Arial Black", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`GRUPO ${group.key}`, x + cardW / 2, y + pad + 28);
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + pad, y + pad + titleH);
        ctx.lineTo(x + cardW - pad, y + pad + titleH);
        ctx.stroke();
        ty = y + pad + titleH + 8;
    }
    group.teams.forEach((team, i) => {
        const img = team.shieldUrl ? opts.shieldImages.get(team.shieldUrl) : undefined;
        ty += drawTeamRow(ctx, x + pad, ty, cardW - pad * 2, team, img, palette.accent, i % 2 === 1);
    });

    ctx.restore();
    return cardH + 18;
}

function drawSponsorBar(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    barH: number,
    opts: RenderGroupsCanvasOptions,
    palette: GroupsCanvasPalette,
): void {
    const y = h - barH;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(0, y, w, barH);
    ctx.fillStyle = palette.accent;
    ctx.fillRect(0, y, w, 3);

    const logos = opts.sponsors.filter((s) => s.logoUrl && opts.sponsorImages.has(s.logoUrl));
    if (logos.length === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = 'bold 18px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.letterSpacing = '6px';
        ctx.fillText('PATROCINADORES', w / 2, y + barH / 2 + 6);
        return;
    }

    const maxH = barH * 0.5;
    const gap = 16;
    const sizes = logos.map((s) => {
        const img = opts.sponsorImages.get(s.logoUrl)!;
        const scale = maxH / img.height;
        return { img, w: img.width * scale, h: maxH };
    });
    let totalW = sizes.reduce((a, s) => a + s.w, 0) + gap * (sizes.length - 1);
    const maxRowW = w - 48;
    if (totalW > maxRowW && totalW > 0) {
        const shrink = maxRowW / totalW;
        for (const s of sizes) {
            s.w *= shrink;
            s.h *= shrink;
        }
        totalW = maxRowW;
    }
    let x = (w - totalW) / 2;
    const cy = y + (barH - maxH) / 2;
    for (const s of sizes) {
        ctx.drawImage(s.img, x, cy, s.w, s.h);
        x += s.w + gap;
    }
}

export function renderGroupsCanvas(
    canvas: HTMLCanvasElement,
    options: RenderGroupsCanvasOptions,
): void {
    const { width: w, height: h } = options;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const palette = options.palette ?? paletteForCategory(options.categoryLabel);

    drawDiagonalBackground(ctx, w, h, palette);
    drawAbstractShapes(ctx, w, h, palette);

    const sponsorBarH = h < 1400 ? 88 : 100;
    const marginX = 44;
    const contentW = w - marginX * 2;
    let y = drawHeader(ctx, w, options, palette, 200);

    const singleGroup = options.groups.length === 1;
    const showInnerGroupLabel = !options.groupTitle;
    const cols = singleGroup ? 1 : options.groups.length >= 3 && w === h ? 1 : options.groups.length === 2 ? 2 : 1;
    const gap = 20;
    const cardW = cols === 2 ? (contentW - gap) / 2 : contentW;
    const maxY = h - sponsorBarH - 24;

    if (singleGroup && options.groups[0]) {
        const g = options.groups[0];
        const cardH = estimateGroupCardHeight(g, showInnerGroupLabel);
        const startY = y + Math.max(0, (maxY - y - cardH) / 2);
        drawGroupCard(ctx, marginX, startY, contentW, g, options, palette, showInnerGroupLabel);
    } else if (cols === 2) {
        const left = options.groups.filter((_, i) => i % 2 === 0);
        const right = options.groups.filter((_, i) => i % 2 === 1);
        let yL = y;
        let yR = y;
        for (const g of left) {
            if (yL > maxY) break;
            yL += drawGroupCard(ctx, marginX, yL, cardW, g, options, palette, true);
        }
        for (const g of right) {
            if (yR > maxY) break;
            yR += drawGroupCard(ctx, marginX + cardW + gap, yR, cardW, g, options, palette, true);
        }
        y = Math.max(yL, yR);
    } else {
        for (const g of options.groups) {
            if (y > maxY) break;
            y += drawGroupCard(ctx, marginX, y, contentW, g, options, palette, true);
        }
    }

    drawSponsorBar(ctx, w, h, sponsorBarH, options, palette);
    drawVignette(ctx, w, h);
}

export function flagEmojiForTeam(city: string): string {
    const c = city.toLowerCase();
    if (/francia|france|lacanau|bordeaux/.test(c)) return '🇫🇷';
    if (/portugal|porto|lisboa/.test(c)) return '🇵🇹';
    if (/italia|italy|roma|milano/.test(c)) return '🇮🇹';
    return '🇪🇸';
}
