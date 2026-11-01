/**
 * Holder for the single active SessionRuntime, shared between the React
 * session page and the game-engine bridge plugin. The runtime itself is
 * framework independent; this is only the hand-off point.
 */
import { SessionRuntime } from '../runtime/runtime';

type Listener = (rt: SessionRuntime | null) => void;

let current: SessionRuntime | null = null;
const listeners = new Set<Listener>();

export const activeSession = {
  get(): SessionRuntime | null {
    return current;
  },
  set(rt: SessionRuntime | null) {
    current = rt;
    listeners.forEach(l => l(rt));
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
