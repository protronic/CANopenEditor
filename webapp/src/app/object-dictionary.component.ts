import { Component, ElementRef, HostListener, effect, inject, input, output, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AccessType,
  DataTypeName,
  DeviceDocument,
  ObjectTypeName,
  OdEntry,
  PdoMapping,
  STORAGE_GROUPS,
  SrdoAccess,
  addObject,
  addSubObject,
  createEntry,
  dataTypeChoices,
  deleteObject,
  deleteSubObject,
  hex2,
  refreshSubZero,
  hex4,
  nextFreeIndex,
  ObjectGroupId,
  parseUserIndex,
} from './model/device';
import { CloneObjectsComponent } from './clone-objects.component';
import { DialogService } from './state/dialog.service';
import {
  checkMappingObject,
  granularityMessage,
  isMappingEntryCounted,
  isMappingObject,
  mappingGranularityIssues,
  mappingTargetLabel,
  sameMappingTarget,
} from './xdd/pdo';
import { DraggableDirective } from './draggable.directive';
import { UnsavedEditsService } from './state/unsaved-edits.service';
import { ViewStateService } from './state/view-state.service';

type PendingChoice = 'yes' | 'no' | 'cancel';
type MenuKind = 'object' | 'sub';

interface OdViewState {
  index: number | null;
  subIndex: number | null;
  collapsed: Record<ObjectGroupId, boolean>;
}

