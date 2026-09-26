import type { CookieOptions, Response } from 'express';
import type { SocialProvider } from './social-auth.service';

export const OAUTH_STATE_COOKIE_TTL_MS = 10 * 60 * 1000;

export function oauthStateCookieName(provider: SocialProvider): string {
  return `oauth_${provider}_state`;
}

export function oauthNonceCookieName(provider: SocialProvider): string {
  return `oauth_${provider}_nonce`;
}

export function setOAuthStateCookies(
  response: Response,
  provider: SocialProvider,
  state: string,
  nonce: string,
): void {
  const sameSite: CookieOptions['sameSite'] = 'lax';
  const secure = process.env.NODE_ENV === 'production';
  const options: CookieOptions = {
    httpOnly: true,
    secure,
    sameSite,
    path: `/auth/${provider}/callback`,
    maxAge: OAUTH_STATE_COOKIE_TTL_MS,
  };
  response.cookie(oauthStateCookieName(provider), state, options);
  response.cookie(oauthNonceCookieName(provider), nonce, options);
}

export function clearOAuthStateCookies(
  response: Response,
  provider: SocialProvider,
): void {
  const sameSite: CookieOptions['sameSite'] = 'lax';
  const secure = process.env.NODE_ENV === 'production';
  const options: CookieOptions = {
    httpOnly: true,
    secure,
    sameSite,
    path: `/auth/${provider}/callback`,
  };
  response.clearCookie(oauthStateCookieName(provider), options);
  response.clearCookie(oauthNonceCookieName(provider), options);
}
