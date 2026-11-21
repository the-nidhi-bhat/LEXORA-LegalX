// Deterministic hashing utilities (browser + Node). Uses SHA-256 when available via Node crypto,
// otherwise a deterministic FNV-1a 256-bit-like hex digest fallback is not cryptographic; to satisfy
// "deterministic cryptographic hash" cross-environment, we implement a small synchronous SHA-256.

function rightRotate(n: number, x: number) { return (x >>> n) | (x << (32 - n)); }

export function sha256Hex(input: string): string {
  // Prefer Node crypto when present for performance/correctness.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const c: any = (globalThis as any).require ? (globalThis as any).require('crypto') : null;
    if (c && typeof c.createHash === 'function') return c.createHash('sha256').update(input, 'utf8').digest('hex');
  } catch { /* ignore */ }
  try {
    const p: any = (globalThis as any).process;
    if (p?.versions?.node) {
      // dynamic access without bundler issues
      const req = Function('return typeof require!=="undefined"?require:null')();
      if (req) {
        const c = req('crypto');
        if (c?.createHash) return c.createHash('sha256').update(input, 'utf8').digest('hex');
      }
    }
  } catch { /* ignore */ }

  // Pure JS SHA-256 (synchronous)
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const msg = unescape(encodeURIComponent(input));
  const l = msg.length;
  const bytes: number[] = [];
  for (let i = 0; i < l; i++) bytes.push(msg.charCodeAt(i));
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const bitLen = l * 8;
  for (let i = 7; i >= 0; i--) bytes.push((bitLen / Math.pow(2, i * 8)) & 0xff);
  for (let i = 0; i < bytes.length; i += 64) {
    const w = new Array(64).fill(0);
    for (let j = 0; j < 16; j++) w[j] = (bytes[i + j * 4] << 24) | (bytes[i + j * 4 + 1] << 16) | (bytes[i + j * 4 + 2] << 8) | (bytes[i + j * 4 + 3]);
    for (let j = 16; j < 64; j++) {
      const s0 = (rightRotate(7, w[j-15]) ^ rightRotate(18, w[j-15]) ^ (w[j-15] >>> 3)) >>> 0;
      const s1 = (rightRotate(17, w[j-2]) ^ rightRotate(19, w[j-2]) ^ (w[j-2] >>> 10)) >>> 0;
      w[j] = (w[j-16] + s0 + w[j-7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = H;
    for (let j = 0; j < 64; j++) {
      const S1 = (rightRotate(6, e) ^ rightRotate(11, e) ^ rightRotate(25, e)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const t1 = (h + S1 + ch + K[j] + w[j]) >>> 0;
      const S0 = (rightRotate(2, a) ^ rightRotate(13, a) ^ rightRotate(22, a)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H = [(H[0]+a)>>>0,(H[1]+b)>>>0,(H[2]+c)>>>0,(H[3]+d)>>>0,(H[4]+e)>>>0,(H[5]+f)>>>0,(H[6]+g)>>>0,(H[7]+h)>>>0];
  }
  return H.map(x => x.toString(16).padStart(8, '0')).join('');
}

export function canonicalize(value: any): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalize).join(',') + ']';
  if (typeof value === 'object') {
    const keys = Object.keys(value).filter(k => value[k] !== undefined).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalize(value[k])).join(',') + '}';
  }
  return JSON.stringify(String(value));
}

export function hashObject(value: any): string {
  return sha256Hex(canonicalize(value));
}
