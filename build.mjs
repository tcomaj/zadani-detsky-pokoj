// Build script: renders the brief, inlines photos, encrypts everything with AES-256-GCM
// and writes a self-contained index.html with a password prompt.
//
// Usage:  PASSWORD='...' node build.mjs
// Inputs (not committed): ./src/page.html, ./src/shell.html, ../build/img/*.jpg
// Output: ./index.html

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { webcrypto, randomBytes } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const password = process.env.PASSWORD || ''; // empty = publish unencrypted

const imgDir = resolve(here, '../build/img');
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

function plan(furniture = '') { return `
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
    .furn { fill: #ece9e1; stroke: #2a2925; stroke-width: ${SW}; }
    .bed { fill: #e2e7ea; stroke: #2a2925; stroke-width: ${SW}; }
    .pillow { fill: #ffffff; stroke: #2a2925; stroke-width: ${SW * 0.7}; }
    .door { stroke: #2a2925; stroke-width: ${SW * 0.7}; stroke-dasharray: 40 40; }
    .chair { fill: #ffffff; stroke: #2a2925; stroke-width: ${SW * 0.7}; }
    .grille { stroke: #6b675f; stroke-width: ${SW * 0.6}; }
    .pullout { fill: #f3f5f6; stroke: #2a2925; stroke-width: ${SW * 0.7}; stroke-dasharray: 60 50; }
    .flbl { font: 600 115px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; fill: #2a2925; paint-order: stroke; stroke: #f1efe9; stroke-width: 60px; stroke-linejoin: round; }
    .fsub { font: 95px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; fill: #6b675f; paint-order: stroke; stroke: #f1efe9; stroke-width: 60px; stroke-linejoin: round; }
    .zone { font: 500 110px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; fill: #9a948a; letter-spacing: 10px; }
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
  <text class="lbl muted" x="${W / 2}" y="${-T - 120}" text-anchor="middle">${furniture ? 'zahrada · francouzské okno' : 'zahrada'}</text>
  ${furniture ? '' : `<text class="lbl" x="${winL + winW / 2}" y="${winLeaf + 300}" text-anchor="middle">francouzské okno</text>`}

  <!-- door on right wall, hinged at window-side jamb, swings into the room towards the back wall -->
  <rect class="floor" x="${W}" y="${doorY1}" width="${T}" height="${doorW}"/>
  <line class="thin" x1="${W}" y1="${doorY1}" x2="${W - doorW}" y2="${doorY1}"/>
  <path class="swing" d="M${W},${doorY2} A${doorW},${doorW} 0 0 1 ${W - doorW},${doorY1}"/>
  <text class="lbl" x="${W - 420}" y="${doorY1 + 330}" text-anchor="middle">vstup</text>

  <!-- radiator on left wall -->
  <rect class="rad" x="0" y="${radFromTop}" width="${radDepth}" height="${radLen}"/>
  <text class="lbl" x="${radDepth + 90}" y="${radFromTop + radLen / 2 + FS / 3}">topení</text>

  ${furniture}

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
</svg>`; }

// ---------- furniture helpers (mm) ----------
function label(x, y, w, h, title, sub) {
  const cx = x + w / 2, cy = y + h / 2;
  return `<text class="flbl" x="${cx}" y="${cy - (sub ? 20 : -40)}" text-anchor="middle">${title}</text>` +
    (sub ? `<text class="fsub" x="${cx}" y="${cy + 120}" text-anchor="middle">${sub}</text>` : '');
}
function wardrobe(x, y, w, h, title, sub, doors) {
  let lines = '';
  for (let i = 1; i < doors; i++) lines += `<line class="door" x1="${x + (w / doors) * i}" y1="${y}" x2="${x + (w / doors) * i}" y2="${y + h}"/>`;
  return `<rect class="furn" x="${x}" y="${y}" width="${w}" height="${h}"/>${lines}${label(x, y, w, h, title, sub)}`;
}
function bed(x, y, w, h, title, sub, headAt = 'top') {
  const py = headAt === 'top' ? y + 80 : y + h - 380;
  return `<rect class="bed" x="${x}" y="${y}" width="${w}" height="${h}" rx="40"/>` +
    `<rect class="pillow" x="${x + 120}" y="${py}" width="${w - 240}" height="300" rx="60"/>` +
    label(x, y, w, h, title, sub);
}
function desk(x, y, w, h, title, sub, chairs) {
  const c = chairs.map(([cx, cy]) => `<circle class="chair" cx="${cx}" cy="${cy}" r="190"/>`).join('');
  return `<rect class="furn" x="${x}" y="${y}" width="${w}" height="${h}"/>${c}${label(x, y, w, h, title, sub)}`;
}
function zone(x, y, text) { return `<text class="zone" x="${x}" y="${y}" text-anchor="middle">${text}</text>`; }

