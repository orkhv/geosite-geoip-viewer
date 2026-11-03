// Downloads geosite/geoip .dat releases and converts them into static files for the viewer.
//
// Output layout (dist/data):
//   meta.json                         sources, release tags, build time
//   <source>/<kind>/index.json        [{ name, count, chunks: [n, ...] }]
//   <source>/<kind>/<n>.txt           "#category" header lines followed by entries
//
// Categories are packed into ~4 MB chunks so the site stays small in file count,
// a category loads with one or few requests and content search can stream everything.
//
// Usage:
//   node scripts/build.mjs            build into dist/
//   node scripts/build.mjs --check    print changed=true|false comparing release tags with the live site

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { decode } from './dat.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const CACHE = path.join(ROOT, '.cache');
const SITE_URL = process.env.SITE_URL || 'https://orkhv.github.io/geosite-geoip-viewer/';
const CHUNK_BYTES = 4 * 1024 * 1024;
const MAX_ATTEMPTS = 5;

const REPOS = {
  xray: 'XTLS/Xray-rules-dat',
  loyalsoldier: 'Loyalsoldier/v2ray-rules-dat',
  medium1992: 'Medium1992/geo-dat',
};

// gz: release has a .gz copy, download it to save bandwidth.
export const SOURCES = [
  {
    id: 'xray-lite',
    title: 'Xray Lite',
    repo: 'xray',
    files: { geosite: { name: 'geosite.dat', gz: true }, geoip: { name: 'geoip-lite.dat', gz: true } },
  },
  {
    id: 'xray-full',
    title: 'Xray Full',
    repo: 'xray',
    files: { geosite: { name: 'geosite-expand.dat', gz: true }, geoip: { name: 'geoip-full.dat', gz: true } },
  },
  {
    id: 'loyalsoldier',
    title: 'Loyalsoldier',
    repo: 'loyalsoldier',
    files: { geosite: { name: 'geosite.dat' }, geoip: { name: 'geoip.dat' } },
  },
  {
    id: 'medium1992',
    title: 'Medium1992 (MetaCubeX)',
    repo: 'medium1992',
    files: { geosite: { name: 'geosite.dat' }, geoip: { name: 'geoip.dat' }, asn: { name: 'asn.dat' } },
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchRetry(url, as) {
  const headers = { 'User-Agent': 'geosite-geoip-viewer' };
  if (process.env.GITHUB_TOKEN && url.startsWith('https://api.github.com/')) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { headers, redirect: 'follow' });
      if (response.status === 404 && as === 'json-or-null') return null;
      if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
      if (as === 'json' || as === 'json-or-null') return await response.json();
      if (as === 'text') return await response.text();
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        console.warn(`Попытка ${attempt} не удалась: ${error.message}, повтор...`);
        await sleep(attempt * 2000);
      }
    }
  }
  throw lastError;
}

async function latestTags() {
  const tags = {};
  for (const [key, repo] of Object.entries(REPOS)) {
    const release = await fetchRetry(`https://api.github.com/repos/${repo}/releases/latest`, 'json');
    tags[key] = release.tag_name;
  }
  return tags;
}

// Downloads one asset of a pinned release into .cache, verifies sha256, returns raw .dat bytes.
async function downloadDat(repo, tag, { name, gz }) {
  const asset = gz ? `${name}.gz` : name;
  const base = `https://github.com/${REPOS[repo]}/releases/download/${tag}/`;
  const cached = path.join(CACHE, `${repo}-${tag}-${asset}`);

  let data;
  if (fs.existsSync(cached)) {
    data = fs.readFileSync(cached);
  } else {
    const [bytes, sum] = await Promise.all([
      fetchRetry(base + asset, 'buffer'),
      fetchRetry(`${base}${asset}.sha256sum`, 'text'),
    ]);
    const expected = sum.trim().split(/\s+/)[0].toLowerCase();
    const actual = crypto.createHash('sha256').update(bytes).digest('hex');
    if (expected !== actual) throw new Error(`${asset}: sha256 mismatch`);
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(cached, bytes);
    data = bytes;
  }
  return gz ? zlib.gunzipSync(data) : data;
}

function writeKind(dir, categories) {
  fs.mkdirSync(dir, { recursive: true });
  const names = [...categories.keys()].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const index = [];
  let chunk = [];
  let chunkSize = 0;
  let chunkId = 0;

  const flush = () => {
    if (!chunk.length) return;
    fs.writeFileSync(path.join(dir, `${chunkId}.txt`), chunk.join('\n') + '\n');
    chunk = [];
    chunkSize = 0;
    chunkId++;
  };

  for (const name of names) {
    const entries = [...new Set(categories.get(name))].sort();
    const item = { name, count: entries.length, chunks: [] };
    index.push(item);
    let i = 0;
    do {
      if (chunkSize >= CHUNK_BYTES) flush();
      if (!item.chunks.includes(chunkId)) item.chunks.push(chunkId);
      chunk.push(`#${name}`);
      chunkSize += name.length + 2;
      while (i < entries.length && chunkSize < CHUNK_BYTES) {
        chunk.push(entries[i]);
        chunkSize += entries[i].length + 1;
        i++;
      }
    } while (i < entries.length);
  }
  flush();
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index));
  return { categories: index.length, entries: index.reduce((sum, c) => sum + c.count, 0), chunks: chunkId };
}

async function build() {
  const tags = await latestTags();
  console.log('Релизы:', tags);

  fs.rmSync(DIST, { recursive: true, force: true });
  for (const file of ['index.html', 'script.js', 'style.css', '.nojekyll']) {
    fs.cpSync(path.join(ROOT, 'site', file), path.join(DIST, file));
  }

  const meta = { builtAt: new Date().toISOString(), tags, sources: [] };
  for (const source of SOURCES) {
    const tag = tags[source.repo];
    const info = { id: source.id, title: source.title, repo: REPOS[source.repo], tag, kinds: {} };
    for (const [kind, file] of Object.entries(source.files)) {
      const started = Date.now();
      const dat = await downloadDat(source.repo, tag, file);
      // asn.dat has the geoip layout: categories are AS numbers with CIDR lists.
      const stats = writeKind(path.join(DIST, 'data', source.id, kind), decode(dat, kind === 'geosite' ? 'geosite' : 'geoip'));
      info.kinds[kind] = { file: file.name, ...stats };
      console.log(`${source.id}/${kind}: ${file.name}`, stats, `${Date.now() - started} мс`);
    }
    meta.sources.push(info);
  }
  fs.writeFileSync(path.join(DIST, 'data', 'meta.json'), JSON.stringify(meta, null, 2));
  console.log('Готово');
}

async function check() {
  const [tags, live] = await Promise.all([
    latestTags(),
    fetchRetry(new URL('data/meta.json', SITE_URL).href, 'json-or-null').catch(() => null),
  ]);
  const changed = !live || JSON.stringify(live.tags) !== JSON.stringify(tags);
  console.log(`Сейчас: ${JSON.stringify(tags)}, на сайте: ${JSON.stringify(live?.tags ?? null)}`);
  const line = `changed=${changed}\n`;
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, line);
  process.stdout.write(line);
}

(process.argv.includes('--check') ? check() : build()).catch((error) => {
  console.error('Ошибка:', error);
  process.exit(1);
});
