import { generateKeyPairSync } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { AuthProvider } from '@prisma/client';
import { AuthService } from './auth.service';
import { SocialAuthService } from './social-auth.service';

function responseWithJson(value: unknown): Response {
  return {
    ok: true,
    json: () => Promise.resolve(value),
  } as unknown as Response;
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

describe('SocialAuthService', () => {
  const originalFetch = global.fetch;
  const originalEnv = { ...process.env };
  const signedIn = {
    user: { id: 'user-id', name: 'Social User', email: 'social@example.com' },
    tokens: { accessToken: 'access', refreshToken: 'refresh' },
  };
  let auth: jest.Mocked<Pick<AuthService, 'signInWithProvider'>>;
  let service: SocialAuthService;

  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'google-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'google-client-secret';
    process.env.GOOGLE_REDIRECT_URI =
      'http://localhost:3000/auth/google/callback';
    auth = {
      signInWithProvider: jest.fn().mockResolvedValue(signedIn),
    };
    service = new SocialAuthService(auth as unknown as AuthService);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  function googleToken(
    signingKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
    nonce: string,
  ) {
    return jwt.sign(
      {
        sub: 'google-subject',
        email: 'social@example.com',
        email_verified: true,
        nonce,
      },
      signingKey,
      {
        algorithm: 'RS256',
        keyid: 'google-key-id',
        issuer: 'https://accounts.google.com',
        audience: 'google-client-id',
        expiresIn: '5m',
      },
    );
  }

  function googleJwksResponse(
    publicKey: ReturnType<typeof generateKeyPairSync>['publicKey'],
  ) {
    const jwk = publicKey.export({ format: 'jwk' });
    return {
      keys: [
        {
          ...jwk,
          kid: 'google-key-id',
          kty: 'RSA',
          use: 'sig',
          alg: 'RS256',
        },
      ],
    };
  }

  it('validates Google signature, issuer, audience, nonce, and verified email', async () => {
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const idToken = googleToken(keys.privateKey, 'expected-nonce');
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      if (requestUrl(input).includes('/token')) {
        return Promise.resolve(responseWithJson({ id_token: idToken }));
      }
      return Promise.resolve(
        responseWithJson(googleJwksResponse(keys.publicKey)),
      );
    });

    const result = await service.completeGoogleLogin(
      'authorization-code',
      'expected-state',
      'expected-state',
      'expected-nonce',
    );

    expect(result).toEqual(signedIn);
    expect(auth.signInWithProvider).toHaveBeenCalledWith({
      provider: AuthProvider.GOOGLE,
      providerSubject: 'google-subject',
      providerEmail: 'social@example.com',
      name: undefined,
    });
  });

  it('rejects an invalid state before contacting Google', async () => {
    const fetchMock = jest.fn();
    global.fetch = fetchMock;

    await expect(
      service.completeGoogleLogin(
        'authorization-code',
        'attacker-state',
        'expected-state',
        'expected-nonce',
      ),
    ).rejects.toThrow('Invalid social login state');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(auth.signInWithProvider).not.toHaveBeenCalled();
  });

  it('rejects a Google identity token with a mismatched nonce', async () => {
    const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const idToken = googleToken(keys.privateKey, 'different-nonce');
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      if (requestUrl(input).includes('/token')) {
        return Promise.resolve(responseWithJson({ id_token: idToken }));
      }
      return Promise.resolve(
        responseWithJson(googleJwksResponse(keys.publicKey)),
      );
    });

    await expect(
      service.completeGoogleLogin(
        'authorization-code',
        'expected-state',
        'expected-state',
        'expected-nonce',
      ),
    ).rejects.toThrow('Provider identity is invalid');
    expect(auth.signInWithProvider).not.toHaveBeenCalled();
  });

});