// Variant 1: desk at the back next to the wardrobe wall
const v1 = [
  wardrobe(0, 4200, 2500, 600, 'skříňová stěna', '250 × 60, ke stropu', 4),
  bed(0, 1000, 900, 2000, 'postel A', '90 × 200', 'top'),
  bed(1600, 600, 900, 2000, 'postel B', '90 × 200', 'top'),
  desk(0, 3000, 600, 1200, 'stůl', '120 × 60', [[860, 3300], [860, 3900]]),
  zone(1550, 3250, 'volná plocha'),
  zone(1250, 1950, 'ulička'),
].join('');

// Variant 2: desk by the window (daylight), bed A towards the back
const v2 = [
  wardrobe(0, 4200, 2500, 600, 'skříňová stěna', '250 × 60, ke stropu', 4),
  desk(0, 1000, 600, 1200, 'stůl', '120 × 60', [[860, 1300], [860, 1900]]),
  bed(0, 2200, 900, 2000, 'postel A', '90 × 200', 'bottom'),
  bed(1600, 600, 900, 2000, 'postel B', '90 × 200', 'top'),
  zone(1550, 3250, 'volná plocha'),
].join('');

// Variant C: one SLÄKT bed with pull-out on the right wall, long desk on the radiator wall
const slaktL = 2060, slaktW = 960, slaktOut = 1890, slaktY = 1000;
const v3 = [
  wardrobe(0, 4200, 2500, 600, 'skříňová stěna', '250 × 60, ke stropu', 4),
  `<rect class="pullout" x="${W - slaktOut}" y="${slaktY}" width="${slaktOut - slaktW}" height="${slaktL}" rx="40"/>` +
  `<text class="fsub" x="${W - slaktOut + (slaktOut - slaktW) / 2}" y="${slaktY + slaktL / 2 - 60}" text-anchor="middle">přistýlka</text>` +
  `<text class="fsub" x="${W - slaktOut + (slaktOut - slaktW) / 2}" y="${slaktY + slaktL / 2 + 70}" text-anchor="middle">(vysunutá na noc)</text>`,
  bed(W - slaktW, slaktY, slaktW, slaktL, 'SLÄKT', '96 × 206', 'bottom'),
  desk(0, 0, 500, 3100, 'stůl', '310 × 50, zavěšený', [[760, 1500], [760, 2600]]),
  // ventilation grille in the desk top above the low radiator
  Array.from({ length: 7 }, (_, i) => `<line class="grille" x1="140" y1="${430 + i * 90}" x2="470" y2="${430 + i * 90}"/>`).join('') +
  `<text class="fsub" x="275" y="1180" text-anchor="middle">mřížka</text>`,
  zone(1400, 3650, 'volná plocha'),
].join('');

