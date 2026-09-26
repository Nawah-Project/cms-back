import { BadRequestException } from '@nestjs/common';
import {
  cvContentDisposition,
  sanitizeCvOriginalName,
  validateCvFileContent,
  validateCvFileMetadata,
} from './cv-file.util';

describe('CV file utilities', () => {
  it('accepts a PDF with matching MIME type, extension, and file signature', () => {
    const buffer = Buffer.from('%PDF-1.7\nresume');
    expect(() =>
      validateCvFileContent({
        originalname: 'resume.pdf',
        mimetype: 'application/pdf',
        size: buffer.length,
        buffer,
      }),
    ).not.toThrow();
  });

  it('rejects unsupported extensions and MIME types', () => {
    expect(() =>
      validateCvFileMetadata({
        originalname: 'resume.exe',
        mimetype: 'application/pdf',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      validateCvFileMetadata({
        originalname: 'resume.pdf',
        mimetype: 'application/x-msdownload',
      }),
    ).toThrow(BadRequestException);
  });

  it('rejects a fake PDF whose file contents do not have a PDF signature', () => {
    const buffer = Buffer.from('MZ executable');
    expect(() =>
      validateCvFileContent({
        originalname: 'resume.pdf',
        mimetype: 'application/pdf',
        size: buffer.length,
        buffer,
      }),
    ).toThrow(BadRequestException);
  });

  it('sanitizes user filenames and safely encodes download headers', () => {
    const originalName = sanitizeCvOriginalName('../../My CV; "2026".PDF');
    expect(originalName).toBe('My CV; "2026".pdf');
    expect(cvContentDisposition(originalName)).toContain("filename*=UTF-8''");
    expect(cvContentDisposition(originalName)).not.toContain('../');
  });
});
