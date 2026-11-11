# Open Season

A first-person bird-hunting game for the browser: mallards over the marsh, chaffinch flocks over open ground and
thrushes bursting from an olive grove, with a retriever, solo high scores and 2–4 player rooms.
Three.js for the game, React for the menus and HUD, Firebase for sign-in, leaderboard and rooms.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production bundle in dist/
```

Firebase is optional: without `VITE_FIREBASE_*` values in `.env` the game runs solo and hides sign-in, rooms and the leaderboard.

### Firestore rules

Each quarry has its own leaderboard at `leaderboards/{quarry}/scores/{uid}` (see `src/net/firebase.js`). Security rules
live in the Firebase console (Firestore › Rules); next to the rooms rules, add:

```
match /leaderboards/{quarry}/scores/{uid} {
  allow read: if request.auth != null;
  allow create, update: if request.auth != null && request.auth.uid == uid
    && quarry in ['duck', 'finch', 'thrush']
    && request.resource.data.keys().hasOnly(['name', 'score', 'ducks', 'updatedAt'])
    && request.resource.data.score is int && request.resource.data.ducks is int;
}
```

The board from before quarry choice (`scores/{uid}`) is no longer read; its rule can go once you no longer need that data.

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
