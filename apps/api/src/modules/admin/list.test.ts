import { describe, expect, it } from 'vitest';
import { imageSize } from '../../lib/image-size';
import { toCsv } from './list';

describe('CSV export', () => {
  it('quotes every cell, escapes quotes and defuses formulas', () => {
    const csv = toCsv(
      [
        {
          name: 'Say "hi"',
          formula: '=HYPERLINK("x")',
          when: new Date('2026-01-02T00:00:00Z'),
          empty: null,
        },
      ],
      [
        ['Name', (row) => row.name],
        ['Formula', (row) => row.formula],
        ['When', (row) => row.when],
        ['Empty', (row) => row.empty],
      ],
    );
    expect(csv.split('\r\n')).toEqual([
      '"Name","Formula","When","Empty"',
      '"Say ""hi""","\'=HYPERLINK(""x"")","2026-01-02T00:00:00.000Z",',
    ]);
  });
});

describe('image size', () => {
  it('reads PNG and JPEG headers and rejects anything else', () => {
    const png = Buffer.alloc(33);
    png.writeUInt32BE(0x89504e47, 0);
    png.writeUInt32BE(640, 16);
    png.writeUInt32BE(480, 20);
    expect(imageSize(png)).toEqual({ width: 640, height: 480 });

    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0,
      0x02, 0x80, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0x00, 0x00, 0x00,
      0x00,
    ]);
    expect(imageSize(jpeg)).toEqual({ width: 640, height: 480 });
    expect(imageSize(Buffer.alloc(40))).toBeNull();
  });
});

describe('image size (WebP)', () => {
  const webp = (chunk: string, fill: (data: Buffer) => void) => {
    const data = Buffer.alloc(40);
    data.write('RIFF', 0, 'ascii');
    data.write('WEBP', 8, 'ascii');
    data.write(chunk, 12, 'ascii');
    fill(data);
    return data;
  };

  it('reads lossy, lossless and extended WebP headers', () => {
    expect(
      imageSize(
        webp('VP8 ', (data) => {
          data.writeUInt16LE(1200, 26);
          data.writeUInt16LE(900, 28);
        }),
      ),
    ).toEqual({ width: 1200, height: 900 });
    expect(
      imageSize(
        webp('VP8L', (data) => {
          data.writeUInt32LE((800 - 1) | ((600 - 1) << 14), 21);
        }),
      ),
    ).toEqual({ width: 800, height: 600 });
    expect(
      imageSize(
        webp('VP8X', (data) => {
          data.writeUIntLE(1600 - 1, 24, 3);
          data.writeUIntLE(1200 - 1, 27, 3);
        }),
      ),
    ).toEqual({ width: 1600, height: 1200 });
    expect(imageSize(webp('ALPH', () => undefined))).toBeNull();
  });

  it('gives up on short or broken files', () => {
    expect(imageSize(Buffer.alloc(10))).toBeNull();
    const broken = Buffer.alloc(40);
    broken[0] = 0xff;
    broken[1] = 0xd8;
    broken[2] = 0x00;
    expect(imageSize(broken)).toBeNull();
    expect(imageSize(Buffer.alloc(40, 1))).toBeNull();
  });
});
