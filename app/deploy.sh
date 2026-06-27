#!/bin/bash
# Deploy script for Cloudflare Pages

echo "Deploying to Cloudflare Pages..."
CLOUDFLARE_API_TOKEN=$CLOUDFLARE_API_TOKEN npx wrangler pages deploy dist --project-name collatz-visualizer --commit-dirty=true
