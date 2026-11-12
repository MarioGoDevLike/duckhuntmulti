// Gameplay tuning: every number a designer would want to tweak lives here, not inside the systems.

export const GAME_TIME = 120; // seconds per hunt (a night hunt runs NIGHT.time)

// Semi-auto: 5 in the tube, loaded one shell at a time. Over-under: two stacked barrels, breaks open and takes a fresh pair.
// interval: s between shots · reload: s per shell (single) or for the pair.
export const WEAPONS = {
  semi: { name: 'Field Semi-Auto', type: 'Semi-auto 12 ga', desc: '5 shells · quick follow-up shots · loads one shell at a time', mag: 5, interval: 0.22, reload: 0.55, single: true },
  double: { name: 'Field Over Under', type: 'Over-under 12 ga', desc: '2 shells · instant second barrel · breaks open and reloads both', mag: 2, interval: 0.12, reload: 1.3, single: false },
};

// What is being hunted. hitR/reach/fade: how big the bird is to the shot column and how fast the pattern thins
// with range; pts: score multiplier; rest: how high a procedural bird sits when down;
// upturn: laid breast up in the bag; gap: seconds between flights; bag: how the birds are laid out on the grass.
export const QUARRY = {
  duck: { kind: 'duck', name: 'Mallard', line: 'Steady flights over the lake', speed: 3, skill: 2, desc: 'Marsh ducks · steady, straight flight · longer shots', one: 'duck', many: 'ducks',
          hitR: 0.26, reach: 64, fade: 24, pts: 1, rest: 0.12, upturn: false, gap: [1.6, 3.6], bag: { cols: 6, dx: 0.78, dz: 0.9, front: -2.4 } }, // dx: a duck on its side is ~0.7 across
  finch: { kind: 'finch', name: 'Fringello', line: 'Bounding flocks over open ground', speed: 3, skill: 5, desc: 'Chaffinch flocks · bounding, jinking flight · short, quick shots', one: 'bird', many: 'birds',
           hitR: 0.15, reach: 46, fade: 16, pts: 1.6, rest: 0.05, upturn: true, gap: [6, 9], bag: { cols: 8, dx: 0.24, dz: 0.42, front: -1.8 } },
  thrush: { kind: 'thrush', name: 'Thrush', line: 'Bursts from the woods, one by one', speed: 5, skill: 4, desc: 'Summan · bursts out of the trees one at a time · fast, direct flight', one: 'thrush', many: 'thrushes',
            hitR: 0.19, reach: 52, fade: 18, pts: 1.3, rest: 0.06, upturn: true, gap: [1.4, 3.2], bag: { cols: 6, dx: 0.32, dz: 0.55, front: -2.0 } },
  // Night lamping in the olive terraces: rooms only, one hunter holds the lamp and the others shoot (see game/night.js).
  night: { kind: 'night', bird: 'thrush', night: true, roomOnly: true, name: 'Night Thrush', line: 'Thrushes over the projectors, in the lamp', speed: 2, skill: 5,
           desc: 'Dujj at night · one hunter holds the lamp on the bird, the others shoot · 2+ hunters', one: 'thrush', many: 'thrushes',
           hitR: 0.19, reach: 50, fade: 16, pts: 1, rest: 0.06, upturn: true, gap: [0, 0], bag: { cols: 6, dx: 0.32, dz: 0.55, front: -2.0 } },
};
// Seconds a hunt of this quarry lasts.
export const roundTime = kind => (QUARRY[kind]?.night ? NIGHT.time : GAME_TIME);

// The night hunt. Every designer number for lamping, roosting and flushing lives here.
export const NIGHT = {
  time: 360, dawn: 60,         // s from dusk to first light; no birds come in after the last `dawn` s
  gap: 1.8,                    // m between the hunters at night (they stand together)
  first: 5, arrivals: [12, 22], // s to the first bird, and between birds (sometimes two together)
  // Circling the tree: r radius (m) · alt height above the field (m) · w angular speed (rad/s) · climb: m higher for
  // every shot that frightens it · leaveAfter: frights before it goes · max: s it circles before going anyway.
  circle: { r: [13, 24], alt: [16, 22], w: [0.35, 0.5], climb: 9, leaveAfter: 3, max: 45 },
  inSpeed: 12, outSpeed: 13,   // m/s coming in out of the dark, and going
  // The lamp. angle: rad half-width of the beam · range: m it reaches · cd: candela (three's physical lights) · dazzle:
  // how strongly it lights a point (for finding birds on the ground). The red filter cuts the range and the light.
  flood: { angle: 0.3, range: 50, cd: 2000, dazzle: 1 },
  spot: { angle: 0.1, range: 80, cd: 16000, dazzle: 2 },
  red: { range: 0.55, cd: 0.4, dazzle: 0.3 },
  battery: 240,                // s of flood the battery holds; the spot drains it spotDrain× faster
  spotDrain: 1.7,
  findR: 60, findT: 1.1,       // a downed bird is found once the lamp has held it this long (s) from within findR m
  pts: 100,                    // team points per bird found
};
// Player settings (menu Settings tab) and their defaults: volume 0–1, look sensitivity ×, field of view in degrees.
export const SETTINGS = { volume: 0.8, sensitivity: 1, fov: 55 };
export const quarryOf = kind => QUARRY[kind] || QUARRY.duck;

// Hunter and shot.
export const EYE = 1.7;                             // m, eye height
export const PITCH_MIN = -1.2, PITCH_MAX = 1.45;    // look down to the birds at your feet, up to almost overhead
export const SHOT_SPEED = 370;                      // m/s
export const SHOT_MAX_RANGE = 75;                   // m, where the column is dropped
export const slotX = (slot, count, gap = 5) => (slot - (count - 1) / 2) * gap; // hunters stand 5 m apart in a row (closer at night)
