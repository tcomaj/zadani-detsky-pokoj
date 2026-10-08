// Build script: renders the brief, inlines photos, encrypts everything with AES-256-GCM
// and writes a self-contained index.html with a password prompt.
//
// Usage:  PASSWORD='...' node build.mjs
// Inputs (not committed): ./src/page.html, ./src/shell.html, ../build/img/*.jpg
// Output: ./index.html

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto, randomBytes } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const password = process.env.PASSWORD || ''; // empty = publish unencrypted

const imgDir = resolve(here, '../build/img');
const tpl = readFileSync(resolve(here, 'src/page.html'), 'utf8');
const shell = readFileSync(resolve(here, 'src/shell.html'), 'utf8');

// ---------- floor plan (mm, y down, window at top) ----------
const W = 2500, H = 4800, T = 150;              // interior, wall thickness
const winL = 500, winW = 1700, winLeaf = 900;   // window: left wall gap, width, opening leaf (hinged right)
const doorFromBack = 600, doorW = 900;          // door on right wall, hinged at back-side jamb
const radFromTop = 400, radLen = 600, radDepth = 100;
const FS = 130, TICK = 55, SW = 12;

function tick(x, y, ang) {
  return `<line x1="${x - TICK}" y1="${y + TICK}" x2="${x + TICK}" y2="${y - TICK}" transform="rotate(${ang} ${x} ${y})"/>`;
}
// horizontal dimension line at y, between x1..x2, label above
function dimH(x1, x2, y, label, ext1, ext2) {
  const mid = (x1 + x2) / 2;
  return `<g class="dim">
    <line x1="${x1}" y1="${ext1}" x2="${x1}" y2="${y - 80}"/>
    <line x1="${x2}" y1="${ext2}" x2="${x2}" y2="${y - 80}"/>
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}"/>
    ${tick(x1, y, 0)}${tick(x2, y, 0)}
    <text x="${mid}" y="${y - 40}" text-anchor="middle">${label}</text>
  </g>`;
}
// vertical dimension line at x, between y1..y2, label rotated, placed left of line
function dimV(x, y1, y2, label, ext1, ext2, side = -1) {
  const mid = (y1 + y2) / 2;
  const tx = x + side * 45;
  return `<g class="dim">
    <line x1="${ext1}" y1="${y1}" x2="${x - side * 80}" y2="${y1}"/>
    <line x1="${ext2}" y1="${y2}" x2="${x - side * 80}" y2="${y2}"/>
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}"/>
    ${tick(x, y1, 0)}${tick(x, y2, 0)}
    <text x="${tx}" y="${mid}" text-anchor="middle" transform="rotate(${side < 0 ? -90 : 90} ${tx} ${mid})">${label}</text>
  </g>`;
}

const winR = winL + winW;                     // window right edge
const winFixed = winW - winLeaf;              // fixed pane on the left
const hingeX = winR;                          // leaf hinged at right jamb
const doorY2 = H - doorFromBack;              // hinge (back-side jamb)
const doorY1 = doorY2 - doorW;

const planSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1150 -1250 4670 6350" role="img" aria-label="Půdorys pokoje 2500 × 4800 mm">
  <style>
    .wall { fill: #2a2925; }
    .floor { fill: #ffffff; }
    .thin { stroke: #2a2925; stroke-width: ${SW}; fill: none; }
    .swing { stroke: #2a2925; stroke-width: ${SW}; fill: none; stroke-dasharray: 60 50; }
    .dim line { stroke: #8a857b; stroke-width: ${SW}; }
    .dim text, .lbl { font: ${FS}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; fill: #3a3833; }
    .lbl.muted { fill: #8a857b; }
    .rad { fill: #ffffff; stroke: #2a2925; stroke-width: ${SW}; }
  </style>

  <!-- walls -->
  <rect class="wall" x="${-T}" y="${-T}" width="${W + 2 * T}" height="${H + 2 * T}"/>
  <rect class="floor" x="0" y="0" width="${W}" height="${H}"/>

  <!-- window opening: cut wall, glass line, mullion -->
  <rect class="floor" x="${winL}" y="${-T}" width="${winW}" height="${T}"/>
  <line class="thin" x1="${winL}" y1="${-T / 2}" x2="${winR}" y2="${-T / 2}"/>
  <line class="thin" x1="${winL}" y1="${-T}" x2="${winL}" y2="0"/>
  <line class="thin" x1="${winR}" y1="${-T}" x2="${winR}" y2="0"/>
  <line class="thin" x1="${winL + winLeaf}" y1="${-T}" x2="${winL + winLeaf}" y2="0"/>
  <!-- opening leaf, hinged left, swings into the room -->
  <line class="thin" x1="${winL}" y1="0" x2="${winL}" y2="${winLeaf}"/>
  <path class="swing" d="M${winL + winLeaf},0 A${winLeaf},${winLeaf} 0 0 1 ${winL},${winLeaf}"/>
  <text class="lbl muted" x="${W / 2}" y="${-T - 120}" text-anchor="middle">zahrada</text>
  <text class="lbl" x="${winL + winW / 2}" y="${winLeaf + 300}" text-anchor="middle">francouzské okno</text>

  <!-- door on right wall, hinged at window-side jamb, swings into the room towards the back wall -->
  <rect class="floor" x="${W}" y="${doorY1}" width="${T}" height="${doorW}"/>
  <line class="thin" x1="${W}" y1="${doorY1}" x2="${W - doorW}" y2="${doorY1}"/>
  <path class="swing" d="M${W},${doorY2} A${doorW},${doorW} 0 0 1 ${W - doorW},${doorY1}"/>
  <text class="lbl" x="${W - doorW / 2}" y="${doorY2 + 250}" text-anchor="middle">vstup</text>

  <!-- radiator on left wall -->
  <rect class="rad" x="0" y="${radFromTop}" width="${radDepth}" height="${radLen}"/>
  <text class="lbl" x="${radDepth + 90}" y="${radFromTop + radLen / 2 + FS / 3}">topení</text>

  <!-- dimensions: window wall -->
  ${dimH(0, winL, -520, '500', -T, -T)}
  ${dimH(winL, winR, -520, '1 700', -T, -T)}
  ${dimH(winR, W, -520, '300', -T, -T)}
  ${dimH(0, W, -900, '2 500', -T, -T)}
  <!-- left wall: radiator, overall -->
  ${dimV(-520, 0, radFromTop, '400', -T, 0)}
  ${dimV(-520, radFromTop, radFromTop + radLen, '600', 0, 0)}
  ${dimV(-900, 0, H, '4 800', -T, -T)}
  <!-- right wall: door -->
  ${dimV(W + 520, 0, doorY1, '3 300', W + T, W + T, 1)}
  ${dimV(W + 520, doorY1, doorY2, '900', W + T, W + T, 1)}
  ${dimV(W + 520, doorY2, H, '600', W + T, W + T, 1)}

  <!-- scale + note -->
  <g class="dim">
    <line x1="0" y1="${H + 520}" x2="1000" y2="${H + 520}"/>
    ${tick(0, H + 520, 0)}${tick(1000, H + 520, 0)}
    <text x="500" y="${H + 520 - 40}" text-anchor="middle">1 m</text>
  </g>
  <text class="lbl muted" x="${W}" y="${H + 480}" text-anchor="end">výška stropu 2 600 mm</text>
</svg>`;

// ---------- inline images ----------
let html = tpl.replace('{{PLAN_SVG}}', planSvg);
html = html.replace(/\{\{IMG:([a-z0-9-]+)\}\}/g, (_, name) => {
  const p = resolve(imgDir, `${name}.jpg`);
  if (!existsSync(p)) throw new Error(`missing image ${p}`);
  return `data:image/jpeg;base64,${readFileSync(p).toString('base64')}`;
});
if (/\{\{[A-Z_:a-z0-9-]+\}\}/.test(html)) throw new Error('unreplaced placeholder in page');
writeFileSync(resolve(here, '../build/preview.html'), html); // unencrypted preview, stays outside the repo

if (!password) {
  writeFileSync(resolve(here, 'index.html'), html);
  console.log(`index.html written unencrypted: ${(html.length / 1e6).toFixed(2)} MB`);
  process.exit(0);
}

// ---------- encrypt ----------
const subtle = webcrypto.subtle;
const enc = new TextEncoder();
const salt = randomBytes(16), iv = randomBytes(12), iter = 600000;
const keyMat = await subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
const key = await subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, keyMat,
  { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
const cipher = Buffer.from(await subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(html)));

// round-trip self-check
const back = new TextDecoder().decode(await subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher));
if (back !== html) throw new Error('round-trip decrypt mismatch');

const payload = JSON.stringify({
  salt: salt.toString('base64'), iv: iv.toString('base64'), iter, data: cipher.toString('base64'),
});
const out = shell.replace('{{PAYLOAD}}', payload);
writeFileSync(resolve(here, 'index.html'), out);
console.log(`index.html written: ${(out.length / 1e6).toFixed(2)} MB (plain page ${(html.length / 1e6).toFixed(2)} MB)`);
