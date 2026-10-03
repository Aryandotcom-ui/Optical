/**
 * Width and height from a PNG, JPEG or WebP header, without decoding the
 * image. Returns null for anything it can't read.
 */
export function imageSize(data: Buffer): { width: number; height: number } | null {
  if (data.length < 30) return null;
  // PNG: IHDR is the first chunk.
  if (data.readUInt32BE(0) === 0x89504e47) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  // WebP: RIFF....WEBP, then VP8 / VP8L / VP8X.
  if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = data.toString('ascii', 12, 16);
    if (chunk === 'VP8 ')
      return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const bits = data.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X')
      return { width: data.readUIntLE(24, 3) + 1, height: data.readUIntLE(27, 3) + 1 };
    return null;
  }
  // JPEG: walk the markers to the first start-of-frame.
  if (data[0] === 0xff && data[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) return null;
      const marker = data[offset + 1] ?? 0;
      const length = data.readUInt16BE(offset + 2);
      const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
      if (isFrame)
        return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
      offset += 2 + length;
    }
  }
  return null;
}
