import { randomUUID } from 'node:crypto';

export function newCorrelationId(): string {
  return randomUUID();
}

export function newOpaqueId(): string {
  // 128 bits of randomness, URL-safe, non-sequential by construction.
  return randomUUID().replace(/-/g, '');
}
