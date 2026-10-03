/**
 * Upload hardening for prescription photos and scans: the file type comes
 * from its magic bytes (never the name or the browser's claim), and image
 * metadata (EXIF with GPS and camera details, XMP, IPTC, comments) is
 * removed before the file is stored. Parsing is strict; anything malformed
 * is rejected rather than stored half-cleaned.
 */
export const uploadTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
} as const;
export type UploadMime = keyof typeof uploadTypes;

export class UnreadableFileError extends Error {
  override name = 'UnreadableFileError';
}

export function detectFileType(data: Buffer): UploadMime | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff)
    return 'image/jpeg';
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return 'image/png';
  if (data.toString('latin1', 0, 4) === 'RIFF' && data.toString('latin1', 8, 12) === 'WEBP')
    return 'image/webp';
  if (data.toString('latin1', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}

/** JPEG: keep image data, JFIF (APP0), ICC colour profiles and Adobe (APP14); drop the rest. */
function stripJpeg(data: Buffer): Buffer {
  const parts: Buffer[] = [data.subarray(0, 2)];
  let offset = 2;
  while (offset < data.length) {
    if (data[offset] !== 0xff) throw new UnreadableFileError('Unexpected byte in JPEG header.');
    const marker = data[offset + 1] ?? -1;
    // Padding bytes and markers without a length.
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(data.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (offset + 4 > data.length) throw new UnreadableFileError('Truncated JPEG segment.');
    const length = data.readUInt16BE(offset + 2);
    const end = offset + 2 + length;
    if (length < 2 || end > data.length) throw new UnreadableFileError('Bad JPEG segment length.');
    // Start of scan: the compressed image follows; copy everything from here.
    if (marker === 0xda) {
      parts.push(data.subarray(offset));
      return Buffer.concat(parts);
    }
    const segment = data.subarray(offset, end);
    const isIcc = marker === 0xe2 && segment.toString('latin1', 4, 16) === 'ICC_PROFILE\0';
    const keep =
      !(marker >= 0xe1 && marker <= 0xef && marker !== 0xee && !isIcc) && marker !== 0xfe;
    if (keep) parts.push(segment);
    offset = end;
  }
  throw new UnreadableFileError('JPEG has no image data.');
}

const PNG_METADATA = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

function stripPng(data: Buffer): Buffer {
  const parts: Buffer[] = [data.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString('latin1', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > data.length) throw new UnreadableFileError('Truncated PNG chunk.');
    if (!PNG_METADATA.has(type)) parts.push(data.subarray(offset, end));
    offset = end;
    if (type === 'IEND') return Buffer.concat(parts);
  }
  throw new UnreadableFileError('PNG has no end marker.');
}

const WEBP_METADATA = new Set(['EXIF', 'XMP ']);
/** VP8X flag bits announcing EXIF and XMP chunks. */
const VP8X_METADATA_FLAGS = 0x08 | 0x04;

function stripWebp(data: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let offset = 12;
  while (offset + 8 <= data.length) {
    const type = data.toString('latin1', offset, offset + 4);
    const size = data.readUInt32LE(offset + 4);
    const end = offset + 8 + size + (size % 2);
    if (offset + 8 + size > data.length) throw new UnreadableFileError('Truncated WebP chunk.');
    if (!WEBP_METADATA.has(type)) {
      const chunk = Buffer.from(data.subarray(offset, Math.min(end, data.length)));
      if (type === 'VP8X' && chunk.length > 8) chunk[8] = (chunk[8] ?? 0) & ~VP8X_METADATA_FLAGS;
      chunks.push(chunk);
    }
    offset = end;
  }
  if (chunks.length === 0) throw new UnreadableFileError('WebP has no image data.');
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(body.length + 4, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, body]);
}

/**
 * Removes metadata from an image. PDFs are stored as received: they carry
 * no camera or location data, and rewriting them safely needs a full parser.
 */
export function stripMetadata(data: Buffer, mime: UploadMime): Buffer {
  switch (mime) {
    case 'image/jpeg':
      return stripJpeg(data);
    case 'image/png':
      return stripPng(data);
    case 'image/webp':
      return stripWebp(data);
    case 'application/pdf':
      return data;
  }
}

/** Hook for a malware scanner (e.g. ClamAV). Without one configured, files pass. */
export interface MalwareScanner {
  scan(data: Buffer): Promise<'clean' | 'infected'>;
}

export const noScanner: MalwareScanner = { scan: () => Promise.resolve('clean') };
