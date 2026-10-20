// Minimal event bus shared by game systems.
export class Bus {
  constructor() {
    this.map = new Map();
  }
  on(evt, fn) {
    if (!this.map.has(evt)) this.map.set(evt, new Set());
    this.map.get(evt).add(fn);
    return () => this.off(evt, fn);
  }
  off(evt, fn) {
    this.map.get(evt)?.delete(fn);
  }
  emit(evt, data) {
    const set = this.map.get(evt);
    if (set) for (const fn of [...set]) fn(data);
  }
}
