import { describe, expect, it } from 'vitest';
import { createEmptyDocument, createEntry } from '../model/device';
import { syncMonitoredNodes, trackHeartbeatConsumers, usedHeartbeatConsumers } from './heartbeat';

function project(values: string[]) {
  const document = createEmptyDocument();
  document.objects.push(createEntry({
    index: 0x1016,
    name: 'Consumer heartbeat time',
    objectType: 'ARRAY',
    dataType: 'UNSIGNED32',
    subObjects: [
      createEntry({ index: 0x1016, subIndex: 0, dataType: 'UNSIGNED8', defaultValue: String(values.length) }),
      ...values.map((defaultValue, i) => createEntry({ index: 0x1016, subIndex: i + 1, dataType: 'UNSIGNED32', defaultValue })),
    ],
  }));
  return document;
}

describe('usedHeartbeatConsumers', () => {
  it('counts entries with node ID and heartbeat time', () => {
    expect(usedHeartbeatConsumers(project(['0x000501F4', '0x00000000', '0x000601F4', '0x00000600', '', '0x00070000']))).toBe(2);
    expect(usedHeartbeatConsumers(project(['$NODEID+0x01F4']))).toBe(1);
    expect(usedHeartbeatConsumers(createEmptyDocument())).toBe(0);
  });

  it('ignores entries beyond sub-index 0x00', () => {
    const document = project(['0x000501F4', '0x000601F4']);
    document.objects[document.objects.length - 1].subObjects[0].defaultValue = '1';
    expect(usedHeartbeatConsumers(document)).toBe(1);
  });
});

describe('syncMonitoredNodes', () => {
  it('raises the value when new used entries appear and keeps larger values', () => {
    const document = project(['0x000501F4', '']);
    trackHeartbeatConsumers(document);
    expect(syncMonitoredNodes(document)).toBe(false);
    expect(document.nrOfNgMonitoredNodes).toBe(0);
    const heartbeat = document.objects[document.objects.length - 1];
    heartbeat.subObjects[2].defaultValue = '0x000601F4';
    expect(syncMonitoredNodes(document)).toBe(true);
    expect(document.nrOfNgMonitoredNodes).toBe(2);
    document.nrOfNgMonitoredNodes = 1;
    expect(syncMonitoredNodes(document)).toBe(false);
    expect(document.nrOfNgMonitoredNodes).toBe(1);
    document.nrOfNgMonitoredNodes = 5;
    heartbeat.subObjects.push(createEntry({ index: 0x1016, subIndex: 3, defaultValue: '0x000701F4' }));
    heartbeat.subObjects[0].defaultValue = '3';
    expect(syncMonitoredNodes(document)).toBe(false);
    expect(document.nrOfNgMonitoredNodes).toBe(5);
  });
});
