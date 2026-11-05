import { Component, ElementRef, HostListener, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DeviceDocument, OdEntry, hex2, hex4 } from './model/device';
import { DialogService } from './state/dialog.service';
import { DraggableDirective } from './draggable.directive';
import { UnsavedEditsService } from './state/unsaved-edits.service';
import { ViewStateService } from './state/view-state.service';
import {
  MappableEntry,
  MappingRow,
  PdoDraft,
  PdoDirection,
  PdoField,
  PdoSlot,
  addMapping,
  addPdo,
  commitPdoDraft,
  granularityMessage,
  mappingGranularityIssues,
  createPdoDraft,
  byteMappingBits,
  commBase,
  dummyName,
  encodeMapping,
  fitMappingBits,
  insertMapping,
  isBitwiseMapping,
  mappableEntries,
  movePdo,
  pdoDraftChanged,
  pdoDraftIndices,
  pdoSlots,
  removeMapping,
  removePdo,
  setBitwiseMapping,
  setMappingEntry,
  setPdoField,
  syncPdoDraft,
  COB_INVALID,
  cobIdIssue,
  formatCobId,
  parseCobId,
  pdoFieldIssue,
  setCobBits,
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
  imports: [FormsModule, DraggableDirective],
  template: `
    <div class="pdo-layout">
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
                  @if (bitwise()) {
                    <th class="steps"></th>
                  }
                </tr>
              </thead>
              <tbody [class.locked]="!hasPick()">
                @for (entry of mappable(); track entry.key) {
                  <tr [class.selected]="entry.key === listSelection()" (click)="pickEntry(entry)">
                    <td class="mono">0x{{ hex(entry.index) }}</td>
                    <td class="mono">0x{{ hexByte(entry.subIndex) }}</td>
                    <td>{{ entry.name }}</td>
                    <td>{{ entry.dataType }}</td>
                    <td>{{ shownBits(entry) }}</td>
                    @if (bitwise()) {
                      <td class="steps">
                        @if (entry.key === listSelection() && maxBits(entry) > 1) {
                          <button type="button" class="step" (click)="$event.stopPropagation(); stepBits(entry, -1)">-</button>
                          <button type="button" class="step" (click)="$event.stopPropagation(); stepBits(entry, 1)">+</button>
                        }
                      </td>
                    }
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
                <input #commInput [disabled]="!selected()" [value]="selected() ? indexText(selected()!.commIndex) : ''"
                  (change)="moveIndex(commInput, 0)" />
              </label>
              <label class="info-line">Mapping
                <input #mapInput [disabled]="!selected()" [value]="selected() ? indexText(selected()!.mapIndex) : ''"
                  (change)="moveIndex(mapInput, 512)" />
              </label>
              <label class="info-line">COB
                <input #cobInput [disabled]="!selected()" [value]="cobText(selected()?.cobId ?? '')" (change)="setCob(cobInput)" />
              </label>
              <div class="info-line">
                <span></span>
                <label class="check">
                  <input type="checkbox" [disabled]="!selected()" [ngModel]="invalid()" (ngModelChange)="setInvalid($event)" />
                  Invalid
                </label>
              </div>
              <label class="info-line">Type
                <input [disabled]="!selected()" [ngModel]="selected()?.transmission ?? ''" (ngModelChange)="field('transmission', $event)" (change)="checkField('transmission', $any($event.target).value)" />
              </label>
              <label class="info-line">Inhibit
                <input [disabled]="!selected() || direction() === 'rx'" [ngModel]="selected()?.inhibit ?? ''" (ngModelChange)="field('inhibit', $event)" (change)="checkField('inhibit', $any($event.target).value)" />
              </label>
              <label class="info-line">Event Timer
                <input [disabled]="!selected()" [ngModel]="selected()?.eventTimer ?? ''" (ngModelChange)="field('eventTimer', $event)" (change)="checkField('eventTimer', $any($event.target).value)" />
              </label>
              <label class="info-line">Sync start
                <input [disabled]="!selected() || direction() === 'rx'" [ngModel]="selected()?.syncStart ?? ''" (ngModelChange)="field('syncStart', $event)" (change)="checkField('syncStart', $any($event.target).value)" />
              </label>
              <div class="info-line">
                <span></span>
                <label class="check">
                  <input #bitwiseBox type="checkbox" [disabled]="!selected()" [checked]="bitwise()" (change)="setBitwise(bitwiseBox)" />
                  Bitwise mapping
                </label>
              </div>
            </div>
            <div class="comm-actions">
              <button type="button" class="system" (click)="create()">Add new PDO</button>
              <button type="button" class="system" (click)="remove()" [disabled]="!selected()">Delete PDO</button>
              <button type="button" class="system" [class.dirty]="dirty" (click)="save()" [disabled]="!selected()">Apply</button>
              <label class="od-check autosave">
                <input type="checkbox" [(ngModel)]="autosave" />
                <span>Auto Apply</span>
              </label>
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
            <span class="mono">{{ cobGraph(slot.cobId) }}</span>
            <span class="mono">{{ indexText(slot.commIndex) }}</span>
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
        <button type="button" (click)="insertBlock(false)">Insert Item before</button>
        <button type="button" (click)="insertBlock(true)">Insert Item after</button>
        <button type="button" (click)="removeBlock()">Remove Item</button>
      </div>
    }

    @if (pending) {
      <div class="modal-back">
        <div class="modal" appDraggable>
          <h3>Unapplied Changes</h3>
          <p>You have unapplied changes for PDO {{ pendingLabel }}.<br>Do you want to apply them and switch to a different PDO?</p>
          <div class="modal-actions">
            <button type="button" (click)="resolvePending('no')">Apply</button>
            <button type="button" (click)="resolvePending('yes')">Discard</button>
            <span class="modal-spacer"></span>
            <button type="button" class="quiet" (click)="resolvePending('cancel')">Cancel</button>
          </div>
        </div>
      </div>
    }
  `,
})
export class PdoViewComponent {
  readonly document = input.required<DeviceDocument>();
  readonly direction = input.required<PdoDirection>();
  readonly revision = input(0);
  readonly changed = output<void>();
  selectedSlot: number | null = null;
  zoomLevel = 1;
  menu: { x: number; y: number; slot: number; subIndex: number } | null = null;
  pickedCell: { slot: number; key: string } | null = null;
  listKey: string | null = null;
  /** The selected PDO has edits that are not saved yet. */
  dirty = false;
  autosave = false;
  pending = false;
  pendingLabel = '';
  /** Unsaved edits of the selected PDO; the document is changed only when they are saved. */
  private readonly draft = signal<PdoDraft | null>(null);
  private readonly unsaved = inject(UnsavedEditsService);
  private readonly viewState = inject(ViewStateService);
  private pendingResolve: ((choice: 'yes' | 'no' | 'cancel') => void) | null = null;
  private seen: DeviceDocument | null = null;
  private readonly dialogs = inject(DialogService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly mapScroll = viewChild<ElementRef<HTMLElement>>('mapScroll');
  readonly bitNumbers = Array.from({ length: 64 }, (_, index) => index);
  readonly byteNumbers = [0, 1, 2, 3, 4, 5, 6, 7];
  readonly hex = hex4;
  readonly hexByte = hex2;
  readonly maxBits = maxBits;
  /** Bumped after edits in this view, before the parent passes the next revision. */
  private readonly edits = signal(0);
  private readonly view = computed(() => {
    this.revision();
    this.edits();
    const draft = this.draft();
    if (draft) {
      syncPdoDraft(this.document(), draft);
    }
    const document = draft?.document ?? this.document();
    const slots = pdoSlots(document, this.direction());
    const objects = new Map(document.objects.map((object) => [object.index, object]));
    return { slots, blocks: new Map(slots.map((slot) => [slot.slot, slotBlocks(slot, objects)])) };
  });
  private readonly mappableList = computed(() => {
    this.revision();
    this.edits();
    return mappableEntries(this.document(), this.direction());
  });

  constructor() {
    effect(() => {
      const document = this.document();
      if (document !== this.seen) {
        untracked(() => {
          this.discard();
          if (this.seen) {
            this.viewState.set(this.seen, this.owner(), { slot: this.selectedSlot, zoom: this.zoomLevel });
          }
          this.seen = document;
          this.restoreView(document);
        });
      }
    });
  }

  private restoreView(document: DeviceDocument): void {
    const saved = this.viewState.get<{ slot: number | null; zoom: number }>(document, this.owner());
    const slots = pdoSlots(document, this.direction());
    this.selectedSlot = slots.some((slot) => slot.slot === saved?.slot) ? saved!.slot : null;
    this.zoomLevel = saved?.zoom ?? 1;
    this.pickedCell = null;
    this.listKey = null;
    this.menu = null;
    setTimeout(() => this.host.nativeElement.querySelector('.map-row.selected')?.scrollIntoView({ block: 'nearest' }));
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.menu = null;
  }

  slots(): PdoSlot[] {
    return this.view().slots;
  }

  activeSlot(): number | null {
    return this.selectedSlot ?? this.slots()[0]?.slot ?? null;
  }

  mappable(): MappableEntry[] {
    return this.mappableList();
  }

  selected(): PdoSlot | null {
    return this.slots().find((slot) => slot.slot === this.selectedSlot) ?? this.slots()[0] ?? null;
  }

  async select(slot: PdoSlot): Promise<boolean> {
    if (this.pending) {
      return false;
    }
    if (slot.slot !== this.activeSlot() && !(await this.guard())) {
      return false;
    }
    if (this.pickedCell && this.pickedCell.slot !== slot.slot) {
      this.pickedCell = null;
      this.listKey = null;
    }
    this.selectedSlot = slot.slot;
    return true;
  }

  indexText(index: number): string {
    return `0x${hex4(index)}`;
  }

  cobText(raw: string): string {
    const cob = parseCobId(raw);
    return cob ? formatCobId(cob) : raw.trim();
  }

  /** Full 32-bit COB-ID for the PDO rows, without $NODEID. */
  cobGraph(raw: string): string {
    const cob = parseCobId(raw);
    return cob ? `0x${cob.value.toString(16).toUpperCase().padStart(8, '0')}` : raw.replace(/\s*\+?\s*\$NODEID\s*\+?\s*/gi, '').trim();
  }

  setCob(input: HTMLInputElement): void {
    const slot = this.selected();
    const text = this.cobText(input.value);
    this.field('cobId', text);
    input.value = text;
    if (slot) {
      this.warn(cobIdIssue(text, slot.direction));
    }
  }

  /** Warns about values outside the ranges of CiA 301; the value is kept. */
  checkField(name: Exclude<PdoField, 'cobId'>, value: string): void {
    this.warn(pdoFieldIssue(name, value));
  }

  moveIndex(input: HTMLInputElement, offset: number): void {
    const slot = this.selected();
    if (!slot) {
      return;
    }
    const value = parseHex(input.value);
    const base = commBase(slot.direction) + offset;
    let error: string | null;
    if (value == null) {
      error = 'Enter the index as a hexadecimal number.';
    } else if (value < base || value >= base + 0x200) {
      error = `The ${offset ? 'mapping' : 'communication'} index must be between ${this.indexText(base)} and ${this.indexText(base + 0x1ff)}.`;
    } else {
      this.begin(slot);
      error = movePdo(this.doc(), slot.direction, slot.slot, value - offset);
    }
    this.warn(error);
    if (error != null || value == null) {
      input.value = this.indexText(slot.commIndex + offset);
      return;
    }
    this.selectedSlot = value - base;
    const draft = this.draft();
    if (draft) {
      draft.commIndex = value - offset;
    }
    this.pickedCell = null;
    this.listKey = null;
    input.value = this.indexText(value);
    this.edited();
  }

  invalid(): boolean {
    const slot = this.selected();
    const cob = slot ? parseCobId(slot.cobId) : null;
    return cob != null && (cob.value & COB_INVALID) !== 0;
  }

  bitwise(): boolean {
    const slot = this.selected();
    return slot ? isBitwiseMapping(this.doc(), slot) : false;
  }

  setBitwise(box: HTMLInputElement): void {
    const slot = this.selected();
    if (!slot) {
      return;
    }
    this.begin(slot);
    const error = setBitwiseMapping(this.doc(), slot.direction, slot.slot, box.checked);
    this.warn(error);
    if (error) {
      box.checked = !box.checked;
      return;
    }
    this.edited();
  }

  shownBits(entry: MappableEntry): number {
    if (!this.bitwise()) {
      return byteMappingBits(entry.bits);
    }
    const picked = this.pickedBlock();
    return picked?.block.value === entry.key ? picked.block.bits : defaultBits(entry);
  }

  stepBits(entry: MappableEntry, step: number): void {
    const picked = this.pickedBlock();
    const subIndex = picked?.block.value === entry.key ? picked.block.subIndex : null;
    if (!picked || subIndex == null) {
      return;
    }
    const { slot, block } = picked;
    const capacity = 64 - (usedBits(slot) - block.bits);
    const next = Math.min(maxBits(entry), capacity, Math.max(1, block.bits + step));
    if (next !== block.bits) {
      this.begin(slot);
      setMappingEntry(this.doc(), slot.direction, slot.slot, subIndex, entry.index, entry.subIndex, next);
      this.edited();
    }
  }

  blocks(slot: PdoSlot): MapBlock[] {
    return this.view().blocks.get(slot.slot) ?? [];
  }

  isPicked(slot: PdoSlot, block: MapBlock): boolean {
    return this.pickedCell?.slot === slot.slot && this.pickedCell.key === block.key;
  }

  async selectCell(slot: PdoSlot, block: MapBlock): Promise<boolean> {
    if (!(await this.select(slot))) {
      return false;
    }
    this.pickedCell = { slot: slot.slot, key: block.key };
    if (block.value) {
      this.listKey = block.value;
      requestAnimationFrame(() => this.centerListSelection());
    } else {
      this.listKey = null;
    }
    return true;
  }

  listSelection(): string | null {
    return this.pickedBlock()?.block.value || null;
  }

  hasPick(): boolean {
    return this.pickedBlock() != null;
  }

  pickEntry(entry: MappableEntry): void {
    const picked = this.pickedBlock();
    if (!picked) {
      return;
    }
    this.listKey = entry.key;
    const { slot, block } = picked;
    if (block.value === entry.key) {
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
    this.begin(slot);
    setPdoField(this.doc(), slot.direction, slot.slot, name, value);
    this.edited();
  }

  setInvalid(invalid: boolean): void {
    const slot = this.selected();
    if (!slot) {
      return;
    }
    const next = setCobBits(slot.cobId, COB_INVALID, invalid);
    if (next == null) {
      this.warn(cobIdIssue(slot.cobId, slot.direction));
      this.refresh();
      return;
    }
    this.field('cobId', next);
  }

  async create(): Promise<void> {
    if (!(await this.guard())) {
      return;
    }
    const error = addPdo(this.document(), this.direction());
    this.warn(error);
    if (!error) {
      this.refresh();
      const slots = this.slots();
      this.selectedSlot = slots[slots.length - 1]?.slot ?? null;
      this.changed.emit();
    }
  }

  async remove(): Promise<void> {
    const slot = this.selected();
    if (!slot || !(await this.dialogs.confirm('Delete PDO?'))) {
      return;
    }
    this.discard();
    removePdo(this.document(), slot.direction, slot.slot);
    this.refresh();
    this.selectedSlot = this.slots()[0]?.slot ?? null;
    this.changed.emit();
  }

  /** Writes the edits of the selected PDO into the document; false if they were not saved. */
  async save(): Promise<boolean> {
    const draft = this.draft();
    if (!draft || !pdoDraftChanged(this.document(), draft)) {
      this.discard();
      return true;
    }
    for (const edit of this.unsaved.conflicts(this.owner(), this.document(), pdoDraftIndices(draft))) {
      if (!(await this.dialogs.confirm(`${edit.label} has unapplied changes. Overwrite them?`, 'Warning'))) {
        return false;
      }
      edit.discard();
    }
    const map = draft.document.objects.find((object) => object.index === draft.commIndex + 0x200);
    const issues = map ? mappingGranularityIssues(draft.document, map) : [];
    if (issues.length > 0 && !(await this.dialogs.choose(
      granularityMessage(draft.document.granularity, issues, 'Apply anyway?'), ['Apply'], 'Warning'))) {
      return false;
    }
    const error = commitPdoDraft(this.document(), draft);
    if (error) {
      this.warn(error);
      return false;
    }
    this.draft.set(null);
    this.dirty = false;
    this.unsaved.set(this.owner(), null);
    this.refresh();
    this.changed.emit();
    return true;
  }

  resolvePending(choice: 'yes' | 'no' | 'cancel'): void {
    this.pending = false;
    this.pendingResolve?.(choice);
    this.pendingResolve = null;
  }

  /** Drops the unsaved edits of the selected PDO. */
  discard(): void {
    const draft = this.draft();
    if (draft) {
      this.selectedSlot = draft.originalCommIndex - commBase(draft.direction);
      this.pickedCell = null;
      this.listKey = null;
    }
    this.draft.set(null);
    this.dirty = false;
    this.unsaved.set(this.owner(), null);
    this.refresh();
  }

  private owner(): string {
    return `pdo-${this.direction()}`;
  }

  private doc(): DeviceDocument {
    return this.draft()?.document ?? this.document();
  }

  /** Starts a draft before the first unsaved edit of the PDO. */
  private begin(slot: PdoSlot): void {
    if (!this.draft()) {
      this.draft.set(createPdoDraft(this.document(), slot.direction, slot.slot));
    }
  }

  private edited(): void {
    this.refresh();
    const draft = this.draft();
    this.dirty = draft != null && pdoDraftChanged(this.document(), draft);
    const tab = this.direction() === 'tx' ? 'TX PDO Mapping' : 'RX PDO Mapping';
    this.unsaved.set(this.owner(), draft && this.dirty ? {
      document: this.document(),
      indices: pdoDraftIndices(draft),
      label: `PDO ${this.indexText(draft.originalCommIndex)} in "${tab}"`,
      discard: () => this.discard(),
    } : null);
  }

  /** Asks what to do with unsaved edits; false means stay on the PDO. */
  private async guard(): Promise<boolean> {
    const draft = this.draft();
    if (!this.dirty || !draft) {
      this.discard();
      return true;
    }
    if (this.autosave) {
      return this.save();
    }
    this.pendingLabel = this.indexText(draft.originalCommIndex);
    this.pending = true;
    const choice = await new Promise<'yes' | 'no' | 'cancel'>((resolve) => {
      this.pendingResolve = resolve;
    });
    if (choice === 'cancel') {
      return false;
    }
    if (choice === 'yes') {
      this.discard();
      return true;
    }
    return this.save();
  }

  async openMenu(event: MouseEvent, slot: PdoSlot, block: MapBlock): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    const subIndex = block.subIndex;
    if (subIndex == null || !(await this.selectCell(slot, block))) {
      return;
    }
    this.menu = { x: event.clientX, y: event.clientY, slot: slot.slot, subIndex };
  }

  insertBlock(after: boolean): void {
    const menu = this.menu;
    this.menu = null;
    const slot = menu ? this.slots().find((item) => item.slot === menu.slot) : undefined;
    if (!menu || !slot) {
      return;
    }
    const bits = isBitwiseMapping(this.doc(), slot) ? 1 : 8;
    if (fitMappingBits(bits, usedBits(slot)) < bits) {
      this.warn('The object does not fit into the PDO.');
      return;
    }
    const target = menu.subIndex + (after ? 1 : 0);
    const raw = encodeMapping(INSERT_DUMMY, 0, bits);
    this.begin(slot);
    const error = insertMapping(this.doc(), slot.direction, slot.slot, target, raw);
    this.warn(error);
    if (!error) {
      this.pickedCell = { slot: slot.slot, key: `${slot.commIndex}-${target}` };
      this.listKey = `${INSERT_DUMMY}:0`;
      requestAnimationFrame(() => this.centerListSelection());
      this.edited();
    }
  }

  removeBlock(): void {
    const menu = this.menu;
    this.menu = null;
    if (!menu) {
      return;
    }
    const slot = this.slots().find((item) => item.slot === menu.slot);
    if (slot) {
      this.begin(slot);
    }
    removeMapping(this.doc(), this.direction(), menu.slot, menu.subIndex);
    this.pickedCell = null;
    this.edited();
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
    const replaced = subIndex == null ? 0 : slot.mappings.find((row) => row.subIndex === subIndex)?.bits ?? 0;
    const wanted = isBitwiseMapping(this.doc(), slot) ? defaultBits(entry) : byteMappingBits(entry.bits);
    const bits = fitMappingBits(wanted, usedBits(slot), replaced > 0 ? replaced : 0);
    if (bits <= 0) {
      this.warn('The object does not fit into the PDO.');
      return null;
    }
    this.begin(slot);
    let target = subIndex;
    if (target == null) {
      const error = addMapping(this.doc(), slot.direction, slot.slot);
      if (error) {
        this.warn(error);
        return null;
      }
      this.refresh();
      const updated = this.slots().find((item) => item.slot === slot.slot);
      target = updated?.mappings[updated.mappings.length - 1]?.subIndex ?? null;
      if (target == null) {
        return null;
      }
    }
    setMappingEntry(this.doc(), slot.direction, slot.slot, target, entry.index, entry.subIndex, bits);
    this.edited();
    return target;
  }

  private refresh(): void {
    this.edits.update((value) => value + 1);
  }

  private warn(text: string | null): void {
    if (text) {
      void this.dialogs.warning(text);
    }
  }
}

/** Placeholder inserted from the context menu: Dummy Bool (1 bit, or 8 bits without bitwise mapping). */
const INSERT_DUMMY = 0x0001;

function usedBits(slot: PdoSlot): number {
  return slot.mappings.reduce((sum, row) => sum + (row.bits && row.bits > 0 ? row.bits : 0), 0);
}

function defaultBits(entry: MappableEntry): number {
  return entry.bits > 0 ? Math.min(64, entry.bits) : 8;
}

function maxBits(entry: MappableEntry): number {
  return entry.bits > 0 ? Math.min(64, entry.bits) : 64;
}

function parseHex(raw: string): number | null {
  const text = raw.trim();
  return /^(0x)?[0-9a-f]{1,4}$/i.test(text) ? Number.parseInt(text.replace(/^0x/i, ''), 16) : null;
}

function slotBlocks(slot: PdoSlot, objects: Map<number, OdEntry>): MapBlock[] {
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
      label: blockLabel(row, objects),
      kind: index % 2 === 0 ? 'a' : 'b',
      subIndex: row.subIndex,
      value,
    });
    used += span;
  });
  if (used < 64) {
    blocks.push({
      key: `${slot.commIndex}-empty`,
      bits: 64 - used,
      label: 'Empty',
      kind: 'empty',
      subIndex: null,
      value: '',
    });
  }
  return blocks;
}

function blockLabel(row: MappingRow, objects: Map<number, OdEntry>): string {
  if (row.index == null || row.entrySubIndex == null) {
    return row.label;
  }
  const object = objects.get(row.index);
  const sub = object?.subObjects.find((entry) => entry.subIndex === row.entrySubIndex);
  const name = dummyName(row.index) ?? (row.entrySubIndex === 0 ? object?.name : sub?.name || object?.name);
  return `0x${hex4(row.index)}/${hex2(row.entrySubIndex)}/${name ?? ''}`.replace(/\/$/, '');
}
