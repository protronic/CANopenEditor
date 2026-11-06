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
import type { DialogContent } from '../state/dialog.service';

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
  { index: 0x0001, name: 'Dummy Bool', dataType: 'BOOLEAN' },
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

/**
 * `M - 0xIIII/SS/name` for the mapping entry in sub-index M (decimal), or null if it maps nothing.
 * The leading sub-index keeps the name unique when a PDO maps objects with the same name.
 */
export function mappingTargetLabel(document: DeviceDocument, mappingSubIndex: number, raw: string): string | null {
  const decoded = decodeMapping(raw);
  if (!decoded || (decoded.index === 0 && decoded.subIndex === 0 && decoded.bits === 0)) {
    return null;
  }
  const object = findObject(document, decoded.index);
  const sub = object?.subObjects.find((entry) => entry.subIndex === decoded.subIndex);
  const name = DUMMY_NAMES[decoded.index]
    ?? (decoded.subIndex === 0 && object?.objectType === 'VAR' ? object.name : sub?.name || object?.name)
    ?? '';
  return `${mappingSubIndex} - 0x${hex4(decoded.index)}/${hex2(decoded.subIndex)}/${name}`;
}

/** True if both mapping values refer to the same object; the bit width does not matter. */
export function sameMappingTarget(a: string, b: string): boolean {
  const first = decodeMapping(a);
  const second = decodeMapping(b);
  if (!first || !second) {
    return a.trim() === b.trim();
  }
  return first.index === second.index && first.subIndex === second.subIndex;
}

/**
 * Name for a mapping entry that moves from one sub-index to another. A generated name follows the
 * new sub-index; a name edited by the user is kept.
 */
