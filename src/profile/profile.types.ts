export interface CvMetadata {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
}

export interface SafeCvMetadata {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
}

export function toSafeCvMetadata(
  cv: CvMetadata | null | undefined,
): SafeCvMetadata | null {
  if (!cv) return null;
  return {
    id: cv.id,
    originalName: cv.originalName,
    mimeType: cv.mimeType,
    size: cv.size,
    uploadedAt: cv.uploadedAt.toISOString(),
  };
}
