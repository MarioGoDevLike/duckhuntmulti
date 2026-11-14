// Gameplay tuning: every number a designer would want to tweak lives here, not inside the systems.

export const GAME_TIME = 120; // seconds per hunt (a night hunt runs NIGHT.time)

// Semi-auto: 5 in the tube, loaded one shell at a time. Over-under: two stacked barrels, breaks open and takes a fresh pair.
// interval: s between shots · reload: s per shell (single) or for the pair.
export const WEAPONS = {
  semi: { name: 'Field Semi-Auto', type: 'Semi-auto 12 ga', desc: '5 shells · quick follow-up shots · loads one shell at a time', mag: 5, interval: 0.22, reload: 0.55, single: true },
  double: { name: 'Field Over Under', type: 'Over-under 12 ga', desc: '2 shells · instant second barrel · breaks open and reloads both', mag: 2, interval: 0.12, reload: 1.3, single: false },
};

// Screw-in chokes: how tightly the barrel holds the shot together. spread: × how fast the pattern widens with range ·
// reach: × how far it stays dense enough to kill (the quarry's reach and fade). 2 is the game's original pattern.
// Numbered as on real barrels (the stars stamped on Italian chokes): 1 is the tightest and kills furthest, 3 the most
// open. Tight is small and precise but reaches much further; open is forgiving close and thins out early.
export const CHOKES = {
  1: { name: 'Tight', line: 'Small pattern · long shots', spread: 0.65, reach: 1.2 },
  2: { name: 'Medium', line: 'All-round pattern', spread: 1, reach: 1 },
  3: { name: 'Open', line: 'Wide pattern · close birds', spread: 1.5, reach: 0.8 },
};
// The chokes each gun starts with, one per barrel: the over-under fires its bottom barrel first, then the top.
export const DEFAULT_CHOKES = { semi: ['2'], double: ['2', '2'] };
// A gun's chokes from a saved pick, falling back to its defaults for anything missing or unknown.
export const chokesFor = (weapon, picked) => (DEFAULT_CHOKES[weapon] || DEFAULT_CHOKES.semi).map((d, i) => (CHOKES[picked?.[i]] ? picked[i] : d));

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
  // wave: [period s, depth]: flights come in waves, the gap between them swinging ±depth over each period.
  // limit: the daily bag limit (the hunt goes on, but the hunter is told when it is filled).
  dove: { kind: 'dove', name: 'Mourning Dove', line: 'Fast passes in over a sunflower field', speed: 5, skill: 4,
          desc: 'Pass shooting · 30–40 mph, incoming over the field · flares when it spots you · 15-bird limit', one: 'dove', many: 'doves',
          hitR: 0.27, reach: 52, fade: 17, pts: 1.5, rest: 0.08, upturn: true, gap: [2.4, 5.6], wave: [38, 0.7], limit: 15,
          bag: { cols: 5, dx: 0.42, dz: 0.75, front: -2.0 } },
  // Walked up in the wood: the dog quarters ahead and points; the bird flushes from cover at the dog's nose.
  woodcock: { kind: 'woodcock', name: 'Woodcock', line: 'Flushed from cover over a pointing dog', speed: 4, skill: 5,
              desc: 'Beccaccia · the bell goes quiet, the dog is on point · towers out of cover, zig-zags through the trees · 3-bird limit',
              one: 'woodcock', many: 'woodcock', hitR: 0.21, reach: 42, fade: 14, pts: 3, rest: 0.07, upturn: false, gap: [10, 14], limit: 3,
              bag: { cols: 4, dx: 0.42, dz: 0.7, front: -2.0 } },
  // Night lamping in the olive terraces: rooms only, one hunter holds the lamp and the others shoot (see game/night.js).
  night: { kind: 'night', bird: 'thrush', night: true, roomOnly: true, name: 'Night Thrush', line: 'Thrushes over the projectors, in the lamp', speed: 2, skill: 5,
           desc: 'Dujj at night · one hunter holds the lamp on the bird, the others shoot · 2+ hunters', one: 'thrush', many: 'thrushes',
           hitR: 0.19, reach: 50, fade: 16, pts: 1, rest: 0.06, upturn: true, gap: [0, 0], bag: { cols: 6, dx: 0.32, dz: 0.55, front: -2.0 } },
};
// Seconds a hunt of this quarry lasts.
export const roundTime = kind => (QUARRY[kind]?.night ? NIGHT.time : GAME_TIME);

