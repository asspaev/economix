export type JwtClaims = {
  sub?: string;
  iss?: string;
  iat?: number;
  exp?: number;
  onboarding_required?: boolean;
  initial_capital?: Record<string, number>;
};

function base64UrlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return atob(normalized);
}

export function decodeJwt(token: string): JwtClaims | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const json = base64UrlDecode(parts[1]);
    return JSON.parse(json) as JwtClaims;
  } catch {
    return null;
  }
}
