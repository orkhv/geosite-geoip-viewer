const ROW_HEIGHT = 26;
const CHUNK_CACHE_SIZE = 6;
const SEARCH_CONCURRENCY = 4;
const KEEP_MATCHES = 5000;
const MAX_SIDEBAR = 3000;
const MODES = { geosite: 'GeoSite', geoip: 'GeoIP', asn: 'ASN' };

let meta = null;
let index = [];              // [{ name, count, chunks }]
let filtered = [];           // categories shown in the sidebar
let contentMatches = null;   // Map<name, { count, entries }> while content search is active
let selected = null;         // { name, entries, total }
let searchAbort = null;
let searchTimeout = null;

const state = { source: 'xray-lite', mode: 'geosite', category: '' };

const sourceSelect = document.getElementById('sourceSelect');
const modeSelect = document.getElementById('modeSelect');
const loadingIndicator = document.getElementById('loading');
const searchInput = document.getElementById('search');
const searchInContent = document.getElementById('searchInContent');
const searchInfo = document.querySelector('.search-info');
const categoryList = document.getElementById('categoryList');
const categoryTitle = document.getElementById('categoryTitle');
const categoryInfo = document.getElementById('categoryInfo');
const entriesBox = document.getElementById('entries');
const entriesSpacer = document.getElementById('entriesSpacer');
const domainList = document.getElementById('domainList');
const metaInfo = document.getElementById('meta');

const dataUrl = (file) => `data/${state.source}/${state.mode}/${file}`;

// --- URL hash: #source/mode/category --------------------------------------

function readHash() {
  const [source, mode, category] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (meta.sources.some((s) => s.id === source)) state.source = source;
  if (mode in MODES) state.mode = mode;
  fillModes();
  state.category = category || '';
}

function writeHash() {
  const parts = [state.source, state.mode];
  if (state.category) parts.push(state.category);
  history.replaceState(null, '', `#${parts.map(encodeURIComponent).join('/')}`);
}

// --- Fetching ---------------------------------------------------------------

const chunkCache = new Map();

function fetchText(url, signal) {
  return fetch(url, { signal }).then((res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
    return res.text();
  });
}

function getChunk(url) {
  if (chunkCache.has(url)) {
    const promise = chunkCache.get(url);
    chunkCache.delete(url);
    chunkCache.set(url, promise);
    return promise;
  }
  const promise = fetchText(url).catch((error) => {
    chunkCache.delete(url);
    throw error;
  });
  chunkCache.set(url, promise);
  if (chunkCache.size > CHUNK_CACHE_SIZE) chunkCache.delete(chunkCache.keys().next().value);
  return promise;
}

// Calls onEntry(category, entry) for every line of a chunk.
function scanChunk(text, onEntry) {
  let category = '';
  let start = 0;
  while (start < text.length) {
    let end = text.indexOf('\n', start);
    if (end < 0) end = text.length;
    if (text.charCodeAt(start) === 35 /* # */) category = text.slice(start + 1, end);
    else if (end > start) onEntry(category, text.slice(start, end));
    start = end + 1;
  }
}

async function loadCategoryEntries(item) {
  const entries = [];
  const header = `#${item.name}\n`;
  for (const id of item.chunks) {
    const text = await getChunk(dataUrl(`${id}.txt`));
    // A category occupies one contiguous block per chunk.
    let pos = text.startsWith(header) ? 0 : text.indexOf(`\n${header}`) + 1;
    if (pos === 0 && !text.startsWith(header)) continue;
    pos += header.length;
    const next = text.indexOf('\n#', pos - 1);
    for (const line of text.slice(pos, next < 0 ? text.length : next).split('\n')) {
      if (line) entries.push(line);
    }
  }
  return entries;
}

// --- Matching ---------------------------------------------------------------

