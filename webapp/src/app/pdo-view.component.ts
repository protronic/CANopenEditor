import { Component, input, output, signal } from '@angular/core';
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
      <div class="tabs">
        <button type="button" [class.active]="direction() === 'rx'" (click)="direction.set('rx')">RPDO</button>
        <button type="button" [class.active]="direction() === 'tx'" (click)="direction.set('tx')">TPDO</button>
      </div>
      <button type="button" (click)="create()">{{ direction() === 'rx' ? 'RPDO' : 'TPDO' }} hinzufügen</button>
    </div>
    @if (formError) {
      <p class="error">{{ formError }}</p>
    }
    <p class="hint">Mapbare Objekte erscheinen, wenn ihr PDO-Mapping nicht auf „no“ steht. Gespeichert wird weiterhin nur XDD.</p>
    @if (slots().length === 0) {
      <p class="hint">Keine {{ direction() === 'rx' ? 'Empfangs' : 'Sende' }}-PDOs im Objektverzeichnis.</p>
    }
    <div class="pdo-list">
      @for (slot of slots(); track slot.commIndex) {
        <article class="pdo-card">
          <header>
            <h3>{{ direction() === 'rx' ? 'RPDO' : 'TPDO' }} {{ slot.slot + 1 }}</h3>
            <span class="mono">{{ hex(slot.commIndex) }} / {{ hex(slot.mapIndex) }}</span>
            <button type="button" class="danger" (click)="remove(slot)">Entfernen</button>
          </header>
          <div class="pdo-fields">
            <label>COB-ID
              <input [ngModel]="slot.cobId" (ngModelChange)="field(slot, 'cobId', $event)" />
            </label>
            <label>Transmission Type
              <input [ngModel]="slot.transmission" (ngModelChange)="field(slot, 'transmission', $event)" />
            </label>
            <label>Inhibit Time
              <input [ngModel]="slot.inhibit" (ngModelChange)="field(slot, 'inhibit', $event)" />
            </label>
            <label>Event Timer
              <input [ngModel]="slot.eventTimer" (ngModelChange)="field(slot, 'eventTimer', $event)" />
            </label>
          </div>
          <div class="mapping-head">
            <h4>Mapping</h4>
            <button type="button" (click)="map(slot)">Eintrag</button>
          </div>
          @for (row of slot.mappings; track row.subIndex) {
            <div class="mapping-row">
              <span class="mono">{{ hexByte(row.subIndex) }}</span>
              <select [ngModel]="selectionKey(row)" (ngModelChange)="choose(slot, row, $event)">
                <option value="">Objekt wählen</option>
                @for (entry of mappable(); track entry.key) {
                  <option [value]="entry.key">{{ hex(entry.index) }}:{{ hexByte(entry.subIndex) }} {{ entry.name }}</option>
                }
              </select>
              <input [ngModel]="row.raw" (ngModelChange)="raw(slot, row, $event)" />
              <span>{{ row.label }}</span>
              <button type="button" (click)="unmap(slot, row)">×</button>
            </div>
          }
        </article>
      }
    </div>
  `,
})
export class PdoViewComponent {
  readonly document = input.required<DeviceDocument>();
  readonly changed = output<void>();
  readonly direction = signal<PdoDirection>('rx');
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
    if (!confirm(`${this.direction() === 'rx' ? 'RPDO' : 'TPDO'} ${slot.slot + 1} entfernen?`)) {
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
