import { BadRequestException } from '@nestjs/common';
import { basename, extname, parse } from 'node:path';

export interface UploadedCvFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export function validateCvFileMetadata(file: {
  originalname: string;
  mimetype: string;
}): void {
  const extension = extname(
    file.originalname.replace(/\\/g, '/'),
  ).toLowerCase();
  if (
    extension !== '.pdf' ||
    file.mimetype.toLowerCase() !== 'application/pdf'
  ) {
    throw new BadRequestException('Only PDF CV files are supported');
  }
}

export function validateCvFileContent(file: UploadedCvFile): void {
  validateCvFileMetadata(file);
  const signature = Buffer.from('%PDF-', 'ascii');
  const header = file.buffer.indexOf(signature);
  if (header < 0 || header > 1024) {
    throw new BadRequestException('The uploaded file is not a valid PDF');
  }
}

export function sanitizeCvOriginalName(originalName: string): string {
  const safeBaseName = basename(originalName.replace(/\\/g, '/'))
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim();
  const name = parse(safeBaseName)
    .name.replace(/[. ]+$/g, '')
    .trim();
  return `${(name || 'CV').slice(0, 251)}.pdf`;
}

export function cvContentDisposition(originalName: string): string {
  const fallback = originalName.replace(/[^\x20-\x7e]|["\\;]/g, '_');
  const encoded = encodeURIComponent(originalName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
