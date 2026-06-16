#!/bin/bash
# Patch next-on-pages để dùng npx thay vì pnpm (CF Pages runtime không có pnpm)
NOP_DIR=$(find node_modules/.pnpm -path "*@cloudflare+next-on-pages*next@15.5.2*" -type d | head -1)/node_modules/@cloudflare/next-on-pages
if [ -f "$NOP_DIR/dist/index.js" ]; then
  # Replace 'pnpm exec' with 'npx --no-install'
  sed -i "s|pm.name === \"pnpm\"|false|g" $NOP_DIR/dist/index.js
  sed -i "s|\"pnpm exec\"|\"npx --no-install\"|g" $NOP_DIR/dist/index.js
  sed -i "s|pm.name|\"npx\"|g" $NOP_DIR/dist/index.js
  echo "Patched: $NOP_DIR/dist/index.js"
fi
