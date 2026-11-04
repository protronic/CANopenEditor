/*
    CANopen Editor Web
    Copyright (C) 2026

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.
*/

import {
  DeviceDocument,
  OdEntry,
  bitLength,
  createEntry,
  findObject,
  hex2,
  hex4,
  sortDocument,
} from '../model/device';

export type PdoDirection = 'rx' | 'tx';
export type PdoField = 'cobId' | 'transmission' | 'inhibit' | 'eventTimer' | 'syncStart';

export interface MappingRow {
  subIndex: number;
  raw: string;
  index: number | null;
  entrySubIndex: number | null;
  bits: number | null;
  label: string;
}

export interface PdoSlot {
  direction: PdoDirection;
  slot: number;
  commIndex: number;
  mapIndex: number;
  cobId: string;
  transmission: string;
  inhibit: string;
  eventTimer: string;
  syncStart: string;
  mappings: MappingRow[];
}

export interface MappableEntry {
  index: number;
  subIndex: number;
  name: string;
  dataType: OdEntry['dataType'];
  bits: number;
  key: string;
}

const FIELD_SUB: Record<PdoField, number> = {
  cobId: 1,
  transmission: 2,
  inhibit: 3,
  eventTimer: 5,
  syncStart: 6,
};

export function commBase(direction: PdoDirection): number {
  return direction === 'rx' ? 0x1400 : 0x1800;
}

export function mapBase(direction: PdoDirection): number {
  return direction === 'rx' ? 0x1600 : 0x1a00;
}

function subValue(object: OdEntry | undefined, subIndex: number): string {
  return object?.subObjects.find((sub) => sub.subIndex === subIndex)?.defaultValue ?? '';
}

function setSubValue(document: DeviceDocument, index: number, subIndex: number, value: string): void {
  const object = findObject(document, index);
  const sub = object?.subObjects.find((entry) => entry.subIndex === subIndex);
  if (sub) {
    sub.defaultValue = value;
  }
}

export function decodeMapping(raw: string): { index: number; subIndex: number; bits: number } | null {
  const text = raw.trim();
  if (!text || text.includes('$')) {
    return null;
  }
  let value: number;
  if (/^0x[0-9a-f]+$/i.test(text)) {
    value = Number(text);
  } else if (/^\d+$/.test(text)) {
    value = Number(text);
  } else if (/^[0-9a-f]+$/i.test(text)) {
    value = Number(`0x${text}`);
  } else {
    return null;
  }
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    return null;
  }
  return {
    index: (value >>> 16) & 0xffff,
    subIndex: (value >>> 8) & 0xff,
    bits: value & 0xff,
  };
}

export function encodeMapping(index: number, subIndex: number, bits: number): string {
  const value = ((index & 0xffff) << 16) | ((subIndex & 0xff) << 8) | (bits & 0xff);
  return `0x${value.toString(16).toUpperCase().padStart(8, '0')}`;
}

/** Width stored for a newly chosen object: the datatype width, capped by the free bits in the PDO. */
export function fitMappingBits(entryBits: number, usedBits: number, replacedBits = 0): number {
  const capacity = 64 - (usedBits - Math.max(0, replacedBits));
  if (entryBits <= 0 || capacity <= 0) {
    return 0;
  }
  return Math.min(entryBits, capacity);
}

export function mappingLabel(
  document: DeviceDocument,
  decoded: { index: number; subIndex: number; bits: number } | null,
): string {
  if (!decoded || decoded.bits === 0) {
    return decoded ? 'empty' : 'not a static mapping';
  }
  const object = findObject(document, decoded.index);
  if (!object) {
    return `${hex4(decoded.index)}:${hex2(decoded.subIndex)} · ${decoded.bits} bits`;
  }
  if (decoded.subIndex === 0 && object.objectType === 'VAR') {
    return `${hex4(object.index)} ${object.name} · ${decoded.bits} bits`;
  }
  const sub = object.subObjects.find((entry) => entry.subIndex === decoded.subIndex);
  return `${hex4(object.index)}:${hex2(decoded.subIndex)} ${sub?.name || object.name} · ${decoded.bits} bits`;
}

