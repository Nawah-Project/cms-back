import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateProfileDto } from './update-profile.dto';

describe('UpdateProfileDto', () => {
  it('accepts an HTTP(S) portfolio URL', () => {
    const dto = plainToInstance(UpdateProfileDto, {
      portfolioUrl: 'https://www.behance.net/example',
    });
    expect(validateSync(dto)).toHaveLength(0);
  });

  it('rejects invalid URLs and URLs longer than the configured field limit', () => {
    const invalid = plainToInstance(UpdateProfileDto, {
      portfolioUrl: 'not a URL',
    });
    const tooLong = plainToInstance(UpdateProfileDto, {
      portfolioUrl: `https://example.com/${'a'.repeat(2050)}`,
    });
    expect(validateSync(invalid).length).toBeGreaterThan(0);
    expect(validateSync(tooLong).length).toBeGreaterThan(0);
  });

  it('normalizes an empty portfolio value to null so the user can remove it', () => {
    const dto = plainToInstance(UpdateProfileDto, { portfolioUrl: '  ' });
    expect(dto.portfolioUrl).toBeNull();
    expect(validateSync(dto)).toHaveLength(0);
  });
});
