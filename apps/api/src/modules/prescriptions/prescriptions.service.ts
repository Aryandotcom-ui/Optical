import { randomUUID } from 'node:crypto';
import type { UploadedPrescription } from '@optical/shared/checkout';
import type { Db } from '../../infra/prisma';
import type { FileLinks, StorageProvider } from '../../infra/storage';
import { AppError } from '../../lib/app-error';
import {
  detectFileType,
  stripMetadata,
  UnreadableFileError,
  uploadTypes,
  type MalwareScanner,
} from '../../lib/file-sanitiser';

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

/**
 * Prescription photos and scans. Each upload is checked by its contents,
 * stripped of metadata, scanned, stored privately under a random name and
 * tied to the browser session that sent it.
 */
export class PrescriptionService {
  constructor(
    private readonly db: Db,
    private readonly storage: StorageProvider,
    private readonly links: FileLinks,
    private readonly scanner: MalwareScanner,
  ) {}

  async upload(sessionHash: string, data: Buffer): Promise<UploadedPrescription> {
    if (data.length === 0) throw new AppError('VALIDATION_FAILED', 'That file is empty.');
    const mime = detectFileType(data);
    if (!mime)
      throw new AppError(
        'UNSUPPORTED_MEDIA_TYPE',
        'Upload a photo (JPEG, PNG or WebP) or a PDF of your prescription.',
      );
    let clean: Buffer;
    try {
      clean = stripMetadata(data, mime);
    } catch (error) {
      if (error instanceof UnreadableFileError)
        throw new AppError(
          'VALIDATION_FAILED',
          'We could not read that file. Try another photo or a PDF.',
        );
      throw error;
    }
    if ((await this.scanner.scan(clean)) !== 'clean')
      throw new AppError('VALIDATION_FAILED', 'That file could not be accepted.');

    const key = `rx/${randomUUID()}.${uploadTypes[mime]}`;
    await this.storage.put(key, clean);
    const record = await this.db.prescription.create({
      data: {
        label: 'Uploaded prescription',
        fileKey: key,
        fileMime: mime,
        ownerTokenHash: sessionHash,
      },
    });
    return { id: record.id, mime, sizeBytes: clean.length, previewUrl: this.links.url(key) };
  }

  /** A stored file behind a valid signed link. */
  async file(
    key: string,
    expires: number,
    signature: string,
  ): Promise<{ data: Buffer; mime: string }> {
    if (!this.links.verify(key, expires, signature))
      throw new AppError(
        'FORBIDDEN',
        'This link has expired. Open the page again to get a new one.',
      );
    const record = await this.db.prescription.findFirst({
      where: { fileKey: key, deletedAt: null },
      select: { fileMime: true },
    });
    const data = record ? await this.storage.get(key) : null;
    if (!record?.fileMime || !data) throw AppError.notFound();
    return { data, mime: record.fileMime };
  }
}
