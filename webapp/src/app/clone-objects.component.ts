import { Component, OnInit, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { OdEntry, hex4 } from './model/device';
import { DialogService } from './state/dialog.service';
import { ProjectStore } from './state/project.store';
import { CloneRow, buildCloneRows } from './xdd/clone';
import { parseOffsets } from './xdd/profiles';

@Component({
  selector: 'app-clone-objects',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="modal-back" (click)="closed.emit()">
      <div class="modal profile-modal clone-modal" (click)="$event.stopPropagation()" role="dialog" aria-labelledby="clone-title">
        <h2 id="clone-title">Insert OD Objects</h2>
        <label>Target
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
                @for (offset of offsets(); track $index) {
                  <th>Offset {{ offset }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of rows(); track row.entry.index) {
                <tr [class.blocked]="row.conflict">
                  <td>
                    @if (!row.conflict) {
                      <input type="checkbox" [checked]="isChecked(row)" (change)="toggle(row)" />
                    }
                  </td>
                  <td>0x{{ hex(row.entry.index) }} - {{ row.entry.name }}</td>
                  @for (cell of row.cells; track $index) {
                    <td class="mono" [class.conflict]="cell.conflict">{{ cell.label }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="modal-actions">
          <button type="button" (click)="insert()" [disabled]="!canInsert()">Insert</button>
          <button type="button" class="quiet" (click)="uncheckAll()">Uncheck all</button>
          <span class="modal-spacer"></span>
          <button type="button" class="quiet" (click)="closed.emit()">Cancel</button>
        </div>
      </div>
    </div>
  `,
})
export class CloneObjectsComponent implements OnInit {
  readonly objects = input.required<OdEntry[]>();
  readonly closed = output<void>();
  readonly cloned = output<void>();
  readonly hex = hex4;
  readonly rows = signal<CloneRow[]>([]);
  readonly offsets = signal<number[]>([1]);
  readonly message = signal('');
  targetId = '';
  offsetText = '1';
  private readonly unchecked = new Set<number>();

  constructor(readonly store: ProjectStore, private readonly dialogs: DialogService) {
    this.targetId = store.selectedId() ?? store.devices()[0]?.id ?? '';
  }

  ngOnInit(): void {
    this.rebuild();
  }

  setTarget(id: string): void {
    this.targetId = id;
    this.rebuild();
  }

  setOffset(text: string): void {
    this.offsetText = text;
    this.rebuild();
  }

  isChecked(row: CloneRow): boolean {
    return !this.unchecked.has(row.entry.index);
  }

  toggle(row: CloneRow): void {
    if (this.unchecked.has(row.entry.index)) {
      this.unchecked.delete(row.entry.index);
    } else {
      this.unchecked.add(row.entry.index);
    }
  }

  uncheckAll(): void {
    this.rows().forEach((row) => this.unchecked.add(row.entry.index));
  }

  canInsert(): boolean {
    return this.rows().some((row) => !row.conflict && this.isChecked(row));
  }

  insert(): void {
    const rows = this.rows().filter((row) => !row.conflict && this.isChecked(row));
    const count = this.store.cloneInto(this.targetId, rows, this.offsets());
    if (count == null) {
      void this.dialogs.warning('Select a target device.');
      return;
    }
    this.cloned.emit();
    this.closed.emit();
  }

  private rebuild(): void {
    const offsets = parseOffsets(this.offsetText);
    const target = this.store.devices().find((device) => device.id === this.targetId)?.document;
    if (!offsets) {
      this.message.set('Syntax error in Index Offset.');
      this.rows.set([]);
      return;
    }
    this.message.set('');
    this.offsets.set(offsets);
    this.rows.set(target ? buildCloneRows(this.objects(), target, offsets) : []);
  }
}