function parseIP(text) {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(text)) {
    const octets = text.split('.').map(Number);
    if (octets.some((o) => o > 255)) return null;
    return { v6: false, value: octets.reduce((acc, o) => (acc << 8n) | BigInt(o), 0n) };
  }
  if (text.includes(':') && /^[0-9a-f:.]+$/i.test(text)) {
    let [head, tail] = text.split('::');
    if (text.split('::').length > 2) return null;
    const toGroups = (s) => (s ? s.split(':') : []);
    let left = toGroups(head);
    let right = tail === undefined ? [] : toGroups(tail);
    // Embedded IPv4 in the last group (::ffff:1.2.3.4).
    const last = (tail === undefined ? left : right);
    if (last.length && last[last.length - 1].includes('.')) {
      const v4 = parseIP(last.pop());
      if (!v4 || v4.v6) return null;
      last.push((v4.value >> 16n).toString(16), (v4.value & 0xffffn).toString(16));
    }
    const missing = 8 - left.length - right.length;
    if (tail === undefined ? missing !== 0 : missing < 1) return null;
    const groups = [...left, ...Array(tail === undefined ? 0 : missing).fill('0'), ...right];
    if (groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
    return { v6: true, value: groups.reduce((acc, g) => (acc << 16n) | BigInt(parseInt(g, 16)), 0n) };
  }
  return null;
}

function makeMatcher(query) {
  const q = query.toLowerCase();
  if (state.mode !== 'geosite') {
    const ip = parseIP(q);
    if (!ip) return (entry) => entry.includes(q);
    if (!ip.v6) {
      const addr = Number(ip.value);
      return (entry) => {
        if (entry.includes(':')) return false;
        const [a, b, c, rest] = entry.split('.');
        const [d, prefix] = rest.split('/');
        const net = ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
        const mask = prefix === '0' ? 0 : (~0 << (32 - prefix)) >>> 0;
        return ((net & mask) >>> 0) === ((addr & mask) >>> 0);
      };
    }
    return (entry) => {
      if (!entry.includes(':')) return false;
      const slash = entry.indexOf('/');
      const net = parseIP(entry.slice(0, slash));
      if (!net) return false;
      const shift = 128n - BigInt(entry.slice(slash + 1));
      return net.value >> shift === ip.value >> shift;
    };
  }
  // GeoSite: substring match, plus "would this rule match the domain q" semantics.
  const regexps = new Map();
  return (entry) => {
    if (entry.includes(q)) return true;
    const colon = entry.indexOf(':');
    const space = entry.indexOf(' ', colon);
    const type = entry.slice(0, colon);
    const value = entry.slice(colon + 1, space < 0 ? entry.length : space);
    switch (type) {
      case 'domain': return q === value || q.endsWith(`.${value}`);
      case 'full': return q === value;
      case 'keyword': return q.includes(value);
      case 'regexp': {
        let re = regexps.get(value);
        if (re === undefined) {
          try { re = new RegExp(value); } catch { re = null; }
          regexps.set(value, re);
        }
        return re !== null && re.test(q);
      }
      default: return false;
    }
  };
}

// --- Search -----------------------------------------------------------------

searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(performSearch, 300);
});
function updatePlaceholder() {
  searchInput.placeholder = searchInContent.checked
    ? (state.mode !== 'geosite' ? 'IP-адрес или часть CIDR...' : 'Домен или часть правила...')
    : 'Поиск по категориям...';
}
searchInContent.addEventListener('change', () => {
  updatePlaceholder();
  performSearch();
});

async function performSearch() {
  searchAbort?.abort();
  searchAbort = null;
  const query = searchInput.value.trim();
  contentMatches = null;

  if (!query) {
    filtered = index;
    searchInfo.textContent = '';
  } else if (!searchInContent.checked) {
    const q = query.toLowerCase();
    filtered = index.filter((c) => c.name.includes(q));
    searchInfo.textContent = filtered.length ? `Найдено: ${filtered.length} категорий` : 'Ничего не найдено';
  } else {
    await searchContent(query);
    return;
  }
  renderCategories();
  if (selected) showCategory(selected.name);
}

