#!/usr/bin/env node
/**
 * diff-tokens.mjs — compares color tokens between frontend globals.css and
 * mobile theme.ts. Prints a 3-column table and exits non-zero on mismatch.
 *
 * Usage: node mobile/scripts/diff-tokens.mjs
 * Run from repo root.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../..');

// Parse frontend/src/app/globals.css for --color-* vars
const cssPath = resolve(repoRoot, 'frontend/src/app/globals.css');
const cssText = readFileSync(cssPath, 'utf8');
const frontendTokens = {};
for (const match of cssText.matchAll(/--color-([\w-]+):\s*(#[0-9A-Fa-f]{3,8})/g)) {
  frontendTokens[match[1]] = match[2].toUpperCase();
}

// Parse mobile/src/shared/theme.ts for colors object entries
const themePath = resolve(repoRoot, 'mobile/src/shared/theme.ts');
const themeText = readFileSync(themePath, 'utf8');
const mobileTokens = {};

// Map frontend CSS var names to mobile theme keys using the comment annotations
// Pattern: 'mobile-key': '#HEX', // --color-name
for (const match of themeText.matchAll(/'([\w-]+)':\s*'(#[0-9A-Fa-f]{3,8})'[^,\n]*\/\/[^\n]*--color-([\w-]+)/g)) {
  mobileTokens[match[3]] = { mobileKey: match[1], hex: match[2].toUpperCase() };
}

// Fallback: also parse direct hex values from colors object without comments
// by mapping known token names
const knownMappings = {
  'canvas': 'warm-cream',
  'card': 'card',
  'brand': 'fawn-amber',
  'brand-strong': 'brand-strong',
  'brand-light': 'fawn-amber-light',
  'mint': 'nursery-mint',
  'butter': 'warning-amber-light',
  'powder': 'nursery-powder',
  'sky-soft': 'info-blue-light',
  'text-primary': 'soft-charcoal',
  'text-secondary': 'dark-gray',
  'text-placeholder': 'mid-gray',
  'border': 'oat-border',
  'bubble-agent': 'bubble-agent',
  'bubble-user': 'bubble-user',
  'safety': 'safety-red',
  'safety-bg': 'safety-red-light',
  'success': 'sage-green',
  'success-soft': 'sage-green-soft',
  'focus': 'warning-amber',
  'focus-soft': 'focus-soft',
};

// Extract all mobile hex values
const mobileHexMap = {};
for (const match of themeText.matchAll(/'([\w-]+)':\s*'(#[0-9A-Fa-f]{3,8})'/g)) {
  mobileHexMap[match[1]] = match[2].toUpperCase();
}

let hasError = false;
const rows = [];

for (const [cssName, frontendHex] of Object.entries(frontendTokens)) {
  const mobileKey = knownMappings[cssName];
  const mobileHex = mobileKey ? mobileHexMap[mobileKey] : undefined;
  const match = mobileHex === frontendHex;
  const status = !mobileKey ? 'MISSING_MAPPING' : !mobileHex ? 'MISSING_TOKEN' : match ? 'OK' : 'MISMATCH';
  if (status !== 'OK') hasError = true;
  rows.push({ cssName, frontendHex, mobileKey: mobileKey ?? '—', mobileHex: mobileHex ?? '—', status });
}

// Print table
const col = (s, w) => String(s).padEnd(w);
console.log(col('CSS token', 24) + col('Frontend hex', 14) + col('Mobile key', 22) + col('Mobile hex', 12) + 'Status');
console.log('─'.repeat(90));
for (const r of rows) {
  const line = col(r.cssName, 24) + col(r.frontendHex, 14) + col(r.mobileKey, 22) + col(r.mobileHex, 12) + r.status;
  console.log(line);
}
console.log('─'.repeat(90));

if (hasError) {
  console.error('\nToken diff FAILED — mismatches or missing tokens detected above.');
  process.exit(1);
} else {
  console.log('\nAll tokens match.');
}
