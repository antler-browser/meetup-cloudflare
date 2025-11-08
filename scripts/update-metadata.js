#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Read data.json
const dataPath = join(rootDir, 'data.json');
const data = JSON.parse(readFileSync(dataPath, 'utf-8'));
console.log('📝 Updating metadata from data.json...');

// Update client/index.html
const indexHtmlPath = join(rootDir, 'client/index.html');
let indexHtml = readFileSync(indexHtmlPath, 'utf-8');
indexHtml = indexHtml.replace(
  /<title>.*?<\/title>/,
  `<title>${data.title}</title>`
);
writeFileSync(indexHtmlPath, indexHtml, 'utf-8');
console.log('✅ Updated client/index.html');

// Update client/public/irl-manifest.json
const manifestPath = join(rootDir, 'client/public/irl-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
if (data.title) manifest.name = data.title;
if (data.description) manifest.description = data.description;
if (data.location) manifest.location = data.location;
if (data.type) manifest.type = data.type;
if (data.icon) manifest.icon = data.icon;

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
console.log('✅ Updated client/public/irl-manifest.json');

console.log('🎉 Metadata update complete!\n');