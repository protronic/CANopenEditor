/*
    CANopen Editor Web
    Copyright (C) 2026

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
*/

export type SchemaVersion = '1.0' | '1.1';

export type ObjectTypeName =
  | 'NULL'
  | 'DOMAIN'
  | 'DEFTYPE'
  | 'DEFSTRUCT'
  | 'VAR'
  | 'ARRAY'
  | 'RECORD';

export type DataTypeName =
  | 'UNKNOWN'
  | 'BOOLEAN'
  | 'INTEGER8'
  | 'INTEGER16'
  | 'INTEGER24'
  | 'INTEGER32'
  | 'INTEGER40'
  | 'INTEGER48'
  | 'INTEGER56'
  | 'INTEGER64'
  | 'UNSIGNED8'
  | 'UNSIGNED16'
  | 'UNSIGNED24'
  | 'UNSIGNED32'
  | 'UNSIGNED40'
  | 'UNSIGNED48'
  | 'UNSIGNED56'
  | 'UNSIGNED64'
  | 'REAL32'
  | 'REAL64'
  | 'VISIBLE_STRING'
  | 'OCTET_STRING'
  | 'UNICODE_STRING'
  | 'TIME_OF_DAY'
  | 'TIME_DIFFERENCE'
  | 'DOMAIN'
  | 'PDO_COMMUNICATION_PARAMETER'
  | 'PDO_MAPPING'
  | 'SDO_PARAMETER'
  | 'IDENTITY';

export type AccessType =
  | 'const'
  | 'read'
  | 'write'
  | 'readWrite'
  | 'readWriteInput'
  | 'readWriteOutput'
  | 'noAccess'
  | 'unknown';

export type PdoMapping = 'no' | 'default' | 'optional' | 'TPDO' | 'RPDO';

export type SrdoAccess = 'no' | 'tx' | 'rx' | 'trx';

export interface BaudRates {
  b10: boolean;
  b20: boolean;
  b50: boolean;
  b100: boolean;
  b125: boolean;
  b250: boolean;
  b500: boolean;
  b800: boolean;
  b1000: boolean;
  auto: boolean;
}

export interface OdEntry {
  index: number;
  subIndex: number;
  name: string;
  objectType: ObjectTypeName;
  dataType: DataTypeName;
  access: AccessType;
  pdoMapping: PdoMapping;
  defaultValue: string;
  actualValue: string;
  lowLimit: string;
  highLimit: string;
  description: string;
  denotation: string;
  disabled: boolean;
  countLabel: string;
  storageGroup: string;
  flagsPdo: boolean;
  accessSrdo: SrdoAccess;
  stringLengthMin: number;
  subObjects: OdEntry[];
}

export interface DeviceDocument {
  schemaVersion: SchemaVersion;
  fileName: string;
  fileVersion: string;
  fileCreator: string;
  fileCreationDate: string;
  fileCreationTime: string;
  fileModifiedBy: string;
  fileModificationDate: string;
  fileModificationTime: string;
  description: string;
  vendorName: string;
  vendorId: string;
  productName: string;
  productId: string;
  orderCode: string;
  versionSw: string;
  versionFw: string;
  versionHw: string;
  baudRates: BaudRates;
  granularity: number;
  nrOfRxPdo: number;
  nrOfTxPdo: number;
  bootUpSlave: boolean;
  bootUpMaster: boolean;
  lssSlave: boolean;
  lssMaster: boolean;
  ngSlave: boolean;
  ngMaster: boolean;
  nrOfNgMonitoredNodes: number;
  groupMessaging: boolean;
  dynamicChannels: boolean;
  dummy: boolean[];
  objects: OdEntry[];
}

export const OBJECT_TYPE_CODE: Record<ObjectTypeName, number> = {
  NULL: 0,
  DOMAIN: 2,
  DEFTYPE: 5,
  DEFSTRUCT: 6,
  VAR: 7,
  ARRAY: 8,
  RECORD: 9,
};

