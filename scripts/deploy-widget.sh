#!/usr/bin/env bash
# Deploy widget bundle to Cloudflare R2 (or any S3-compatible CDN).
# Requires: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, R2_ENDPOINT, R2_BUCKET
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Building widget..."
pnpm --filter @dachat/widget build

DIST="packages/widget/dist"
BUNDLE="$DIST/dachat-widget.iife.js"

if [ ! -f "$BUNDLE" ]; then
  echo "ERROR: $BUNDLE not found after build"
  exit 1
fi

echo "Uploading to R2..."
aws s3 cp "$BUNDLE" "s3://${R2_BUCKET}/dachat-widget.iife.js" \
  --endpoint-url "$R2_ENDPOINT" \
  --cache-control "public, max-age=31536000, immutable" \
  --content-type "application/javascript"

echo "Widget deployed: ${R2_PUBLIC_URL:-https://cdn.dachat.io}/dachat-widget.iife.js"
