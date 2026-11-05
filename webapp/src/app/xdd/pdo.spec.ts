import { describe, expect, it } from 'vitest';
import { bitLength, createEntry, createEmptyDocument } from '../model/device';
import {
  addMapping,
  addPdo,
  checkMappingObject,
  commitPdoDraft,
  createPdoDraft,
  byteMappingBits,
  fitMappingBits,
  insertMapping,
  isBitwiseMapping,
  isMappingEntryCounted,
  isMappingObject,
  mappableEntries,
  mappingTargetLabel,
  movePdo,
  pdoDraftChanged,
  pdoSlots,
  removeMapping,
  sameMappingTarget,
  setBitwiseMapping,
  setMappingEntry,
  setPdoField,
} from './pdo';

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

  it('names the mapped object with mapping sub-index, index and sub-index', () => {
    expect(mappingTargetLabel(document, 1, '0x21000001')).toBe('1 - 0x2100/00/Temperatur');
    expect(mappingTargetLabel(document, 2, '0x20010210')).toBe('2 - 0x2001/02/Eingang 2');
    expect(mappingTargetLabel(document, 12, '0x00050008')).toBe('12 - 0x0005/00/Dummy UInt8');
  });

  it('keeps labels unique when the same object is mapped twice', () => {
    expect(mappingTargetLabel(document, 1, '0x00050008')).not.toBe(mappingTargetLabel(document, 2, '0x00050008'));
  });

  it('leaves empty or non-static entries unlabeled', () => {
    expect(mappingTargetLabel(document, 1, '0x00000000')).toBeNull();
    expect(mappingTargetLabel(document, 1, '$NODEID+1')).toBeNull();
  });

  it('renames mapping sub-objects after their mapped object', () => {
    const project = createEmptyDocument();
    project.objects.push(createEntry({ index: 0x2100, name: 'Temperatur', objectType: 'VAR', dataType: 'BOOLEAN', pdoMapping: 'optional' }));
    addPdo(project, 'tx');
    const map = project.objects.find((object) => object.index === 0x1a00)!;
    map.subObjects.push(createEntry({ index: 0x1a00, subIndex: 2, name: 'Application object 2', defaultValue: '0x00000000' }));
    addMapping(project, 'tx', 0);
    setMappingEntry(project, 'tx', 0, 1, 0x2100, 0, 1);

    expect(map.subObjects.find((sub) => sub.subIndex === 1)?.name).toBe('1 - 0x2100/00/Temperatur');
    expect(map.subObjects.find((sub) => sub.subIndex === 2)?.name).toBe('Application object 2');
  });

  it('keeps an edited name until the mapped object changes', () => {
    const project = createEmptyDocument();
    project.objects.push(
      createEntry({ index: 0x2100, name: 'Temperatur', objectType: 'VAR', dataType: 'UNSIGNED8', pdoMapping: 'optional' }),
      createEntry({ index: 0x2200, name: 'Druck', objectType: 'VAR', dataType: 'UNSIGNED8', pdoMapping: 'optional' }),
    );
    addPdo(project, 'tx');
    addMapping(project, 'tx', 0);
    setMappingEntry(project, 'tx', 0, 1, 0x2100, 0, 8);
    const sub = project.objects.find((object) => object.index === 0x1a00)!.subObjects.find((entry) => entry.subIndex === 1)!;
    sub.name = 'Sensor';

    setMappingEntry(project, 'tx', 0, 1, 0x2100, 0, 4);
    expect(sub.name).toBe('Sensor');
    setMappingEntry(project, 'tx', 0, 1, 0x2200, 0, 8);
    expect(sub.name).toBe('1 - 0x2200/00/Druck');
  });

  it('compares mapping values by object only', () => {
    expect(sameMappingTarget('0x21000008', '0x21000004')).toBe(true);
    expect(sameMappingTarget('0x21000008', '0x21010008')).toBe(false);
  });

  it('recognises the RPDO and TPDO mapping ranges', () => {
    expect(isMappingObject(0x1600)).toBe(true);
    expect(isMappingObject(0x1bff)).toBe(true);
    expect(isMappingObject(0x1800)).toBe(false);
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

    expect(mappableEntries(document)[6]).toMatchObject({ index: 0x2000, bits: 32 });
  });

  it('starts with the dummy objects for every direction', () => {
    const document = createEmptyDocument();
    for (const direction of [undefined, 'rx', 'tx'] as const) {
      expect(mappableEntries(document, direction).map((entry) => [entry.index, entry.subIndex, entry.name, entry.bits]))
        .toEqual([
          [0x0002, 0, 'Dummy Int8', 8],
          [0x0003, 0, 'Dummy Int16', 16],
          [0x0004, 0, 'Dummy Int32', 32],
          [0x0005, 0, 'Dummy UInt8', 8],
          [0x0006, 0, 'Dummy UInt16', 16],
          [0x0007, 0, 'Dummy UInt32', 32],
        ]);
    }
  });
});

