import { Component, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DeviceDocument, hex4 } from './model/device';
import { DialogService } from './state/dialog.service';
import { ProjectStore } from './state/project.store';
import { parseXdd } from './xdd/xdd-codec';
import {
  InsertRow,
  PROFILE_FILES,
  buildInsertRows,
  indexLabel,
  parseOffsets,
  profileUrl,
} from './xdd/profiles';

@Component({
  selector: 'app-insert-profile',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="modal-back" (click)="closed.emit()">
      <div class="modal profile-modal" (click)="$event.stopPropagation()" role="dialog" aria-labelledby="insert-profile-title">
        <h2 id="insert-profile-title">Insert Profile</h2>
        <fieldset>
          <legend>Profiles</legend>
          <div class="info-checks">
            @for (file of files; track file) {
              <label class="check">
                <input type="checkbox" [checked]="isPicked(file)" (change)="toggleFile(file)" />
                {{ file }}
              </label>
            }
          </div>
        </fieldset>
        <label class="info-line">Target
          <select [ngModel]="targetId" (ngModelChange)="setTarget($event)">
            @for (device of store.devices(); track device.id) {
              <option [value]="device.id">{{ device.document.productName || 'Unnamed' }}</option>
            }
          </select>
        </label>
        <label>Index Offset (single or space separated list for multiple insert)
          <input [ngModel]="offsetText" (ngModelChange)="setOffset($event)" />
        </label>
        @if (message()) {
          <p class="error">{{ message() }}</p>
        }
        <div class="profile-scroll">
          <table>
            <thead>
              <tr>
                <th>Insert</th>
                <th>Original Object</th>
                <th>Index</th>
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.key) {
                <tr [class.conflict]="row.conflict && row.selected">
                  <td>
                    <input type="checkbox" [checked]="row.selected" (change)="toggleRow(row)" />
                  </td>
                  <td>0x{{ hex(row.entry.index) }} - {{ row.entry.name }} <small>{{ row.source }}</small></td>
                  <td class="mono">{{ labels(row) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="modal-actions">
          <button type="button" (click)="insert()" [disabled]="busy() || !canInsert()">Insert</button>
          <button type="button" class="quiet" (click)="checkAll()">Check all</button>
          <button type="button" class="quiet" (click)="uncheckAll()">Uncheck all</button>
          <span class="modal-spacer"></span>
          <button type="button" class="quiet" (click)="closed.emit()">Cancel</button>
        </div>
      </div>
    </div>
  `,
})
export class InsertProfileComponent {
  readonly closed = output<void>();
  readonly inserted = output<void>();
  readonly files = PROFILE_FILES;
  readonly hex = hex4;
  readonly rows = signal<InsertRow[]>([]);
  readonly message = signal('');
  readonly busy = signal(false);
  targetId = '';
  offsetText = '0';
  private readonly picked = new Set<string>();
  private readonly cache = new Map<string, DeviceDocument>();
  private readonly selection = new Map<string, boolean>();

  constructor(readonly store: ProjectStore, private readonly dialogs: DialogService) {
    this.targetId = store.selectedId() ?? store.devices()[0]?.id ?? '';
  }

  isPicked(file: string): boolean {
    return this.picked.has(file);
  }

  labels(row: InsertRow): string {
    return indexLabel(row.indexes);
  }

  canInsert(): boolean {
    return this.rows().some((row) => row.selected);
  }

  async toggleFile(file: string): Promise<void> {
    if (this.picked.has(file)) {
      this.picked.delete(file);
      this.rebuild(false);
      return;
    }
    this.picked.add(file);
    this.message.set('');
    if (!this.cache.has(file)) {
      this.busy.set(true);
      try {
        const response = await fetch(profileUrl(file));
        if (!response.ok) {
          throw new Error(`${file} could not be loaded.`);
        }
        this.cache.set(file, parseXdd(await response.text()));
      } catch (error) {
        this.picked.delete(file);
        void this.dialogs.error(error instanceof Error ? error.message : `${file} could not be loaded.`);
      } finally {
        this.busy.set(false);
      }
    }
    this.rebuild(true);
  }

  setTarget(id: string): void {
    this.targetId = id;
    this.rebuild(true);
  }

  setOffset(value: string): void {
    this.offsetText = value;
    this.rebuild(false);
  }

  toggleRow(row: InsertRow): void {
    row.selected = !row.selected;
    this.selection.set(row.key, row.selected);
    this.rebuild(false);
  }

  checkAll(): void {
    for (const row of this.rows()) {
      this.selection.set(row.key, true);
    }
    this.rebuild(false);
  }

  uncheckAll(): void {
    for (const row of this.rows()) {
      this.selection.set(row.key, false);
    }
    this.rebuild(false);
  }

  async insert(): Promise<void> {
    const rows = this.rows();
    const conflicts = rows.filter((row) => row.selected && row.conflict);
    let overwrite = false;
    if (conflicts.length > 0) {
      const names = conflicts.map((row) => `${indexLabel(row.indexes)} ${row.entry.name}`).join(', ');
      overwrite = await this.dialogs.confirm(conflicts.length === 1
        ? `${names} already exists. Overwrite the existing object?`
        : `These objects already exist: ${names}. Overwrite them?`);
      if (!overwrite && !rows.some((row) => row.selected && !row.conflict)) {
        void this.dialogs.warning('Existing objects were kept.');
        return;
      }
    }
    const count = this.store.insertObjects(this.targetId, rows, overwrite);
    if (count == null) {
      void this.dialogs.warning('Select a target device.');
      return;
    }
    this.inserted.emit();
    this.closed.emit();
  }

  private rebuild(uncheckConflicts: boolean): void {
    const offsets = parseOffsets(this.offsetText);
    if (!offsets) {
      this.rows.set([]);
      this.message.set('Syntax error in Index Offset.');
      return;
    }
    if (this.message() === 'Syntax error in Index Offset.') {
      this.message.set('');
    }
    const target = this.store.devices().find((device) => device.id === this.targetId)?.document;
    if (!target) {
      this.rows.set([]);
      return;
    }
    const profiles = [...this.picked].flatMap((name) => {
      const document = this.cache.get(name);
      return document ? [{ name, document }] : [];
    });
    const rows = buildInsertRows(profiles, target, offsets, this.selection, uncheckConflicts);
    for (const row of rows) {
      this.selection.set(row.key, row.selected);
    }
    this.rows.set(rows);
  }
}
