# Open Season

A first-person bird-hunting game for the browser: mallards over the marsh, chaffinch flocks over open ground and
thrushes bursting from an olive grove, with a retriever, solo high scores and 2–4 player rooms — and a night hunt
for 2–4: thrushes circling a lone olive at night, seen in projector beams, one hunter on the lamp and the others on the guns.
Three.js for the game, React for the menus and HUD, Firebase for sign-in, leaderboard and rooms.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle in dist/
```

Firebase is optional: without `VITE_FIREBASE_*` values in `.env` the game runs solo and hides sign-in, rooms and the leaderboard.

### Firestore rules

Security rules live in the Firebase console (Firestore › Rules): paste in [`firestore.rules`](firestore.rules), which
covers the leaderboards (`leaderboards/{quarry}/scores/{uid}`) and the rooms (see `src/net/firebase.js`).

Firestore keeps only rooms in use: the last hunter to leave a room deletes it with its players, kills and night
events, and rooms left behind by closed tabs are cleared by the next room opened once untouched for 3 hours. The
leaderboards are kept. The board from before quarry choice (`scores/{uid}`) is no longer read or covered by the rules.

### The night hunt

A night hunt (quarry `night`, map Projector Field) is played in a room of 2–4: in the lobby each hunter takes the lamp
or a gun, and a round needs exactly one lamp. Thrushes come in to the olive in the middle of the field and circle it,
seen only in the projectors' beams and the lamp; every shot sends them higher until they leave, and a bird that is
hit counts once the lamp finds it on the ground. The rules of the night live in `src/game/night.js`; its numbers in
`NIGHT` in `src/config/gameplay.js`. A development build (`npm run dev`) can also start one alone from the Hunt tab
("Test the night"), holding both the lamp and a gun, and exposes `window.__hunt` for tuning from the console.

It adds to the room data (see `src/net/firebase.js`): a `role` on each player, `lamp` (the lamper's uid) on the room,
and `rooms/{code}/rounds/{n}/events/{id}` — shots that frighten the birds, birds the lamp has found, and the callouts
(all covered by `firestore.rules`).

The guns aim by the lamper's beam, so poses at night travel ten times a second over the live channel (below).

### The live channel (Realtime Database)

Where every hunter in a room is looking, and the lamp at night, travel over the **Realtime Database**
(`live/{code}/{uid}`): twice a second by day, ten times at night. It charges by data rather than by write, so it costs
nothing on the free plan, where the same traffic through Firestore uses up its daily write and read quota within a
few hunts. To turn it on: Firebase console › Build › Realtime Database › Create database; copy its URL into `.env`
(and the host's environment variables) as `VITE_FIREBASE_DATABASE_URL`; and paste `database.rules.json` into its
Rules tab. Without it rooms still play, with poses going through Firestore twice a second.

## Layout

Dependencies point down this list only — a module never imports from a layer above it.

| Folder | Owns |
|---|---|
| `src/ui/` | React: `App.jsx` (screen flow, room session, engine ↔ Firestore bridge), `components/` (screens), `hooks/`, `lib/` |
| `src/net/` | Firebase: auth, leaderboard, rooms (the room data model is documented in `firebase.js`) |
| `src/game/` | The rules and the frame loop. `createGame.js` wires the systems and is the only API the UI uses; `spawner`, `flock`, `shotColumn`, `bag`, `inspector`, `featherBursts`, `input` are its systems |
| `src/entities/` | Things in the world — how they are built and how they move: `birds/`, `weapons/`, `retriever/`, `hunters.js` |
| `src/world/` | Terrain height and the static environment (sky, light, grass, trees, grove) |
| `src/audio/` | The soundscape: recorded calls and shots, synthesis fallbacks, outdoor reverb, HRTF |
| `src/core/` | Engine-agnostic helpers: math and the seeded RNG, shared meshes, canvas textures, glTF loading |
| `src/config/` | Tuning (`gameplay.js`: weapons, quarry, timings, distances) and platform detection |
| `src/assets/` | Only what ships: `audio/`, `images/`, `models/` |
| `art-source/` | Raw recordings, original model downloads and reference photos the shipped assets were made from. Not bundled |

## Rules worth knowing

- **Tuning lives in `config/gameplay.js`.** Systems read it; they don't hard-code designer numbers.
- **Rooms are deterministic.** Every screen flies the same birds from a shared seed. In `game/spawner.js` the order of
  `R()` calls is part of the protocol; cosmetic randomness uses `rnd()` (`Math.random`). Anything that changes a live
  bird's path (like the flare at a shot) is solo-only.
- **Loaded models degrade gracefully.** Every glTF has a procedural stand-in that is used until it loads, or if it
  fails (`core/gltf.js` resolves to `null` rather than throwing).
- **Systems are factories** (`createX(scene, …)` returning a small object) holding their own state; `createGame` owns
  the shared round state and passes in only what each system needs.

## Credits

3D models from Sketchfab, all CC BY 4.0: “Dead Chaffinch” by b-unicycling, “Swainson's Thrush - in Flight” by
osuecampus, “Realistic Mallard Duck” by 3Dima, “Labrador Dog” by kenchoo, “low poly shotgun” by leoxx300, and “Low-Poly CZ Drake” by TastyTony.
Credited in the game's menu too.