@Component({
  selector: 'app-object-dictionary',
  standalone: true,
  imports: [FormsModule, CloneObjectsComponent, DraggableDirective],
  template: `
    <div class="od">
      <div class="od-groups">
        @for (group of groups; track group.title) {
          <section class="od-group" [class.collapsed]="isCollapsed(group.id)" (contextmenu)="openObjectMenu($event, null, group.id)">
            <h3>
              <button type="button" class="collapse" (click)="toggleGroup(group.id, $event)" [attr.aria-expanded]="!isCollapsed(group.id)">{{ isCollapsed(group.id) ? '▸' : '▾' }}</button>
              {{ group.title }}
            </h3>
            @if (!isCollapsed(group.id)) {
            <div class="od-scroll">
              <table>
                <thead>
                  <tr>
                    <th (click)="openObjectMenu($event, null, group.id)">Index</th>
                    <th (click)="openObjectMenu($event, null, group.id)">Name</th>
                  </tr>
                </thead>
                <tbody>
                  @for (object of objectsIn(group.id); track object.index) {
                    <tr
                      [class.selected]="object.index === selectedIndex || extraSelection.has(object.index)"
                      [class.disabled]="object.disabled"
                      (click)="clickObject($event, group.id, object.index)"
                      (contextmenu)="openObjectMenu($event, object.index, group.id)">
                      <td class="mono">0x{{ hex(object.index) }}</td>
                      <td>{{ object.name }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            }
          </section>
        }
      </div>

      <div class="od-main">
        <div class="od-scroll od-subs" (contextmenu)="openSubMenu($event, null)">
          <table>
            <thead>
              <tr>
                <th>Sub</th>
                <th>
                  <span class="th-action">
                    Name
                    @if (mappingSelected()) {
                      <button type="button" class="system" (click)="resetAllNames()" [disabled]="!canResetAll" title="Reset the names of all mapping entries to the naming scheme">Reset all</button>
                    }
                  </span>
                </th>
                <th>Obj Type</th>
                <th>Data Type</th>
                <th>SDO</th>
                <th>PDO</th>
                <th>SRDO</th>
                <th>Default Value</th>
              </tr>
            </thead>
            <tbody>
              @for (row of subRows(); track row.key) {
                <tr
                  [class.selected]="row.selected"
                  (click)="selectSub(row.subIndex)"
                  (contextmenu)="openSubMenu($event, row.subIndex)">
                  <td class="mono">{{ row.subLabel }}</td>
                  <td>{{ row.name }}</td>
                  <td>{{ row.objectType }}</td>
                  <td>{{ row.dataType }}</td>
                  <td>{{ row.sdo }}</td>
                  <td>{{ row.pdo }}</td>
                  <td>{{ row.srdo }}</td>
                  <td class="mono">{{ row.defaultValue }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="od-form">
          <div class="od-id-row">
            <label class="od-line compact">
              <span>Index</span>
              <input readonly [value]="indexText()" />
            </label>
            <label class="od-line compact">
              <span>Sub Index</span>
              <input readonly [value]="subText()" />
            </label>
          </div>
          <div class="od-name-row">
            <label class="od-line">
              <span>Name</span>
              <input [ngModel]="draftName" (ngModelChange)="setDraft('name', $event)" [disabled]="!editing()" />
            </label>
            @if (mappingSelected()) {
              <button type="button" class="system" (click)="resetName()" [disabled]="!canResetName">Reset Name</button>
            }
          </div>
          <label class="od-line">
            <span>Denotation</span>
            <input class="peach" [ngModel]="draftDenotation" (ngModelChange)="setDraft('denotation', $event)" [disabled]="!editing()" />
          </label>
          <label class="od-line od-description">
            <span>Description</span>
            <textarea [ngModel]="draftDescription" (ngModelChange)="setDraft('description', $event)" [disabled]="!editing()"></textarea>
          </label>

          <fieldset class="object-settings">
            <legend>Object settings</legend>
            <label class="od-line">
              <span>Object Type</span>
              <select [ngModel]="draftType" disabled>
                @for (type of objectTypes; track type) {
                  <option [value]="type">{{ type }}</option>
                }
              </select>
            </label>
            <label class="od-line">
              <span>HighLimit</span>
              <input [ngModel]="isVar ? draftHigh : ''" (ngModelChange)="setDraft('high', $event)" [disabled]="!isVar" />
            </label>
            <label class="od-line">
              <span>Count Label</span>
              <select #countSelect [ngModel]="draftCount" (ngModelChange)="setCount($event, countSelect)" [disabled]="!isParent">
                @for (label of countLabels(); track label) {
                  <option [value]="label">{{ label }}</option>
                }
              </select>
            </label>

            <label class="od-line">
              <span>Data Type</span>
              <select [ngModel]="isVar ? draftDataType : ''" (ngModelChange)="setDraft('dataType', $event)" [disabled]="!isVar">
                @for (type of dataChoices(draftDataType); track type) {
                  <option [value]="type">{{ type }}</option>
                }
              </select>
            </label>
            <label class="od-line">
              <span>LowLimit</span>
              <input [ngModel]="isVar ? draftLow : ''" (ngModelChange)="setDraft('low', $event)" [disabled]="!isVar" />
            </label>
            <label class="od-line">
              <span>Storage Group</span>
              <select #storageSelect [ngModel]="draftStorage" (ngModelChange)="setStorage($event, storageSelect)" [disabled]="!isParent">
                @for (group of storageLabels(); track group) {
                  <option [value]="group">{{ group }}</option>
                }
              </select>
            </label>

            <label class="od-line">
              <span>Access SDO</span>
              <select [ngModel]="isVar ? sdoShort(draftAccess) : ''" (ngModelChange)="setSdoShort($event)" [disabled]="!isVar">
                <option value="no">no</option>
                <option value="ro">ro</option>
                <option value="wo">wo</option>
                <option value="rw">rw</option>
              </select>
            </label>
            <label class="od-line">
              <span>Actual Value</span>
              <input class="peach" [ngModel]="isVar ? draftActual : ''" (ngModelChange)="setDraft('actual', $event)" [disabled]="!isVar" />
            </label>
            <label class="od-check">
              <span>Enabled</span>
              <input type="checkbox" [ngModel]="!draftDisabled" (ngModelChange)="setDraft('enabled', $event)" [disabled]="!isParent" />
            </label>

            <label class="od-line">
              <span>Access PDO</span>
              <select [ngModel]="isVar ? pdoShort(draftPdo) : ''" (ngModelChange)="setPdoShort($event)" [disabled]="!isVar">
                <option value="no">no</option>
                <option value="t">t</option>
                <option value="r">r</option>
                <option value="tr">tr</option>
              </select>
            </label>
            <label class="od-line">
              <span>String Len Min</span>
              <input type="number" min="0" [ngModel]="isVar ? draftStringLen : ''" (ngModelChange)="setDraft('stringLen', $event)" [disabled]="!isVar" />
            </label>
            <span></span>

            <label class="od-line">
              <span>Access SRDO</span>
              <select [ngModel]="isVar ? draftSrdo : ''" (ngModelChange)="setDraft('srdo', $event)" [disabled]="!isVar">
                <option value="no">no</option>
                <option value="tx">tx</option>
                <option value="rx">rx</option>
                <option value="trx">trx</option>
              </select>
            </label>
            <span></span>
            <span></span>

            <label class="od-line span-2 default-line">
              <span>Default value</span>
              <input [ngModel]="isVar ? draftDefault : ''" (ngModelChange)="setDraft('default', $event)" [disabled]="!isVar" />
            </label>
            <div class="save-row">
              <label class="od-check autosave">
                <input type="checkbox" [(ngModel)]="autosave" />
                <span>Auto Apply</span>
              </label>
              <button type="button" class="system" [class.dirty]="dirty" (click)="saveChanges()" [disabled]="!editing()">Apply</button>
            </div>
          </fieldset>
        </div>
      </div>
    </div>

    @if (menu; as menu) {
      <div class="menu" [style.left.px]="menu.x" [style.top.px]="menu.y" (click)="$event.stopPropagation()" (contextmenu)="$event.preventDefault()">
        @if (menu.kind === 'object') {
          <button type="button" (click)="addObjectDialog()">Add...</button>
          <button type="button" (click)="cloneDialog()" [disabled]="selectedIndex == null">Clone...</button>
          <button type="button" (click)="deleteSelected()" [disabled]="selectedIndex == null">Delete...</button>
          <button type="button" (click)="toggleSelected()" [disabled]="selectedIndex == null">Toggle</button>
        } @else {
          <button type="button" (click)="addSub()" [disabled]="!canAddSub">Add</button>
          <button type="button" (click)="removeSub(true)" [disabled]="!canRemoveSub">Remove (shift up)</button>
          <button type="button" (click)="removeSub(false)" [disabled]="!canRemoveGap">Remove (leave gap)</button>
        }
      </div>
    }

    @if (showAdd) {
      <div class="modal-back">
        <form class="modal" appDraggable (submit)="createObject($event)">
          <h3>Create new OD Index</h3>
          <label class="od-line">
            <span>Index (hex)</span>
            <input [(ngModel)]="addIndex" name="addIndex" />
          </label>
          <label class="od-line">
            <span>Name</span>
            <input [(ngModel)]="addName" name="addName" />
          </label>
          <fieldset>
            <legend>Object Type</legend>
            <label class="check"><input type="radio" name="addType" value="VAR" [(ngModel)]="addType" /> VAR</label>
            <label class="check"><input type="radio" name="addType" value="ARRAY" [(ngModel)]="addType" /> ARRAY</label>
            <label class="check"><input type="radio" name="addType" value="RECORD" [(ngModel)]="addType" /> RECORD</label>
          </fieldset>
          <div class="modal-actions">
            <button type="submit">Create</button>
            <span class="modal-spacer"></span>
            <button type="button" class="quiet" (click)="showAdd = false">Cancel</button>
          </div>
        </form>
      </div>
    }

    @if (cloneSources.length) {
      <app-clone-objects [objects]="cloneSources" (closed)="cloneSources = []" />
    }

    @if (pending) {
      <div class="modal-back">
        <div class="modal" appDraggable>
          <h3>Unapplied Changes</h3>
          <p>You have unapplied changes for index {{ pendingLabel }}.<br>Do you want to apply them and switch to a different object?</p>
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
export class ObjectDictionaryComponent {
  readonly document = input.required<DeviceDocument>();
  readonly revision = input(0);
  readonly changed = output<void>();

  readonly groups = [
    { id: 'communication', title: 'Communication Specific Parameters' },
    { id: 'manufacturer', title: 'Manufacturer Specific Parameters' },
    { id: 'profile', title: 'Device Profile Specific Parameters' },
  ] as const;

  readonly objectTypes: ObjectTypeName[] = ['VAR', 'ARRAY', 'RECORD', 'DOMAIN', 'DEFTYPE', 'DEFSTRUCT', 'NULL'];
  readonly hex = hex4;
  readonly dataChoices = dataTypeChoices;

  selectedIndex: number | null = null;
  selectedSubIndex: number | null = null;
  collapsed: Record<ObjectGroupId, boolean> = {
    communication: false,
    manufacturer: false,
    profile: false,
  };
  dirty = false;
  autosave = false;
  showAdd = false;
  addIndex = '2000';
  addName = 'New Object';
  addType: ObjectTypeName = 'VAR';
  menu: { x: number; y: number; kind: MenuKind } | null = null;
  /** Group and object under the mouse pointer when the object menu was opened. */
  private menuAnchor: { group: ObjectGroupId; index: number | null } | null = null;
  /** Objects selected with Ctrl or Shift in addition to the edited object. */
  extraSelection = new Set<number>();
  cloneSources: OdEntry[] = [];
  pending = false;
  pendingLabel = '';
  draftName = '';
  draftDenotation = '';
  draftDescription = '';
  draftType: ObjectTypeName = 'VAR';
  draftDataType: DataTypeName = 'UNSIGNED32';
  draftAccess: AccessType = 'readWrite';
  draftPdo: PdoMapping = 'no';
  draftSrdo: SrdoAccess = 'no';
  draftDefault = '';
  draftActual = '';
  draftLow = '';
  draftHigh = '';
  draftStringLen = 0;
  draftCount = '';
  draftStorage = 'RAM';
  draftDisabled = false;
  draftFlags = false;

  private readonly dialogs = inject(DialogService);
  private readonly unsaved = inject(UnsavedEditsService);
  private readonly viewState = inject(ViewStateService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private extraCounts: string[] = [];
  private extraStorage: string[] = [];
  private baseline = '';
  private pendingResolve: ((choice: PendingChoice) => void) | null = null;
  private seen: DeviceDocument | null = null;

  constructor() {
    effect(() => {
      const document = this.document();
      this.revision();
      untracked(() => {
        if (document !== this.seen) {
          if (this.seen) {
            this.viewState.set<OdViewState>(this.seen, 'od', {
              index: this.selectedIndex,
              subIndex: this.selectedSubIndex,
              collapsed: this.collapsed,
            });
          }
          this.seen = document;
          this.restoreView(document);
          this.extraSelection.clear();
          this.cloneSources = [];
          this.menu = null;
          this.showAdd = false;
          this.loadDraft();
        } else if (!this.dirty) {
          this.loadDraft();
        }
      });
    });
  }

  private restoreView(document: DeviceDocument): void {
    const saved = this.viewState.get<OdViewState>(document, 'od');
    const object = document.objects.find((entry) => entry.index === saved?.index) ?? document.objects[0];
    this.selectedIndex = object?.index ?? null;
    this.selectedSubIndex = object && saved?.index === object.index
      && object.subObjects.some((sub) => sub.subIndex === saved.subIndex) ? saved.subIndex : null;
    this.collapsed = saved ? { ...saved.collapsed } : { communication: false, manufacturer: false, profile: false };
    setTimeout(() => {
      this.host.nativeElement.querySelectorAll('tr.selected').forEach((row) => row.scrollIntoView({ block: 'nearest' }));
    });
  }

  @HostListener('document:click')
  closeMenu(): void {
    this.menu = null;
  }

  isCollapsed(id: 'communication' | 'manufacturer' | 'profile'): boolean {
    return this.collapsed[id];
  }

  toggleGroup(id: 'communication' | 'manufacturer' | 'profile', event: Event): void {
    event.stopPropagation();
    this.collapsed = { ...this.collapsed, [id]: !this.collapsed[id] };
  }

  sdoShort(value: AccessType): string {
    switch (value) {
      case 'const':
      case 'read':
        return 'ro';
      case 'write':
        return 'wo';
      case 'readWrite':
      case 'readWriteInput':
      case 'readWriteOutput':
        return 'rw';
      default:
        return 'no';
    }
  }

  setSdoShort(value: string): void {
    if (value === 'ro') {
      this.draftAccess = 'read';
    } else if (value === 'wo') {
      this.draftAccess = 'write';
    } else if (value === 'rw') {
      const pdo = this.pdoShort(this.draftPdo);
      this.draftAccess = pdo === 'r' ? 'readWriteOutput' : pdo === 't' ? 'readWriteInput' : 'readWrite';
    } else {
      this.draftAccess = 'noAccess';
    }
    this.applyDraft();
  }

  pdoShort(value: PdoMapping): string {
    if (value === 'TPDO') {
      return 't';
    }
    if (value === 'RPDO') {
      return 'r';
    }
    if (value === 'optional' || value === 'default') {
      return 'tr';
    }
    return 'no';
  }

  setPdoShort(value: string): void {
    if (value === 't') {
      this.draftPdo = 'TPDO';
    } else if (value === 'r') {
      this.draftPdo = 'RPDO';
    } else if (value === 'tr') {
      this.draftPdo = this.draftPdo === 'default' ? 'default' : 'optional';
    } else {
      this.draftPdo = 'no';
    }
    this.applyDraft();
  }

  objectsIn(group: 'communication' | 'manufacturer' | 'profile'): OdEntry[] {
    return this.document().objects.filter((object) => this.groupOf(object.index) === group);
  }

  selected(): OdEntry | null {
    if (this.selectedIndex == null) {
      return null;
    }
    return this.document().objects.find((object) => object.index === this.selectedIndex) ?? null;
  }

  selectedSub(): OdEntry | null {
    if (this.selectedSubIndex == null) {
      return null;
    }
    return this.selected()?.subObjects.find((sub) => sub.subIndex === this.selectedSubIndex) ?? null;
  }

  editing(): OdEntry | null {
    return this.selectedSub() ?? this.selected();
  }

  get isVar(): boolean {
    return this.editing()?.objectType === 'VAR';
  }

  get isParent(): boolean {
    return this.selected() != null && this.selectedSub() == null;
  }

  get canAddSub(): boolean {
    const object = this.selected();
    return object?.objectType === 'ARRAY' || object?.objectType === 'RECORD';
  }

  get canRemoveSub(): boolean {
    return this.selectedSubIndex != null && this.selectedSubIndex > 0;
  }

  get canRemoveGap(): boolean {
    return this.selected()?.objectType === 'RECORD' && this.canRemoveSub;
  }

  subRows(): {
    key: string;
    subIndex: number | null;
    selected: boolean;
    subLabel: string;
    name: string;
    objectType: string;
    dataType: string;
    sdo: string;
    pdo: string;
    srdo: string;
    defaultValue: string;
  }[] {
    const object = this.selected();
    if (!object) {
      return [];
    }
    const parentSelected = this.selectedSubIndex == null;
    const rows = [this.rowFor(object, null, parentSelected, object.objectType === 'VAR')];
    if (object.objectType === 'ARRAY' || object.objectType === 'RECORD') {
      for (const sub of object.subObjects) {
        rows.push(this.rowFor(sub, object, sub.subIndex === this.selectedSubIndex, true));
      }
    }
    return rows;
  }

  indexText(): string {
    const entry = this.editing();
    return entry ? `0x${hex4(entry.index)}` : '';
  }

  subText(): string {
    const sub = this.selectedSub();
    return sub ? `0x${hex2(sub.subIndex)}` : '';
  }

  countLabels(): string[] {
    const labels = new Set<string>(['']);
    for (const object of this.document().objects) {
      if (object.countLabel) {
        labels.add(object.countLabel);
      }
    }
    for (const extra of this.extraCounts) {
      labels.add(extra);
    }
    if (this.draftCount) {
      labels.add(this.draftCount);
    }
    return [...labels, 'Add...'];
  }

  storageLabels(): string[] {
    const labels = new Set<string>(STORAGE_GROUPS);
    for (const object of this.document().objects) {
      if (object.storageGroup) {
        labels.add(object.storageGroup);
      }
    }
    for (const extra of this.extraStorage) {
      labels.add(extra);
    }
    if (this.draftStorage) {
      labels.add(this.draftStorage);
    }
    return [...labels, 'Add...'];
  }

  async selectObject(index: number): Promise<void> {
    if (index === this.selectedIndex && this.selectedSubIndex == null) {
      return;
    }
    if (!(await this.guard())) {
      return;
    }
    this.selectedIndex = index;
    this.selectedSubIndex = null;
    this.loadDraft();
  }

  async selectSub(subIndex: number | null): Promise<void> {
    if (subIndex === this.selectedSubIndex) {
      return;
    }
    if (!(await this.guard())) {
      return;
    }
    this.selectedSubIndex = subIndex;
    this.loadDraft();
  }

  clickObject(event: MouseEvent, group: 'communication' | 'manufacturer' | 'profile', index: number): void {
    const primary = this.selectedIndex;
    if (primary != null && (event.ctrlKey || event.metaKey)) {
      if (index !== primary && !this.extraSelection.delete(index)) {
        this.extraSelection.add(index);
      }
      return;
    }
    if (primary != null && event.shiftKey) {
      const list = this.objectsIn(group).map((object) => object.index);
      const from = list.indexOf(primary);
      const to = list.indexOf(index);
      if (from >= 0 && to >= 0) {
        const range = list.slice(Math.min(from, to), Math.max(from, to) + 1);
        this.extraSelection = new Set(range.filter((entry) => entry !== primary));
        return;
      }
    }
    this.extraSelection.clear();
    void this.selectObject(index);
  }

  selectedObjects(): OdEntry[] {
    return this.document().objects.filter((object) =>
      object.index === this.selectedIndex || this.extraSelection.has(object.index));
  }

  mappingSelected(): boolean {
    return this.selectedIndex != null && isMappingObject(this.selectedIndex);
  }

  /** Only for active entries: counted by sub-index 0x00, mapping an object, in an enabled mapping object. */
  get canResetName(): boolean {
    const map = this.selected();
    const subIndex = this.selectedSubIndex;
    return map != null && isMappingObject(map.index) && !map.disabled && subIndex != null
      && isMappingEntryCounted(map, subIndex)
      && mappingTargetLabel(this.document(), subIndex, this.draftDefault) != null;
  }

  /** Puts the generated name of the selected mapping entry into the name field. */
  resetName(): void {
    if (!this.canResetName) {
      return;
    }
    const label = mappingTargetLabel(this.document(), this.selectedSubIndex!, this.draftDefault);
    if (!label) {
      return;
    }
    this.setDraft('name', label);
  }

  /** Mapping entries whose name differs from the naming scheme, with the generated name. */
  private resettableNames(): { sub: OdEntry; label: string }[] {
    const map = this.selected();
    if (!map || !isMappingObject(map.index) || map.disabled) {
      return [];
    }
    return map.subObjects
      .filter((sub) => isMappingEntryCounted(map, sub.subIndex))
      .map((sub) => ({ sub, label: mappingTargetLabel(this.document(), sub.subIndex, sub.defaultValue) }))
      .filter((item): item is { sub: OdEntry; label: string } => item.label != null);
  }

  get canResetAll(): boolean {
    return this.resettableNames().length > 0;
  }

  /** Resets the names of all active mapping entries and applies them without "Apply". */
  async resetAllNames(): Promise<void> {
    const map = this.selected();
    if (!map || !this.canResetAll || !(await this.guard())) {
      return;
    }
    const ok = await this.dialogs.confirm(
      `Reset the names of all mapping entries of 0x${hex4(map.index)} to "Mapping index - Index/Subindex/Name"?\n\n`
        + 'Names changed by hand are lost. The change is applied immediately.',
      'Warning',
    );
    if (!ok) {
      return;
    }
    for (const edit of this.unsaved.conflicts('od', this.document(), [map.index])) {
      if (!(await this.dialogs.confirm(`${edit.label} has unapplied changes. Overwrite them?`, 'Warning'))) {
        return;
      }
      edit.discard();
    }
    const items = this.resettableNames();
    if (items.every(({ sub, label }) => sub.name === label)) {
      return;
    }
    for (const { sub, label } of items) {
      sub.name = label;
    }
    this.loadDraft();
    this.changed.emit();
  }

  cloneDialog(): void {
    this.menu = null;
    this.cloneSources = this.selectedObjects();
  }

  async openObjectMenu(event: MouseEvent, index: number | null, group: ObjectGroupId): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    this.menuAnchor = { group, index };
    if (index != null && this.extraSelection.has(index)) {
      if (this.dirty && !(await this.guard())) {
        return;
      }
    } else if (index != null && index !== this.selectedIndex) {
      this.extraSelection.clear();
      if (!(await this.guard())) {
        return;
      }
      this.selectedIndex = index;
      this.selectedSubIndex = null;
      this.loadDraft();
    } else if (index != null && this.dirty && !(await this.guard())) {
      return;
    }
    this.menu = { x: event.clientX, y: event.clientY, kind: 'object' };
  }

  async openSubMenu(event: MouseEvent, subIndex: number | null): Promise<void> {
    event.preventDefault();
    event.stopPropagation();
    if (!this.selected()) {
      return;
    }
    if (subIndex !== this.selectedSubIndex) {
      if (!(await this.guard())) {
        return;
      }
      this.selectedSubIndex = subIndex;
      this.loadDraft();
    } else if (this.dirty && !(await this.guard())) {
      return;
    }
    this.menu = { x: event.clientX, y: event.clientY, kind: 'sub' };
  }

  setDraft(field: string, value: string | number | boolean): void {
    switch (field) {
      case 'name': this.draftName = String(value); break;
      case 'denotation': this.draftDenotation = String(value); break;
      case 'description': this.draftDescription = String(value); break;
      case 'dataType': this.draftDataType = value as DataTypeName; break;
      case 'access': this.draftAccess = value as AccessType; break;
      case 'pdo': this.draftPdo = value as PdoMapping; break;
      case 'srdo': this.draftSrdo = value as SrdoAccess; break;
      case 'default': this.setDefault(String(value)); break;
      case 'actual': this.draftActual = String(value); break;
      case 'low': this.draftLow = String(value); break;
      case 'high': this.draftHigh = String(value); break;
      case 'stringLen': this.draftStringLen = Number(value) || 0; break;
      case 'enabled': this.draftDisabled = !value; break;
      case 'flags': this.draftFlags = Boolean(value); break;
      default: break;
    }
    this.applyDraft();
  }

  async setCount(value: string, select: HTMLSelectElement): Promise<void> {
    if (value === 'Add...') {
      const name = (await this.dialogs.prompt('Name of the new count label:', 'Add Count Label'))?.trim();
      if (name) {
        this.extraCounts = [...this.extraCounts, name];
        this.draftCount = name;
        this.applyDraft();
      }
      setTimeout(() => (select.value = this.draftCount));
      return;
    }
    this.draftCount = value;
    this.applyDraft();
  }

  async setStorage(value: string, select: HTMLSelectElement): Promise<void> {
    if (value === 'Add...') {
      const name = (await this.dialogs.prompt('Name of the new storage group:', 'Add Storage Group'))?.trim();
      if (name) {
        this.extraStorage = [...this.extraStorage, name];
        this.draftStorage = name;
        this.applyDraft();
      }
      setTimeout(() => (select.value = this.draftStorage));
      return;
    }
    this.draftStorage = value;
    this.applyDraft();
  }

  /** Writes the draft into the object; false if it was not saved. */
  async saveChanges(): Promise<boolean> {
    const entry = this.editing();
    const parent = this.selected();
    if (!entry || !parent || !this.dirty) {
      return true;
    }
    if (entry !== parent && entry.objectType === 'VAR') {
      const error = checkMappingObject(this.document(), parent, entry.subIndex, this.draftDefault);
      if (error) {
        void this.dialogs.warning(error);
        return false;
      }
      const issues = mappingGranularityIssues(this.document(), parent,
        (sub) => sub.subIndex === entry.subIndex ? this.draftDefault : sub.defaultValue);
      if (issues.length > 0 && !(await this.dialogs.choose(
        granularityMessage(this.document().granularity, issues, 'Apply anyway?'), ['Apply'], 'Warning'))) {
        return false;
      }
    }
    for (const edit of this.unsaved.conflicts('od', this.document(), [parent.index])) {
      if (!(await this.dialogs.confirm(`${edit.label} has unapplied changes. Overwrite them?`, 'Warning'))) {
        return false;
      }
      edit.discard();
    }
    this.writeDraft(entry, parent);
    this.dirty = false;
    this.baseline = this.snapshot();
    this.reportUnsaved();
    this.changed.emit();
    return true;
  }

  async addObjectDialog(): Promise<void> {
    this.menu = null;
    if (!(await this.guard())) {
      return;
    }
    const anchor = this.menuAnchor ?? { group: 'manufacturer' as const, index: null };
    this.addIndex = hex4(nextFreeIndex(this.document().objects, anchor.group, anchor.index));
    this.addName = 'New Object';
    this.addType = 'VAR';
    this.showAdd = true;
  }

  createObject(event: Event): void {
    event.preventDefault();
    const parsed = parseUserIndex(this.addIndex);
    if (parsed == null) {
      void this.dialogs.warning('Enter the index as a hex value between 0 and FFFF.');
      return;
    }
    const name = this.addName.trim();
    if (!name) {
      void this.dialogs.warning('Please specify a name');
      return;
    }
    const entry = createEntry({
      index: parsed,
      name,
      objectType: this.addType,
      dataType: 'UNSIGNED32',
      access: 'readWrite',
      pdoMapping: 'no',
      defaultValue: '0',
    });
    if (entry.objectType === 'ARRAY' || entry.objectType === 'RECORD') {
      entry.defaultValue = '';
      entry.subObjects.push(createEntry({
        index: parsed,
        subIndex: 0,
        name: 'Highest sub-index supported',
        objectType: 'VAR',
        dataType: 'UNSIGNED8',
        access: 'read',
        pdoMapping: 'no',
        defaultValue: '0x01',
      }));
      entry.subObjects.push(createEntry({
        index: parsed,
        subIndex: 1,
        name: 'Sub Object 1',
        objectType: 'VAR',
        dataType: 'UNSIGNED32',
        access: 'readWrite',
        pdoMapping: 'no',
        defaultValue: '0',
      }));
    }
    const error = addObject(this.document(), entry);
    if (error) {
      void this.dialogs.warning(error);
      return;
    }
    this.showAdd = false;
    this.extraSelection.clear();
    this.selectedIndex = parsed;
    this.selectedSubIndex = null;
    this.loadDraft();
    this.changed.emit();
  }

  async deleteSelected(): Promise<void> {
    this.menu = null;
    const objects = this.selectedObjects();
    if (objects.length === 0) {
      return;
    }
    if (!(await this.dialogs.confirm(`Do you really want to delete the selected ${objects.length} items?`))) {
      return;
    }
    objects.forEach((object) => deleteObject(this.document(), object.index));
    this.extraSelection.clear();
    this.selectedIndex = this.document().objects[0]?.index ?? null;
    this.selectedSubIndex = null;
    this.loadDraft();
    this.changed.emit();
  }

  async toggleSelected(): Promise<void> {
    this.menu = null;
    if (!(await this.guard())) {
      return;
    }
    const object = this.selected();
    if (!object) {
      return;
    }
    const disabled = !object.disabled;
    this.selectedObjects().forEach((entry) => (entry.disabled = disabled));
    this.loadDraft();
    this.changed.emit();
  }

  async addSub(): Promise<void> {
    this.menu = null;
    if (!(await this.guard())) {
      return;
    }
    const object = this.selected();
    if (!object) {
      return;
    }
    const error = addSubObject(this.document(), object.index);
    if (error) {
      void this.dialogs.warning(error);
      return;
    }
    this.selectedSubIndex = object.subObjects[object.subObjects.length - 1]?.subIndex ?? null;
    this.loadDraft();
    this.changed.emit();
  }

  async removeSub(shiftUp: boolean): Promise<void> {
    this.menu = null;
    if (!(await this.guard())) {
      return;
    }
    const object = this.selected();
    const subIndex = this.selectedSubIndex;
    if (!object || subIndex == null || subIndex === 0) {
      return;
    }
    deleteSubObject(this.document(), object.index, subIndex);
    if (shiftUp) {
      for (const sub of object.subObjects) {
        if (sub.subIndex > subIndex) {
          sub.subIndex -= 1;
        }
      }
      refreshSubZero(object);
    }
    this.selectedSubIndex = null;
    this.loadDraft();
    this.changed.emit();
  }

  resolvePending(choice: PendingChoice): void {
    this.pending = false;
    this.pendingResolve?.(choice);
    this.pendingResolve = null;
  }

  private groupOf(index: number): 'communication' | 'manufacturer' | 'profile' {
    if (index >= 0x1000 && index < 0x2000) {
      return 'communication';
    }
    if (index >= 0x2000 && index < 0x6000) {
      return 'manufacturer';
    }
    return 'profile';
  }

  private rowFor(entry: OdEntry, parent: OdEntry | null, selected: boolean, detailed: boolean): {
    key: string;
    subIndex: number | null;
    selected: boolean;
    subLabel: string;
    name: string;
    objectType: string;
    dataType: string;
    sdo: string;
    pdo: string;
    srdo: string;
    defaultValue: string;
  } {
    const dataType = entry.dataType !== 'UNKNOWN'
      ? entry.dataType
      : parent?.dataType && parent.dataType !== 'UNKNOWN' ? parent.dataType : entry.dataType;
    return {
      key: parent ? `sub-${entry.subIndex}` : 'parent',
      subIndex: parent ? entry.subIndex : null,
      selected,
      subLabel: parent ? `0x${hex2(entry.subIndex)}` : '',
      name: entry.name,
      objectType: entry.objectType,
      dataType: detailed ? dataType : '',
      sdo: detailed ? this.sdoLabel(entry) : '',
      pdo: detailed ? this.pdoLabel(entry) : '',
      srdo: detailed ? entry.accessSrdo : '',
      defaultValue: detailed ? entry.defaultValue : '',
    };
  }

  private sdoLabel(entry: OdEntry): string {
    return this.sdoShort(entry.access);
  }

  private pdoLabel(entry: OdEntry): string {
    if (entry.pdoMapping === 'RPDO' || entry.access === 'readWriteOutput') {
      return 'r';
    }
    if (entry.pdoMapping === 'TPDO' || entry.access === 'readWriteInput') {
      return 't';
    }
    if (entry.pdoMapping === 'optional' || entry.pdoMapping === 'default') {
      return 'tr';
    }
    return 'no';
  }

  private loadDraft(): void {
    const entry = this.editing();
    const parent = this.selected();
    this.dirty = false;
    if (!entry || !parent) {
      this.draftName = '';
      this.draftDenotation = '';
      this.draftDescription = '';
      this.draftType = 'VAR';
      this.draftDataType = 'UNSIGNED32';
      this.draftAccess = 'readWrite';
      this.draftPdo = 'no';
      this.draftSrdo = 'no';
      this.draftDefault = '';
      this.draftActual = '';
      this.draftLow = '';
      this.draftHigh = '';
      this.draftStringLen = 0;
      this.draftCount = '';
      this.draftStorage = 'RAM';
      this.draftDisabled = false;
      this.draftFlags = false;
      this.baseline = this.snapshot();
      this.reportUnsaved();
      return;
    }
    this.draftName = entry.name;
    this.draftDenotation = entry.denotation;
    this.draftDescription = entry.description;
    this.draftType = entry.objectType;
    this.draftDataType = entry.dataType === 'UNKNOWN' && parent.dataType !== 'UNKNOWN' ? parent.dataType : entry.dataType;
    this.draftAccess = entry.access;
    this.draftPdo = entry.pdoMapping;
    this.draftSrdo = entry.accessSrdo;
    this.draftDefault = entry.defaultValue;
    this.draftActual = entry.actualValue;
    this.draftLow = entry.lowLimit;
    this.draftHigh = entry.highLimit;
    this.draftStringLen = entry.stringLengthMin;
    this.draftCount = parent.countLabel;
    this.draftStorage = parent.storageGroup || 'RAM';
    this.draftDisabled = parent.disabled;
    this.draftFlags = parent.flagsPdo;
    this.baseline = this.snapshot();
    this.reportUnsaved();
  }

  /** Draft edits change the object only when they are saved. */
  private applyDraft(): void {
    this.dirty = this.snapshot() !== this.baseline;
    this.reportUnsaved();
  }

  /** A new default value of a mapping entry that maps another object also gives it the generated name. */
  private setDefault(value: string): void {
    const parent = this.selected();
    const sub = this.selectedSub();
    if (parent && sub && sub.subIndex > 0 && isMappingObject(parent.index) && !sameMappingTarget(this.draftDefault, value)) {
      this.draftName = mappingTargetLabel(this.document(), sub.subIndex, value) ?? this.draftName;
    }
    this.draftDefault = value;
  }

  private reportUnsaved(): void {
    const entry = this.editing();
    this.unsaved.set('od', this.dirty && entry ? {
      document: this.document(),
      indices: [entry.index],
      label: `Index 0x${hex4(entry.index)}/${hex2(this.selectedSub()?.subIndex ?? 0)} in "Object Dictionary"`,
      discard: () => this.loadDraft(),
    } : null);
  }

  private writeDraft(entry: OdEntry, parent: OdEntry): void {
    entry.name = this.draftName;
    entry.denotation = this.draftDenotation;
    entry.description = this.draftDescription;
    if (entry.objectType === 'VAR') {
      entry.dataType = this.draftDataType;
      entry.access = this.draftAccess;
      entry.pdoMapping = this.draftPdo;
      entry.accessSrdo = this.draftSrdo;
      entry.defaultValue = this.draftDefault;
      entry.actualValue = this.draftActual;
      entry.lowLimit = this.draftLow;
      entry.highLimit = this.draftHigh;
      entry.stringLengthMin = this.draftStringLen;
    }
    if (entry === parent) {
      parent.countLabel = this.draftCount;
      parent.storageGroup = this.draftStorage || 'RAM';
      parent.disabled = this.draftDisabled;
      parent.flagsPdo = this.draftFlags;
    }
  }

  private snapshot(): string {
    return JSON.stringify({
      name: this.draftName,
      denotation: this.draftDenotation,
      description: this.draftDescription,
      dataType: this.draftDataType,
      access: this.draftAccess,
      pdo: this.draftPdo,
      srdo: this.draftSrdo,
      defaultValue: this.draftDefault,
      actual: this.draftActual,
      low: this.draftLow,
      high: this.draftHigh,
      stringLen: this.draftStringLen,
      count: this.draftCount,
      storage: this.draftStorage,
      disabled: this.draftDisabled,
      flags: this.draftFlags,
    });
  }

  private async guard(): Promise<boolean> {
    if (!this.dirty) {
      return true;
    }
    if (this.autosave) {
      return this.saveChanges();
    }
    const entry = this.editing();
    this.pendingLabel = entry
      ? `0x${hex4(entry.index)}/${hex2(this.selectedSub()?.subIndex ?? 0)}`
      : '';
    this.pending = true;
    const choice = await new Promise<PendingChoice>((resolve) => {
      this.pendingResolve = resolve;
    });
    if (choice === 'cancel') {
      return false;
    }
    if (choice === 'yes') {
      this.loadDraft();
      return true;
    }
    return this.saveChanges();
  }
}
