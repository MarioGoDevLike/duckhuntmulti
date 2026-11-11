// m:ss
export const clock = s => `${s / 60 | 0}:${String(s % 60).padStart(2, '0')}`;
export const capitalize = s => s[0].toUpperCase() + s.slice(1);
