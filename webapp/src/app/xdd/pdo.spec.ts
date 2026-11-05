import { describe, expect, it } from 'vitest';
import { bitLength, createEntry, createEmptyDocument } from '../model/device';
import {
  COB_INVALID,
  cobIdIssue,
  parseCobId,
  pdoFieldIssue,
  setCobBits,
  addMapping,
  addPdo,
  checkMappingObject,
  commitPdoDraft,
  createPdoDraft,
  byteMappingBits,
  fitMappingBits,
  granularityMessage,
  insertMapping,
  isBitwiseMapping,
  isMappingEntryCounted,
  isMappingObject,
  mappableEntries,
  mappingGranularityIssues,
  mappingTargetLabel,
  movePdo,
  pdoDraftChanged,
  pdoGranularityIssues,
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
    expect(mappingTargetLabel(document, 3, '0x00010001')).toBe('3 - 0x0001/00/Dummy Bool');
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

    expect(mappableEntries(document)[7]).toMatchObject({ index: 0x2000, bits: 32 });
  });

  it('starts with the dummy objects for every direction', () => {
    const document = createEmptyDocument();
    for (const direction of [undefined, 'rx', 'tx'] as const) {
      expect(mappableEntries(document, direction).map((entry) => [entry.index, entry.subIndex, entry.name, entry.bits]))
        .toEqual([
          [0x0001, 0, 'Dummy Bool', 1],
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

  it('accepts a BOOLEAN with 8 bits unless bitwise mapping is on', () => {
    const { document, map } = project();
    expect(checkMappingObject(document, map, 2, '0x21010008')).toBeNull();
    setBitwiseMapping(document, 'tx', 0, false);
    expect(checkMappingObject(document, map, 2, '0x21010008')).toBeNull();
    expect(checkMappingObject(document, map, 2, '0x21010010')).toContain('exceed the width');
    setBitwiseMapping(document, 'tx', 0, true);
    expect(checkMappingObject(document, map, 2, '0x21010008')).toContain('exceed the width');
  });
});

describe('COB-ID', () => {
  it('parses $NODEID before or after the number', () => {
    expect(parseCobId('$NODEID+0x80000500')).toEqual({ value: 0x80000500, before: '$NODEID+', after: '', digits: 8 });
    expect(parseCobId('0x40000180+$NODEID')).toEqual({ value: 0x40000180, before: '', after: '+$NODEID', digits: 8 });
    expect(parseCobId('384')?.value).toBe(0x180);
    expect(parseCobId('$NODEID+0x180+$NODEID')).toBeNull();
    expect(parseCobId('abc')).toBeNull();
  });

  it('sets only bit 31 for Invalid and keeps CAN-ID and $NODEID', () => {
    expect(setCobBits('0x40000180+$NODEID', COB_INVALID, true)).toBe('0xC0000180+$NODEID');
    expect(setCobBits('$NODEID+0x80000500', COB_INVALID, false)).toBe('$NODEID+0x00000500');
    expect(setCobBits('$NODEID+0x180', COB_INVALID, true)).toBe('$NODEID+0x80000180');
    expect(setCobBits('0x180', COB_INVALID, false)).toBe('0x180');
    expect(setCobBits('abc', COB_INVALID, true)).toBeNull();
  });

  it('checks the reserved bits of RPDO and TPDO', () => {
    expect(cobIdIssue('$NODEID+0x80000200', 'rx')).toBeNull();
    expect(cobIdIssue('0x40000200', 'rx')).toContain('bits 11-30');
    expect(cobIdIssue('$NODEID+0xC0000180', 'tx')).toBeNull();
    expect(cobIdIssue('0x20000180', 'tx')).toContain('bits 11-29');
    expect(cobIdIssue('0x800', 'tx')).toContain('bits 11-29');
    expect(cobIdIssue('xyz', 'tx')).toContain('no valid COB-ID');
  });
});

describe('pdoFieldIssue', () => {
  it('follows the ranges of the DS301 profile', () => {
    expect(pdoFieldIssue('transmission', '240')).toBeNull();
    expect(pdoFieldIssue('transmission', '254')).toBeNull();
    expect(pdoFieldIssue('transmission', '241')).toContain('not used');
    expect(pdoFieldIssue('transmission', '256')).toContain('0 to 255');
    expect(pdoFieldIssue('syncStart', '240')).toBeNull();
    expect(pdoFieldIssue('syncStart', '241')).toContain('0 to 240');
    expect(pdoFieldIssue('inhibit', '0x10')).toBeNull();
    expect(pdoFieldIssue('eventTimer', '65536')).toContain('0 to 65535');
    expect(pdoFieldIssue('eventTimer', '')).toContain('0 to 65535');
  });
});

describe('addPdo', () => {
  it('creates the communication objects like DS301_profile.xpd', () => {
    const document = createEmptyDocument();
    addPdo(document, 'rx');
    addPdo(document, 'tx');
    const rx = document.objects.find((object) => object.index === 0x1400)!;
    const tx = document.objects.find((object) => object.index === 0x1800)!;
    expect(rx.subObjects.map((sub) => sub.subIndex)).toEqual([0, 1, 2, 5]);
    expect(rx.subObjects[1].name).toBe('COB-ID used by RPDO');
    expect(rx.subObjects[1].defaultValue).toBe('$NODEID+0x200');
    expect(tx.subObjects.map((sub) => sub.subIndex)).toEqual([0, 1, 2, 3, 5, 6]);
    expect(tx.subObjects[1].defaultValue).toBe('$NODEID+0x40000180');
    expect(tx.subObjects[0].defaultValue).toBe('0x06');
  });
});

describe('pdoSlots', () => {
  it('skips disabled communication objects like the desktop editor', () => {
    const document = createEmptyDocument();
    addPdo(document, 'tx');
    addPdo(document, 'tx');
    document.objects.find((object) => object.index === 0x1801)!.disabled = true;
    expect(pdoSlots(document, 'tx').map((slot) => slot.commIndex)).toEqual([0x1800]);
    expect(addPdo(document, 'tx')).toBeNull();
    expect(pdoSlots(document, 'tx').map((slot) => slot.commIndex)).toEqual([0x1800, 0x1802]);
    expect(document.nrOfTxPdo).toBe(2);
  });
});

describe('mappingGranularityIssues', () => {
  /** TPDO 0x1800 with the given entries as [index, bits]. */
  function project(granularity: number, entries: [number, number][]) {
    const document = createEmptyDocument();
    document.granularity = granularity;
    document.objects.push(
      createEntry({ index: 0x2100, name: 'Value', objectType: 'VAR', dataType: 'UNSIGNED32', pdoMapping: 'optional' }),
      createEntry({ index: 0x2101, name: 'Flag', objectType: 'VAR', dataType: 'BOOLEAN', pdoMapping: 'optional' }),
      createEntry({ index: 0x2102, name: 'Level', objectType: 'VAR', dataType: 'UNSIGNED8', pdoMapping: 'optional' }),
      createEntry({ index: 0x2103, name: 'Word', objectType: 'VAR', dataType: 'UNSIGNED16', pdoMapping: 'optional' }),
    );
    addPdo(document, 'tx');
    entries.forEach(([index, bits], i) => {
      addMapping(document, 'tx', 0);
      setMappingEntry(document, 'tx', 0, i + 1, index, 0, bits);
    });
    return { document, map: document.objects.find((object) => object.index === 0x1a00)! };
  }

  it('accepts objects that fit exactly into one byte', () => {
    const { document } = project(8, [[0x2101, 1], [0x2101, 1], [0x2101, 1], [0x2102, 5]]);
    expect(pdoGranularityIssues(document)).toEqual([]);
  });

  it('lists objects that cross a byte boundary', () => {
    const { document } = project(8, [[0x2101, 1], [0x2101, 1], [0x2101, 1], [0x2101, 1], [0x2102, 5]]);
    expect(pdoGranularityIssues(document)).toEqual([
      'TPDO 0x1800 entry 5: 0x2102/00 Level (5 bits, bit 4-8)',
      'TPDO 0x1800: byte 1 is not filled up (1 of 8 bits used)',
    ]);
    const message = granularityMessage(8, pdoGranularityIssues(document), 'Save anyway?');
    expect(message.text).toContain('granularity of 8 bits');
    expect(message.items).toEqual(pdoGranularityIssues(document));
    expect(message.footer).toBe('Save anyway?');
  });

  it('accepts objects that start and end on unit boundaries', () => {
    expect(pdoGranularityIssues(project(8, [[0x2100, 32], [0x2103, 16], [0x2102, 8]]).document)).toEqual([]);
    expect(pdoGranularityIssues(project(16, [[0x2102, 8], [0x2102, 8], [0x2100, 32]]).document)).toEqual([]);
    expect(pdoGranularityIssues(project(1, [[0x2101, 1], [0x2103, 16], [0x0005, 7]]).document)).toEqual([]);
    expect(pdoGranularityIssues(project(8, [[0x2101, 1], [0x2103, 16], [0x0005, 7]]).document))
      .toEqual(['TPDO 0x1800 entry 2: 0x2103/00 Word (16 bits, bit 1-16)']);
    expect(pdoGranularityIssues(project(8, [[0x2103, 12]]).document)).toEqual([
      'TPDO 0x1800 entry 1: 0x2103/00 Word (12 bits, bit 0-11)',
      'TPDO 0x1800: byte 1 is not filled up (4 of 8 bits used)',
    ]);
  });

  it('accepts dummy objects that fill up to the granularity boundary', () => {
    expect(pdoGranularityIssues(project(8, [[0x2101, 1], [0x0006, 15]]).document)).toEqual([]);
    expect(pdoGranularityIssues(project(8, [[0x2101, 1], [0x0006, 14]]).document)).toEqual([
      'TPDO 0x1800 entry 2: 0x0006/00 Dummy UInt16 (14 bits, bit 1-14)',
      'TPDO 0x1800: byte 1 is not filled up (7 of 8 bits used)',
    ]);
  });

  it('warns about a byte that is not filled up, whatever the granularity', () => {
    for (const granularity of [0, 1, 8]) {
      expect(pdoGranularityIssues(project(granularity, [[0x2101, 1], [0x2101, 1], [0x2101, 1]]).document))
        .toEqual(['TPDO 0x1800: byte 0 is not filled up (3 of 8 bits used)']);
      expect(pdoGranularityIssues(project(granularity, [[0x2101, 1], [0x2101, 1], [0x2101, 1], [0x0001, 1], [0x2102, 4]]).document))
        .toEqual([]);
    }
    expect(pdoGranularityIssues(project(8, []).document)).toEqual([]);
  });

  it('checks unsaved values and ignores entries beyond the count of sub-index 0x00', () => {
    const { document, map } = project(8, [[0x2102, 8], [0x2103, 12]]);
    expect(mappingGranularityIssues(document, map)).toHaveLength(2);
    expect(mappingGranularityIssues(document, map, (sub) => sub.subIndex === 2 ? '0x21030010' : sub.defaultValue)).toEqual([]);
    expect(mappingGranularityIssues(document, map, (sub) => sub.subIndex === 0 ? '1' : sub.defaultValue)).toEqual([]);
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
