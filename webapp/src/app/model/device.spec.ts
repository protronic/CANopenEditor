import { describe, expect, it } from 'vitest';
import { createEntry, nextFreeIndex } from './device';

const objects = [0x1000, 0x1001, 0x1018, 0x2000, 0x2001, 0x2003, 0x5fff].map((index) => createEntry({ index, name: 'Object' }));

describe('nextFreeIndex', () => {
  it('uses the next free index after the hovered object', () => {
    expect(nextFreeIndex(objects, 'communication', 0x1000)).toBe(0x1002);
    expect(nextFreeIndex(objects, 'manufacturer', 0x2000)).toBe(0x2002);
    expect(nextFreeIndex(objects, 'manufacturer', 0x2003)).toBe(0x2004);
  });

  it('uses the next free index after the last object when no object is hovered', () => {
    expect(nextFreeIndex(objects, 'communication', null)).toBe(0x1019);
  });

  it('starts with the first index of an empty range', () => {
    expect(nextFreeIndex(objects, 'profile', null)).toBe(0x6000);
  });

  it('wraps around to the start of the range', () => {
    expect(nextFreeIndex(objects, 'manufacturer', 0x5fff)).toBe(0x2002);
  });
});
