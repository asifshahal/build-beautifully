/**
 * Token logo resolver with in-memory cache.
 * Priority: backend logo → Jupiter CDN → default fallback.
 * No per-token API calls. Images are cached to prevent flicker.
 */

const JUPITER_CDN = 'https://cdn.jsdelivr.net/gh/nicholasgasior/solana-tokens-list/logos';
const DEFAULT_LOGO = '/token.png';

const cache = new Map<string, string>();
const failedUrls = new Set<string>();

export function getLogo(mint: string, backendLogo?: string): string {
  // Priority 1: backend-provided logo
  if (backendLogo && !failedUrls.has(backendLogo)) {
    cache.set(mint, backendLogo);
    return backendLogo;
  }

  // Priority 2: cached value
  if (cache.has(mint)) return cache.get(mint)!;

  // Priority 3: Jupiter CDN
  const jupiterUrl = `${JUPITER_CDN}/${mint}.png`;
  cache.set(mint, jupiterUrl);
  return jupiterUrl;
}

/** Mark a URL as failed so we don't retry it */
export function markLogoFailed(url: string, mint: string): void {
  failedUrls.add(url);
  // Fall back to default
  cache.set(mint, DEFAULT_LOGO);
}

export function getDefaultLogo(): string {
  return DEFAULT_LOGO;
}
