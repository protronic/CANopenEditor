import { describe, expect, it } from 'vitest';
import { bitLength, createEntry, createEmptyDocument } from '../model/device';
import { emptySpans, fitMappingBits, isMappingObject, mappableEntries, mappingTargetLabel } from './pdo';

describe('mappingTargetLabel', () => {
  const document = createEmptyDocument();
  document.objects.push(
    createEntry({ index: 0x2100, name: 'Temperatur', objectType: 'VAR', dataType: 'BOOLEAN' }),
    createEntry({
      index: 0x2001,
      name: 'Eingang',
      objectType: 'ARRAY',
      subObjects: [createEntry({ index: 0x2001, subIndex: 2, name: 'Eingang 2', dataType: 'INTEGER16' })],
    }),
  );

  it('names the mapped object with index, sub-index and bit width', () => {
    expect(mappingTargetLabel(document, '0x21000001')).toBe('0x2100/00/Temperatur (1)');
    expect(mappingTargetLabel(document, '0x20010210')).toBe('0x2001/02/Eingang 2 (16)');
    expect(mappingTargetLabel(document, '0x00050008')).toBe('0x0005/00/Dummy UInt8 (8)');
  });

  it('leaves empty or non-static entries unlabeled', () => {
    expect(mappingTargetLabel(document, '0x00000000')).toBeNull();
    expect(mappingTargetLabel(document, '$NODEID+1')).toBeNull();
  });

  it('recognises the RPDO and TPDO mapping ranges', () => {
    expect(isMappingObject(0x1600)).toBe(true);
    expect(isMappingObject(0x1bff)).toBe(true);
    expect(isMappingObject(0x1800)).toBe(false);
  });
});

describe('emptySpans', () => {
  it('fills a free PDO with byte-sized cells', () => {
    expect(emptySpans(0)).toEqual([8, 8, 8, 8, 8, 8, 8, 8]);
  });

  it('aligns the first empty cell to the next byte boundary', () => {
    expect(emptySpans(12)).toEqual([4, 8, 8, 8, 8, 8, 8]);
    expect(emptySpans(12).reduce((sum, span) => sum + span, 0)).toBe(52);
  });

  it('returns no cells when the PDO is full', () => {
    expect(emptySpans(64)).toEqual([]);
    expect(emptySpans(80)).toEqual([]);
  });

  it('keeps a trailing partial byte', () => {
    expect(emptySpans(63)).toEqual([1]);
  });
});

describe('fitMappingBits', () => {
  it('uses the datatype width when it fits', () => {
    expect(fitMappingBits(16, 8)).toBe(16);
    expect(fitMappingBits(1, 0)).toBe(1);
  });

  it('caps the width at the remaining capacity', () => {
    expect(fitMappingBits(32, 40)).toBe(24);
    expect(fitMappingBits(32, 64, 8)).toBe(8);
  });

  it('rejects objects that do not fit', () => {
    expect(fitMappingBits(8, 64)).toBe(0);
    expect(fitMappingBits(0, 0)).toBe(0);
  });
});

describe('bitLength', () => {
  it('matches the CANopen widths drawn in the PDO grid', () => {
    expect(bitLength('BOOLEAN')).toBe(1);
    expect(bitLength('UNSIGNED8')).toBe(8);
    expect(bitLength('INTEGER16')).toBe(16);
    expect(bitLength('UNSIGNED32')).toBe(32);
    expect(bitLength('TIME_OF_DAY')).toBe(48);
    expect(bitLength('REAL64')).toBe(64);
    expect(bitLength('DOMAIN')).toBe(0);
  });
});

describe('mappableEntries', () => {
  it('uses the string length as the mapped bit width', () => {
    const document = createEmptyDocument();
    document.objects.push(createEntry({
      index: 0x2000,
      name: 'Name',
      objectType: 'VAR',
      dataType: 'VISIBLE_STRING',
      access: 'read',
      pdoMapping: 'optional',
      defaultValue: 'ABCD',
    }));

    expect(mappableEntries(document)).toMatchObject([{ bits: 32 }]);
  });
});
