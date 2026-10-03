import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const here = dirname(fileURLToPath(import.meta.url));
export const PORTRAIT = join(here, 'fixtures', 'face.png');
/** Generated on first use (git-ignored): Chromium plays it as the camera. */
export const FAKE_CAMERA_FILE = join(here, '.generated', 'face.y4m');

const WIDTH = 640;
const HEIGHT = 480;
const FRAMES = 30;

/**
 * Turns the test face (MediaPipe's own test image, see docs/ASSETS.md) into a short Y4M video for Chromium's fake
 * camera (`--use-file-for-fake-video-capture`). The browser decodes the
 * image and converts it to YUV 4:2:0, so no image library is needed.
 */
export async function ensureFakeCamera(): Promise<string> {
  if (existsSync(FAKE_CAMERA_FILE)) return FAKE_CAMERA_FILE;
  const executablePath = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch(executablePath ? { executablePath } : {});
  try {
    const page = await browser.newPage();
    const dataUrl = `data:image/png;base64,${readFileSync(PORTRAIT).toString('base64')}`;
    const planes = await page.evaluate(
      async ({ source, width, height }) => {
        const image = new Image();
        image.src = source;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('No 2D context');
        context.fillStyle = '#808080';
        context.fillRect(0, 0, width, height);
        // Fit the portrait's height into the frame, centred.
        const scale = height / image.naturalHeight;
        const drawn = image.naturalWidth * scale;
        context.drawImage(image, (width - drawn) / 2, 0, drawn, height);
        const rgba = context.getImageData(0, 0, width, height).data;
        const y = new Array<number>(width * height);
        const u = new Array<number>((width / 2) * (height / 2));
        const v = new Array<number>((width / 2) * (height / 2));
        for (let row = 0; row < height; row += 1)
          for (let col = 0; col < width; col += 1) {
            const i = (row * width + col) * 4;
            const r = rgba[i] ?? 0;
            const g = rgba[i + 1] ?? 0;
            const b = rgba[i + 2] ?? 0;
            y[row * width + col] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
            if (row % 2 === 0 && col % 2 === 0) {
              const c = (row / 2) * (width / 2) + col / 2;
              u[c] = Math.round(128 - 0.168736 * r - 0.331264 * g + 0.5 * b);
              v[c] = Math.round(128 + 0.5 * r - 0.418688 * g - 0.081312 * b);
            }
          }
        return { y, u, v };
      },
      { source: dataUrl, width: WIDTH, height: HEIGHT },
    );
    const frame = Buffer.concat([
      Buffer.from('FRAME\n'),
      Buffer.from(planes.y),
      Buffer.from(planes.u),
      Buffer.from(planes.v),
    ]);
    const header = Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F30:1 Ip A1:1 C420jpeg\n`);
    mkdirSync(dirname(FAKE_CAMERA_FILE), { recursive: true });
    writeFileSync(
      FAKE_CAMERA_FILE,
      Buffer.concat([header, ...Array.from({ length: FRAMES }, () => frame)]),
    );
    return FAKE_CAMERA_FILE;
  } finally {
    await browser.close();
  }
}
