import { MarketingService } from './marketing.service';

describe('MarketingService', () => {
  const dto = {
    visitorId: '11111111-1111-4111-8111-111111111111',
    sessionId: '22222222-2222-4222-8222-222222222222',
    type: 'PAGE_VIEW' as const,
    path: '/auth/register?utm_source=youtube',
    utmSource: ' youtube ',
    utmMedium: 'video',
    utmCampaign: 'launch',
    deviceType: 'mobile',
  };

  test('stores privacy-safe acquisition fields without the query string', async () => {
    const create = jest.fn().mockResolvedValue({});
    const service = new MarketingService({
      marketingEvent: { create },
    } as any);
    await expect(
      service.record(dto, {
        userAgent: 'Mozilla/5.0 Chrome/130',
        country: 'eg',
      }),
    ).resolves.toEqual({ accepted: true });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        visitorId: dto.visitorId,
        sessionId: dto.sessionId,
        path: '/auth/register',
        utmSource: 'youtube',
        country: 'EG',
      }),
    });
    expect(create.mock.calls[0][0].data).not.toHaveProperty('userAgent');
    expect(create.mock.calls[0][0].data).not.toHaveProperty('ip');
  });

  test('drops bots and synthetic page probes', async () => {
    const create = jest.fn();
    const service = new MarketingService({
      marketingEvent: { create },
    } as any);
    await expect(
      service.record(dto, {
        userAgent: 'Mozilla/5.0 Lighthouse',
        country: null,
      }),
    ).resolves.toEqual({ accepted: false });
    expect(create).not.toHaveBeenCalled();
  });

  test('anonymous events cannot invent sign-ups or onboarding conversions', async () => {
    const create = jest.fn();
    const service = new MarketingService({ marketingEvent: { create } } as any);
    expect(
      await service.record(
        { ...dto, type: 'SIGNUP_COMPLETED' },
        { userAgent: 'Chrome', country: null },
      ),
    ).toEqual({ accepted: false });
    expect(create).not.toHaveBeenCalled();
  });

  test('conversion sync validates profile state and uses a stable deduplication key per account', async () => {
    const before = process.env.JWT_ACCESS_SECRET;
    process.env.JWT_ACCESS_SECRET = 'marketing-unit-test-secret';
    try {
      const upsert = jest.fn().mockResolvedValue({});
      const account = {
        role: 'USER',
        createdAt: new Date('2026-10-29'),
        portfolioUrl: null,
        targetJobTitle: null,
        cv: null,
      };
      const service = new MarketingService({
        user: { findUnique: jest.fn().mockImplementation(async () => account) },
        $queryRaw: jest
          .fn()
          .mockResolvedValue([{ startedAt: new Date('2026-10-28') }]),
        marketingEvent: { upsert },
      } as any);
      await service.syncConversions(dto, 'email-or-google-account', {
        userAgent: 'Chrome',
        country: null,
      });
      await service.syncConversions(
        { ...dto, visitorId: '33333333-3333-4333-8333-333333333333' },
        'email-or-google-account',
        { userAgent: 'Chrome', country: null },
      );
      expect(upsert).toHaveBeenCalledTimes(2);
      expect(upsert.mock.calls[0][0].where.conversionKey).toBe(
        upsert.mock.calls[1][0].where.conversionKey,
      );
      expect(upsert.mock.calls[0][0].create.type).toBe('SIGNUP_COMPLETED');
      expect(upsert.mock.calls[0][0].create).not.toHaveProperty('userId');
    } finally {
      process.env.JWT_ACCESS_SECRET = before;
    }
  });

  test.each(['ADMIN', 'USER'])(
    'does not count an existing %s account as a new marketing conversion',
    async (role) => {
      const upsert = jest.fn();
      const service = new MarketingService({
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ role, createdAt: new Date('2020-01-01') }),
        },
        $queryRaw: jest
          .fn()
          .mockResolvedValue([{ startedAt: new Date('2026-10-29') }]),
        marketingEvent: { upsert },
      } as any);
      expect(
        await service.syncConversions(dto, 'existing-account', {
          userAgent: 'Chrome',
          country: null,
        }),
      ).toEqual({ accepted: false });
      expect(upsert).not.toHaveBeenCalled();
    },
  );
});
