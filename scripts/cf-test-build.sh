#!/bin/bash
# Test CF build environment
cd /tmp
mkdir -p cf-test && cd cf-test
cat > package.json << 'JSON'
{"name": "test", "scripts": {"build": "echo 'hello from build' && ls -la"}}
JSON
echo '{"name":"test"}' > package-lock.json
npm install 2>&1 | tail -3
echo "---"
npm run build 2>&1