describe('PDO settings', () => {
  function project() {
    const document = createEmptyDocument();
    document.objects.push(
      createEntry({ index: 0x2100, name: 'Flag', objectType: 'VAR', dataType: 'BOOLEAN', pdoMapping: 'optional' }),
      createEntry({ index: 0x2200, name: 'Wert', objectType: 'VAR', dataType: 'INTEGER16', pdoMapping: 'optional' }),
    );
    addPdo(document, 'rx');
    return document;
  }

  it('rounds widths up to whole bytes without bitwise mapping', () => {
    expect(byteMappingBits(1)).toBe(8);
    expect(byteMappingBits(0)).toBe(8);
    expect(byteMappingBits(12)).toBe(16);
    expect(byteMappingBits(24)).toBe(24);
    expect(byteMappingBits(80)).toBe(64);
  });

  it('switches to whole bytes when bitwise mapping is turned off', () => {
    const document = project();
    addMapping(document, 'rx', 0);
    addMapping(document, 'rx', 0);
    setMappingEntry(document, 'rx', 0, 1, 0x2100, 0, 1);
    setMappingEntry(document, 'rx', 0, 2, 0x2200, 0, 5);
    expect(isBitwiseMapping(document, pdoSlots(document, 'rx')[0])).toBe(true);

    expect(setBitwiseMapping(document, 'rx', 0, false)).toBeNull();
    const slot = pdoSlots(document, 'rx')[0];
    expect(isBitwiseMapping(document, slot)).toBe(false);
    expect(slot.mappings.map((row) => row.bits)).toEqual([8, 16]);

    expect(setBitwiseMapping(document, 'rx', 0, true)).toBeNull();
    expect(pdoSlots(document, 'rx')[0].mappings.map((row) => row.bits)).toEqual([1, 16]);
  });

  it('moves communication and mapping objects together', () => {
    const document = project();
    expect(movePdo(document, 'rx', 0, 0x1405)).toBeNull();
    expect(document.objects.map((object) => object.index)).toEqual(expect.arrayContaining([0x1405, 0x1605]));
    expect(document.objects.some((object) => object.index === 0x1400 || object.index === 0x1600)).toBe(false);
    expect(document.objects.find((object) => object.index === 0x1605)!.subObjects.every((sub) => sub.index === 0x1605)).toBe(true);
    expect(movePdo(document, 'rx', 5, 0x1800)).toContain('0x1400');
  });

  it('inserts a mapping entry and moves the following entries up', () => {
    const document = project();
    addMapping(document, 'rx', 0);
    addMapping(document, 'rx', 0);
    setMappingEntry(document, 'rx', 0, 1, 0x2100, 0, 8);
    setMappingEntry(document, 'rx', 0, 2, 0x2200, 0, 16);

    expect(insertMapping(document, 'rx', 0, 2, '0x00020008')).toBeNull();
    expect(pdoSlots(document, 'rx')[0].mappings.map((row) => row.raw)).toEqual(['0x21000008', '0x00020008', '0x22000010']);
    const map = document.objects.find((object) => object.index === 0x1600)!;
    expect(map.subObjects.find((sub) => sub.subIndex === 0)?.defaultValue).toBe('3');
    expect(map.subObjects.find((sub) => sub.subIndex === 2)?.name).toBe('2 - 0x0002/00/Dummy Int8');
    expect(map.subObjects.find((sub) => sub.subIndex === 3)?.name).toBe('3 - 0x2200/00/Wert');

    map.subObjects.find((sub) => sub.subIndex === 3)!.name = 'Sollwert';
    removeMapping(document, 'rx', 0, 1);
    expect(map.subObjects.find((sub) => sub.subIndex === 1)?.name).toBe('1 - 0x0002/00/Dummy Int8');
    expect(map.subObjects.find((sub) => sub.subIndex === 2)?.name).toBe('Sollwert');
  });

  it('adds a missing event timer to an RPDO', () => {
    const document = project();
    const comm = document.objects.find((object) => object.index === 0x1400)!;
    comm.subObjects = comm.subObjects.filter((sub) => sub.subIndex < 3);
    comm.subObjects[0].defaultValue = '2';
    setPdoField(document, 'rx', 0, 'eventTimer', '100');
    expect(pdoSlots(document, 'rx')[0].eventTimer).toBe('100');
    expect(comm.subObjects[0].defaultValue).toBe('5');
  });
});

