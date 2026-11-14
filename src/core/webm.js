// A minimal WebM writer: one video track of already-encoded VP8/VP9 frames (from WebCodecs' VideoEncoder) into a file
// any browser, VLC or the Windows media player can play. EBML is nested elements of [id][size][data]; the clip is short
// and in memory, so every size is known up front and there are no seek cues.
//
// frames: [{ data: Uint8Array, ts: µs, key: boolean }] in order, starting on a key frame. Returns a Blob.

const enc = new TextEncoder();
const cat = parts => { const n = parts.reduce((a, p) => a + p.length, 0), out = new Uint8Array(n); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; };
const idBytes = id => { const b = []; for (let v = id; v > 0; v = Math.floor(v / 256)) b.unshift(v & 255); return Uint8Array.from(b); };
// Element sizes as EBML variable-length ints: the length of the number is marked by the first set bit.
function vint(n) {
  let len = 1; while (len < 8 && n >= 2 ** (7 * len) - 1) len++;
  const b = new Uint8Array(len); for (let i = len - 1, v = n; i >= 0; i--, v = Math.floor(v / 256)) b[i] = v & 255;
  b[0] |= 1 << (8 - len); return b;
}
const uint = n => { const b = []; do { b.unshift(n & 255); n = Math.floor(n / 256); } while (n > 0); return Uint8Array.from(b); };
const f64 = x => { const b = new Uint8Array(8); new DataView(b.buffer).setFloat64(0, x); return b; };
const el = (id, data) => cat([idBytes(id), vint(data.length), data]);
const master = (id, ...kids) => el(id, cat(kids));

export function muxWebM(frames, { codec, width, height }) {
  const t0 = frames[0].ts, ms = f => Math.round((f.ts - t0) / 1000);
  const last = frames[frames.length - 1], step = frames.length > 1 ? (last.ts - frames[frames.length - 2].ts) / 1000 : 33;
  const header = master(0x1A45DFA3,
    el(0x4286, uint(1)), el(0x42F7, uint(1)), el(0x42F2, uint(4)), el(0x42F3, uint(8)),
    el(0x4282, enc.encode('webm')), el(0x4287, uint(4)), el(0x4285, uint(2)));
  const info = master(0x1549A966, el(0x2AD7B1, uint(1e6)), el(0x4D80, enc.encode('Open Season')), el(0x5741, enc.encode('Open Season')),
    el(0x4489, f64(ms(last) + step)));
  const tracks = master(0x1654AE6B, master(0xAE,
    el(0xD7, uint(1)), el(0x73C5, uint(1)), el(0x83, uint(1)), el(0x9C, uint(0)),
    el(0x86, enc.encode(codec === 'vp8' ? 'V_VP8' : 'V_VP9')),
    master(0xE0, el(0xB0, uint(width)), el(0xBA, uint(height)))));
  // One cluster per key frame (a block's time is a 16-bit offset from its cluster's, so clusters stay well under 32 s).
  const clusters = []; let blocks = [], start = 0;
  const close = () => { if (blocks.length) clusters.push(master(0x1F43B675, el(0xE7, uint(start)), ...blocks)); blocks = []; };
  for (const f of frames) {
    const t = ms(f);
    if (f.key || t - start > 30000) { close(); start = t; }
    const head = new Uint8Array(4); head[0] = 0x81; new DataView(head.buffer).setInt16(1, t - start); head[3] = f.key ? 0x80 : 0;
    blocks.push(el(0xA3, cat([head, f.data])));
  }
  close();
  return new Blob([header, master(0x18538067, info, tracks, ...clusters)], { type: 'video/webm' });
}
