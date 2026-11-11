export const TAU = Math.PI * 2;

// Unseeded: cosmetic variation only (anything that must match across a room's screens uses mulberry).
export const rnd = (a, b) => a + Math.random() * (b - a);

// Seeded generator: every player in a room gets the same flights from the same seed.
export function mulberry(seed) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
