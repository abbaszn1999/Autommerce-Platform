// Something an agent or a plan step changed in a connected account (applied,
// or undone). Pages that show that account listen and load it again, so the
// numbers on screen never lag behind what was just approved.

type Listener = () => void;
const listeners = new Set<Listener>();

export function onAccountChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function signalAccountChanged(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      // One page failing to reload never stops the others.
    }
  }
}
