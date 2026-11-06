import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createEmptyDocument, createEntry, findObject, hex4 } from '../model/device';
import { addMapping, addPdo, pdoSlots, setMappingEntry, setPdoField } from './pdo';
import { XddFormatError, parseXdd, writeXdd } from './xdd-codec';

const minimal = readFileSync(resolve(process.cwd(), '../Tests/minimal_project.xdd'), 'utf8');

describe('parseXdd', () => {
  it('reads the CANopenEditor minimal XDD 1.1 project', () => {
    const document = parseXdd(minimal);

    expect(document.schemaVersion).toBe('1.1');
    expect(document.productName).toBe('minimal_test');
    expect(document.fileName).toBe('minimal_project.xdd');
    expect(document.fileVersion).toBe('1');
    expect(document.fileCreationDate).toBe('2024-07-22');
    expect(document.granularity).toBe(8);
    expect(document.baudRates.b250).toBe(false);
    expect(document.objects).toHaveLength(10);

    const errorRegister = findObject(document, 0x1001);
    expect(errorRegister).toMatchObject({
      name: 'Error register',
      objectType: 'VAR',
      dataType: 'UNSIGNED8',
      access: 'read',
      pdoMapping: 'TPDO',
      defaultValue: '0x00',
      countLabel: 'EM',
    });
    expect(errorRegister?.description).toContain('generic error');

    const errors = findObject(document, 0x1003);
    expect(errors?.objectType).toBe('ARRAY');
    expect(errors?.dataType).toBe('UNSIGNED32');
    expect(errors?.subObjects).toHaveLength(17);
    expect(errors?.subObjects[0]).toMatchObject({
      subIndex: 0,
      name: 'Number of errors',
      dataType: 'UNSIGNED8',
      access: 'readWrite',
    });
    expect(errors?.subObjects.find((sub) => sub.subIndex === 0x0a)?.name).toBe('Standard error field');

    const emcy = findObject(document, 0x1014);
    expect(emcy).toMatchObject({
      defaultValue: '$NODEID+0x80',
      countLabel: 'EM_PROD',
      storageGroup: 'PERSIST_COMM',
      dataType: 'UNSIGNED32',
    });

    const behavior = findObject(document, 0x1029);
    expect(behavior?.disabled).toBe(true);
    expect(behavior?.storageGroup).toBe('PERSIST_COMM');
    expect(behavior?.subObjects).toHaveLength(3);
  });

  it('reads an XDD 1.0 description from network-object attributes', () => {
    const document = parseXdd(`<?xml version="1.0"?>
      <ISO15745ProfileContainer xmlns="http://www.canopen.org/xml/1.0">
        <ISO15745Profile>
          <ProfileHeader>
            <ProfileClassID>Device</ProfileClassID>
          </ProfileHeader>
          <ProfileBody fileName="legacy.xdd" fileCreator="Ada" fileVersion="3">
            <DeviceIdentity>
              <vendorName>Acme</vendorName>
              <productName>Legacy</productName>
              <version versionType="SW">1.2</version>
            </DeviceIdentity>
          </ProfileBody>
        </ISO15745Profile>
        <ISO15745Profile>
          <ProfileHeader>
            <ProfileClassID>CommunicationNetwork</ProfileClassID>
          </ProfileHeader>
          <ProfileBody>
            <ApplicationLayers>
              <CANopenObjectList>
                <CANopenObject index="2000" name="Speed" objectType="7" dataType="0007" accessType="rw" PDOmapping="TPDO" defaultValue="5" lowLimit="0" highLimit="9" />
              </CANopenObjectList>
            </ApplicationLayers>
            <TransportLayers>
              <PhysicalLayer>
                <baudRate>
                  <supportedBaudRate value="250 Kbps" />
                </baudRate>
              </PhysicalLayer>
            </TransportLayers>
            <NetworkManagement>
              <CANopenGeneralFeatures granularity="8" nrOfRxPDO="2" bootUpSlave="true" />
              <CANopenMasterFeatures bootUpMaster="true" />
            </NetworkManagement>
          </ProfileBody>
        </ISO15745Profile>
      </ISO15745ProfileContainer>`);

    expect(document.schemaVersion).toBe('1.0');
    expect(document.productName).toBe('Legacy');
    expect(document.vendorName).toBe('Acme');
    expect(document.versionSw).toBe('1.2');
    expect(document.fileCreator).toBe('Ada');
    expect(document.baudRates.b250).toBe(true);
    expect(document.nrOfRxPdo).toBe(2);
    expect(document.bootUpSlave).toBe(true);
    expect(document.bootUpMaster).toBe(true);
    expect(findObject(document, 0x2000)).toMatchObject({
      name: 'Speed',
      dataType: 'UNSIGNED32',
      access: 'readWriteInput',
      pdoMapping: 'TPDO',
      defaultValue: '5',
      lowLimit: '0',
      highLimit: '9',
    });
  });

  it('rejects EDS text and documents that are not XDD', () => {
    expect(() => parseXdd('[FileInfo]\nFileName=demo.eds\n')).toThrow(XddFormatError);
    expect(() => parseXdd('[FileInfo]\nFileName=demo.eds\n')).toThrow(/Only XDD/);
    expect(() => parseXdd('<Device/>')).toThrow(/ISO15745ProfileContainer/);
    expect(() => parseXdd('<not-xml')).toThrow(/valid XML/);
  });
});

