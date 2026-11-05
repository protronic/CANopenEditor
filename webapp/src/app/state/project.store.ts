import { Injectable, computed, inject, signal } from '@angular/core';
import { DeviceDocument, ensureXddName, formatDate, formatTime } from '../model/device';
import { createEmptyDocument } from '../model/device';
import { parseXdd, writeXdd } from '../xdd/xdd-codec';
import { CloneRow, cloneObjects } from '../xdd/clone';
import { DialogService } from './dialog.service';
import { InsertRow, buildInsertRows, insertSelected, profileUrl } from '../xdd/profiles';
import { pdoSlots } from '../xdd/pdo';

export interface OpenDevice {
  id: string;
  fileName: string;
  dirty: boolean;
  document: DeviceDocument;
  /** Counts changes to the document, so views recompute derived data only after a change. */
  revision: number;
}

const NEW_EMPTY = 'Empty project';
const NEW_DS301 = 'DS301 profile';
const DS301_PROFILE = 'DS301_profile.xpd';

@Injectable({ providedIn: 'root' })
export class ProjectStore {
  readonly devices = signal<OpenDevice[]>([]);
  readonly selectedId = signal<string | null>(null);

  private readonly dialogs = inject(DialogService);

  readonly selected = computed(() => this.devices().find((device) => device.id === this.selectedId()) ?? null);

  select(id: string): void {
    this.selectedId.set(id);
  }

  async newDevice(): Promise<void> {
    const choice = await this.dialogs.choose(
      'Create an empty project or a project with the DS301 profile?',
      [NEW_EMPTY, NEW_DS301] as const,
      'New project',
    );
    if (!choice) {
      return;
    }
    const document = createEmptyDocument();
    if (choice === NEW_DS301) {
      try {
        const response = await fetch(profileUrl(DS301_PROFILE));
        if (!response.ok) {
          throw new Error();
        }
        const profile = parseXdd(await response.text());
        insertSelected(document, buildInsertRows([{ name: DS301_PROFILE, document: profile }], document, [0], new Map(), true));
        document.nrOfRxPdo = pdoSlots(document, 'rx').length;
        document.nrOfTxPdo = pdoSlots(document, 'tx').length;
      } catch {
        void this.dialogs.error(`${DS301_PROFILE} could not be loaded.`);
        return;
      }
    }
    this.add(this.create(document, 'project.xdd', true));
  }

  openXml(fileName: string, xml: string): void {
    try {
      const document = parseXdd(xml);
      const safeName = ensureXddName(fileName, document.productName);
      document.fileName = safeName;
      this.add(this.create(document, safeName, false));
    } catch (error) {
      void this.dialogs.error(error instanceof Error ? error.message : 'The XDD file could not be read.');
    }
  }

  insertObjects(id: string, rows: InsertRow[], overwrite = false): number | null {
    const device = this.devices().find((entry) => entry.id === id);
    if (!device) {
      return null;
    }
    const inserted = insertSelected(device.document, rows, overwrite);
    device.document.nrOfRxPdo = pdoSlots(device.document, 'rx').length;
    device.document.nrOfTxPdo = pdoSlots(device.document, 'tx').length;
    this.touch(id);
    return inserted;
  }

  cloneInto(id: string, rows: CloneRow[], offsets: number[]): number | null {
    const device = this.devices().find((entry) => entry.id === id);
    if (!device) {
      return null;
    }
    const cloned = cloneObjects(device.document, rows, offsets);
    device.document.nrOfRxPdo = pdoSlots(device.document, 'rx').length;
    device.document.nrOfTxPdo = pdoSlots(device.document, 'tx').length;
    this.touch(id);
    return cloned;
  }

  touch(id: string): void {
    this.devices.update((list) => list.map((device) => device.id === id ? { ...device, dirty: true, revision: device.revision + 1 } : device));
  }

  close(id: string): void {
    const remaining = this.devices().filter((device) => device.id !== id);
    this.devices.set(remaining);
    if (this.selectedId() === id) {
      this.selectedId.set(remaining[0]?.id ?? null);
    }
  }

  serialize(device: OpenDevice): { fileName: string; xml: string } {
    const now = new Date();
    if (!device.document.fileCreationDate) {
      device.document.fileCreationDate = formatDate(now);
      device.document.fileCreationTime = formatTime(now);
    }
    device.document.fileModificationDate = formatDate(now);
    device.document.fileModificationTime = formatTime(now);
    const fileName = ensureXddName(device.fileName, device.document.productName);
    device.document.fileName = fileName;
    device.document.schemaVersion = '1.1';
    return { fileName, xml: writeXdd(device.document, now) };
  }

  markSaved(id: string, fileName: string): void {
    this.devices.update((list) => list.map((device) => (
      device.id === id ? { ...device, dirty: false, fileName, revision: device.revision + 1 } : device
    )));
  }

  private add(device: OpenDevice): void {
    this.devices.update((list) => [...list, device]);
    this.selectedId.set(device.id);
  }

  private create(document: DeviceDocument, fileName: string, dirty: boolean): OpenDevice {
    return {
      id: globalThis.crypto.randomUUID(),
      fileName,
      dirty,
      document,
      revision: 0,
    };
  }
}