const DUMMY_OBJECTS: { index: number; name: string; dataType: OdEntry['dataType'] }[] = [
  { index: 0x0002, name: 'Dummy Int8', dataType: 'INTEGER8' },
  { index: 0x0003, name: 'Dummy Int16', dataType: 'INTEGER16' },
  { index: 0x0004, name: 'Dummy Int32', dataType: 'INTEGER32' },
  { index: 0x0005, name: 'Dummy UInt8', dataType: 'UNSIGNED8' },
  { index: 0x0006, name: 'Dummy UInt16', dataType: 'UNSIGNED16' },
  { index: 0x0007, name: 'Dummy UInt32', dataType: 'UNSIGNED32' },
];

const DUMMY_NAMES: Record<number, string> = Object.fromEntries(
  DUMMY_OBJECTS.map((dummy) => [dummy.index, dummy.name]),
);

export function dummyName(index: number): string | undefined {
  return DUMMY_NAMES[index];
}

export function isMappingObject(index: number): boolean {
  return (index >= 0x1600 && index < 0x1800) || (index >= 0x1a00 && index < 0x1c00);
}

/** `0xIIII/SS/name (bits)` for a mapping entry value, or null if it maps nothing. */
export function mappingTargetLabel(document: DeviceDocument, raw: string): string | null {
  const decoded = decodeMapping(raw);
  if (!decoded || (decoded.index === 0 && decoded.subIndex === 0 && decoded.bits === 0)) {
    return null;
  }
  const object = findObject(document, decoded.index);
  const sub = object?.subObjects.find((entry) => entry.subIndex === decoded.subIndex);
  const name = DUMMY_NAMES[decoded.index]
    ?? (decoded.subIndex === 0 && object?.objectType === 'VAR' ? object.name : sub?.name || object?.name)
    ?? '';
  return `0x${hex4(decoded.index)}/${hex2(decoded.subIndex)}/${name} (${decoded.bits})`;
}

/** Names each mapping sub-object after the object it maps, as shown in the object dictionary. */
export function syncMappingNames(document: DeviceDocument, mapIndex?: number): void {
  for (const map of document.objects) {
    if (!isMappingObject(map.index) || (mapIndex != null && map.index !== mapIndex)) {
      continue;
    }
    for (const sub of map.subObjects) {
      const label = sub.subIndex > 0 ? mappingTargetLabel(document, sub.defaultValue) : null;
      if (label) {
        sub.name = label;
      }
    }
  }
}

function toMappingRow(document: DeviceDocument, subIndex: number, raw: string): MappingRow {
  const decoded = decodeMapping(raw);
  return {
    subIndex,
    raw,
    index: decoded?.index ?? null,
    entrySubIndex: decoded?.subIndex ?? null,
    bits: decoded?.bits ?? null,
    label: mappingLabel(document, decoded),
  };
}

function mappingCount(map: OdEntry | undefined): number {
  if (!map) {
    return 0;
  }
  const raw = subValue(map, 0).trim();
  if (!raw) {
    return map.subObjects.filter((sub) => sub.subIndex > 0).length;
  }
  const value = /^0x/i.test(raw) ? Number.parseInt(raw, 16) : Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : 0;
}

export function pdoSlots(document: DeviceDocument, direction: PdoDirection): PdoSlot[] {
  const base = commBase(direction);
  return document.objects
    .filter((object) => object.index >= base && object.index < base + 0x200)
    .sort((a, b) => a.index - b.index)
    .map((comm) => {
      const slot = comm.index - base;
      const map = findObject(document, mapBase(direction) + slot);
      const count = mappingCount(map);
      const mappings = (map?.subObjects ?? [])
        .filter((sub) => sub.subIndex > 0 && sub.subIndex <= count)
        .sort((a, b) => a.subIndex - b.subIndex)
        .map((sub) => toMappingRow(document, sub.subIndex, sub.defaultValue));
      return {
        direction,
        slot,
        commIndex: comm.index,
        mapIndex: mapBase(direction) + slot,
        cobId: subValue(comm, 1),
        transmission: subValue(comm, 2),
        inhibit: subValue(comm, 3),
        eventTimer: subValue(comm, 5),
        syncStart: subValue(comm, 6),
        mappings,
      };
    });
}

function acceptsMapping(mapping: OdEntry['pdoMapping'], direction: PdoDirection | undefined): boolean {
  if (!direction) {
    return mapping !== 'no';
  }
  if (mapping === 'optional' || mapping === 'default') {
    return true;
  }
  return direction === 'tx' ? mapping === 'TPDO' : mapping === 'RPDO';
}

