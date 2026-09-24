// CSS colors EdenText can import and export without turning foreign text into CSS syntax.
const NAMED_COLOR = /^[a-zA-Z]+$/;
const HEX_COLOR = /^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const RGB_COLOR = /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d+(?:\.\d+)?)\s*)?\)$/i;

export function normalizeColor(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const s = input.trim();
  if (!s) return undefined;
  const hex = s.match(HEX_COLOR);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
    return `#${h.slice(0, 6)}`.toUpperCase();
  }
  const rgb = s.match(RGB_COLOR);
  if (rgb) {
    const channels = rgb.slice(1, 4).map(Number);
    if (channels.some(n => !Number.isFinite(n) || n < 0)) return undefined;
    return `#${channels.map(n => Math.round(Math.min(n, 255)).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  }
  // Identifier-only color names cannot introduce declarations or URLs.
  return NAMED_COLOR.test(s) ? s.toLowerCase() : undefined;
}
