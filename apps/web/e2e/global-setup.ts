import { ensureFakeCamera } from './fake-camera';

export default async function globalSetup() {
  await ensureFakeCamera();
}