// The night hunt. Every designer number for lamping, roosting and flushing lives here.
export const NIGHT = {
  time: 300, dawn: 10,         // s from dusk to first light, which comes up over the last `dawn` s (no birds then)
  gap: 1.8,                    // m between the hunters at night (they stand together)
  first: 5, arrivals: [12, 22], // s to the first bird, and between birds (sometimes two together)
  // Circling the tree: r radius (m) · alt height above the field (m) · w angular speed (rad/s) · climb: m higher for
  // every shot that frightens it · leaveAfter: frights before it goes · max: s it circles before going anyway.
  circle: { r: [13, 24], alt: [16, 22], w: [0.35, 0.5], climb: 9, leaveAfter: 3, max: 45 },
  // A held bird following the laser: reach (m from the lamp it keeps to) · floor (m, lowest it comes) · speed (m/s) · turn (how fast it answers).
  laser: { reach: [15, 55], floor: 9, speed: 11, turn: 2.2 },
  holdT: 0.4,                  // s the lamp must stay on a passing bird before it turns to circle the tree
  dark: 0.6,                   // share of the pattern that goes wide at a bird the lamp isn't on
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
// How a mourning dove flies (entities/birds/flight.js, game/spawner.js). Ranges are [min, max], drawn per bird.
export const DOVE = {
  cruise: [13, 17],          // m/s, 29–38 mph; a flared dove puts on `flare.speed` more
  beat: [5.5, 6.5],          // wingbeats a second, steady: a dove flaps nearly all the time
  weave: 0.08,               // rad/s of gentle side-to-side drift about its line
  // Jinks: now and then a swerve, a turn of `yaw` rad (either way) and a drop or lift of `dip` m/s, over `dur` s, every
  // `every` s. Drawn when the bird is spawned (seeded in a room), so every screen sees the same dodges.
  jinks: 8, every: [1.8, 4], yaw: [0.08, 0.35], dur: [0.4, 0.8], dip: [-1.8, 0.8],
  spot: [14, 24],            // m from a hunter at which it sees the line and flares
  flare: { climb: [3, 5], speed: 2.5, yaw: [0.25, 0.6] },
  landGlide: 50,             // m out from where it lands that it sets its wings and glides in
};
// How a woodcock is found and flushes (game/spawner.js, entities/birds/flight.js). Ranges are [min, max], drawn per bird.
export const WOODCOCK = {
  dist: [9, 22],      // m from the hunter where it sits, within `arc` rad either side of where the hunter faces
  arc: 1.1,
  point: [4.5, 6.5],  // s from the dog setting off to the flush: the run in and the point held
  stand: 2.2,         // m the dog stops short of the bird
  tower: [2.5, 4.5],  // m it climbs almost straight up to clear the cover, at `climb` m/s
  climb: 7,
  speed: [9, 12],     // m/s once away, low through the trunks
  zig: [0.35, 0.7],   // s between zig-zags, each a turn of `yaw` rad either way
  yaw: [0.4, 0.9],
  height: [3, 7],     // m it holds once out of the cover, under the canopy
  away: 45,           // m from the hunter at which it is lost in the wood
};
// Player settings (menu Settings tab) and their defaults: volume 0–1, look sensitivity ×, field of view in degrees,
// graphics 'high' | 'low' (low: native-or-less resolution, thinner grass, coarser lamp shadow — for slower PCs),
// shotcam: film from a camera on the barrel (off by default: it draws the scene a second time), shotcamKey: the key that
// saves the last kill's clip (a KeyboardEvent code).
export const SETTINGS = { volume: 0.8, sensitivity: 1, fov: 55, graphics: 'high', shotcam: false, shotcamKey: 'KeyS' };
// Keys the hunt already uses (game/input.js, and the night hunt's in game/createGame.js): not free for the Save clip key.
export const HUNT_KEYS = ['KeyR', 'KeyE', 'KeyP', 'Escape', 'KeyF', 'KeyQ', 'KeyK', 'KeyL', 'Digit1', 'Digit2', 'Digit3', 'Digit4'];
export const quarryOf = kind => QUARRY[kind] || QUARRY.duck;

// Hunter and shot.
export const EYE = 1.7;                             // m, eye height
export const PITCH_MIN = -1.2, PITCH_MAX = 1.45;    // look down to the birds at your feet, up to almost overhead
export const SHOT_SPEED = 370;                      // m/s
export const SHOT_MAX_RANGE = 75;                   // m, where the column is dropped
export const slotX = (slot, count, gap = 5) => (slot - (count - 1) / 2) * gap; // hunters stand 5 m apart in a row (closer at night)