function mappingBits(dataType: OdEntry['dataType'], defaultValue: string): number {
  if (dataType === 'VISIBLE_STRING') {
    return defaultValue.length * 8;
  }
  if (dataType === 'OCTET_STRING') {
    return Math.floor(defaultValue.replace(/\s/g, '').length / 2) * 8;
  }
  return bitLength(dataType);
}

export function mappableEntries(document: DeviceDocument, direction?: PdoDirection): MappableEntry[] {
  const result: MappableEntry[] = DUMMY_OBJECTS.map((dummy) => ({
    index: dummy.index,
    subIndex: 0,
    name: dummy.name,
    dataType: dummy.dataType,
    bits: bitLength(dummy.dataType),
    key: `${dummy.index}:0`,
  }));
  for (const object of document.objects) {
    if (object.disabled || DUMMY_NAMES[object.index]) {
      continue;
    }
    if (object.objectType === 'VAR' && acceptsMapping(object.pdoMapping, direction)) {
      result.push({
        index: object.index,
        subIndex: 0,
        name: object.name,
        dataType: object.dataType,
        bits: mappingBits(object.dataType, object.defaultValue),
        key: `${object.index}:0`,
      });
    }
    for (const sub of object.subObjects) {
      if (acceptsMapping(sub.pdoMapping, direction)) {
        const dataType = sub.dataType !== 'UNKNOWN' ? sub.dataType : object.dataType;
        result.push({
          index: object.index,
          subIndex: sub.subIndex,
          name: sub.name || object.name,
          dataType,
          bits: mappingBits(dataType, sub.defaultValue),
          key: `${object.index}:${sub.subIndex}`,
        });
      }
    }
  }
  return result;
}

function defaultCobId(direction: PdoDirection, slot: number): string {
  const table = direction === 'rx' ? [0x200, 0x300, 0x400, 0x500] : [0x180, 0x280, 0x380, 0x480];
  if (slot < table.length) {
    return `$NODEID+0x${table[slot].toString(16)}`;
  }
  return '0x80000000';
}

function communicationSub(
  index: number,
  subIndex: number,
  name: string,
  dataType: OdEntry['dataType'],
  access: OdEntry['access'],
  defaultValue: string,
): OdEntry {
  return createEntry({
    index,
    subIndex,
    name,
    objectType: 'VAR',
    dataType,
    access,
    pdoMapping: 'no',
    defaultValue,
  });
}

function updatePdoCount(document: DeviceDocument, direction: PdoDirection): void {
  const count = pdoSlots(document, direction).length;
  if (direction === 'rx') {
    document.nrOfRxPdo = count;
  } else {
    document.nrOfTxPdo = count;
  }
}

export function addPdo(document: DeviceDocument, direction: PdoDirection): string | null {
  const base = commBase(direction);
  let slot = 0;
  while (slot < 0x200 && findObject(document, base + slot)) {
    slot += 1;
  }
  if (slot >= 0x200) {
    return 'No further PDO slot is free.';
  }
  const commIndex = base + slot;
  const mappingIndex = mapBase(direction) + slot;
  if (findObject(document, mappingIndex)) {
    return `Mapping index ${hex4(mappingIndex)} is already in use.`;
  }
  const receive = direction === 'rx';
  document.objects.push(
    createEntry({
      index: commIndex,
      name: receive ? 'RPDO communication parameter' : 'TPDO communication parameter',
      objectType: 'RECORD',
      dataType: 'UNKNOWN',
      access: 'readWrite',
      pdoMapping: 'no',
      subObjects: [
        communicationSub(commIndex, 0, 'Highest sub-index supported', 'UNSIGNED8', 'const', '5'),
        communicationSub(commIndex, 1, 'COB-ID', 'UNSIGNED32', 'readWrite', defaultCobId(direction, slot)),
        communicationSub(commIndex, 2, 'Transmission type', 'UNSIGNED8', 'readWrite', '255'),
        communicationSub(commIndex, 3, 'Inhibit time', 'UNSIGNED16', 'readWrite', '0'),
        communicationSub(commIndex, 4, 'Compatibility entry', 'UNSIGNED8', 'readWrite', '0'),
        communicationSub(commIndex, 5, 'Event timer', 'UNSIGNED16', 'readWrite', '0'),
      ],
    }),
    createEntry({
      index: mappingIndex,
      name: receive ? 'RPDO mapping parameter' : 'TPDO mapping parameter',
      objectType: 'RECORD',
      dataType: 'UNKNOWN',
      access: 'readWrite',
      pdoMapping: 'no',
      subObjects: [
        communicationSub(mappingIndex, 0, 'Number of mapped objects', 'UNSIGNED8', 'readWrite', '0'),
      ],
    }),
  );
  sortDocument(document);
  updatePdoCount(document, direction);
  return null;
}

