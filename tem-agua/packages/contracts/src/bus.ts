import type { BusEvents } from './types';

type Key = keyof BusEvents;
type Handler<K extends Key> = (payload: BusEvents[K]) => void;

interface BusState {
  target: EventTarget;
  last: Partial<{ [K in Key]: BusEvents[K] }>;
}

// Cada microfrontend empacota sua própria cópia deste módulo, então o estado
// precisa morar no window para que todos compartilhem a mesma instância.
declare global {
  interface Window {
    __TEM_AGUA_BUS__?: BusState;
  }
}

function state(): BusState {
  window.__TEM_AGUA_BUS__ ??= { target: new EventTarget(), last: {} };
  return window.__TEM_AGUA_BUS__;
}

export function emit<K extends Key>(event: K, payload: BusEvents[K]): void {
  const s = state();
  s.last[event] = payload;
  s.target.dispatchEvent(new CustomEvent(event, { detail: payload }));
}

/**
 * Assina um evento. Se o evento já foi emitido antes, o último valor é entregue
 * imediatamente (replay), assim um microfrontend que monta depois não perde o estado.
 */
export function on<K extends Key>(event: K, handler: Handler<K>, { replay = true } = {}): () => void {
  const s = state();
  const listener = (e: Event) => handler((e as CustomEvent<BusEvents[K]>).detail);
  s.target.addEventListener(event, listener);
  if (replay && event in s.last) handler(s.last[event] as BusEvents[K]);
  return () => s.target.removeEventListener(event, listener);
}

export function last<K extends Key>(event: K): BusEvents[K] | undefined {
  return state().last[event] as BusEvents[K] | undefined;
}
