import { DeviceDocument, OdEntry, findObject, hex4, sortDocument } from '../model/device';

/** Predefined profiles shipped with EDSEditorGUI. */
export const PROFILE_FILES = [
  'DS301_profile.xpd',
  'DS301_profile_old.xpd',
  'DS401_profile.xpd',
  'DSP302-NMTMaster.xpd',
] as const;

export interface InsertRow {
  key: string;
  source: string;
  entry: OdEntry;
  selected: boolean;
  indexes: number[];
  conflict: boolean;
}

export function profileUrl(fileName: string): string {
  return `profiles/${encodeURIComponent(fileName)}`;
}

export function parseOffsets(text: string): number[] | null {
  const tokens = text.trim().split(/\s+/).filter((token) => token);
  if (tokens.length === 0) {
    return null;
  }
  const offsets: number[] = [];
  for (const token of tokens) {
    const range = /^(0x[0-9a-f]+|-?\d+)\s*-\s*(0x[0-9a-f]+|-?\d+)$/i.exec(token);
    if (range) {
      const start = parseOffsetToken(range[1]);
      const end = parseOffsetToken(range[2]);
      if (start == null || end == null || end < start || end - start > 64) {
        return null;
      }
      for (let value = start; value <= end; value += 1) {
        offsets.push(value);
      }
      continue;
    }
    const value = parseOffsetToken(token);
    if (value == null) {
      return null;
    }
    offsets.push(value);
  }
  return offsets;
}

export function buildInsertRows(
  profiles: { name: string; document: DeviceDocument }[],
  target: DeviceDocument,
  offsets: number[],
  previous: ReadonlyMap<string, boolean>,
  uncheckConflicts: boolean,
): InsertRow[] {
  const rows: InsertRow[] = profiles.flatMap((profile) => profile.document.objects.map((entry) => {
    const key = `${profile.name}:${entry.index}`;
    return {
      key,
      source: profile.name,
      entry,
      selected: previous.get(key) ?? true,
      indexes: offsets.map((offset) => entry.index + offset),
      conflict: false,
    };
  }));
  const taken = new Set(target.objects.map((object) => object.index));
  for (const row of rows) {
    row.conflict = row.indexes.some((index) => !validIndex(index) || taken.has(index));
    if (row.conflict && uncheckConflicts) {
      row.selected = false;
    }
    if (row.selected && !row.conflict) {
      for (const index of row.indexes) {
        taken.add(index);
      }
    }
  }
  return rows;
}

export function insertSelected(target: DeviceDocument, rows: InsertRow[], overwrite = false): number {
  let inserted = 0;
  for (const row of rows) {
    if (!row.selected || (row.conflict && !overwrite)) {
      continue;
    }
    for (const index of row.indexes) {
      if (!validIndex(index)) {
        continue;
      }
      const existing = findObject(target, index);
      if (existing && !overwrite) {
        continue;
      }
      const copy = structuredClone(row.entry);
      copy.index = index;
      for (const sub of copy.subObjects) {
        sub.index = index;
      }
      if (existing) {
        target.objects[target.objects.indexOf(existing)] = copy;
      } else {
        target.objects.push(copy);
      }
      inserted += 1;
    }
  }
  sortDocument(target);
  return inserted;
}

export function indexLabel(indexes: number[]): string {
  return indexes.map((index) => validIndex(index) ? `0x${hex4(index)}` : String(index)).join(', ');
}

function parseOffsetToken(token: string): number | null {
  if (/^-?\d+$/.test(token)) {
    return Number.parseInt(token, 10);
  }
  if (/^-?0x[0-9a-f]+$/i.test(token)) {
    return Number.parseInt(token, 16);
  }
  return null;
}

function validIndex(index: number): boolean {
  return Number.isInteger(index) && index > 0 && index <= 0xffff;
}
