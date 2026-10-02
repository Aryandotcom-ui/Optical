import { describe, expect, it } from 'vitest';
import { detectFileType, stripMetadata, UnreadableFileError } from '../src/lib/file-sanitiser';
import { GPS_TEXT, jpegWithExif, pngWithText, webpWithExif } from './fixtures';

describe('detectFileType', () => {
  it('reads the type from magic bytes, not names', () => {
    expect(detectFileType(jpegWithExif())).toBe('image/jpeg');
    expect(detectFileType(pngWithText())).toBe('image/png');
    expect(detectFileType(webpWithExif())).toBe('image/webp');
    expect(detectFileType(Buffer.from('%PDF-1.7\n'))).toBe('application/pdf');
    expect(detectFileType(Buffer.from('<svg onload=alert(1)>'))).toBeNull();
    expect(detectFileType(Buffer.from('MZ executable'))).toBeNull();
  });
});

describe('stripMetadata', () => {
  it('removes EXIF and comments from JPEGs but keeps the image and colour profile', () => {
    const original = jpegWithExif();
    const clean = stripMetadata(original, 'image/jpeg');
    expect(clean.toString('latin1')).not.toContain(GPS_TEXT);
    expect(clean.toString('latin1')).not.toContain('a comment');
    expect(clean.toString('latin1')).toContain('JFIF');
    expect(clean.toString('latin1')).toContain('ICC_PROFILE');
    expect(clean.subarray(-7)).toEqual(original.subarray(-7));
  });

  it('removes text chunks from PNGs', () => {
    const clean = stripMetadata(pngWithText(), 'image/png');
    expect(clean.toString('latin1')).not.toContain(GPS_TEXT);
    expect(clean.toString('latin1')).toContain('IDAT');
    expect(clean.toString('latin1').endsWith('IEND\0\0\0\0')).toBe(true);
  });

  it('removes EXIF from WebP and clears the flags that announced it', () => {
    const clean = stripMetadata(webpWithExif(), 'image/webp');
    expect(clean.toString('latin1')).not.toContain(GPS_TEXT);
    expect(clean.readUInt32LE(4)).toBe(clean.length - 8);
    expect(clean[20]).toBe(0);
  });

  it('keeps PDFs as they are', () => {
    const pdf = Buffer.from('%PDF-1.7\nhello');
    expect(stripMetadata(pdf, 'application/pdf')).toBe(pdf);
  });

  it('rejects broken files rather than storing them half-cleaned', () => {
    expect(() =>
      stripMetadata(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]), 'image/jpeg'),
    ).toThrow(UnreadableFileError);
    expect(() => stripMetadata(pngWithText().subarray(0, 30), 'image/png')).toThrow(
      UnreadableFileError,
    );
    expect(() => stripMetadata(Buffer.from([0xff, 0xd8, 0x00]), 'image/jpeg')).toThrow(
      UnreadableFileError,
    );
  });
});
