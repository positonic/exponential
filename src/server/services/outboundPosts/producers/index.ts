/**
 * The producer registry, keyed by kind. Adding a producer is one file plus one line
 * here; nothing in `emit` or `deliver` knows a producer by name.
 *
 * Empty until the decisions producer lands (ticket tiny.olive); the others arrive as
 * they migrate onto the primitive. Tests register their own through `registerProducer`.
 */

import type { OutboundKind, OutboundSubject, Producer } from "../types";

const producers = new Map<OutboundKind, Producer<OutboundSubject>>();

export function registerProducer<S extends OutboundSubject>(producer: Producer<S>): void {
  // A producer's subject is only ever handed back to that same producer, so the
  // widening is safe at the registry boundary.
  producers.set(producer.kind, producer as unknown as Producer<OutboundSubject>);
}

export function getProducer(kind: OutboundKind): Producer<OutboundSubject> | undefined {
  return producers.get(kind);
}

/** Tests only: start from a clean registry. */
export function resetProducersForTests(): void {
  producers.clear();
}
