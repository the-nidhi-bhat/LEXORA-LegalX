#!/usr/bin/env node
/**
 * LEGALX lightweight release validation — no new dependencies.
 * Run: node scripts/release-check.mjs
 *
 * Checks (best-effort, explicit PASS/WARN/FAIL, exit non-zero only on FAIL):
 *  1. README contains zero screenshot references.
 *  2. All relative markdown links in README resolve on disk.
 *  3. Required static assets exist under public/ (favicon, fonts, film, noir, OG image).
 *  4. No obvious secret/binary patterns in tracked text config files.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
const log = (s, m) => console.log(`${s}: ${m}`);
const read = p => fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';

// 1. README screenshots
const readme = read(path.join(root, 'README.md'));
const shotRe = /docs\/screenshots|<img\s|\.png|\.jpe?g|\.webp|\.mp4|\.vtt|!\[/i;
const shotHits = readme.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => shotRe.test(l));
shotHits.length ? log('FAIL', `README screenshot refs at lines ${shotHits.map(h => h[0]).join(',')}`) && fail++
               : log('PASS', 'README has zero screenshot references');

// 2. relative markdown links resolve
const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
const broken = [];
for (const m of readme.matchAll(linkRe)) {
  const t = m[1].trim();
  if (/^(https?:|#|mailto:)/.test(t)) continue;
  const target = t.split('#')[0];
  if (!target) continue;
  if (!fs.existsSync(path.resolve(root, target))) broken.push(t);
}
broken.length ? log('WARN', `README unresolved links: ${[...new Set(broken)].join(', ')}`)
              : log('PASS', 'all relative README links resolve');

// 3. required static assets
const required = [
  'public/favicon.svg', 'public/legalx-social.png',
  'public/film/legalx.mp4', 'public/film/poster.jpg', 'public/film/legalx.en.vtt',
  'public/noir/living-contract.webp', 'public/noir/living-contract-day.webp',
  'public/fonts/dm-sans-latin-wght-normal.woff2',
  'public/fonts/instrument-serif-latin-400-normal.woff2',
  'public/fonts/DM-Sans-LICENSE', 'public/fonts/Instrument-Serif-LICENSE',
];
const missing = required.filter(f => !fs.existsSync(path.join(root, f)));
missing.length ? log('FAIL', `missing static assets: ${missing.join(', ')}`) && fail++
               : log('PASS', `all ${required.length} required static assets present`);

// 4. obvious secret patterns in tracked config text (values, not names)
const scanTargets = ['.env.example', 'api/.env.example', 'vercel.json', 'package.json'];
const secretRe = /(AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|AIza[0-9A-Za-z_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
let secrets = [];
for (const f of scanTargets) {
  const txt = read(path.join(root, f));
  txt.split('\n').forEach((l, i) => { if (secretRe.test(l)) secrets.push(`${f}:${i + 1}`); });
}
secrets.length ? log('FAIL', `secret-like values: ${secrets.join(', ')}`) && fail++
               : log('PASS', 'no obvious secret values in config files');

console.log(fail ? `release-check: FAIL (${fail})` : 'release-check: PASS');
process.exit(fail ? 1 : 0);
