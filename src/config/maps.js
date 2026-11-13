// The hunting grounds. Each quarry is hunted on its own map(s); a quarry with more than one lets the hunter choose.
// Scenery, light and terrain are built in world/maps.js; where the birds come from is in game/spawner.js.
export const MAPS = {
  lake: { quarry: 'duck', name: 'Reed Lake', line: 'Dawn flights over open water' },
  oakRide: { quarry: 'thrush', name: 'Oak Wood Ride', line: 'Snap shots across a ride in the woods' },
  pineRidge: { quarry: 'thrush', name: 'Pine Ridge Pass', line: 'Birds climbing out of the valley' },
  clearing: { quarry: 'finch', name: 'Stubble Clearing', line: 'Flocks over open stubble' },
  doveField: { quarry: 'dove', name: 'Sunflower Field', line: 'Pass shooting at the edge of a cut sunflower field' },
  field: { quarry: 'night', name: 'Projector Field', line: 'A lone olive in an open field, projectors lighting the sky' },
};
export const MENU_MAP = 'lake'; // the view behind the menus

export const mapsFor = kind => Object.keys(MAPS).filter(k => MAPS[k].quarry === kind);
// A map for this quarry: the one asked for if it belongs to it, else the quarry's first.
export const mapOf = (id, kind) => (MAPS[id]?.quarry === kind ? id : mapsFor(kind)[0]);
