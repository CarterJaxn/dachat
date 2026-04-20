#!/usr/bin/env bash
# Deploy widget bundle + test page to Cloudflare R2 (or any S3-compatible CDN).
# Requires: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET
# Optional: R2_PUBLIC_URL (defaults to https://cdn.dachat.io)
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Building widget..."
# Support both pnpm (CI) and direct npx (local dev without pnpm)
if command -v pnpm &>/dev/null; then
  pnpm --filter @dachat/widget build
else
  (cd packages/widget && npx vite build)
fi

DIST="packages/widget/dist"
BUNDLE="$DIST/dachat-widget.iife.js"
TEST_PAGE="test.html"
PUBLIC_URL="${R2_PUBLIC_URL:-https://cdn.dachat.io}"

if [ ! -f "$BUNDLE" ]; then
  echo "ERROR: $BUNDLE not found after build"
  exit 1
fi

echo "Uploading widget bundle to R2..."
aws s3 cp "$BUNDLE" "s3://${R2_BUCKET}/dachat-widget.iife.js" \
  --endpoint-url "$R2_ENDPOINT" \
  --cache-control "public, max-age=31536000, immutable" \
  --content-type "application/javascript"

if [ -f "$TEST_PAGE" ]; then
  echo "Uploading test page to R2..."
  aws s3 cp "$TEST_PAGE" "s3://${R2_BUCKET}/test.html" \
    --endpoint-url "$R2_ENDPOINT" \
    --cache-control "no-cache" \
    --content-type "text/html"
  echo "Test page:     ${PUBLIC_URL}/test.html"
fi

echo "Widget deployed: ${PUBLIC_URL}/dachat-widget.iife.js"
