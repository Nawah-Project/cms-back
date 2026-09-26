import type { Response } from 'express';
import {
  ACCESS_COOKIE,
  ACCESS_TTL_SECONDS,
  REFRESH_COOKIE,
  REFRESH_TTL_SECONDS,
} from './auth.constants';
import type { TokenPair } from './auth.service';

function cookieOptions() {
  const sameSite = (process.env.AUTH_COOKIE_SAME_SITE || 'lax').toLowerCase() as
    | 'strict'
    | 'lax'
    | 'none';
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
    sameSite,
    path: '/',
  } as const;
}

export function setAuthCookies(response: Response, tokens: TokenPair): void {
  const options = cookieOptions();
  response.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...options,
    maxAge: ACCESS_TTL_SECONDS * 1000,
  });
  response.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...options,
    maxAge: REFRESH_TTL_SECONDS * 1000,
  });
}

export function clearAuthCookies(response: Response): void {
  const options = cookieOptions();
  response.clearCookie(ACCESS_COOKIE, options);
  response.clearCookie(REFRESH_COOKIE, options);
}
