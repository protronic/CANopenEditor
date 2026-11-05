import { describe, expect, it } from 'vitest';
import { createEntry, dataTypeChoices, nextFreeIndex } from './device';

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

describe('dataTypeChoices', () => {
  const offered = [
    'BOOLEAN', 'INTEGER8', 'INTEGER16', 'INTEGER32', 'INTEGER64', 'UNSIGNED8', 'UNSIGNED16', 'UNSIGNED32',
    'UNSIGNED64', 'REAL32', 'REAL64', 'VISIBLE_STRING', 'OCTET_STRING', 'UNICODE_STRING', 'DOMAIN',
  ];

  it('offers only the basic data types', () => {
    expect(dataTypeChoices('UNSIGNED8')).toEqual(offered);
  });

  it('keeps a different current data type selectable', () => {
    expect(dataTypeChoices('UNSIGNED24')).toEqual(['UNSIGNED24', ...offered]);
  });
});