describe('PDO draft', () => {
  function project() {
    const document = createEmptyDocument();
    document.objects.push(createEntry({ index: 0x2100, name: 'Flag', objectType: 'VAR', dataType: 'BOOLEAN', pdoMapping: 'optional' }));
    addPdo(document, 'rx');
    return document;
  }

  it('keeps the document unchanged until the draft is committed', () => {
    const document = project();
    const draft = createPdoDraft(document, 'rx', 0);
    expect(pdoDraftChanged(document, draft)).toBe(false);

    addMapping(draft.document, 'rx', 0);
    setMappingEntry(draft.document, 'rx', 0, 1, 0x2100, 0, 1);
    setBitwiseMapping(draft.document, 'rx', 0, true);
    setPdoField(draft.document, 'rx', 0, 'eventTimer', '250');
    expect(pdoDraftChanged(document, draft)).toBe(true);
    expect(pdoSlots(document, 'rx')[0].mappings).toEqual([]);
    expect(pdoSlots(document, 'rx')[0].eventTimer).toBe('0');

    expect(commitPdoDraft(document, draft)).toBeNull();
    const slot = pdoSlots(document, 'rx')[0];
    expect(slot.mappings.map((row) => row.raw)).toEqual(['0x21000001']);
    expect(slot.eventTimer).toBe('250');
    expect(isBitwiseMapping(document, slot)).toBe(true);
  });

  it('commits a moved PDO to its new index', () => {
    const document = project();
    const draft = createPdoDraft(document, 'rx', 0);
    movePdo(draft.document, 'rx', 0, 0x1405);
    draft.commIndex = 0x1405;
    expect(pdoSlots(document, 'rx').map((slot) => slot.commIndex)).toEqual([0x1400]);

    expect(commitPdoDraft(document, draft)).toBeNull();
    expect(pdoSlots(document, 'rx').map((slot) => [slot.commIndex, slot.mapIndex])).toEqual([[0x1405, 0x1605]]);
  });
});

describe('checkMappingObject', () => {
  function project() {
    const document = createEmptyDocument();
    document.objects.push(
      createEntry({ index: 0x2100, name: 'Wert', objectType: 'VAR', dataType: 'UNSIGNED32', pdoMapping: 'optional' }),
      createEntry({ index: 0x2101, name: 'Flag', objectType: 'VAR', dataType: 'BOOLEAN', pdoMapping: 'optional' }),
    );
    addPdo(document, 'tx');
    addMapping(document, 'tx', 0);
    addMapping(document, 'tx', 0);
    setMappingEntry(document, 'tx', 0, 1, 0x2100, 0, 32);
    setMappingEntry(document, 'tx', 0, 2, 0x2100, 0, 32);
    return { document, map: document.objects.find((object) => object.index === 0x1a00)! };
  }

  it('accepts a consistent mapping', () => {
    const { document, map } = project();
    expect(checkMappingObject(document, map, 2, '0x21010001')).toBeNull();
  });

  it('rejects entries that do not fit into the PDO or the datatype', () => {
    const { document, map } = project();
    expect(checkMappingObject(document, map, 2, '0x21000028')).toContain('exceed the width');
    map.subObjects.find((sub) => sub.subIndex === 2)!.defaultValue = '0x21010001';
    expect(checkMappingObject(document, map, 2, '0x21000020')).toBeNull();
    addMapping(document, 'tx', 0);
    setMappingEntry(document, 'tx', 0, 3, 0x2100, 0, 32);
    expect(checkMappingObject(document, map, 2, '0x21000020')).toContain('at most 64 bits');
  });

  it('rejects missing objects, invalid values and a wrong count', () => {
    const { document, map } = project();
    expect(checkMappingObject(document, map, 2, '0x30000008')).toContain('does not exist');
    expect(checkMappingObject(document, map, 2, 'xyz')).toContain('not a valid');
    expect(checkMappingObject(document, map, 0, '5')).toContain('does not exist');
  });

  it('requires whole bytes when bitwise mapping is off', () => {
    const { document, map } = project();
    setBitwiseMapping(document, 'tx', 0, false);
    expect(checkMappingObject(document, map, 2, '0x21010001')).toContain('whole bytes');
  });
});

describe('isMappingEntryCounted', () => {
  it('counts only the entries up to sub-index 0x00', () => {
    const document = createEmptyDocument();
    addPdo(document, 'tx');
    addMapping(document, 'tx', 0);
    const map = document.objects.find((object) => object.index === 0x1a00)!;
    map.subObjects.push(createEntry({ index: 0x1a00, subIndex: 2, name: 'Application object 2', defaultValue: '0x00000000' }));
    expect([0, 1, 2].map((subIndex) => isMappingEntryCounted(map, subIndex))).toEqual([false, true, false]);
  });
});
