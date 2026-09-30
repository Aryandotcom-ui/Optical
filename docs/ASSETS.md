# Third-party assets

Binary assets committed to the repository, with their source, size and licence.

| Asset                                                          | Path                                               | Size  | Source                                                                              | Licence                                                         |
| -------------------------------------------------------------- | -------------------------------------------------- | ----- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Inter variable font, Latin subset + ₹ and prescription symbols | `apps/web/src/app/fonts/InterVariable-latin.woff2` | 87 KB | `inter-ui@4.1.1` on npm (Rasmus Andersson), subsetted with `scripts/subset-font.sh` | SIL Open Font License 1.1, see `apps/web/src/app/fonts/OFL.txt` |

MediaPipe Face Landmarker WASM and model files are added in Phase 5 under
`apps/web/public/mediapipe` (Apache 2.0).

Generated product renders (`apps/web/public/renders/`) are produced by `pnpm render:images` from
Phase 1 onwards and are not committed.