async function searchContent(query) {
  const abort = new AbortController();
  searchAbort = abort;
  const match = makeMatcher(query);
  const matches = new Map();
  const chunkCount = Math.max(-1, ...index.flatMap((c) => c.chunks)) + 1;
  let done = 0;
  let next = 0;
  searchInfo.textContent = `Поиск... 0/${chunkCount}`;

  const worker = async () => {
    while (next < chunkCount) {
      const url = dataUrl(`${next++}.txt`);
      const text = await (chunkCache.has(url) ? getChunk(url) : fetchText(url, abort.signal));
      if (abort.signal.aborted) return;
      scanChunk(text, (category, entry) => {
        if (!match(entry)) return;
        let m = matches.get(category);
        if (!m) matches.set(category, (m = { count: 0, entries: [] }));
        m.count++;
        if (m.entries.length < KEEP_MATCHES) m.entries.push(entry);
      });
      searchInfo.textContent = `Поиск... ${++done}/${chunkCount}`;
      await new Promise((resolve) => setTimeout(resolve)); // let the UI breathe
    }
  };

  try {
    await Promise.all(Array.from({ length: SEARCH_CONCURRENCY }, worker));
  } catch (error) {
    if (abort.signal.aborted) return;
    searchInfo.textContent = `Ошибка поиска: ${error.message}`;
    return;
  }
  if (abort.signal.aborted) return;

  contentMatches = matches;
  filtered = index.filter((c) => matches.has(c.name));
  const total = [...matches.values()].reduce((sum, m) => sum + m.count, 0);
  searchInfo.textContent = filtered.length
    ? `Найдено: ${filtered.length} категорий, ${total} записей`
    : 'Ничего не найдено';
  renderCategories();
  if (selected) showCategory(selected.name);
}

// --- Rendering --------------------------------------------------------------

function renderCategories() {
  const fragment = document.createDocumentFragment();
  // ASN has ~80k categories: keep the DOM small, the active one always visible.
  let shown = filtered.slice(0, MAX_SIDEBAR);
  const active = filtered.find((c) => c.name === state.category);
  if (active && !shown.includes(active)) shown = [active, ...shown];
  for (const item of shown) {
    const li = document.createElement('li');
    li.dataset.name = item.name;
    const count = contentMatches?.get(item.name)?.count ?? item.count;
    li.innerHTML = '<span class="name"></span><span class="count"></span>';
    li.firstChild.textContent = item.name;
    li.lastChild.textContent = count;
    if (item.name === state.category) li.classList.add('active');
    fragment.appendChild(li);
  }
  if (filtered.length > shown.length) {
    const li = document.createElement('li');
    li.className = 'more';
    li.textContent = `...и ещё ${filtered.length - shown.length}, уточните поиск`;
    fragment.appendChild(li);
  }
  categoryList.replaceChildren(fragment);
}

categoryList.addEventListener('click', (event) => {
  const li = event.target.closest('li');
  if (li?.dataset.name) showCategory(li.dataset.name);
});

function renderEntries() {
  const entries = selected?.entries ?? [];
  entriesSpacer.style.height = `${entries.length * ROW_HEIGHT}px`;
  const first = Math.max(0, Math.floor(entriesBox.scrollTop / ROW_HEIGHT) - 10);
  const last = Math.min(entries.length, first + Math.ceil(entriesBox.clientHeight / ROW_HEIGHT) + 20);
  domainList.style.transform = `translateY(${first * ROW_HEIGHT}px)`;
  const fragment = document.createDocumentFragment();
  for (let i = first; i < last; i++) {
    const li = document.createElement('li');
    li.textContent = entries[i];
    fragment.appendChild(li);
  }
  domainList.replaceChildren(fragment);
}

entriesBox.addEventListener('scroll', () => requestAnimationFrame(renderEntries));
window.addEventListener('resize', renderEntries);

domainList.addEventListener('click', (event) => {
  const li = event.target.closest('li');
  if (!li) return;
  navigator.clipboard.writeText(li.textContent);
  li.classList.add('copied');
  setTimeout(() => li.classList.remove('copied'), 1000);
});

