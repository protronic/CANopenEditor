import { Component, ElementRef, HostListener, inject, input, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DeviceDocument, hex2, hex4 } from './model/device';
import {
  MappableEntry,
  MappingRow,
  PdoDirection,
  PdoField,
  PdoSlot,
  addMapping,
  addPdo,
  emptySpans,
  fitMappingBits,
  mappableEntries,
  pdoSlots,
  removeMapping,
  removePdo,
  setMappingEntry,
  setPdoField,
} from './xdd/pdo';

interface MapBlock {
  key: string;
  bits: number;
  label: string;
  kind: 'a' | 'b' | 'empty';
  subIndex: number | null;
  value: string;
}

@Component({
  selector: 'app-pdo-view',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="pdo-layout">
      @if (formError) {
        <p class="error">{{ formError }}</p>
      }
      <div class="pdo-top">
        <fieldset class="available">
          <legend>Available Objects for PDO</legend>
          <div class="od-scroll">
            <table>
              <thead>
                <tr>
                  <th>Index</th>
                  <th>Sub</th>
                  <th>Name</th>
                  <th>Datatype</th>
                  <th>Bits</th>
                </tr>
              </thead>
              <tbody>
                @for (entry of mappable(); track entry.key) {
                  <tr [class.selected]="entry.key === listSelection()" (click)="pickEntry(entry)">
                    <td class="mono">0x{{ hex(entry.index) }}</td>
                    <td class="mono">0x{{ hexByte(entry.subIndex) }}</td>
                    <td>{{ entry.name }}</td>
                    <td>{{ entry.dataType }}</td>
                    <td>{{ entry.bits }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </fieldset>

        <fieldset class="comm">
          <legend>Communication parameters</legend>
          <div class="comm-grid">
            <div class="comm-fields">
              <label class="info-line">Communication
                <input readonly [value]="selected() ? indexText(selected()!.commIndex) : ''" />
              </label>
              <label class="info-line">Mapping
                <input readonly [value]="selected() ? indexText(selected()!.mapIndex) : ''" />
              </label>
              <label class="info-line">COB
                <input [disabled]="!selected()" [ngModel]="selected()?.cobId ?? ''" (ngModelChange)="field('cobId', $event)" />
              </label>
              <label class="info-line">Type
                <input [disabled]="!selected()" [ngModel]="selected()?.transmission ?? ''" (ngModelChange)="field('transmission', $event)" />
              </label>
              <label class="info-line">Inhibit
                <input [disabled]="!selected() || direction() === 'rx'" [ngModel]="selected()?.inhibit ?? ''" (ngModelChange)="field('inhibit', $event)" />
              </label>
              <label class="info-line">Event Timer
                <input [disabled]="!selected() || direction() === 'rx'" [ngModel]="selected()?.eventTimer ?? ''" (ngModelChange)="field('eventTimer', $event)" />
              </label>
              <div class="sync-row">
                <label class="info-line">Sync start
                  <input [disabled]="!selected() || direction() === 'rx'" [ngModel]="selected()?.syncStart ?? ''" (ngModelChange)="field('syncStart', $event)" />
                </label>
                <label class="check invalid">
                  <input type="checkbox" [disabled]="!selected()" [ngModel]="invalid()" (ngModelChange)="setInvalid($event)" />
                  Invalid
                </label>
              </div>
            </div>
            <div class="comm-actions">
              <button type="button" class="system" (click)="create()">Add new PDO</button>
              <button type="button" class="system" (click)="remove()" [disabled]="!selected()">Delete PDO</button>
              <button type="button" class="system" (click)="save()" [disabled]="!selected()">Save</button>
            </div>
          </div>
        </fieldset>
      </div>

      <div class="map-scroll" #mapScroll [style.--zoom]="zoomLevel">
        <div class="map-head">
          <span>ID</span>
          <span>COB</span>
          <span>Index</span>
          <span class="bit-track">
            @for (bit of bitNumbers; track bit) {
              <i>{{ bit }}</i>
            }
          </span>
        </div>
        <div class="map-bytes">
          <span></span>
          <span></span>
          <span></span>
          <span class="bit-track">
            @for (byte of byteNumbers; track byte) {
              <b>Byte {{ byte }}</b>
            }
          </span>
        </div>
        @for (slot of slots(); track slot.commIndex) {
          <div class="map-row" [class.selected]="slot.slot === activeSlot()" (click)="select(slot)">
            <span>{{ slot.slot + 1 }}</span>
            <span class="mono">{{ cobHex(slot.cobId) }}</span>
            <span class="mono">{{ hex(slot.commIndex) }}</span>
            <span class="bit-track">
              @for (block of blocks(slot); track block.key) {
                <span
                  class="cell"
                  [class]="block.kind"
                  [class.picked]="isPicked(slot, block)"
                  [style.grid-column]="'span ' + block.bits"
                  [title]="block.label"
                  (click)="selectCell(slot, block)"
                  (contextmenu)="openMenu($event, slot, block)">{{ block.label }}</span>
              }
            </span>
          </div>
        }
      </div>

      <div class="zoom-row">
        <button type="button" class="system" (click)="zoom(1)">Zoom In</button>
        <button type="button" class="system" (click)="zoom(-1)">Zoom Out</button>
      </div>
    </div>

    @if (menu; as menu) {
      <div class="menu" [style.left.px]="menu.x" [style.top.px]="menu.y" (click)="$event.stopPropagation()" (contextmenu)="$event.preventDefault()">
        <button type="button" (click)="removeBlock()">Remove Item</button>
      </div>
    }
  `,
})
export class PdoViewComponent {
  readonly document = input.required<DeviceDocument>();
  readonly direction = input.required<PdoDirection>();
  readonly changed = output<void>();
  formError = '';
  selectedSlot: number | null = null;
  zoomLevel = 1;
  menu: { x: number; y: number; slot: number; subIndex: number } | null = null;
  pickedCell: { slot: number; key: string } | null = null;
  listKey: string | null = null;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly mapScroll = viewChild<ElementRef<HTMLElement>>('mapScroll');
  readonly bitNumbers = Array.from({ length: 64 }, (_, index) => index);
  readonly byteNumbers = [0, 1, 2, 3, 4, 5, 6, 7];
  readonly hex = hex4;
  readonly hexByte = hex2;

  @HostListener('document:click')
  closeMenu(): void {
    this.menu = null;
  }

  slots(): PdoSlot[] {
    return pdoSlots(this.document(), this.direction());
  }

  activeSlot(): number | null {
    return this.selectedSlot ?? this.slots()[0]?.slot ?? null;
  }

  mappable(): MappableEntry[] {
    return mappableEntries(this.document(), this.direction());
  }

  selected(): PdoSlot | null {
    return this.slots().find((slot) => slot.slot === this.selectedSlot) ?? this.slots()[0] ?? null;
  }

  select(slot: PdoSlot): void {
    this.selectedSlot = slot.slot;
    this.formError = '';
  }

  indexText(index: number): string {
    return `0x${hex4(index)}`;
  }

  cobHex(raw: string): string {
    const value = parseCob(raw);
    if (value == null) {
      return raw;
    }
    return (value & 0x7fffffff).toString(16).toUpperCase();
  }

  invalid(): boolean {
    const slot = this.selected();
    const value = slot ? parseCob(slot.cobId) : null;
    return value != null && (value & 0x80000000) !== 0;
  }

  blocks(slot: PdoSlot): MapBlock[] {
    const blocks: MapBlock[] = [];
    let used = 0;
    slot.mappings.forEach((row, index) => {
      const bits = row.bits && row.bits > 0 ? row.bits : 0;
      if (bits === 0 || used >= 64) {
        return;
      }
      const span = Math.min(bits, 64 - used);
      const value = row.index != null && row.entrySubIndex != null ? `${row.index}:${row.entrySubIndex}` : '';
      blocks.push({
        key: `${slot.commIndex}-${row.subIndex}`,
        bits: span,
        label: this.blockLabel(row),
        kind: index % 2 === 0 ? 'a' : 'b',
        subIndex: row.subIndex,
        value,
      });
      used += span;
    });
    let bit = used;
    for (const span of emptySpans(used)) {
      blocks.push({
        key: `${slot.commIndex}-empty-${bit}`,
        bits: span,
        label: 'Empty',
        kind: 'empty',
        subIndex: null,
        value: '',
      });
      bit += span;
    }
    return blocks;
  }

  isPicked(slot: PdoSlot, block: MapBlock): boolean {
    return this.pickedCell?.slot === slot.slot && this.pickedCell.key === block.key;
  }

  selectCell(slot: PdoSlot, block: MapBlock): void {
    this.select(slot);
    this.pickedCell = { slot: slot.slot, key: block.key };
    if (block.value) {
      this.listKey = block.value;
      requestAnimationFrame(() => this.centerListSelection());
    } else {
      this.listKey = null;
    }
  }

  listSelection(): string | null {
    return this.pickedBlock()?.block.value || this.listKey;
  }

  pickEntry(entry: MappableEntry): void {
    this.listKey = entry.key;
    const picked = this.pickedBlock();
    if (!picked) {
      this.formError = 'Select an element in the PDO first.';
      return;
    }
    const { slot, block } = picked;
    if (block.value === entry.key) {
      this.formError = '';
      return;
    }
    const target = this.applyMapping(slot, block.subIndex, entry);
    if (target != null) {
      this.pickedCell = { slot: slot.slot, key: `${slot.commIndex}-${target}` };
    }
  }

  private centerListSelection(): void {
    const list = this.host.nativeElement.querySelector<HTMLElement>('.available .od-scroll');
    const position = this.mappable().findIndex((entry) => entry.key === this.listKey);
    const row = position < 0 ? null : list?.querySelectorAll<HTMLElement>('tbody tr')[position];
    if (!list || !row) {
      return;
    }
    const head = list.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    const rowTop = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    const visible = list.clientHeight - head;
    list.scrollTop = Math.max(0, rowTop - head - (visible - row.offsetHeight) / 2);
  }

  private pickedBlock(): { slot: PdoSlot; block: MapBlock } | null {
    const picked = this.pickedCell;
    const slot = picked ? this.slots().find((item) => item.slot === picked.slot) : undefined;
    const block = slot ? this.blocks(slot).find((item) => item.key === picked!.key) : undefined;
    return slot && block ? { slot, block } : null;
  }

  field(name: PdoField, value: string): void {
    const slot = this.selected();
    if (!slot) {
      return;
    }
    setPdoField(this.document(), slot.direction, slot.slot, name, value);
    this.changed.emit();
  }

  setInvalid(invalid: boolean): void {
    const slot = this.selected();
    if (!slot) {
      return;
    }
    const value = parseCob(slot.cobId) ?? 0;
    const next = invalid ? (value | 0x80000000) : (value & 0x7fffffff);
    this.field('cobId', `0x${(next >>> 0).toString(16).toUpperCase().padStart(8, '0')}`);
  }

  create(): void {
    const error = addPdo(this.document(), this.direction());
    this.formError = error ?? '';
    if (!error) {
      const slots = this.slots();
      this.selectedSlot = slots[slots.length - 1]?.slot ?? null;
      this.changed.emit();
    }
  }

  remove(): void {
    const slot = this.selected();
    if (!slot || !confirm('Delete PDO?')) {
      return;
    }
    removePdo(this.document(), slot.direction, slot.slot);
    this.selectedSlot = this.slots()[0]?.slot ?? null;
    this.changed.emit();
  }

  save(): void {
    this.formError = '';
    this.changed.emit();
  }

  openMenu(event: MouseEvent, slot: PdoSlot, block: MapBlock): void {
    event.preventDefault();
    event.stopPropagation();
    if (block.subIndex == null) {
      return;
    }
    this.selectCell(slot, block);
    this.menu = { x: event.clientX, y: event.clientY, slot: slot.slot, subIndex: block.subIndex };
  }

  removeBlock(): void {
    const menu = this.menu;
    this.menu = null;
    if (!menu) {
      return;
    }
    removeMapping(this.document(), this.direction(), menu.slot, menu.subIndex);
    this.pickedCell = null;
    this.changed.emit();
  }

  zoom(step: number): void {
    const scroller = this.mapScroll()?.nativeElement;
    const scrollLeft = scroller?.scrollLeft ?? 0;
    const factor = step > 0 ? 1.25 : 0.8;
    this.zoomLevel = Math.min(6, Math.max(0.35, this.zoomLevel * factor));
    if (scroller) {
      requestAnimationFrame(() => {
        scroller.scrollLeft = scrollLeft;
      });
    }
  }

  private applyMapping(slot: PdoSlot, subIndex: number | null, entry: MappableEntry): number | null {
    const used = slot.mappings.reduce((sum, row) => sum + (row.bits && row.bits > 0 ? row.bits : 0), 0);
    const replaced = subIndex == null ? 0 : slot.mappings.find((row) => row.subIndex === subIndex)?.bits ?? 0;
    const bits = fitMappingBits(entry.bits, used, replaced > 0 ? replaced : 0);
    if (bits <= 0) {
      this.formError = 'The object does not fit into the PDO.';
      return null;
    }
    let target = subIndex;
    if (target == null) {
      const error = addMapping(this.document(), slot.direction, slot.slot);
      if (error) {
        this.formError = error;
        return null;
      }
      const updated = this.slots().find((item) => item.slot === slot.slot);
      target = updated?.mappings[updated.mappings.length - 1]?.subIndex ?? null;
      if (target == null) {
        return null;
      }
    }
    setMappingEntry(this.document(), slot.direction, slot.slot, target, entry.index, entry.subIndex, bits);
    this.formError = '';
    this.changed.emit();
    return target;
  }

  private blockLabel(row: MappingRow): string {
    if (row.index == null || row.entrySubIndex == null) {
      return row.label;
    }
    const object = this.document().objects.find((entry) => entry.index === row.index);
    const sub = object?.subObjects.find((entry) => entry.subIndex === row.entrySubIndex);
    const name = row.entrySubIndex === 0 ? object?.name : sub?.name || object?.name;
    return `0x${hex4(row.index)}/${hex2(row.entrySubIndex)}/${name ?? ''}`.replace(/\/$/, '');
  }
}

function parseCob(raw: string): number | null {
  const text = raw.trim();
  const node = /^\$NODEID\+0x([0-9a-f]+)$/i.exec(text);
  if (node) {
    return Number.parseInt(node[1], 16);
  }
  if (/^0x[0-9a-f]+$/i.test(text)) {
    const value = Number.parseInt(text, 16);
    return Number.isFinite(value) ? value : null;
  }
  if (/^\d+$/.test(text)) {
    return Number.parseInt(text, 10);
  }
  return null;
}
