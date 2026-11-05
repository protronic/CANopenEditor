import { Injectable } from '@angular/core';
import { DeviceDocument } from '../model/device';

/** Unsaved edits of one view that cover some objects of a document. */
export interface UnsavedEdit {
  document: DeviceDocument;
  /** Indices of the objects the edits would write. */
  indices: number[];
  /** Where the edits are, e.g. `PDO 0x1800 in "TX PDO Mapping"`. */
  label: string;
  discard: () => void;
}

/** Lets a view find unsaved edits of another view before it saves the same objects. */
@Injectable({ providedIn: 'root' })
export class UnsavedEditsService {
  private readonly edits = new Map<string, UnsavedEdit>();

  set(owner: string, edit: UnsavedEdit | null): void {
    if (edit) {
      this.edits.set(owner, edit);
    } else {
      this.edits.delete(owner);
    }
  }

  conflicts(owner: string, document: DeviceDocument, indices: number[]): UnsavedEdit[] {
    const wanted = new Set(indices);
    return [...this.edits.entries()]
      .filter(([key, edit]) => key !== owner && edit.document === document && edit.indices.some((index) => wanted.has(index)))
      .map(([, edit]) => edit);
  }
}
