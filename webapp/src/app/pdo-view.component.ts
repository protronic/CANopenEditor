import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DeviceDocument, bitLength, hex2, hex4 } from './model/device';
import {
  MappingRow,
  MappableEntry,
  PdoDirection,
  PdoField,
  PdoSlot,
  addMapping,
  addPdo,
  mappableEntries,
  pdoSlots,
  removeMapping,
  removePdo,
  setMappingEntry,
  setMappingRaw,
  setPdoField,
} from './xdd/pdo';

@Component({
  selector: 'app-pdo-view',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="pdo-head">
      <h2>{{ direction() === 'rx' ? 'RX PDO Mapping' : 'TX PDO Mapping' }}</h2>
      <button type="button" (click)="create()">Add new PDO</button>
    </div>
    @if (formError) {
      <p class="error">{{ formError }}</p>
    }
    <p class="hint">Objects appear here when Access PDO is not no.</p>
    @if (slots().length === 0) {
      <p class="hint">{{ direction() === 'rx' ? 'No receive PDOs.' : 'No transmit PDOs.' }}</p>
    }
    <div class="pdo-list">
      @for (slot of slots(); track slot.commIndex) {
        <article class="pdo-card">
          <header>
            <h3>{{ direction() === 'rx' ? 'RPDO' : 'TPDO' }} {{ slot.slot + 1 }}</h3>
            <span class="mono">{{ hex(slot.commIndex) }} / {{ hex(slot.mapIndex) }}</span>
            <button type="button" class="danger" (click)="remove(slot)">Delete PDO</button>
          </header>
          <h4>Communication parameters</h4>
          <div class="pdo-fields">
            <label>COB
              <input [ngModel]="slot.cobId" (ngModelChange)="field(slot, 'cobId', $event)" />
            </label>
            <label>Type
              <input [ngModel]="slot.transmission" (ngModelChange)="field(slot, 'transmission', $event)" />
            </label>
            <label>Inhibit
              <input [ngModel]="slot.inhibit" (ngModelChange)="field(slot, 'inhibit', $event)" />
            </label>
            <label>Event Timer
              <input [ngModel]="slot.eventTimer" (ngModelChange)="field(slot, 'eventTimer', $event)" />
            </label>
          </div>
          <div class="mapping-head">
            <h4>Mapping</h4>
            <button type="button" (click)="map(slot)">Insert Item</button>
          </div>
          @for (row of slot.mappings; track row.subIndex) {
            <div class="mapping-row">
              <span class="mono">{{ hexByte(row.subIndex) }}</span>
              <select [ngModel]="selectionKey(row)" (ngModelChange)="choose(slot, row, $event)">
                <option value="">Select object</option>
                @for (entry of mappable(); track entry.key) {
                  <option [value]="entry.key">{{ hex(entry.index) }}:{{ hexByte(entry.subIndex) }} {{ entry.name }}</option>
                }
              </select>
              <input [ngModel]="row.raw" (ngModelChange)="raw(slot, row, $event)" />
              <span>{{ row.label }}</span>
              <button type="button" (click)="unmap(slot, row)" aria-label="Remove Item">×</button>
            </div>
          }
        </article>
      }
    </div>
  `,
})
export class PdoViewComponent {
  readonly document = input.required<DeviceDocument>();
  readonly direction = input.required<PdoDirection>();
  readonly changed = output<void>();
  formError = '';
  readonly hex = hex4;
  readonly hexByte = hex2;

  slots(): PdoSlot[] {
    return pdoSlots(this.document(), this.direction());
  }

  mappable(): MappableEntry[] {
    return mappableEntries(this.document());
  }

  create(): void {
    const error = addPdo(this.document(), this.direction());
    this.formError = error ?? '';
    if (!error) {
      this.changed.emit();
    }
  }

  remove(slot: PdoSlot): void {
    if (!confirm('Delete PDO?')) {
      return;
    }
    removePdo(this.document(), slot.direction, slot.slot);
    this.changed.emit();
  }

  field(slot: PdoSlot, name: PdoField, value: string): void {
    setPdoField(this.document(), slot.direction, slot.slot, name, value);
    this.changed.emit();
  }

  map(slot: PdoSlot): void {
    const error = addMapping(this.document(), slot.direction, slot.slot);
    this.formError = error ?? '';
    if (!error) {
      this.changed.emit();
    }
  }

  unmap(slot: PdoSlot, row: MappingRow): void {
    removeMapping(this.document(), slot.direction, slot.slot, row.subIndex);
    this.changed.emit();
  }

  raw(slot: PdoSlot, row: MappingRow, value: string): void {
    setMappingRaw(this.document(), slot.direction, slot.slot, row.subIndex, value);
    this.changed.emit();
  }

  selectionKey(row: MappingRow): string {
    if (row.index == null || row.entrySubIndex == null) {
      return '';
    }
    return `${row.index}:${row.entrySubIndex}`;
  }

  choose(slot: PdoSlot, row: MappingRow, key: string): void {
    const entry = this.mappable().find((item) => item.key === key);
    if (!entry) {
      return;
    }
    const bits = entry.bits || bitLength('UNSIGNED32');
    setMappingEntry(this.document(), slot.direction, slot.slot, row.subIndex, entry.index, entry.subIndex, bits);
    this.changed.emit();
  }
}