export function removePdo(document: DeviceDocument, direction: PdoDirection, slot: number): void {
  const commIndex = commBase(direction) + slot;
  const mappingIndex = mapBase(direction) + slot;
  document.objects = document.objects.filter((object) => object.index !== commIndex && object.index !== mappingIndex);
  bitwiseFlags.get(document)?.delete(commIndex);
  updatePdoCount(document, direction);
}

const ADDABLE_SUB: Partial<Record<PdoField, { name: string; dataType: OdEntry['dataType'] }>> = {
  eventTimer: { name: 'Event timer', dataType: 'UNSIGNED16' },
  syncStart: { name: 'Sync start value', dataType: 'UNSIGNED8' },
};

export function setPdoField(
  document: DeviceDocument,
  direction: PdoDirection,
  slot: number,
  field: PdoField,
  value: string,
): void {
  const index = commBase(direction) + slot;
  const subIndex = FIELD_SUB[field];
  const object = findObject(document, index);
  const addable = ADDABLE_SUB[field];
  if (addable && object && !object.subObjects.some((sub) => sub.subIndex === subIndex)) {
    object.subObjects.push(communicationSub(index, subIndex, addable.name, addable.dataType, 'readWrite', value));
    object.subObjects.sort((a, b) => a.subIndex - b.subIndex);
    const count = object.subObjects.find((sub) => sub.subIndex === 0);
    if (count) {
      count.defaultValue = String(Math.max(...object.subObjects.map((sub) => sub.subIndex)));
    }
  }
  setSubValue(document, index, subIndex, value);
}

/** Moves a PDO to another communication index; the mapping index always follows at +0x200. */
export function movePdo(document: DeviceDocument, direction: PdoDirection, slot: number, commIndex: number): string | null {
  const base = commBase(direction);
  if (!Number.isInteger(commIndex) || commIndex < base || commIndex >= base + 0x200) {
    return `The communication index must be between 0x${hex4(base)} and 0x${hex4(base + 0x1ff)}.`;
  }
  const from = base + slot;
  if (commIndex === from) {
    return null;
  }
  const mapTo = commIndex + 0x200;
  if (findObject(document, commIndex) || findObject(document, mapTo)) {
    return `Index 0x${hex4(commIndex)} or 0x${hex4(mapTo)} is already in use.`;
  }
  for (const [oldIndex, newIndex] of [[from, commIndex], [mapBase(direction) + slot, mapTo]]) {
    const object = findObject(document, oldIndex);
    if (object) {
      object.index = newIndex;
      object.subObjects.forEach((sub) => (sub.index = newIndex));
    }
  }
  const flags = bitwiseFlags.get(document);
  if (flags?.has(from)) {
    flags.set(commIndex, flags.get(from)!);
    flags.delete(from);
  }
  sortDocument(document);
  return null;
}

/** Width of an object in a PDO without bitwise mapping: whole bytes, at least 8 and at most 64 bits. */
export function byteMappingBits(bits: number): number {
  return Math.min(64, Math.max(8, Math.ceil(bits / 8) * 8));
}

/** Datatype width of a mappable object, or null if the document does not contain it. */
export function objectMappingBits(document: DeviceDocument, index: number, subIndex: number): number | null {
  const dummy = DUMMY_OBJECTS.find((entry) => entry.index === index);
  if (dummy) {
    return bitLength(dummy.dataType);
  }
  const object = findObject(document, index);
  if (!object) {
    return null;
  }
  if (subIndex === 0 && object.objectType === 'VAR') {
    return mappingBits(object.dataType, object.defaultValue);
  }
  const sub = object.subObjects.find((entry) => entry.subIndex === subIndex);
  if (!sub) {
    return null;
  }
  return mappingBits(sub.dataType !== 'UNKNOWN' ? sub.dataType : object.dataType, sub.defaultValue);
}

const bitwiseFlags = new WeakMap<DeviceDocument, Map<number, boolean>>();

/** Bitwise mapping is a setting of the editor; without one, a PDO with a non-byte width counts as bitwise. */
export function isBitwiseMapping(document: DeviceDocument, slot: PdoSlot): boolean {
  return bitwiseFlags.get(document)?.get(slot.commIndex)
    ?? slot.mappings.some((row) => row.bits != null && row.bits % 8 !== 0);
}

