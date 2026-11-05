import { Component, computed, signal } from '@angular/core';
import { DeviceInfoComponent } from './device-info.component';
import { DialogHostComponent } from './dialog-host.component';
import { InsertProfileComponent } from './insert-profile.component';
import { ObjectDictionaryComponent } from './object-dictionary.component';
import { PdoViewComponent } from './pdo-view.component';
import { DialogService } from './state/dialog.service';
import { OpenDevice, ProjectStore } from './state/project.store';

type EditorTab = 'info' | 'od' | 'rx' | 'tx';

/** File System Access API (Chromium); absent in other browsers. */
interface SaveFileHandle {
  readonly name: string;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
}

type SaveFilePickerWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<SaveFileHandle>;
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DialogHostComponent, DeviceInfoComponent, InsertProfileComponent, ObjectDictionaryComponent, PdoViewComponent],
  template: `
    <div class="shell">
      <header class="top">
        <div class="brand">
          <span class="mark">OD</span>
          <div>
            <strong>Object Dictionary Editor</strong>
            <small>XDD</small>
          </div>
        </div>
        <div class="actions">
          <button type="button" (click)="store.newDevice()">New</button>
          <button type="button" (click)="picker.click()">Open</button>
          <button type="button" (click)="save()" [disabled]="!store.selected()">Save</button>
          <button type="button" class="quiet" (click)="loadExample()">Example</button>
          <button type="button" (click)="profileOpen.set(true)" [disabled]="!store.selected()">Insert Profile</button>
          <input #picker hidden type="file" accept=".xdd,application/xml" (change)="openFile($event)" />
        </div>
      </header>

      <div class="workspace">
        <aside>
          <h2>Devices</h2>
          @for (device of store.devices(); track device.id) {
            <div class="device" [class.active]="device.id === store.selectedId()" [class.dirty]="device.dirty" (click)="store.select(device.id)">
              <div>
                <strong>{{ device.document.productName || 'Unnamed' }}</strong>
                <small>{{ device.fileName }}{{ device.dirty ? ' · modified' : '' }}</small>
              </div>
              <button type="button" (click)="close(device, $event)" aria-label="Close file">×</button>
            </div>
          } @empty {
            <p class="hint">No device open.</p>
          }
        </aside>

        <main>
          @if (store.selected(); as device) {
            <div class="main-head">
              <div class="tabs">
                <button type="button" [class.active]="tab() === 'info'" (click)="setTab('info')">Device Info</button>
                <button type="button" [class.active]="tab() === 'od'" (click)="setTab('od')">Object Dictionary</button>
                <button type="button" [class.active]="tab() === 'tx'" (click)="setTab('tx')">TX PDO Mapping</button>
                <button type="button" [class.active]="tab() === 'rx'" (click)="setTab('rx')">RX PDO Mapping</button>
              </div>
              <span class="schema">Opened as XDD {{ device.document.schemaVersion }}. Save writes XDD 1.1</span>
            </div>
            <div class="pane" [hidden]="tab() !== 'info'">
              <app-device-info [document]="device.document" (changed)="store.touch(device.id)" />
            </div>
            <div class="pane" [hidden]="tab() !== 'od'">
              <app-object-dictionary [document]="device.document" [revision]="device.revision" (changed)="store.touch(device.id)" />
            </div>
            <div class="pane" [hidden]="tab() !== 'rx'">
              <app-pdo-view direction="rx" [document]="device.document" [revision]="device.revision" (changed)="store.touch(device.id)" />
            </div>
            <div class="pane" [hidden]="tab() !== 'tx'">
              <app-pdo-view direction="tx" [document]="device.document" [revision]="device.revision" (changed)="store.touch(device.id)" />
            </div>
          } @else {
            <section class="empty">
              <h2>Object Dictionary Editor</h2>
              <p>Edit device information, the object dictionary, and PDO mapping.</p>
              <p>Only the <strong>XDD</strong> file format is read and written.</p>
              <div class="actions">
                <button type="button" (click)="store.newDevice()">New</button>
                <button type="button" (click)="picker.click()">Open</button>
                <button type="button" (click)="loadExample()">Open example XDD</button>
              </div>
            </section>
          }
        </main>
      </div>
      @if (profileOpen()) {
        <app-insert-profile (closed)="profileOpen.set(false)" (inserted)="setTab('od')" />
      }
      <app-dialog-host />
    </div>
  `,
})
export class AppComponent {
  /** Active tab per open device, so switching back to a device restores its tab. */
  private readonly tabs = signal<Record<string, EditorTab>>({});
  readonly tab = computed<EditorTab>(() => {
    const id = this.store.selectedId();
    return (id && this.tabs()[id]) || 'info';
  });
  readonly profileOpen = signal(false);

  constructor(readonly store: ProjectStore, private readonly dialogs: DialogService) {}

  setTab(tab: EditorTab): void {
    const id = this.store.selectedId();
    if (id) {
      this.tabs.update((tabs) => ({ ...tabs, [id]: tab }));
    }
  }

  openFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (!file.name.toLowerCase().endsWith('.xdd')) {
      void this.dialogs.error('Only XDD files are read. Other formats are not imported or exported.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.store.openXml(file.name, String(reader.result ?? ''));
    };
    reader.onerror = () => {
      void this.dialogs.error('The file could not be read.');
    };
    reader.readAsText(file);
  }

  async save(): Promise<void> {
    const device = this.store.selected();
    if (!device) {
      return;
    }
    const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
    let handle: SaveFileHandle | null = null;
    if (picker) {
      try {
        handle = await picker.call(window, {
          suggestedName: this.store.saveName(device),
          types: [{ description: 'XDD file', accept: { 'application/xml': ['.xdd'] } }],
        });
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') {
          return;
        }
      }
    }
    if (handle) {
      const xml = this.store.serialize(device, handle.name).xml;
      try {
        const writable = await handle.createWritable();
        await writable.write(xml);
        await writable.close();
      } catch {
        void this.dialogs.error(`"${handle.name}" could not be written.`);
        return;
      }
      this.store.markSaved(device.id, handle.name);
      return;
    }
    this.download(device);
  }

  /**
   * Fallback without the save dialog of the browser (e.g. Firefox): a download, whose cancellation
   * the page cannot notice, so the project counts as saved.
   */
  private download(device: OpenDevice): void {
    const result = this.store.serialize(device);
    const blob = new Blob([result.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    this.store.markSaved(device.id, result.fileName);
  }

  async close(device: OpenDevice, event: Event): Promise<void> {
    event.stopPropagation();
    const name = device.document.productName || device.fileName;
    if (device.dirty && !(await this.dialogs.choose(`"${name}" has unsaved changes. Close file?`, ['Close without saving']))) {
      return;
    }
    this.store.close(device.id);
    this.tabs.update(({ [device.id]: _, ...rest }) => rest);
  }

  async loadExample(): Promise<void> {
    try {
      const response = await fetch('demo_io.xdd');
      if (!response.ok) {
        throw new Error('Example not found');
      }
      this.store.openXml('demo_io.xdd', await response.text());
    } catch {
      void this.dialogs.error('The example XDD could not be loaded.');
    }
  }
}
