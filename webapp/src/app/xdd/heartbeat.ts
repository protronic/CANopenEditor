import { DeviceDocument, findObject } from '../model/device';

export const CONSUMER_HEARTBEAT = 0x1016;

function parseNumber(text: string): number {
  return /^0x/i.test(text) ? Number.parseInt(text, 16) : /^\d+$/.test(text) ? Number(text) : Number.NaN;
}

/**
 * Number of used entries of 0x1016 Consumer heartbeat time: entries counted by sub-index 0x00 whose
 * node ID (bits 16..23) and heartbeat time (bits 0..15) are both set. Values that are no plain
 * number (e.g. $NODEID expressions) count as used.
 */
export function usedHeartbeatConsumers(document: DeviceDocument): number {
  const object = findObject(document, CONSUMER_HEARTBEAT);
  if (!object) {
    return 0;
  }
  const countText = object.subObjects.find((sub) => sub.subIndex === 0)?.defaultValue.trim() ?? '';
  const count = countText ? parseNumber(countText) : Number.POSITIVE_INFINITY;
  return object.subObjects.filter((sub) => {
    const text = sub.defaultValue.trim();
    if (sub.subIndex < 1 || !(sub.subIndex <= count) || !text) {
      return false;
    }
    const value = parseNumber(text);
    if (!Number.isFinite(value)) {
      return true;
    }
    const nodeId = Math.floor(value / 0x10000) & 0xff;
    return nodeId > 0 && (value & 0xffff) > 0;
  }).length;
}

const lastUsed = new WeakMap<DeviceDocument, number>();

/** Remembers the current number of used 0x1016 entries without changing the document. */
export function trackHeartbeatConsumers(document: DeviceDocument): void {
  lastUsed.set(document, usedHeartbeatConsumers(document));
}

/**
 * Raises "No of monitored nodes" when the number of used 0x1016 entries grew beyond it. A larger
 * value set by the user is kept. Returns true if the value was changed.
 */
export function syncMonitoredNodes(document: DeviceDocument): boolean {
  const used = usedHeartbeatConsumers(document);
  const previous = lastUsed.get(document) ?? used;
  lastUsed.set(document, used);
  if (used > previous && used > document.nrOfNgMonitoredNodes) {
    document.nrOfNgMonitoredNodes = Math.min(127, used);
    return true;
  }
  return false;
}
