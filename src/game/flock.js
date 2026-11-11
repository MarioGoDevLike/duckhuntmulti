// Every bird in the scene, alive or down, with the id it is known by across a room's screens.
export function createFlock(scene) {
  const birds = [], drakeOf = new Map(); // drakeOf: id → drake?, kept after the bird is gone, for laying out the bag
  let nextId = 0;
  const remove = i => { scene.remove(birds[i].g); birds.splice(i, 1); };
  return {
    birds, drakeOf,
    // lag: seconds the flight is late (a hidden tab), so it appears where it would be by now.
    add(d, state, drake, lag) {
      Object.assign(d, { id: nextId++ }, state);
      d.g.position.addScaledVector(d.vel, lag); drakeOf.set(d.id, drake);
      scene.add(d.g); birds.push(d);
      return d;
    },
    remove,
    removeWhere(pred) { for (let i = birds.length - 1; i >= 0; i--) if (pred(birds[i])) remove(i); },
    clear() { birds.forEach(d => scene.remove(d.g)); birds.length = 0; },
    // A new round: ids restart at 0 so they match on every screen in a room.
    reset() { this.clear(); drakeOf.clear(); nextId = 0; },
  };
}