describe('writeXdd', () => {
  it('round-trips the minimal project and keeps edited values', () => {
    const document = parseXdd(minimal);
    const rewritten = parseXdd(writeXdd(document, new Date('2026-11-03T09:00:00Z')));
    expect(rewritten.schemaVersion).toBe('1.1');
    expect(rewritten.productName).toBe('minimal_test');
    expect(rewritten.fileCreationDate).toBe('2024-07-22');
    expect(rewritten.objects).toHaveLength(10);
    expect(findObject(rewritten, 0x1001)?.description).toContain('generic error');
    expect(findObject(rewritten, 0x1001)?.countLabel).toBe('EM');
    expect(findObject(rewritten, 0x1003)?.subObjects).toHaveLength(17);
    expect(findObject(rewritten, 0x1014)?.defaultValue).toBe('$NODEID+0x80');
    expect(findObject(rewritten, 0x1029)?.disabled).toBe(true);

    document.productName = 'Geändert';
    const errorRegister = findObject(document, 0x1001);
    if (!errorRegister) {
      throw new Error('missing object');
    }
    errorRegister.defaultValue = '0x01';
    const changed = parseXdd(writeXdd(document));
    expect(changed.productName).toBe('Geändert');
    expect(findObject(changed, 0x1001)?.defaultValue).toBe('0x01');
  });

  it('writes only an XDD container for a new device', () => {
    const document = createEmptyDocument();
    document.productName = 'Sensor';
    document.vendorName = 'Firma & Co';
    document.description = 'Zeile 1\nZeile 2';
    document.baudRates.b250 = true;
    document.bootUpSlave = true;
    document.objects.push(createEntry({
      index: 0x2000,
      name: 'Speed <rpm>',
      objectType: 'VAR',
      dataType: 'UNSIGNED32',
      access: 'readWrite',
      pdoMapping: 'optional',
      defaultValue: '5',
      lowLimit: '0',
      highLimit: '100',
      description: 'Drehzahl',
      countLabel: 'TPDO',
      storageGroup: 'PERSIST_APP',
    }));
    const error = addPdo(document, 'rx');
    expect(error).toBeNull();
    setPdoField(document, 'rx', 0, 'cobId', '$NODEID+0x200');
    const mappingError = addMapping(document, 'rx', 0);
    expect(mappingError).toBeNull();
    setMappingEntry(document, 'rx', 0, 1, 0x2000, 0, 32);

    const xml = writeXdd(document, new Date('2026-11-03T10:00:00Z'));
    expect(xml).toContain('xmlns="http://www.canopen.org/xml/1.1"');
    expect(xml).not.toContain('.eds');
    expect(xml).not.toContain('.xdc');
    expect(xml).not.toContain('CanOpenNode');

    const parsed = parseXdd(xml);
    expect(parsed.vendorName).toBe('Firma & Co');
    expect(parsed.description).toBe('Zeile 1\nZeile 2');
    expect(parsed.baudRates.b250).toBe(true);
    expect(parsed.bootUpSlave).toBe(true);
    expect(findObject(parsed, 0x2000)).toMatchObject({
      name: 'Speed <rpm>',
      defaultValue: '5',
      lowLimit: '0',
      highLimit: '100',
      countLabel: 'TPDO',
      storageGroup: 'PERSIST_APP',
      pdoMapping: 'optional',
    });
    const slots = pdoSlots(parsed, 'rx');
    expect(slots).toHaveLength(1);
    expect(slots[0]?.cobId).toBe('$NODEID+0x200');
    expect(slots[0]?.mappings).toHaveLength(1);
    expect(slots[0]?.mappings[0]?.label).toContain('Speed <rpm>');
    expect(hex4(slots[0]?.commIndex ?? 0)).toBe('1400');
  });
});