// ---------- elevation of the left (radiator) wall, variant C ----------
function elevation() {
  const CH = 2600, L = 4800;
  const deskL = 3100, deskZ = 720, deskT = 40;
  const radX1 = 400, radX2 = 1000, radZ1 = 150, radZ2 = 450;
  const pegZ1 = 900, pegZ2 = 1460, pegW = 760, pegN = 4;
  const wardX = 4200;
  const z = (v) => CH - v; // mm above floor -> svg y
  let fins = '';
  for (let x = radX1 + 60; x < radX2; x += 60) fins += `<line class="thin" x1="${x}" y1="${z(radZ2) + 30}" x2="${x}" y2="${z(radZ1) - 30}"/>`;
  let pegs = '';
  for (let i = 0; i < pegN; i++) pegs += `<rect class="peg" x="${i * pegW + 10}" y="${z(pegZ2)}" width="${pegW - 20}" height="${pegZ2 - pegZ1}" rx="30"/>`;
  const chair = (cx) => `<g class="thin">
    <rect x="${cx - 200}" y="${z(430)}" width="400" height="40" rx="15" fill="#fff"/>
    <rect x="${cx - 180}" y="${z(820)}" width="360" height="330" rx="40" fill="#fff"/>
    <line x1="${cx - 170}" y1="${z(430) + 40}" x2="${cx - 190}" y2="${z(0)}"/>
    <line x1="${cx + 170}" y1="${z(430) + 40}" x2="${cx + 190}" y2="${z(0)}"/>
  </g>`;
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1150 -750 6950 4050" role="img" aria-label="Pohled na levou stěnu, varianta C">
  <style>
    .wall { fill: #2a2925; }
    .thin { stroke: #2a2925; stroke-width: ${SW}; fill: none; }
    .furn { fill: #ece9e1; stroke: #2a2925; stroke-width: ${SW}; }
    .peg { fill: url(#dots); stroke: #2a2925; stroke-width: ${SW * 0.7}; }
    .grille { stroke: #6b675f; stroke-width: ${SW * 0.6}; stroke-dasharray: 40 40; fill: none; }
    .dim line { stroke: #8a857b; stroke-width: ${SW}; }
    .dim text, .lbl { font: ${FS}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; fill: #3a3833; }
    .lbl.muted { fill: #8a857b; }
    .flbl { font: 600 115px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; fill: #2a2925; }
    .fsub { font: 95px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; fill: #6b675f; }
  </style>
  <defs>
    <pattern id="dots" width="100" height="100" patternUnits="userSpaceOnUse">
      <rect width="100" height="100" fill="#f6f4ee"/>
      <circle cx="50" cy="50" r="12" fill="#b9b3a7"/>
    </pattern>
  </defs>

  <!-- wall surface, floor, ceiling, side walls in section -->
  <rect x="0" y="0" width="${L}" height="${CH}" fill="#ffffff"/>
  <rect class="wall" x="${-T}" y="${-T}" width="${L + 2 * T}" height="${T}"/>
  <rect class="wall" x="${-T}" y="${CH}" width="${L + 2 * T}" height="${T}"/>
  <rect class="wall" x="${-T}" y="0" width="${T}" height="${CH}"/>
  <rect class="wall" x="${L}" y="0" width="${T}" height="${CH}"/>
  <text class="lbl muted" x="${-T - 60}" y="${CH / 2}" text-anchor="middle" transform="rotate(-90 ${-T - 60} ${CH / 2})">okenní stěna</text>

  <!-- wardrobe wall seen from the side -->
  <rect class="furn" x="${wardX}" y="0" width="${L - wardX}" height="${CH}"/>
  <text class="flbl" x="${wardX + 300}" y="${CH / 2}" text-anchor="middle" transform="rotate(-90 ${wardX + 300} ${CH / 2})">skříňová stěna (bok)</text>

  <!-- radiator -->
  <rect class="furn" x="${radX1}" y="${z(radZ2)}" width="${radX2 - radX1}" height="${radZ2 - radZ1}"/>
  ${fins}
  <text class="fsub" x="${(radX1 + radX2) / 2}" y="${z(radZ1) + 150}" text-anchor="middle">radiátor</text>

  <!-- pegboard band -->
  ${pegs}
  <text class="fsub" x="${deskL / 2}" y="${z(pegZ2) - 60}" text-anchor="middle">děrovaná deska SKÅDIS, 4 × 76 × 56 cm</text>

  <!-- chairs (behind the desk slab) -->
  ${chair(1500)}${chair(2600)}

  <!-- floating desk slab -->
  <rect class="furn" x="0" y="${z(deskZ + deskT)}" width="${deskL}" height="${deskT}"/>
  <rect class="grille" x="${radX1}" y="${z(deskZ + deskT) - 30}" width="${radX2 - radX1}" height="${deskT + 60}"/>
  <text class="fsub" x="${(radX1 + radX2) / 2}" y="${z(deskZ) + 150}" text-anchor="middle">mřížka v desce</text>
  <text class="flbl" x="${deskL / 2 + 550}" y="${z(deskZ) + 150}" text-anchor="middle">zavěšený stůl 310 × 50, bez nohou</text>

  <!-- dimensions -->
  ${dimH(0, deskL, -400, '3 100', 0, 0)}
  ${dimH(deskL, wardX, -400, '1 100', 0, 0)}
  ${dimH(wardX, L, -400, '600', 0, 0)}
  ${dimV(-520, z(deskZ), z(0), '720', 0, 0)}
  ${dimV(-820, z(CH), z(0), '2 600', -T, -T)}
  ${dimV(L + 520, z(pegZ2), z(pegZ1), '560', L + T, L + T, 1)}
  ${dimV(L + 520, z(pegZ1), z(deskZ), '180', L + T, L + T, 1)}
  <g class="dim">
    <line x1="0" y1="${CH + 520}" x2="1000" y2="${CH + 520}"/>
    ${tick(0, CH + 520, 0)}${tick(1000, CH + 520, 0)}
    <text x="500" y="${CH + 520 - 40}" text-anchor="middle">1 m</text>
  </g>
</svg>`;
}

// ---------- render pages ----------
function inlineImages(s) {
  return s.replace(/\{\{IMG:([a-z0-9-]+)\}\}/g, (_, name) => {
    const p = resolve(imgDir, `${name}.jpg`);
    if (!existsSync(p)) throw new Error(`missing image ${p}`);
    return `data:image/jpeg;base64,${readFileSync(p).toString('base64')}`;
  });
}
function render(src, vars) {
  let s = readFileSync(resolve(here, 'src', src), 'utf8');
  for (const [k, v] of Object.entries(vars)) s = s.replace(`{{${k}}}`, v);
  s = inlineImages(s);
  if (/\{\{[A-Z_:a-z0-9-]+\}\}/.test(s)) throw new Error(`unreplaced placeholder in ${src}`);
  return s;
}

const navrh = render('navrh.html', { PLAN_V1: plan(v1), PLAN_V2: plan(v2), PLAN_V3: plan(v3), ELEV_V3: elevation() });
mkdirSync(resolve(here, 'navrh'), { recursive: true });
writeFileSync(resolve(here, 'navrh/index.html'), navrh);
writeFileSync(resolve(here, '../build/preview-navrh.html'), navrh);
console.log(`navrh/index.html written: ${(navrh.length / 1e3).toFixed(0)} kB`);

let html = render('page.html', { PLAN_SVG: plan() });
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
