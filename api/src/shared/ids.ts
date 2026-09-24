import { randomUUID } from 'node:crypto';

export function newCorrelationId(): string {
  return randomUUID();
}

export function newOpaqueId(): string {
  return randomUUID().replace(/-/g, '');
}