export const OBJECT_TYPE_BY_CODE: Record<number, ObjectTypeName> = {
  0: 'NULL',
  2: 'DOMAIN',
  5: 'DEFTYPE',
  6: 'DEFSTRUCT',
  7: 'VAR',
  8: 'ARRAY',
  9: 'RECORD',
};

export const DATA_TYPE_BY_CODE: Record<number, DataTypeName> = {
  0x01: 'BOOLEAN',
  0x02: 'INTEGER8',
  0x03: 'INTEGER16',
  0x04: 'INTEGER32',
  0x05: 'UNSIGNED8',
  0x06: 'UNSIGNED16',
  0x07: 'UNSIGNED32',
  0x08: 'REAL32',
  0x09: 'VISIBLE_STRING',
  0x0a: 'OCTET_STRING',
  0x0b: 'UNICODE_STRING',
  0x0c: 'TIME_OF_DAY',
  0x0d: 'TIME_DIFFERENCE',
  0x0f: 'DOMAIN',
  0x10: 'INTEGER24',
  0x11: 'REAL64',
  0x12: 'INTEGER40',
  0x13: 'INTEGER48',
  0x14: 'INTEGER56',
  0x15: 'INTEGER64',
  0x16: 'UNSIGNED24',
  0x18: 'UNSIGNED40',
  0x19: 'UNSIGNED48',
  0x1a: 'UNSIGNED56',
  0x1b: 'UNSIGNED64',
  0x20: 'PDO_COMMUNICATION_PARAMETER',
  0x21: 'PDO_MAPPING',
  0x22: 'SDO_PARAMETER',
  0x23: 'IDENTITY',
};

/** Data types offered in the "Data Type" selection. */
export const DATA_TYPES: DataTypeName[] = [
  'BOOLEAN',
  'INTEGER8',
  'INTEGER16',
  'INTEGER32',
  'INTEGER64',
  'UNSIGNED8',
  'UNSIGNED16',
  'UNSIGNED32',
  'UNSIGNED64',
  'REAL32',
  'REAL64',
  'VISIBLE_STRING',
  'OCTET_STRING',
  'UNICODE_STRING',
  'DOMAIN',
];

export const ACCESS_TYPES: AccessType[] = [
  'const',
  'read',
  'write',
  'readWrite',
  'readWriteInput',
  'readWriteOutput',
  'noAccess',
  'unknown',
];

export const PDO_MAPPINGS: PdoMapping[] = ['no', 'optional', 'RPDO', 'TPDO', 'default'];

export const STORAGE_GROUPS = ['RAM', 'ROM', 'EEPROM', 'PERSIST_COMM', 'PERSIST_APP'];

export const BAUD_OPTIONS: { key: keyof BaudRates; label: string; xml: string }[] = [
  { key: 'b10', label: '10 kbps', xml: '10 Kbps' },
  { key: 'b20', label: '20 kbps', xml: '20 Kbps' },
  { key: 'b50', label: '50 kbps', xml: '50 Kbps' },
  { key: 'b100', label: '100 kbps', xml: '100 Kbps' },
  { key: 'b125', label: '125 kbps', xml: '125 Kbps' },
  { key: 'b250', label: '250 kbps', xml: '250 Kbps' },
  { key: 'b500', label: '500 kbps', xml: '500 Kbps' },
  { key: 'b800', label: '800 kbps', xml: '800 Kbps' },
  { key: 'b1000', label: '1000 kbps', xml: '1000 Kbps' },
  { key: 'auto', label: 'auto', xml: 'auto-baudRate' },
];

export function emptyBaudRates(): BaudRates {
  return {
    b10: false,
    b20: false,
    b50: false,
    b100: false,
    b125: false,
    b250: false,
    b500: false,
    b800: false,
    b1000: false,
    auto: false,
  };
}

