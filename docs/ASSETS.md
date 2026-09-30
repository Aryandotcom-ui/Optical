# Third-party assets

Binary assets committed to the repository, with their source, size and licence.

| Asset                                                          | Path                                               | Size  | Source                                                                              | Licence                                                         |
| -------------------------------------------------------------- | -------------------------------------------------- | ----- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Inter variable font, Latin subset + ₹ and prescription symbols | `apps/web/src/app/fonts/InterVariable-latin.woff2` | 87 KB | `inter-ui@4.1.1` on npm (Rasmus Andersson), subsetted with `scripts/subset-font.sh` | SIL Open Font License 1.1, see `apps/web/src/app/fonts/OFL.txt` |

| Accessory illustrations (5 SVGs) | `apps/web/public/images/accessories/` | 1–2 KB each | Drawn for this project | Same licence as the repository |

Product images for frames are **generated, not committed**: `pnpm render:images` renders three
views per colour variant (front, three-quarter, side) from the parametric geometry into
`apps/web/public/renders/` as transparent 1200 × 900 WebP, 30 to 55 KB each. A manifest of input
hashes makes re-runs incremental. See ADR-017.

MediaPipe Face Landmarker WASM and model files are added in Phase 5 under
`apps/web/public/mediapipe` (Apache 2.0).
