/**
 * Where to go after signing in: only a path on this site, so a crafted
 * link can't send someone elsewhere ("//evil.example" and "/\\evil" are
 * refused). Defaults to the account page.
 */
export function safeNext(value: string | null | undefined, fallback = '/account'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return fallback;
  return value;
}