export function createEmptyDocument(): DeviceDocument {
  return {
    schemaVersion: '1.1',
    fileName: 'project.xdd',
    fileVersion: '1',
    fileCreator: '',
    fileCreationDate: '',
    fileCreationTime: '',
    fileModifiedBy: '',
    fileModificationDate: '',
    fileModificationTime: '',
    description: '',
    vendorName: '',
    vendorId: '',
    productName: 'New Product',
    productId: '',
    orderCode: '',
    versionSw: '0',
    versionFw: '0',
    versionHw: '0',
    baudRates: emptyBaudRates(),
    granularity: 8,
    nrOfRxPdo: 0,
    nrOfTxPdo: 0,
    bootUpSlave: false,
    bootUpMaster: false,
    lssSlave: false,
    lssMaster: false,
    ngSlave: false,
    ngMaster: false,
    nrOfNgMonitoredNodes: 0,
    groupMessaging: false,
    dynamicChannels: false,
    dummy: [false, false, false, false, false, false, false],
    objects: [],
  };
}

export function createEntry(partial: Partial<OdEntry> & Pick<OdEntry, 'index' | 'name'>): OdEntry {
  return {
    index: partial.index,
    subIndex: partial.subIndex ?? 0,
    name: partial.name,
    objectType: partial.objectType ?? 'VAR',
    dataType: partial.dataType ?? 'UNSIGNED32',
    access: partial.access ?? 'readWrite',
    pdoMapping: partial.pdoMapping ?? 'no',
    defaultValue: partial.defaultValue ?? '',
    actualValue: partial.actualValue ?? '',
    lowLimit: partial.lowLimit ?? '',
    highLimit: partial.highLimit ?? '',
    description: partial.description ?? '',
    denotation: partial.denotation ?? '',
    disabled: partial.disabled ?? false,
    countLabel: partial.countLabel ?? '',
    storageGroup: partial.storageGroup ?? 'RAM',
    flagsPdo: partial.flagsPdo ?? false,
    accessSrdo: partial.accessSrdo ?? 'no',
    stringLengthMin: partial.stringLengthMin ?? 0,
    subObjects: partial.subObjects ?? [],
  };
}

