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
export type PdoField = 'cobId' | 'transmission' | 'inhibit' | 'eventTimer';

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
  mappings: MappingRow[];
}

export interface MappableEntry {
  index: number;
  subIndex: number;
  name: string;
  bits: number;
  key: string;
}

const FIELD_SUB: Record<PdoField, number> = {
  cobId: 1,
  transmission: 2,
  inhibit: 3,
  eventTimer: 5,
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

export function mappingLabel(
  document: DeviceDocument,
  decoded: { index: number; subIndex: number; bits: number } | null,
): string {
  if (!decoded || decoded.bits === 0) {
    return decoded ? 'leer' : 'kein statischer Wert';
  }
  const object = findObject(document, decoded.index);
  if (!object) {
    return `${hex4(decoded.index)}:${hex2(decoded.subIndex)} · ${decoded.bits} Bit`;
  }
  if (decoded.subIndex === 0 && object.objectType === 'VAR') {
    return `${hex4(object.index)} ${object.name} · ${decoded.bits} Bit`;
  }
  const sub = object.subObjects.find((entry) => entry.subIndex === decoded.subIndex);
  return `${hex4(object.index)}:${hex2(decoded.subIndex)} ${sub?.name || object.name} · ${decoded.bits} Bit`;
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
        mappings,
      };
    });
}

export function mappableEntries(document: DeviceDocument): MappableEntry[] {
  const result: MappableEntry[] = [];
  for (const object of document.objects) {
    if (object.objectType === 'VAR' && object.pdoMapping !== 'no') {
      result.push({
        index: object.index,
        subIndex: 0,
        name: object.name,
        bits: bitLength(object.dataType),
        key: `${object.index}:0`,
      });
    }
    for (const sub of object.subObjects) {
      if (sub.pdoMapping !== 'no') {
        result.push({
          index: object.index,
          subIndex: sub.subIndex,
          name: `${object.name} / ${sub.name}`,
          bits: bitLength(sub.dataType),
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
    return 'Es ist kein weiterer PDO-Slot frei.';
  }
  const commIndex = base + slot;
  const mappingIndex = mapBase(direction) + slot;
  if (findObject(document, mappingIndex)) {
    return `Mapping-Index ${hex4(mappingIndex)} ist bereits belegt.`;
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
  updatePdoCount(document, direction);
}

export function setPdoField(
  document: DeviceDocument,
  direction: PdoDirection,
  slot: number,
  field: PdoField,
  value: string,
): void {
  setSubValue(document, commBase(direction) + slot, FIELD_SUB[field], value);
}

export function setMappingRaw(
  document: DeviceDocument,
  direction: PdoDirection,
  slot: number,
  subIndex: number,
  raw: string,
): void {
  setSubValue(document, mapBase(direction) + slot, subIndex, raw);
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
    return 'Mapping-Objekt fehlt.';
  }
  const count = mappingCount(map);
  if (count >= 64) {
    return 'Es sind höchstens 64 Mapping-Einträge möglich.';
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
