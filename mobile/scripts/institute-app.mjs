#!/usr/bin/env node
/**
 * Adds an institute's own app to eas.json: two build profiles, "<code>"
 * (installable APK) and "<code>-store" (Play Store bundle), locked to that
 * institute. The universal app (profiles "preview"/"production") is untouched.
 *
 *   node scripts/institute-app.mjs <code> "<App name>"
 *   node scripts/institute-app.mjs sunrise "Sunrise Public School"
 *
 * Then: eas build --platform android --profile sunrise
 * Optional icon: assets/institutes/<code>/icon.png (1024×1024 PNG).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [code, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(' ').trim();
const slug = code?.trim().toLowerCase();

if (!slug || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug) || !name) {
  console.error('Usage: node scripts/institute-app.mjs <institute code> "<App name>"');
  console.error('The code is the institute\'s address in the control panel, e.g. sunrise.');
  process.exit(1);
}
if (['development', 'preview', 'production'].includes(slug)) {
  console.error(`"${slug}" is a built-in profile name; it cannot be an institute code here.`);
  process.exit(1);
}

const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'eas.json');
const eas = JSON.parse(fs.readFileSync(file, 'utf8'));
const env = { EXPO_PUBLIC_INSTITUTE: slug, EXPO_PUBLIC_INSTITUTE_NAME: name };

eas.build[slug] = { extends: 'preview', env: { ...eas.build.preview.env, ...env } };
eas.build[`${slug}-store`] = { extends: 'production', env: { ...eas.build.production.env, ...env } };

fs.writeFileSync(file, JSON.stringify(eas, null, 2) + '\n');

console.log(`Added "${name}" (${slug}) to eas.json.`);
console.log(`  APK to share:     eas build --platform android --profile ${slug}`);
console.log(`  Play Store build: eas build --platform android --profile ${slug}-store`);
console.log(`  Package ID:       in.ac.campusos.${slug.replace(/[^a-z0-9]/g, '').replace(/^(\d)/, 'i$1')}`);
