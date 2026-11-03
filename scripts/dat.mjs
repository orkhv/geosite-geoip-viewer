// Minimal protobuf decoder for v2ray/xray geosite.dat and geoip.dat.
// Schema: github.com/XTLS/Xray-core/app/router/config.proto
// Hand-written to avoid dependencies and to keep `ip` as raw bytes.

const DOMAIN_PREFIX = ['keyword:', 'regexp:', 'domain:', 'full:']; // Plain, Regex, Domain(RootDomain), Full

function* fields(buf, start = 0, end = buf.length) {
  let pos = start;
  const varint = () => {
    let result = 0;
    let shift = 0;
    for (;;) {
      const b = buf[pos++];
      result += (b & 0x7f) * 2 ** shift;
      if (b < 0x80) return result;
      shift += 7;
    }
  };
  while (pos < end) {
    const tag = varint();
    const field = Math.floor(tag / 8);
    const wire = tag & 7;
    if (wire === 0) {
      yield [field, varint()];
    } else if (wire === 2) {
      const len = varint();
      yield [field, pos, pos + len];
      pos += len;
    } else if (wire === 1) {
      pos += 8;
    } else if (wire === 5) {
      pos += 4;
    } else {
      throw new Error(`Unsupported wire type ${wire} at ${pos}`);
    }
  }
}

const str = (buf, s, e) => buf.toString('utf8', s, e);

function formatAttribute(buf, s, e) {
  let key = '';
  let value = null;
  for (const [f, a, b] of fields(buf, s, e)) {
    if (f === 1) key = str(buf, a, b);
    else if (f === 3) value = a; // int_value
  }
  return value === null || value === 0 ? `@${key}` : `@${key}=${value}`;
}

function formatDomain(buf, s, e) {
  let type = 0;
  let value = '';
  const attrs = [];
  for (const [f, a, b] of fields(buf, s, e)) {
    if (f === 1) type = a;
    else if (f === 2) value = str(buf, a, b);
    else if (f === 3) attrs.push(formatAttribute(buf, a, b));
  }
  const line = (DOMAIN_PREFIX[type] ?? `type${type}:`) + value;
  return attrs.length ? `${line} ${attrs.join(' ')}` : line;
}

function formatIP(buf, s, e) {
  const len = e - s;
  if (len === 4) return `${buf[s]}.${buf[s + 1]}.${buf[s + 2]}.${buf[s + 3]}`;
  if (len !== 16) throw new Error(`Bad IP length ${len}`);
  const parts = [];
  for (let i = s; i < e; i += 2) parts.push(((buf[i] << 8) | buf[i + 1]).toString(16));
  // RFC 5952: compress the longest run (>=2) of zero groups.
  let best = -1;
  let bestLen = 1;
  for (let i = 0; i < 8; ) {
    if (parts[i] !== '0') { i++; continue; }
    let j = i;
    while (j < 8 && parts[j] === '0') j++;
    if (j - i > bestLen) { best = i; bestLen = j - i; }
    i = j;
  }
  if (best < 0) return parts.join(':');
  return `${parts.slice(0, best).join(':')}::${parts.slice(best + bestLen).join(':')}`;
}

function formatCIDR(buf, s, e) {
  let ip = '';
  let prefix = 0;
  for (const [f, a, b] of fields(buf, s, e)) {
    if (f === 1) ip = formatIP(buf, a, b);
    else if (f === 2) prefix = a;
  }
  return `${ip}/${prefix}`;
}

// Returns Map<categoryLowercase, string[]>
export function decode(buf, kind) {
  const formatItem = kind === 'geosite' ? formatDomain : formatCIDR;
  const result = new Map();
  for (const [f, s, e] of fields(buf)) {
    if (f !== 1) continue;
    let name = '';
    const items = [];
    for (const [ef, a, b] of fields(buf, s, e)) {
      if (ef === 1) name = str(buf, a, b).toLowerCase();
      else if (ef === 2) items.push(formatItem(buf, a, b));
    }
    result.set(name, items);
  }
  return result;
}
