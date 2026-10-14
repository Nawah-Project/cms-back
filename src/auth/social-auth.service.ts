import { Injectable } from '@nestjs/common';
import { AuthProvider } from '@prisma/client';
import { createPublicKey, randomBytes, timingSafeEqual } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AuthService, type PublicUser, type TokenPair } from './auth.service';

export type SocialProvider = 'google';

export interface SocialAuthorizationRequest {
  url: string;
  state: string;
  nonce: string;
}

interface IdentityClaims extends jwt.JwtPayload {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  nonce?: string;
}

interface ProviderJwk {
  kid: string;
  kty: string;
  use?: string;
  alg?: string;
  [key: string]: unknown;
}

interface CachedJwks {
  expiresAt: number;
  keys: ProviderJwk[];
}

interface JwksRequestWindow {
  startedAt: number;
  requests: number;
}

@Injectable()
export class SocialAuthService {
  private readonly jwksCache = new Map<SocialProvider, CachedJwks>();
  private readonly jwksRequestWindows = new Map<
    SocialProvider,
    JwksRequestWindow
  >();

  constructor(private readonly auth: AuthService) {}

  createAuthorizationRequest(
    provider: SocialProvider,
  ): SocialAuthorizationRequest {
    const state = randomBytes(32).toString('base64url');
    const nonce = randomBytes(32).toString('base64url');
    const clientId = this.requiredEnv('GOOGLE_CLIENT_ID');
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      nonce,
      prompt: 'select_account',
    });
    return {
      state,
      nonce,
      url: `https://accounts.google.com/o/oauth2/v2/auth?${query}`,
    };
  }

  async completeGoogleLogin(
    code: string,
    state: string,
    expectedState: string | undefined,
    expectedNonce: string | undefined,
  ): Promise<{ user: PublicUser; tokens: TokenPair }> {
    this.assertState(state, expectedState);
    if (!expectedNonce) throw new Error('Invalid social login response');

    const clientId = this.requiredEnv('GOOGLE_CLIENT_ID');
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: this.requiredEnv('GOOGLE_CLIENT_SECRET'),
        redirect_uri: this.redirectUri(),
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error('Provider token exchange failed');
    const tokenResponse = (await response.json()) as { id_token?: unknown };
    if (typeof tokenResponse.id_token !== 'string') {
      throw new Error('Provider did not return an identity token');
    }

    const claims = await this.verifyIdentityToken(
      tokenResponse.id_token,
      clientId,
    );
    if (
      !this.constantTimeEqual(claims.nonce ?? '', expectedNonce) ||
      !claims.sub ||
      !claims.email ||
      !this.isVerifiedEmail(claims.email_verified)
    ) {
      throw new Error('Provider identity is invalid');
    }

    return this.auth.signInWithProvider({
      provider: AuthProvider.GOOGLE,
      providerSubject: claims.sub,
      providerEmail: claims.email,
      name: claims.name,
    });
  }

  private async verifyIdentityToken(
    token: string,
    audience: string,
  ): Promise<IdentityClaims> {
    const issuer: [string, ...string[]] = [
      'https://accounts.google.com',
      'accounts.google.com',
    ];
    const algorithms: jwt.Algorithm[] = ['RS256'];

    return new Promise((resolve, reject) => {
      const getKey: jwt.GetPublicKeyOrSecret = (header, callback) => {
        if (!header.kid) {
          callback(new Error('Identity token has no signing key id'));
          return;
        }
        void this.getPublicKey('google', header.kid)
          .then((key) => callback(null, key))
          .catch((error: unknown) =>
            callback(
              error instanceof Error
                ? error
                : new Error('Identity token signing key not found'),
            ),
          );
      };

      jwt.verify(
        token,
        getKey,
        { algorithms, issuer, audience, clockTolerance: 5 },
        (error, decoded) => {
          if (error || !decoded || typeof decoded === 'string') {
            reject(new Error('Identity token verification failed'));
            return;
          }
          resolve(decoded as IdentityClaims);
        },
      );
    });
  }

  private async getPublicKey(
    provider: SocialProvider,
    kid: string,
    forceRefresh = false,
  ): Promise<string> {
    let cached = this.jwksCache.get(provider);
    if (forceRefresh || !cached || cached.expiresAt <= Date.now()) {
      const now = Date.now();
      let window = this.jwksRequestWindows.get(provider);
      if (!window || now - window.startedAt >= 60_000) {
        window = { startedAt: now, requests: 0 };
        this.jwksRequestWindows.set(provider, window);
      }
      if (window.requests >= 10) {
        throw new Error('Provider signing key request limit reached');
      }
      window.requests += 1;
      const response = await fetch(
        'https://www.googleapis.com/oauth2/v3/certs',
        {
          signal: AbortSignal.timeout(10_000),
        },
      );
      if (!response.ok) throw new Error('Unable to load provider signing keys');
      const body = (await response.json()) as { keys?: unknown };
      if (!Array.isArray(body.keys)) {
        throw new Error('Provider signing keys are invalid');
      }
      cached = {
        expiresAt: Date.now() + 10 * 60 * 1000,
        keys: body.keys as ProviderJwk[],
      };
      this.jwksCache.set(provider, cached);
    }

    const jwk = cached.keys.find(
      (candidate) =>
        candidate.kid === kid &&
        candidate.kty === 'RSA' &&
        (!candidate.use || candidate.use === 'sig') &&
        (!candidate.alg || candidate.alg === 'RS256'),
    );
    if (!jwk) {
      if (!forceRefresh) return this.getPublicKey(provider, kid, true);
      throw new Error('Provider signing key was not found');
    }

    return createPublicKey({
      key: jwk as unknown as import('node:crypto').JsonWebKey,
      format: 'jwk',
    })
      .export({ type: 'spki', format: 'pem' })
      .toString();
  }

  private assertState(state: string, expectedState?: string): void {
    if (
      !state ||
      !expectedState ||
      !this.constantTimeEqual(state, expectedState)
    ) {
      throw new Error('Invalid social login state');
    }
  }

  private constantTimeEqual(actual: string, expected: string): boolean {
    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return (
      actualBuffer.length === expectedBuffer.length &&
      timingSafeEqual(actualBuffer, expectedBuffer)
    );
  }

  private isVerifiedEmail(value: boolean | string | undefined): boolean {
    return value === true || value === 'true';
  }

  private redirectUri(): string {
    return this.requiredEnv('GOOGLE_REDIRECT_URI');
  }

  private requiredEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is not configured`);
    return value;
  }
}