export function setBitwiseMapping(
  document: DeviceDocument,
  direction: PdoDirection,
  slot: number,
  bitwise: boolean,
): string | null {
  const current = pdoSlots(document, direction).find((item) => item.slot === slot);
  if (!current) {
    return null;
  }
  const rows = current.mappings.filter((row) => row.index != null && row.entrySubIndex != null && row.bits);
  const widths = rows.map((row) => {
    const typeBits = objectMappingBits(document, row.index!, row.entrySubIndex!);
    if (!bitwise) {
      return byteMappingBits(typeBits ?? row.bits!);
    }
    return typeBits && typeBits < row.bits! ? typeBits : row.bits!;
  });
  if (widths.reduce((sum, bits) => sum + bits, 0) > 64) {
    return 'The objects do not fit into the PDO without bitwise mapping.';
  }
  rows.forEach((row, position) => {
    if (row.bits !== widths[position]) {
      setMappingEntry(document, direction, slot, row.subIndex, row.index!, row.entrySubIndex!, widths[position]);
    }
  });
  let flags = bitwiseFlags.get(document);
  if (!flags) {
    flags = new Map();
    bitwiseFlags.set(document, flags);
  }
  flags.set(current.commIndex, bitwise);
  return null;
}

export function setMappingRaw(
  document: DeviceDocument,
  direction: PdoDirection,
  slot: number,
  subIndex: number,
  raw: string,
): void {
  setSubValue(document, mapBase(direction) + slot, subIndex, raw);
  syncMappingNames(document, mapBase(direction) + slot);
}

export function setMappingEntry(
  document: DeviceDocument,
  direction: PdoDirection,
  slot: number,
  subIndex: number,
  index: number,
  entrySubIndex: number,
  bits: number,
): void {
  setMappingRaw(document, direction, slot, subIndex, encodeMapping(index, entrySubIndex, bits));
}

export function addMapping(document: DeviceDocument, direction: PdoDirection, slot: number): string | null {
  const map = findObject(document, mapBase(direction) + slot);
  if (!map) {
    return 'Mapping object is missing.';
  }
  const count = mappingCount(map);
  if (count >= 64) {
    return 'At most 64 mapping entries are possible.';
  }
  const subIndex = count + 1;
  if (!map.subObjects.some((sub) => sub.subIndex === subIndex)) {
    map.subObjects.push(communicationSub(map.index, subIndex, `Mapping ${subIndex}`, 'UNSIGNED32', 'readWrite', '0x00000000'));
    map.subObjects.sort((a, b) => a.subIndex - b.subIndex);
  }
  const sub0 = map.subObjects.find((sub) => sub.subIndex === 0);
  if (sub0) {
    sub0.defaultValue = String(subIndex);
  }
  return null;
}

/** Inserts a mapping entry at `subIndex`; the following entries move up by one. */
export function insertMapping(
  document: DeviceDocument,
  direction: PdoDirection,
  slot: number,
  subIndex: number,
  raw: string,
): string | null {
  const mapIndex = mapBase(direction) + slot;
  const count = mappingCount(findObject(document, mapIndex));
  const error = addMapping(document, direction, slot);
  if (error) {
    return error;
  }
  const map = findObject(document, mapIndex)!;
  const position = Math.min(Math.max(1, subIndex), count + 1);
  for (let target = count + 1; target > position; target -= 1) {
    setSubValue(document, mapIndex, target, subValue(map, target - 1));
  }
  setSubValue(document, mapIndex, position, raw);
  syncMappingNames(document, mapIndex);
  return null;
}

export function removeMapping(
  document: DeviceDocument,
  direction: PdoDirection,
  slot: number,
  subIndex: number,
): void {
  const map = findObject(document, mapBase(direction) + slot);
  if (!map) {
    return;
  }
  map.subObjects = map.subObjects.filter((sub) => sub.subIndex !== subIndex);
  const mapped = map.subObjects.filter((sub) => sub.subIndex > 0).sort((a, b) => a.subIndex - b.subIndex);
  mapped.forEach((sub, position) => {
    sub.subIndex = position + 1;
  });
  const sub0 = map.subObjects.find((sub) => sub.subIndex === 0);
  if (sub0) {
    sub0.defaultValue = String(mapped.length);
  }
}
