// Rename app: "Quản lý kho vật tư" / "Quản kho Vật tư" / "quan-ly-kho-vat-tu" → "Quản kho"
const fs = require('fs');
const path = require('path');

const files = [
  'README.md',
  'package.json',
  'apps/api/appsettings.Production.json',
  'apps/web/public/manifest.json',
  'apps/web/public/offline.html',
  'apps/web/src/app/(auth)/login/page.tsx',
  'apps/web/src/app/(dashboard)/dashboard/page.tsx',
  'apps/web/src/app/layout.tsx',
  'docs/DEPLOY-INFO.md',
  'docs/YEARLY-FORECAST-RESUME.md',
  'docs/catalog.html',
  'docs/plans/2026-06-14-khoa-xn-handover.md',
];

const replacements = [
  // Long names first to avoid partial matches
  ['Quản lý kho vật tư Pro', 'Quản kho'],
  ['Quản lý kho vật tư', 'Quản kho'],
  ['Quản kho Vật tư', 'Quản kho'],
  ['Quản Kho Vật Tư', 'Quản Kho'],
  // slug
  ['quan-ly-kho-vat-tu', 'quan-kho'],
  // short forms (lowercase i.e. package description)
  ['Kho Vật tư', 'Kho'],
  ['kho vật tư', 'kho'],
];

let totalChanges = 0;
for (const f of files) {
  const absPath = path.resolve(f);
  if (!fs.existsSync(absPath)) {
    console.log('SKIP (not found): ' + f);
    continue;
  }
  let content = fs.readFileSync(absPath, 'utf8');
  const before = content;
  for (const [from, to] of replacements) {
    const regex = new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    content = content.replace(regex, to);
  }
  if (content !== before) {
    fs.writeFileSync(absPath, content, 'utf8');
    const diffs = before.length - content.length;
    console.log('OK: ' + f + ' (changed ' + diffs + ' chars)');
    totalChanges++;
  } else {
    console.log('NO CHANGE: ' + f);
  }
}
console.log('\nTotal files changed: ' + totalChanges);
