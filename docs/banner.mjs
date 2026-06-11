#!/usr/bin/env node
// TokyoNight gradient README banner — same recipe as the dotfiles banner
// (figlet 'ANSI Shadow' + per-char gradient, serialized to a monospace-grid
// SVG so GitHub renders it in colour). Zero deps: the figlet text is
// pre-rendered below.
//
//   node docs/banner.mjs        # rewrites docs/banner.svg
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ART = `
██╗███████╗ █████╗ ██╗  ██╗ █████╗ ██╗   ██╗ █████╗
██║╚══███╔╝██╔══██╗██║ ██╔╝██╔══██╗╚██╗ ██╔╝██╔══██╗
██║  ███╔╝ ███████║█████╔╝ ███████║ ╚████╔╝ ███████║
██║ ███╔╝  ██╔══██║██╔═██╗ ██╔══██║  ╚██╔╝  ██╔══██║
██║███████╗██║  ██║██║  ██╗██║  ██║   ██║   ██║  ██║
╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚═╝  ╚═╝
`.replace(/^\n|\n$/g, '');

const SUBTITLE = '🏮 居酒屋 — a cozy little bar where your repos are the menu';

const BG = '#16161e';
// TokyoNight gradient stops: blue → cyan → purple → teal → green → pink.
const STOPS = [
  [122, 162, 247], [125, 207, 255], [187, 154, 247], [115, 218, 202], [158, 206, 106], [247, 118, 142],
];

const lerp = (a, b, t) => Math.round(a + (b - a) * t);
function gradColor(p) {
  const x = ((p % 1) + 1) % 1;
  const seg = x * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(seg));
  const t = seg - i;
  const [a, b] = [STOPS[i], STOPS[i + 1]];
  return `#${[lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
    .map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const fontSize = 13;
const lineH = fontSize * 1.35;
const pad = 22;
const charW = fontSize * 0.6;

const lines = ART.split('\n');
const maxCols = Math.max(...lines.map((l) => l.length));
// Per-char tspans pinned to the monospace grid (explicit x + textLength) so
// block/box glyphs can't drift.
const texts = lines.map((line, row) => {
  const y = (pad + row * lineH + fontSize).toFixed(1);
  const n = Math.max(line.length, 1);
  const tspans = [...line].map((ch, i) => {
    if (ch === ' ') return '';
    const fill = gradColor((i / n) * 0.9 + row * 0.07);
    return `<tspan x="${(pad + i * charW).toFixed(2)}" textLength="${charW.toFixed(2)}" lengthAdjust="spacingAndGlyphs" fill="${fill}">${ch}</tspan>`;
  }).join('');
  return `<text y="${y}" xml:space="preserve">${tspans}</text>`;
});

const w = Math.ceil(maxCols * charW + pad * 2);
const subY = pad + lines.length * lineH + fontSize + 4;
const h = Math.ceil(subY + pad - 6);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" font-family="ui-monospace, 'JetBrains Mono', 'SFMono-Regular', Menlo, Consolas, monospace" font-size="${fontSize}">
<rect width="${w}" height="${h}" rx="12" fill="${BG}"/>
${texts.join('\n')}
<text x="${w / 2}" y="${subY.toFixed(1)}" text-anchor="middle" fill="#565f89" font-size="12">${SUBTITLE}</text>
</svg>
`;

const out = join(dirname(fileURLToPath(import.meta.url)), 'banner.svg');
writeFileSync(out, svg);
console.log(`wrote ${out} (${w}x${h})`);
