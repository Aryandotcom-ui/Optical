# Third-party assets

Binary assets committed to the repository, with their source, size and licence.

| Asset                                                                                                                      | Path                                               | Size        | Source                                                                                                                                                                                                           | Licence                                                         |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Inter variable font, Latin subset + ₹ and prescription symbols                                                             | `apps/web/src/app/fonts/InterVariable-latin.woff2` | 87 KB       | `inter-ui@4.1.1` on npm (Rasmus Andersson), subsetted with `scripts/subset-font.sh`                                                                                                                              | SIL Open Font License 1.1, see `apps/web/src/app/fonts/OFL.txt` |
| Accessory illustrations (5 SVGs)                                                                                           | `apps/web/public/images/accessories/`              | 1–2 KB each | Drawn for this project                                                                                                                                                                                           | Same licence as the repository                                  |
| MediaPipe Face Landmarker model (float16, v1): 478 landmarks with irises, blendshapes and the facial transformation matrix | `apps/web/public/mediapipe/face_landmarker.task`   | 3.6 MB      | `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, SHA-256 `64184e22…0bc9ff` (checked by `scripts/copy-mediapipe.mjs` before every dev and build) | Apache License 2.0 (Google)                                     |
| Try-on e2e test face                                                                                                       | `apps/web/e2e/fixtures/face.png`                   | 106 KB      | MediaPipe's test data, `https://storage.googleapis.com/mediapipe-assets/face_stylizer_test_image.png`                                                                                                            | Apache License 2.0 (Google)                                     |

Product images for frames are **generated, not committed**: `pnpm render:images` renders three
views per colour variant (front, three-quarter, side) from the parametric geometry into
`apps/web/public/renders/` as transparent 1200 × 900 WebP, 30 to 55 KB each. A manifest of input
hashes makes re-runs incremental. See ADR-017.

The **MediaPipe WASM runtime** (`vision_wasm_internal.{js,wasm}` and the no-SIMD fallback, 23 MB on disk, of which a browser
loads one 12 MB pair) is not committed: `scripts/copy-mediapipe.mjs` copies it from the installed
`@mediapipe/tasks-vision@1.0.1` (Apache 2.0) into `apps/web/public/mediapipe/wasm/` before `dev`
and `build`, so try-on loads nothing from a CDN and works offline. The package is patched
(`patches/@mediapipe__tasks-vision@1.0.1.patch`) to turn off its usage logging; see ADR-045.

The Chromium fake-camera video used by the try-on tests (`apps/web/e2e/.generated/face.y4m`) is
made from `face.png` on first use and is not committed.
