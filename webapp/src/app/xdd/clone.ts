import { DeviceDocument, OdEntry, hex4, sortDocument } from '../model/device';

export interface CloneCell {
  index: number;
  label: string;
  conflict: boolean;
}

export interface CloneRow {
  entry: OdEntry;
  cells: CloneCell[];
  /** True if any new index is invalid, already used in the target, or claimed by an earlier row. */
  conflict: boolean;
}

export function buildCloneRows(objects: OdEntry[], target: DeviceDocument, offsets: number[]): CloneRow[] {
  const taken = new Set(target.objects.map((object) => object.index));
  const claimed = new Set<number>();
  return objects.map((entry) => {
    const cells = offsets.map((offset) => {
      const index = entry.index + offset;
      const valid = Number.isInteger(index) && index > 0 && index <= 0xffff;
      const conflict = !valid || taken.has(index) || claimed.has(index);
      return { index, label: valid ? `0x${hex4(index)}` : String(index), conflict };
    });
    const conflict = cells.some((cell) => cell.conflict);
    if (!conflict) {
      cells.forEach((cell) => claimed.add(cell.index));
    }
    return { entry, cells, conflict };
  });
}

/** Name of a clone: a trailing number is shifted by the offset, as in the desktop editor. */
export function cloneName(name: string, offset: number): string {
  const match = /^(.*?)(\d+)$/.exec(name);
  if (!match) {
    return name;
  }
  const number = Number.parseInt(match[2], 10) + offset;
  return number >= 0 ? `${match[1]}${number}` : name;
}

/** Copies the rows without conflicts into the target; existing objects are never overwritten. */
export function cloneObjects(target: DeviceDocument, rows: CloneRow[], offsets: number[]): number {
  let cloned = 0;
  for (const row of rows) {
    if (row.conflict) {
      continue;
    }
    row.cells.forEach((cell, position) => {
      const copy = structuredClone(row.entry);
      copy.index = cell.index;
      copy.name = cloneName(row.entry.name, offsets[position]);
      for (const sub of copy.subObjects) {
        sub.index = cell.index;
      }
      target.objects.push(copy);
      cloned += 1;
    });
  }
  sortDocument(target);
  return cloned;
}