export function hex4(value: number): string {
  return (value & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

export function hex2(value: number): string {
  return (value & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

export function parseUserIndex(raw: string): number | null {
  const text = raw.trim();
  const match = /^(?:0x)?([0-9a-fA-F]{1,4})$/.exec(text);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1], 16);
}

export type ObjectGroupId = 'communication' | 'manufacturer' | 'profile';

export const OBJECT_GROUP_RANGES: Record<ObjectGroupId, readonly [number, number]> = {
  communication: [0x1000, 0x1fff],
  manufacturer: [0x2000, 0x5fff],
  profile: [0x6000, 0xffff],
};

/**
 * Next free index in the group's range after `after`, or after the last object of the range
 * when `after` is null. Starts at the first index of the range if it holds no objects and wraps
 * around to its start when the end is reached.
 */
export function nextFreeIndex(objects: readonly OdEntry[], group: ObjectGroupId, after: number | null): number {
  const [start, end] = OBJECT_GROUP_RANGES[group];
  const used = new Set(objects.map((object) => object.index));
  const inRange = [...used].filter((index) => index >= start && index <= end);
  const anchor = after ?? (inRange.length ? Math.max(...inRange) : start - 1);
  const from = Math.min(end + 1, Math.max(start, anchor + 1));
  for (let index = from; index <= end; index++) {
    if (!used.has(index)) {
      return index;
    }
  }
  for (let index = start; index < from; index++) {
    if (!used.has(index)) {
      return index;
    }
  }
  return start;
}

export function objectGroup(index: number): string {
  if (index >= 0x1000 && index < 0x2000) {
    return 'Communication Specific Parameters';
  }
  if (index >= 0x2000 && index < 0x6000) {
    return 'Manufacturer Specific Parameters';
  }
  return 'Device Profile Specific Parameters';
}

export function sortDocument(document: DeviceDocument): void {
  document.objects.sort((a, b) => a.index - b.index);
  for (const object of document.objects) {
    object.subObjects.sort((a, b) => a.subIndex - b.subIndex);
  }
}

export function findObject(document: DeviceDocument, index: number): OdEntry | undefined {
  return document.objects.find((object) => object.index === index);
}

export function addObject(document: DeviceDocument, entry: OdEntry): string | null {
  if (document.objects.some((object) => object.index === entry.index)) {
    return `Index ${hex4(entry.index)} already exists.`;
  }
  document.objects.push(entry);
  sortDocument(document);
  return null;
}

export function deleteObject(document: DeviceDocument, index: number): void {
  document.objects = document.objects.filter((object) => object.index !== index);
}

export function refreshSubZero(object: OdEntry): void {
  const sub0 = object.subObjects.find((sub) => sub.subIndex === 0);
  if (!sub0) {
    return;
  }
  const highest = object.subObjects.reduce((max, sub) => Math.max(max, sub.subIndex), 0);
  const useHex = /^0x/i.test(sub0.defaultValue);
  sub0.defaultValue = useHex ? `0x${hex2(highest)}` : String(highest);
}

export function addSubObject(document: DeviceDocument, index: number): string | null {
  const object = findObject(document, index);
  if (!object) {
    return 'Object not found.';
  }
  if (object.objectType !== 'ARRAY' && object.objectType !== 'RECORD') {
    return 'Sub-objects are only available for ARRAY and RECORD.';
  }
  const used = new Set(object.subObjects.map((sub) => sub.subIndex));
  let subIndex = 0;
  while (used.has(subIndex) && subIndex < 255) {
    subIndex += 1;
  }
  if (used.has(subIndex)) {
    return 'No free sub-index.';
  }
  const dataType = subIndex === 0
    ? 'UNSIGNED8'
    : object.dataType === 'UNKNOWN' ? 'UNSIGNED32' : object.dataType;
  object.subObjects.push(createEntry({
    index,
    subIndex,
    name: subIndex === 0 ? 'Highest sub-index supported' : `Sub ${hex2(subIndex)}`,
    objectType: 'VAR',
    dataType,
    access: subIndex === 0 ? 'const' : object.access === 'unknown' ? 'readWrite' : object.access,
    pdoMapping: 'no',
  }));
  object.subObjects.sort((a, b) => a.subIndex - b.subIndex);
  refreshSubZero(object);
  return null;
}

export function deleteSubObject(document: DeviceDocument, index: number, subIndex: number): void {
  const object = findObject(document, index);
  if (!object) {
    return;
  }
  object.subObjects = object.subObjects.filter((sub) => sub.subIndex !== subIndex);
  refreshSubZero(object);
}

export function bitLength(dataType: DataTypeName): number {
  switch (dataType) {
    case 'BOOLEAN':
      return 1;
    case 'INTEGER8':
    case 'UNSIGNED8':
      return 8;
    case 'INTEGER16':
    case 'UNSIGNED16':
    case 'UNICODE_STRING':
      return 16;
    case 'INTEGER24':
    case 'UNSIGNED24':
      return 24;
    case 'INTEGER32':
    case 'UNSIGNED32':
    case 'REAL32':
      return 32;
    case 'INTEGER40':
    case 'UNSIGNED40':
      return 40;
    case 'INTEGER48':
    case 'UNSIGNED48':
    case 'TIME_OF_DAY':
    case 'TIME_DIFFERENCE':
      return 48;
    case 'INTEGER56':
    case 'UNSIGNED56':
      return 56;
    case 'INTEGER64':
    case 'UNSIGNED64':
    case 'REAL64':
      return 64;
    case 'DOMAIN':
      return 0;
    default:
      return 8;
  }
}

export function ensureXddName(fileName: string, productName: string): string {
  const source = fileName.trim() || productName.trim() || 'project';
  const baseName = source.replace(/^.*[\\/]/, '').replace(/\.xdd$/i, '') || 'project';
  const safe = baseName.replace(/[^\w.\- ()[\]]+/g, '_') || 'project';
  return `${safe}.xdd`;
}

export function formatDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function formatTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** The offered data types; a different current type (e.g. from an opened file) stays selectable. */
export function dataTypeChoices(current: DataTypeName): DataTypeName[] {
  return DATA_TYPES.includes(current) ? DATA_TYPES : [current, ...DATA_TYPES];
}

export function accessChoices(current: AccessType): AccessType[] {
  return ACCESS_TYPES.includes(current) ? ACCESS_TYPES : [current, ...ACCESS_TYPES];
}