function movedMappingName(document: DeviceDocument, entry: OdEntry, from: number, to: number): string {
  return entry.name === mappingTargetLabel(document, from, entry.defaultValue)
    ? mappingTargetLabel(document, to, entry.defaultValue) ?? entry.name
    : entry.name;
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

/** True if the entry is counted by sub-index 0x00 of the mapping object. */
export function isMappingEntryCounted(map: OdEntry, subIndex: number): boolean {
  return subIndex > 0 && subIndex <= mappingCount(map);
}

/** PDOs of the device; like the desktop editor, disabled communication objects are no PDOs. */
export function pdoSlots(document: DeviceDocument, direction: PdoDirection): PdoSlot[] {
  const base = commBase(direction);
  return document.objects
    .filter((object) => object.index >= base && object.index < base + 0x200 && !object.disabled)
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
    return `$NODEID+0x${((direction === 'tx' ? 0x40000000 : 0) + table[slot]).toString(16).toUpperCase()}`;
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
      subObjects: receive
        ? [
          communicationSub(commIndex, 0, 'Highest sub-index supported', 'UNSIGNED8', 'const', '0x05'),
          communicationSub(commIndex, 1, 'COB-ID used by RPDO', 'UNSIGNED32', 'readWrite', defaultCobId(direction, slot)),
          communicationSub(commIndex, 2, 'Transmission type', 'UNSIGNED8', 'readWrite', '255'),
          communicationSub(commIndex, 5, 'Event timer', 'UNSIGNED16', 'readWrite', '0'),
        ]
        : [
          communicationSub(commIndex, 0, 'Highest sub-index supported', 'UNSIGNED8', 'const', '0x06'),
          communicationSub(commIndex, 1, 'COB-ID used by TPDO', 'UNSIGNED32', 'readWrite', defaultCobId(direction, slot)),
          communicationSub(commIndex, 2, 'Transmission type', 'UNSIGNED8', 'readWrite', '255'),
          communicationSub(commIndex, 3, 'Inhibit time', 'UNSIGNED16', 'readWrite', '0'),
          communicationSub(commIndex, 5, 'Event timer', 'UNSIGNED16', 'readWrite', '0'),
          communicationSub(commIndex, 6, 'SYNC start value', 'UNSIGNED8', 'readWrite', '0'),
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
        communicationSub(mappingIndex, 0, 'Number of mapped application objects in PDO', 'UNSIGNED8', 'readWrite', '0'),
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
  syncStart: { name: 'SYNC start value', dataType: 'UNSIGNED8' },
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

export interface CobId {
  value: number;
  /** `$NODEID+` before the number, if present. */
  before: string;
  /** `+$NODEID` after the number, if present. */
  after: string;
  /** Hex digits of the number, kept when the value changes. */
  digits: number;
}

/** Parses a COB-ID such as `0x180`, `$NODEID+0x80000500` or `0x40000180+$NODEID`. */
export function parseCobId(raw: string): CobId | null {
  const match = /^\s*(\$NODEID\s*\+\s*)?(0x[0-9a-f]+|\d+)(\s*\+\s*\$NODEID)?\s*$/i.exec(raw);
  if (!match || (match[1] && match[3])) {
    return null;
  }
  const hex = /^0x/i.test(match[2]);
  const value = hex ? Number.parseInt(match[2].slice(2), 16) : Number(match[2]);
  if (!(value <= 0xffffffff)) {
    return null;
  }
  return {
    value,
    before: match[1] ? '$NODEID+' : '',
    after: match[3] ? '+$NODEID' : '',
    digits: hex ? match[2].length - 2 : 0,
  };
}

export function formatCobId(cob: CobId, value = cob.value): string {
  return `${cob.before}0x${(value >>> 0).toString(16).toUpperCase().padStart(cob.digits, '0')}${cob.after}`;
}

/** Bit 31 of the COB-ID: if set, the PDO does not exist / is not valid. */
export const COB_INVALID = 0x80000000;

/** Sets or clears bits of a COB-ID and keeps the CAN-ID and `$NODEID`; null if it is no plain COB-ID. */
export function setCobBits(raw: string, mask: number, on: boolean): string | null {
  const cob = parseCobId(raw);
  if (!cob) {
    return null;
  }
  const value = on ? (cob.value | mask) >>> 0 : (cob.value & ~mask) >>> 0;
  return formatCobId(cob, value);
}

/**
 * Checks a COB-ID against CiA 301 (comments of `DS301_profile.xpd`): bit 31 invalid, for a TPDO bit 30
 * "no RTR allowed", bits 0..10 the 11-bit CAN-ID, all other bits 0.
 */
export function cobIdIssue(raw: string, direction: PdoDirection): string | null {
  const cob = parseCobId(raw);
  if (!cob) {
    return `COB "${raw.trim()}" is no valid COB-ID. Use a number, optionally with $NODEID+ before or +$NODEID after it.`;
  }
  const reserved = direction === 'rx' ? 0x7ffff800 : 0x3ffff800;
  if ((cob.value & reserved) !== 0) {
    return direction === 'rx'
      ? 'COB-ID used by RPDO: bits 11-30 must be 0 (bit 31: PDO not valid, bits 0-10: 11-bit CAN-ID).'
      : 'COB-ID used by TPDO: bits 11-29 must be 0 (bit 31: PDO not valid, bit 30: no RTR allowed, bits 0-10: 11-bit CAN-ID).';
  }
  return null;
}

function parseInteger(raw: string): number {
  const text = raw.trim();
  return /^0x[0-9a-f]+$/i.test(text) ? Number.parseInt(text, 16) : /^\d+$/.test(text) ? Number(text) : Number.NaN;
}

/** Checks a communication parameter against the ranges in the comments of `DS301_profile.xpd`. */
export function pdoFieldIssue(field: Exclude<PdoField, 'cobId'>, raw: string): string | null {
  const value = parseInteger(raw);
  switch (field) {
    case 'transmission':
      if (!(value >= 0 && value <= 255)) {
        return 'Transmission type must be a number from 0 to 255.';
      }
      return value >= 241 && value <= 253
        ? `Transmission type ${value} is not used (allowed: 0-240 synchronous, 254/255 event-driven).`
        : null;
    case 'inhibit':
      return value >= 0 && value <= 0xffff ? null : 'Inhibit time (multiple of 100 µs) must be a number from 0 to 65535.';
    case 'eventTimer':
      return value >= 0 && value <= 0xffff ? null : 'Event timer (ms) must be a number from 0 to 65535.';
    case 'syncStart':
      return value >= 0 && value <= 240 ? null : 'SYNC start value must be a number from 0 to 240.';
  }
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

/**
 * Unsaved edits of one PDO: a copy of the document that shares all objects except the communication
 * and mapping object of the PDO. `commIndex` is where the PDO is in the draft (it may be moved).
 */
export interface PdoDraft {
  document: DeviceDocument;
  direction: PdoDirection;
  originalCommIndex: number;
  commIndex: number;
}

function mapOffset(direction: PdoDirection): number {
  return mapBase(direction) - commBase(direction);
}

function pdoState(document: DeviceDocument, direction: PdoDirection, commIndex: number): string {
  return JSON.stringify({
    commIndex,
    comm: findObject(document, commIndex) ?? null,
    map: findObject(document, commIndex + mapOffset(direction)) ?? null,
    bitwise: bitwiseFlags.get(document)?.get(commIndex) ?? null,
  });
}

export function createPdoDraft(document: DeviceDocument, direction: PdoDirection, slot: number): PdoDraft {
  const commIndex = commBase(direction) + slot;
  const copied = new Set([commIndex, commIndex + mapOffset(direction)]);
  const draft: DeviceDocument = {
    ...document,
    objects: document.objects.map((object) => (copied.has(object.index) ? structuredClone(object) : object)),
  };
  bitwiseFlags.set(draft, new Map(bitwiseFlags.get(document) ?? []));
  return { document: draft, direction, originalCommIndex: commIndex, commIndex };
}

/** Indices of the communication and mapping object of the PDO, before and after a move. */
export function pdoDraftIndices(draft: PdoDraft): number[] {
  const offset = mapOffset(draft.direction);
  return [...new Set([draft.originalCommIndex, draft.originalCommIndex + offset, draft.commIndex, draft.commIndex + offset])];
}

/** Takes over objects that were added, removed, or replaced in the document since the draft was made. */
export function syncPdoDraft(document: DeviceDocument, draft: PdoDraft): void {
  const own = new Set(pdoDraftIndices(draft));
  const offset = mapOffset(draft.direction);
  const edited = [draft.commIndex, draft.commIndex + offset]
    .map((index) => findObject(draft.document, index))
    .filter((object): object is OdEntry => object != null);
  draft.document.objects = [...document.objects.filter((object) => !own.has(object.index)), ...edited]
    .sort((a, b) => a.index - b.index);
}

export function pdoDraftChanged(document: DeviceDocument, draft: PdoDraft): boolean {
  return pdoState(draft.document, draft.direction, draft.commIndex)
    !== pdoState(document, draft.direction, draft.originalCommIndex);
}

/** Writes the draft into the document. */
export function commitPdoDraft(document: DeviceDocument, draft: PdoDraft): string | null {
  const offset = mapOffset(draft.direction);
  const target = [draft.commIndex, draft.commIndex + offset];
  const original = new Set([draft.originalCommIndex, draft.originalCommIndex + offset]);
  const taken = target.find((index) => !original.has(index) && findObject(document, index));
  if (taken != null) {
    return `Index 0x${hex4(taken)} is already in use.`;
  }
  const replaced = new Set([...original, ...target]);
  const edited = target
    .map((index) => findObject(draft.document, index))
    .filter((object): object is OdEntry => object != null);
  document.objects = [...document.objects.filter((object) => !replaced.has(object.index)), ...edited];
  sortDocument(document);
  let flags = bitwiseFlags.get(document);
  if (!flags) {
    flags = new Map();
    bitwiseFlags.set(document, flags);
  }
  flags.delete(draft.originalCommIndex);
  const bitwise = bitwiseFlags.get(draft.document)?.get(draft.commIndex);
  if (bitwise != null) {
    flags.set(draft.commIndex, bitwise);
  }
  return null;
}

/**
 * Checks a mapping object after an edit of one of its sub-objects: every used entry must refer to an
 * existing object, fit its datatype, and all entries together must fit into the 64 bits of a PDO.
 */
export function checkMappingObject(document: DeviceDocument, map: OdEntry, subIndex: number, value: string): string | null {
  if (!isMappingObject(map.index)) {
    return null;
  }
  const valueOf = (sub: OdEntry) => (sub.subIndex === subIndex ? value : sub.defaultValue);
  const sub0 = map.subObjects.find((sub) => sub.subIndex === 0);
  const countText = sub0 ? valueOf(sub0).trim() : '';
  const count = !countText
    ? map.subObjects.filter((sub) => sub.subIndex > 0).length
    : /^0x/i.test(countText) ? Number.parseInt(countText, 16) : Number.parseInt(countText, 10);
  if (!Number.isInteger(count) || count < 0 || count > 64) {
    return 'The number of mapped objects must be between 0 and 64.';
  }
  const commIndex = map.index - 0x200;
  const bitwise = bitwiseFlags.get(document)?.get(commIndex);
  const bytesOnly = bitwise === false;
  let total = 0;
  for (let entry = 1; entry <= count; entry += 1) {
    const sub = map.subObjects.find((item) => item.subIndex === entry);
    if (!sub) {
      return `Mapping entry ${entry} does not exist, but ${count} objects are mapped.`;
    }
    const raw = valueOf(sub);
    const decoded = decodeMapping(raw);
    if (!decoded) {
      if (raw.trim().includes('$')) {
        continue;
      }
      return `Mapping entry ${entry}: "${raw}" is not a valid mapping value.`;
    }
    if (decoded.bits === 0) {
      continue;
    }
    const typeBits = objectMappingBits(document, decoded.index, decoded.subIndex);
    const target = `0x${hex4(decoded.index)}/${hex2(decoded.subIndex)}`;
    if (typeBits == null) {
      return `Mapping entry ${entry}: object ${target} does not exist.`;
    }
    // Without bitwise mapping an object occupies whole bytes, e.g. BOOLEAN 8 bits.
    const byteBits = Math.ceil(typeBits / 8) * 8;
    const maxBits = bitwise !== true && decoded.bits % 8 === 0 ? byteBits : typeBits;
    if (typeBits > 0 && decoded.bits > Math.min(64, maxBits)) {
      return `Mapping entry ${entry}: ${decoded.bits} bits exceed the width of ${target} (${maxBits} bits).`;
    }
    if (bytesOnly && decoded.bits % 8 !== 0) {
      return `Mapping entry ${entry}: ${decoded.bits} bits are not whole bytes, but "Bitwise mapping" is off for this PDO.`;
    }
    total += decoded.bits;
  }
  if (total > 64) {
    return `The mapped objects need ${total} bits, but a PDO holds at most 64 bits.`;
  }
  return null;
}

/** A dummy object (0x0001..0x0007) that fills up to the next granularity boundary. */
function isGranularityFiller(index: number, bits: number, start: number, granularity: number): boolean {
  return DUMMY_NAMES[index] != null && bits > 0 && (start + bits) % granularity === 0;
}

/**
 * True if a mapped object lies within one granularity unit (e.g. several bits packed into one byte)
 * or starts and ends on unit boundaries; false if it crosses a boundary.
 */
function fitsGranularity(start: number, bits: number, granularity: number): boolean {
  const end = start + bits;
  return Math.floor(start / granularity) === Math.floor((end - 1) / granularity)
    || (start % granularity === 0 && end % granularity === 0);
}

/**
 * Mapped objects that do not fit into the units of the device granularity (Device Info), i.e. that
 * cross a unit boundary (granularity 0 or 1 accepts every object), and a last byte that is not
 * filled up. `valueOf` lets callers check unsaved values of the mapping object.
 */
export function mappingGranularityIssues(
  document: DeviceDocument,
  map: OdEntry,
  valueOf: (sub: OdEntry) => string = (sub) => sub.defaultValue,
): string[] {
  const granularity = document.granularity;
  if (!isMappingObject(map.index)) {
    return [];
  }
  const checkUnits = Number.isInteger(granularity) && granularity > 1;
  const sub0 = map.subObjects.find((sub) => sub.subIndex === 0);
  const countText = sub0 ? valueOf(sub0).trim() : '';
  const count = !countText
    ? map.subObjects.filter((sub) => sub.subIndex > 0).length
    : /^0x/i.test(countText) ? Number.parseInt(countText, 16) : Number.parseInt(countText, 10);
  const kind = map.index >= 0x1a00 ? 'TPDO' : 'RPDO';
  const issues: string[] = [];
  let offset = 0;
  for (const sub of [...map.subObjects].sort((x, y) => x.subIndex - y.subIndex)) {
    if (sub.subIndex < 1 || sub.subIndex > count) {
      continue;
    }
    const decoded = decodeMapping(valueOf(sub));
    const start = offset;
    offset += decoded?.bits ?? 0;
    if (!checkUnits || (decoded && isGranularityFiller(decoded.index, decoded.bits, start, granularity))) {
      continue;
    }
    if (decoded && decoded.bits > 0 && !fitsGranularity(start, decoded.bits, granularity)) {
      const name = findObject(document, decoded.index)?.subObjects.find((entry) => entry.subIndex === decoded.subIndex)?.name
        ?? findObject(document, decoded.index)?.name ?? dummyName(decoded.index) ?? '';
      issues.push(`${kind} 0x${hex4(map.index - 0x200)} entry ${sub.subIndex}: `
        + `0x${hex4(decoded.index)}/${hex2(decoded.subIndex)}${name ? ` ${name}` : ''} `
        + `(${decoded.bits} bits, bit ${start}-${start + decoded.bits - 1})`);
    }
  }
  if (offset % 8 !== 0) {
    issues.push(`${kind} 0x${hex4(map.index - 0x200)}: byte ${Math.floor(offset / 8)} is not filled up `
      + `(${offset % 8} of 8 bits used)`);
  }
  return issues;
}

/** Granularity and byte fill issues of all PDOs of the device. */
export function pdoGranularityIssues(document: DeviceDocument): string[] {
  return document.objects
    .filter((object) => isMappingObject(object.index) && findObject(document, object.index - 0x200)?.disabled === false)
    .flatMap((map) => mappingGranularityIssues(document, map));
}

export function granularityMessage(granularity: number, issues: string[], footer: string): DialogContent {
  return {
    text: `The PDO mapping does not fit the granularity of ${granularity} bits (an object must lie `
      + `within one ${granularity}-bit unit or start and end on unit boundaries) or leaves a byte not `
      + `filled up (fill it e.g. with a dummy object):`,
    items: issues,
    footer,
  };
}

export function setMappingRaw(
  document: DeviceDocument,
  direction: PdoDirection,
  slot: number,
  subIndex: number,
  raw: string,
): void {
  const mapIndex = mapBase(direction) + slot;
  const sub = findObject(document, mapIndex)?.subObjects.find((entry) => entry.subIndex === subIndex);
  if (!sub) {
    return;
  }
  const retarget = !sameMappingTarget(sub.defaultValue, raw);
  sub.defaultValue = raw;
  if (retarget) {
    sub.name = mappingTargetLabel(document, subIndex, raw) ?? sub.name;
  }
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
  const subAt = (subIndex: number) => map.subObjects.find((sub) => sub.subIndex === subIndex);
  for (let target = count + 1; target > position; target -= 1) {
    const from = subAt(target - 1);
    const to = subAt(target);
    if (from && to) {
      to.name = movedMappingName(document, from, target - 1, target);
      to.defaultValue = from.defaultValue;
    }
  }
  const inserted = subAt(position);
  if (inserted) {
    inserted.defaultValue = raw;
    inserted.name = mappingTargetLabel(document, position, raw) ?? inserted.name;
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
    sub.name = movedMappingName(document, sub, sub.subIndex, position + 1);
    sub.subIndex = position + 1;
  });
  const sub0 = map.subObjects.find((sub) => sub.subIndex === 0);
  if (sub0) {
    sub0.defaultValue = String(mapped.length);
  }
}
