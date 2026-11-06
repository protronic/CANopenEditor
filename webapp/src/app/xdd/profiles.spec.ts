import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyDocument, createEntry, findObject } from '../model/device';
import { parseXdd } from './xdd-codec';
import { buildInsertRows, insertSelected, parseOffsets } from './profiles';

const ds301 = parseXdd(readFileSync(resolve(process.cwd(), '../EDSEditorGUI/Profiles/DS301_profile.xpd'), 'utf8'));

describe('profile offsets', () => {
  it('reads a single offset, a hex offset and a range', () => {
    expect(parseOffsets('0')).toEqual([0]);
    expect(parseOffsets('0x10 2')).toEqual([16, 2]);
    expect(parseOffsets('1-3')).toEqual([1, 2, 3]);
    expect(parseOffsets('0x2000-0x2001')).toEqual([0x2000, 0x2001]);
    expect(parseOffsets('')).toBeNull();
    expect(parseOffsets('x')).toBeNull();
  });
});

describe('profile insert', () => {
  it('reads the DS301 profile and inserts objects that are not already present', () => {
    expect(ds301.objects.length).toBeGreaterThan(10);
    const target = createEmptyDocument();
    target.objects.push(createEntry({ index: 0x1000, name: 'Device type' }));
    const rows = buildInsertRows(
      [{ name: 'DS301_profile.xpd', document: ds301 }],
      target,
      [0],
      new Map(),
      true,
    );
    const deviceType = rows.find((row) => row.entry.index === 0x1000);
    expect(deviceType?.selected).toBe(false);
    expect(deviceType?.conflict).toBe(true);
    const inserted = insertSelected(target, rows);
    expect(inserted).toBe(ds301.objects.length - 1);
    expect(findObject(target, 0x1000)?.name).toBe('Device type');
    expect(findObject(target, 0x1018)?.objectType).toBe('RECORD');
    expect(findObject(target, 0x1018)?.subObjects.length).toBeGreaterThan(0);
  });

  it('keeps the second profile from reusing an index taken by the first', () => {
    const first = createEmptyDocument();
    first.objects.push(createEntry({ index: 0x1001, name: 'First' }));
    const second = createEmptyDocument();
    second.objects.push(createEntry({ index: 0x1001, name: 'Second' }));
    const target = createEmptyDocument();
    const rows = buildInsertRows(
      [
        { name: 'a.xpd', document: first },
        { name: 'b.xpd', document: second },
      ],
      target,
      [0],
      new Map(),
      true,
    );
    expect(rows[0]?.selected).toBe(true);
    expect(rows[1]?.selected).toBe(false);
    expect(insertSelected(target, rows)).toBe(1);
    expect(findObject(target, 0x1001)?.name).toBe('First');
  });

  it('overwrites an existing object only when requested', () => {
    const profile = createEmptyDocument();
    profile.objects.push(createEntry({ index: 0x1000, name: 'From profile' }));
    const target = createEmptyDocument();
    target.objects.push(createEntry({ index: 0x1000, name: 'Already there' }));
    const rows = buildInsertRows([{ name: 'a.xpd', document: profile }], target, [0], new Map([['a.xpd:4096', true]]), false);
    expect(rows[0]?.conflict).toBe(true);
    expect(rows[0]?.selected).toBe(true);
    expect(insertSelected(target, rows, false)).toBe(0);
    expect(findObject(target, 0x1000)?.name).toBe('Already there');
    expect(insertSelected(target, rows, true)).toBe(1);
    expect(findObject(target, 0x1000)?.name).toBe('From profile');
  });
});
