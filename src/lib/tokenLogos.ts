/**
 * Token logo resolver — prefers backend-provided logos,
 * falls back to Jupiter CDN, then default image.
 * No per-token API calls.
 */

const JUPITER_CDN = "https://cdn.jsdelivr.net/gh/nicholasgasior/solana-tokens-list/logos";
const DEFAULT_LOGO = "/token.png";

const cache = new Map<string, string>();

export function getLogo(mint: string, backendLogo?: string): string {
  if (backendLogo) {
    cache.set(mint, backendLogo);
    return backendLogo;
  }
  if (cache.has(mint)) return cache.get(mint)!;

  // Synchronous fallback — no API calls
  const jupiterUrl = `${JUPITER_CDN}/${mint}.png`;
  cache.set(mint, jupiterUrl);
  return jupiterUrl;
}

export function getDefaultLogo(): string {
  return DEFAULT_LOGO;
}
