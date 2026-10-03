#!/usr/bin/env bash
# Rebuilds apps/web/src/app/fonts/InterVariable-latin.woff2 from the full
# Inter variable font. Only needed when changing the glyph set.
# Requires: python3 with `pip install fonttools brotli`.
set -euo pipefail

VERSION="${INTER_VERSION:-4.1.1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

(cd "$WORK" && npm pack "inter-ui@${VERSION}" >/dev/null && tar xzf inter-ui-*.tgz)

# Basic Latin + Latin-1, general punctuation, currency (€ ₹), arrows, maths
# signs used in prescriptions (−, ×, ≤, ≥), check/cross marks.
pyftsubset "$WORK/package/variable/InterVariable.woff2" \
  --output-file="$ROOT/apps/web/src/app/fonts/InterVariable-latin.woff2" \
  --flavor=woff2 \
  --layout-features='kern,liga,calt,ccmp,locl,mark,mkmk,tnum,cv05,cv08,ss03,case,frac,sups' \
  --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+20B9,U+2122,U+2190-2193,U+2212,U+2215,U+2248,U+2264,U+2265,U+00D7,U+2715,U+2713,U+FEFF,U+FFFD"

# Keep only the weights the design uses (400 to 700) and pin optical size to
# the text setting: together they halve the file (about 39 KB instead of 87 KB).
fonttools varLib.instancer "$ROOT/apps/web/src/app/fonts/InterVariable-latin.woff2" \
  wght=400:700 opsz=14 \
  --output="$ROOT/apps/web/src/app/fonts/InterVariable-latin.woff2"

cp "$WORK/package/LICENSE.txt" "$ROOT/apps/web/src/app/fonts/OFL.txt"
echo "Wrote apps/web/src/app/fonts/InterVariable-latin.woff2"
