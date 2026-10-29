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
});