let showToken = 0;
async function showCategory(name) {
  const item = index.find((c) => c.name === name);
  if (!item) return;
  const token = ++showToken;
  state.category = name;
  writeHash();
  renderCategories();
  categoryList.querySelector('li.active')?.scrollIntoView({ block: 'nearest' });
  categoryTitle.textContent = `Категория: ${name}`;

  const m = contentMatches?.get(name);
  let entries;
  let info;
  if (m) {
    entries = m.entries;
    info = `Совпадений: ${m.count} из ${item.count}` + (m.count > m.entries.length ? ` (показаны первые ${m.entries.length})` : '');
  } else {
    categoryInfo.textContent = `Записей: ${item.count}, загрузка...`;
    try {
      entries = await loadCategoryEntries(item);
    } catch (error) {
      if (token === showToken) categoryInfo.textContent = `Не удалось загрузить: ${error.message}`;
      return;
    }
    info = item.count ? `Записей: ${item.count}` : 'Нет записей';
  }
  if (token !== showToken) return;

  const kind = meta.sources.find((s) => s.id === state.source).kinds[state.mode];
  const rule = state.mode === 'asn' ? `ext:${kind.file}:${name}` : `${state.mode}:${name}`;
  categoryInfo.innerHTML = '';
  categoryInfo.append(info, ' · ');
  const code = document.createElement('code');
  code.textContent = rule;
  code.title = 'Скопировать';
  code.onclick = () => navigator.clipboard.writeText(code.textContent);
  categoryInfo.append(code);

  selected = { name, entries };
  entriesBox.scrollTop = 0;
  renderEntries();
}

// --- Loading ----------------------------------------------------------------

async function loadIndex() {
  loadingIndicator.hidden = false;
  searchAbort?.abort();
  contentMatches = null;
  selected = null;
  chunkCache.clear();
  renderEntries();
  categoryTitle.textContent = 'Выберите категорию';
  categoryInfo.textContent = '';
  try {
    const res = await fetch(dataUrl('index.json'));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    index = await res.json();
  } catch (error) {
    index = [];
    categoryTitle.textContent = 'Ошибка загрузки данных';
    categoryInfo.textContent = error.message;
  } finally {
    loadingIndicator.hidden = true;
  }
  renderMeta();
  const category = state.category;
  state.category = '';
  await performSearch();
  if (category) showCategory(category);
  else writeHash();
}

function renderMeta() {
  const source = meta.sources.find((s) => s.id === state.source);
  const kind = source.kinds[state.mode];
  const built = new Date(meta.builtAt).toLocaleString('ru-RU');
  metaInfo.innerHTML = '';
  const link = document.createElement('a');
  link.href = `https://github.com/${source.repo}/releases/tag/${source.tag}`;
  link.target = '_blank';
  link.rel = 'noopener';
  link.textContent = `${source.repo} ${source.tag}`;
  metaInfo.append(link, ` · ${kind.file} · ${kind.categories} категорий, ${kind.entries.toLocaleString('ru-RU')} записей · обновлено ${built}`);
}

// Mode options depend on what the source ships (ASN only for some).
function fillModes() {
  const kinds = meta.sources.find((s) => s.id === state.source).kinds;
  if (!(state.mode in kinds)) {
    state.mode = 'geosite';
    state.category = '';
  }
  modeSelect.replaceChildren(...Object.keys(kinds).map((k) => new Option(MODES[k] ?? k, k)));
  modeSelect.value = state.mode;
  updatePlaceholder();
}

sourceSelect.addEventListener('change', () => {
  state.source = sourceSelect.value;
  fillModes();
  loadIndex();
});
modeSelect.addEventListener('change', () => {
  state.mode = modeSelect.value;
  state.category = '';
  updatePlaceholder();
  loadIndex();
});

// Back/forward or a pasted link with another hash.
window.addEventListener('hashchange', () => {
  if (!meta) return;
  const { source, mode, category } = state;
  readHash();
  sourceSelect.value = state.source;
  modeSelect.value = state.mode;
  if (state.source !== source || state.mode !== mode) {
    updatePlaceholder();
    loadIndex();
  } else if (state.category && state.category !== category) {
    showCategory(state.category);
  }
});

async function init() {
  try {
    const res = await fetch('data/meta.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    meta = await res.json();
  } catch (error) {
    categoryTitle.textContent = 'Ошибка загрузки данных';
    categoryInfo.textContent = error.message;
    return;
  }
  for (const source of meta.sources) sourceSelect.add(new Option(source.title, source.id));
  readHash();
  sourceSelect.value = state.source;
  modeSelect.value = state.mode;
  loadIndex();
}

init();
