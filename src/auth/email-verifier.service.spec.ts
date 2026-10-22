import { BadRequestException } from '@nestjs/common';
import { promises as dns } from 'node:dns';
import { EmailVerifierService } from './email-verifier.service';

describe('EmailVerifierService', () => {
  let service: EmailVerifierService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test' };
    service = new EmailVerifierService();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('rejects known disposable email domains and subdomains', async () => {
    await expect(
      service.validateEmailAddress('test@tempmail.com'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.validateEmailAddress('test@mailinator.com'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.validateEmailAddress('test@sub.yopmail.com'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.validateEmailAddress('test@10minutemail.com'),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects custom disposable domains configured via DISPOSABLE_EMAIL_DOMAINS', async () => {
    process.env.DISPOSABLE_EMAIL_DOMAINS = 'fakecorp.local, burner.org';
    await expect(
      service.validateEmailAddress('someone@fakecorp.local'),
    ).rejects.toThrow(BadRequestException);
  });

  it('allows valid domains with MX records', async () => {
    jest
      .spyOn(dns, 'resolveMx')
      .mockResolvedValue([{ exchange: 'mx.valid-domain.com', priority: 10 }]);

    await expect(
      service.validateEmailAddress('real.user@valid-domain.com'),
    ).resolves.toBeUndefined();
  });

  it('rejects non-existent domains when DNS lookup returns ENOTFOUND', async () => {
    const notFoundError = Object.assign(new Error('queryMx ENOTFOUND'), {
      code: 'ENOTFOUND',
    });
    jest.spyOn(dns, 'resolveMx').mockRejectedValue(notFoundError);

    await expect(
      service.validateEmailAddress('user@nonexistent-domain-xyz123.com'),
    ).rejects.toThrow(BadRequestException);
  });
});

