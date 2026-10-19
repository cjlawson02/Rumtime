/** Thin wrappers so browser tests can mock navigation without redefining window.location. */
export function assignLocation(url: string): void {
  window.location.assign(url);
}

export function reloadLocation(): void {
  window.location.reload();
}
