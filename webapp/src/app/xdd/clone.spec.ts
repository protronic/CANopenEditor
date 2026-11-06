import { describe, expect, it } from 'vitest';
import { createEmptyDocument, createEntry } from '../model/device';
import { buildCloneRows, cloneName, cloneObjects } from './clone';

function project() {
  const document = createEmptyDocument();
  document.objects.push(
    createEntry({ index: 0x2011, name: 'CAN State', objectType: 'RECORD', subObjects: [
      createEntry({ index: 0x2011, subIndex: 0, name: 'Highest sub-index supported', dataType: 'UNSIGNED8' }),
    ] }),
    createEntry({ index: 0x2130, name: 'Kbm State', objectType: 'VAR', dataType: 'UNSIGNED8' }),
    createEntry({ index: 0x2131, name: 'Kbm Error', objectType: 'VAR', dataType: 'UNSIGNED8' }),
  );
  return document;
}

describe('clone', () => {
  it('blocks objects whose new index is already used', () => {
    const document = project();
    const rows = buildCloneRows(document.objects, document, [1]);
    expect(rows.map((row) => [row.cells[0].label, row.conflict])).toEqual([
      ['0x2012', false],
      ['0x2131', true],
      ['0x2132', false],
    ]);
  });

  it('accepts negative offsets and flags indexes out of range', () => {
    const document = project();
    const rows = buildCloneRows([document.objects[0]], document, [-0x11, -0x3000]);
    expect(rows[0].cells.map((cell) => [cell.label, cell.conflict])).toEqual([['0x2000', false], ['-4079', true]]);
    expect(rows[0].conflict).toBe(true);
  });

  it('copies objects into another project without overwriting', () => {
    const source = project();
    const target = createEmptyDocument();
    target.objects.push(createEntry({ index: 0x2132, name: 'Belegt', objectType: 'VAR' }));
    const rows = buildCloneRows(source.objects, target, [1]);
    expect(rows.map((row) => row.conflict)).toEqual([false, false, true]);

    expect(cloneObjects(target, rows, [1])).toBe(2);
    expect(target.objects.map((object) => [object.index, object.name])).toEqual([
      [0x2012, 'CAN State'],
      [0x2131, 'Kbm State'],
      [0x2132, 'Belegt'],
    ]);
    expect(target.objects[0].subObjects[0].index).toBe(0x2012);
    expect(source.objects[0].index).toBe(0x2011);
  });

  it('shifts a trailing number in the name by the offset', () => {
    expect(cloneName('Rpdo State Ntch 1', 2)).toBe('Rpdo State Ntch 3');
    expect(cloneName('Kbm State', 1)).toBe('Kbm State');
    expect(cloneName('Value 1', -3)).toBe('Value 1');
  });
});
