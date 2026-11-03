import { Component, effect, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ACCESS_TYPES,
  AccessType,
  DATA_TYPES,
  DataTypeName,
  DeviceDocument,
  OBJECT_TYPE_CODE,
  ObjectTypeName,
  OdEntry,
  PDO_MAPPINGS,
  PdoMapping,
  STORAGE_GROUPS,
  accessChoices,
  addObject,
  addSubObject,
  createEntry,
  dataTypeChoices,
  deleteObject,
  deleteSubObject,
  hex2,
  hex4,
  objectGroup,
  parseUserIndex,
  sortDocument,
} from './model/device';

@Component({
  selector: 'app-object-dictionary',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="od">
      <div class="od-list">
        <div class="od-toolbar">
          <input placeholder="Index or name" [ngModel]="query" (ngModelChange)="query = $event" />
          <button type="button" (click)="showAdd = !showAdd">{{ showAdd ? 'Cancel' : 'Add...' }}</button>
        </div>
        @if (showAdd) {
          <form class="add-box" (submit)="createObject($event)">
            <label>Index (hex)
              <input [(ngModel)]="addIndex" name="addIndex" placeholder="2000" />
            </label>
            <label>Name
              <input [(ngModel)]="addName" name="addName" />
            </label>
            <label>Object Type
              <select [(ngModel)]="addType" name="addType">
                @for (type of objectTypes; track type) {
                  <option [ngValue]="type">{{ type }}</option>
                }
              </select>
            </label>
            <label>Data Type
              <select [(ngModel)]="addDataType" name="addDataType">
                @for (type of dataTypes; track type) {
                  <option [ngValue]="type">{{ type }}</option>
                }
              </select>
            </label>
            <label>Access SDO
              <select [(ngModel)]="addAccess" name="addAccess">
                @for (access of accessTypes; track access) {
                  <option [ngValue]="access">{{ access }}</option>
                }
              </select>
            </label>
            <label>Access PDO
              <select [(ngModel)]="addPdo" name="addPdo">
                @for (pdo of pdoMappings; track pdo) {
                  <option [ngValue]="pdo">{{ pdo }}</option>
                }
              </select>
            </label>
            <label>Default value
              <input [(ngModel)]="addDefault" name="addDefault" />
            </label>
            @if (formError) {
              <p class="error">{{ formError }}</p>
            }
            <button type="submit">Create</button>
          </form>
        }
        <div class="entries">
          @for (object of filtered(); track object.index; let i = $index) {
            @if (i === 0 || group(object.index) !== group(filtered()[i - 1].index)) {
              <div class="group">{{ group(object.index) }}</div>
            }
            <button type="button" class="entry" [class.active]="object.index === selectedIndex" (click)="select(object.index)">
              <span class="mono">{{ hex(object.index) }}</span>
              <span>{{ object.name || 'unnamed' }}</span>
            </button>
          } @empty {
            <p class="hint">No objects. Use Add... to create an entry.</p>
          }
        </div>
      </div>

      <div class="od-detail">
        @if (selected(); as object) {
          <div class="detail-head">
            <h2 class="mono">{{ hex(object.index) }} {{ object.name }}</h2>
            <div class="row-actions">
              @if (object.objectType === 'ARRAY' || object.objectType === 'RECORD') {
                <button type="button" (click)="addSub()">Add</button>
              }
              <button type="button" class="danger" (click)="removeSelected()">Delete...</button>
            </div>
          </div>
          @if (indexError) {
            <p class="error">{{ indexError }}</p>
          }
          @if (editing(); as entry) {
            <div class="detail-form">
              @if (!selectedSub()) {
                <label>Index (hex)
                  <input [ngModel]="indexDraft" (ngModelChange)="indexDraft = $event" (blur)="commitIndex()" />
                </label>
                <label>Object Type
                  <select [ngModel]="entry.objectType" (ngModelChange)="setObjectType(entry, $event)">
                    @for (type of objectTypes; track type) {
                      <option [value]="type">{{ type }} ({{ typeCode(type) }})</option>
                    }
                  </select>
                </label>
              } @else {
                <p class="hint">Sub-index {{ hexByte(entry.subIndex) }} of {{ hex(object.index) }}</p>
                <button type="button" (click)="selectedSubIndex = null">Back to object</button>
              }
              <label>Name
                <input [ngModel]="entry.name" (ngModelChange)="update(entry, 'name', $event)" />
              </label>
              <label>Data Type
                <select [ngModel]="entry.dataType" (ngModelChange)="setDataType(entry, $event)">
                  @for (type of dataChoices(entry.dataType); track type) {
                    <option [value]="type">{{ type }}</option>
                  }
                </select>
              </label>
              <label>Access SDO
                <select [ngModel]="entry.access" (ngModelChange)="setAccess(entry, $event)">
                  @for (access of accessChoices(entry.access); track access) {
                    <option [value]="access">{{ access }}</option>
                  }
                </select>
              </label>
              <label>Access PDO
                <select [ngModel]="entry.pdoMapping" (ngModelChange)="setPdo(entry, $event)">
                  @for (pdo of pdoMappings; track pdo) {
                    <option [value]="pdo">{{ pdo }}</option>
                  }
                </select>
              </label>
              <label>Default value
                <input [ngModel]="entry.defaultValue" (ngModelChange)="update(entry, 'defaultValue', $event)" />
              </label>
              <label>Actual Value
                <input [ngModel]="entry.actualValue" (ngModelChange)="update(entry, 'actualValue', $event)" />
              </label>
              <label>LowLimit
                <input [ngModel]="entry.lowLimit" (ngModelChange)="update(entry, 'lowLimit', $event)" />
              </label>
              <label>HighLimit
                <input [ngModel]="entry.highLimit" (ngModelChange)="update(entry, 'highLimit', $event)" />
              </label>
              <label>Denotation
                <input [ngModel]="entry.denotation" (ngModelChange)="update(entry, 'denotation', $event)" />
              </label>
              <label class="wide">Description
                <textarea rows="5" [ngModel]="entry.description" (ngModelChange)="update(entry, 'description', $event)"></textarea>
              </label>
              <fieldset class="wide">
                <legend>Object settings</legend>
                <div class="checks">
                  <label class="check"><input type="checkbox" [ngModel]="!entry.disabled" (ngModelChange)="update(entry, 'disabled', !$event)" /> Enabled</label>
                  <label class="check"><input type="checkbox" [ngModel]="entry.flagsPdo" (ngModelChange)="update(entry, 'flagsPdo', $event)" /> TPDO COS</label>
                </div>
                <label>Storage Group
                  <input list="storage-groups" [ngModel]="entry.storageGroup" (ngModelChange)="update(entry, 'storageGroup', $event)" />
                </label>
                <datalist id="storage-groups">
                  @for (group of storageGroups; track group) {
                    <option [value]="group"></option>
                  }
                </datalist>
                <label>Count Label
                  <input [ngModel]="entry.countLabel" (ngModelChange)="update(entry, 'countLabel', $event)" />
                </label>
                <label>Access SRDO
                  <select [ngModel]="entry.accessSrdo" (ngModelChange)="setSrdo(entry, $event)">
                    <option value="no">no</option>
                    <option value="tx">tx</option>
                    <option value="rx">rx</option>
                    <option value="trx">trx</option>
                  </select>
                </label>
                <label>String Len Min
                  <input type="number" min="0" [ngModel]="entry.stringLengthMin" (ngModelChange)="setStringLength(entry, $event)" />
                </label>
              </fieldset>
            </div>
          }

          @if (object.subObjects.length > 0) {
            <table>
              <thead>
                <tr>
                  <th>Sub</th>
                  <th>Name</th>
                  <th>Data Type</th>
                  <th>Access SDO</th>
                  <th>Access PDO</th>
                  <th>Default Value</th>
                </tr>
              </thead>
              <tbody>
                @for (sub of object.subObjects; track sub.subIndex) {
                  <tr [class.active]="sub.subIndex === selectedSubIndex" (click)="selectedSubIndex = sub.subIndex">
                    <td class="mono">{{ hexByte(sub.subIndex) }}</td>
                    <td>{{ sub.name }}</td>
                    <td>{{ sub.dataType }}</td>
                    <td>{{ sub.access }}</td>
                    <td>{{ sub.pdoMapping }}</td>
                    <td class="mono">{{ sub.defaultValue }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
        } @else {
          <p class="hint">No object selected.</p>
        }
      </div>
    </div>
  `,
})
export class ObjectDictionaryComponent {
  readonly document = input.required<DeviceDocument>();
  readonly changed = output<void>();

  query = '';
  showAdd = false;
  formError = '';
  indexError = '';
  indexDraft = '';
  selectedIndex: number | null = null;
  selectedSubIndex: number | null = null;
  addIndex = '';
  addName = '';
  addType: ObjectTypeName = 'VAR';
  addDataType: DataTypeName = 'UNSIGNED32';
  addAccess: AccessType = 'readWrite';
  addPdo: PdoMapping = 'no';
  addDefault = '';

  readonly objectTypes: ObjectTypeName[] = ['VAR', 'ARRAY', 'RECORD', 'DOMAIN', 'DEFTYPE', 'DEFSTRUCT', 'NULL'];
  readonly dataTypes = DATA_TYPES;
  readonly accessTypes = ACCESS_TYPES.filter((access) => access !== 'unknown');
  readonly pdoMappings = PDO_MAPPINGS;
  readonly storageGroups = STORAGE_GROUPS;
  readonly group = objectGroup;
  readonly hex = hex4;
  readonly hexByte = hex2;
  readonly dataChoices = dataTypeChoices;
  readonly accessChoices = accessChoices;

  private seen: DeviceDocument | null = null;

  constructor() {
    effect(() => {
      const document = this.document();
      if (document !== this.seen) {
        this.seen = document;
        this.selectedIndex = document.objects[0]?.index ?? null;
        this.selectedSubIndex = null;
        this.query = '';
        this.formError = '';
        this.indexError = '';
        this.syncIndexDraft();
      }
    });
  }

  filtered(): OdEntry[] {
    const query = this.query.trim().toLowerCase();
    const objects = this.document().objects;
    if (!query) {
      return objects;
    }
    return objects.filter((object) => {
      const hex = hex4(object.index).toLowerCase();
      return hex.includes(query) || `0x${hex}`.includes(query) || object.name.toLowerCase().includes(query);
    });
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

  select(index: number): void {
    this.selectedIndex = index;
    this.selectedSubIndex = null;
    this.indexError = '';
    this.syncIndexDraft();
  }

  typeCode(type: ObjectTypeName): number {
    return OBJECT_TYPE_CODE[type];
  }

  update<K extends keyof OdEntry>(entry: OdEntry, key: K, value: OdEntry[K]): void {
    entry[key] = value;
    this.changed.emit();
  }

  setObjectType(entry: OdEntry, value: ObjectTypeName): void {
    entry.objectType = value;
    if ((value === 'ARRAY' || value === 'RECORD') && entry.subObjects.length === 0) {
      addSubObject(this.document(), entry.index);
    }
    this.changed.emit();
  }

  setDataType(entry: OdEntry, value: DataTypeName): void {
    entry.dataType = value;
    this.changed.emit();
  }

  setAccess(entry: OdEntry, value: AccessType): void {
    entry.access = value;
    this.changed.emit();
  }

  setPdo(entry: OdEntry, value: PdoMapping): void {
    entry.pdoMapping = value;
    this.changed.emit();
  }

  setSrdo(entry: OdEntry, value: OdEntry['accessSrdo']): void {
    entry.accessSrdo = value;
    this.changed.emit();
  }

  setStringLength(entry: OdEntry, value: number | string): void {
    const parsed = Number(value);
    entry.stringLengthMin = Number.isFinite(parsed) ? parsed : 0;
    this.changed.emit();
  }

  commitIndex(): void {
    const object = this.selected();
    if (!object) {
      return;
    }
    const parsed = parseUserIndex(this.indexDraft);
    if (parsed == null) {
      this.indexError = 'Enter the index as a hex value between 0 and FFFF.';
      this.indexDraft = hex4(object.index);
      return;
    }
    if (parsed !== object.index && this.document().objects.some((item) => item.index === parsed)) {
      this.indexError = `Index ${hex4(parsed)} already exists.`;
      this.indexDraft = hex4(object.index);
      return;
    }
    object.index = parsed;
    for (const sub of object.subObjects) {
      sub.index = parsed;
    }
    sortDocument(this.document());
    this.selectedIndex = parsed;
    this.indexError = '';
    this.syncIndexDraft();
    this.changed.emit();
  }

  createObject(event: Event): void {
    event.preventDefault();
    const parsed = parseUserIndex(this.addIndex);
    if (parsed == null) {
      this.formError = 'Enter the index as a hex value between 0 and FFFF.';
      return;
    }
    const entry = createEntry({
      index: parsed,
      name: this.addName.trim() || 'New Object',
      objectType: this.addType,
      dataType: this.addDataType,
      access: this.addAccess,
      pdoMapping: this.addPdo,
      defaultValue: this.addDefault,
    });
    if (entry.objectType === 'ARRAY' || entry.objectType === 'RECORD') {
      entry.subObjects.push(createEntry({
        index: parsed,
        subIndex: 0,
        name: 'Highest sub-index supported',
        objectType: 'VAR',
        dataType: 'UNSIGNED8',
        access: 'const',
        pdoMapping: 'no',
        defaultValue: '0',
      }));
    }
    const error = addObject(this.document(), entry);
    if (error) {
      this.formError = error;
      return;
    }
    this.formError = '';
    this.showAdd = false;
    this.addIndex = '';
    this.addName = '';
    this.addDefault = '';
    this.selectedIndex = parsed;
    this.selectedSubIndex = null;
    this.syncIndexDraft();
    this.changed.emit();
  }

  addSub(): void {
    const object = this.selected();
    if (!object) {
      return;
    }
    const error = addSubObject(this.document(), object.index);
    if (error) {
      this.formError = error;
      return;
    }
    this.formError = '';
    this.selectedSubIndex = object.subObjects[object.subObjects.length - 1]?.subIndex ?? null;
    this.changed.emit();
  }

  removeSelected(): void {
    const object = this.selected();
    if (!object) {
      return;
    }
    const sub = this.selectedSub();
    const label = sub ? `Sub-index ${hex2(sub.subIndex)}` : `${hex4(object.index)} ${object.name}`;
    if (!confirm(`Delete ${label}?`)) {
      return;
    }
    if (sub) {
      deleteSubObject(this.document(), object.index, sub.subIndex);
      this.selectedSubIndex = null;
    } else {
      deleteObject(this.document(), object.index);
      this.selectedIndex = this.document().objects[0]?.index ?? null;
      this.syncIndexDraft();
    }
    this.changed.emit();
  }

  private syncIndexDraft(): void {
    const object = this.selected();
    this.indexDraft = object ? hex4(object.index) : '';
  }
}
