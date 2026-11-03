import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BAUD_OPTIONS, BaudRates, DeviceDocument } from './model/device';

@Component({
  selector: 'app-device-info',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="info-layout">
      <div class="info-col">
        <fieldset>
          <legend>Device Info</legend>
          <label class="info-line">Product name
            <input [ngModel]="document().productName" (ngModelChange)="set('productName', $event)" />
          </label>
          <label class="info-line">Product ID
            <input [ngModel]="document().productId" (ngModelChange)="set('productId', $event)" />
          </label>
          <label class="info-line">Vendor name
            <input [ngModel]="document().vendorName" (ngModelChange)="set('vendorName', $event)" />
          </label>
          <label class="info-line">Vendor ID
            <input [ngModel]="document().vendorId" (ngModelChange)="set('vendorId', $event)" />
          </label>
        </fieldset>

        <fieldset>
          <legend>File Info</legend>
          <label class="info-line">File version
            <input [ngModel]="document().fileVersion" (ngModelChange)="set('fileVersion', $event)" />
          </label>
          <label class="info-line">Description
            <input [ngModel]="document().description" (ngModelChange)="set('description', $event)" />
          </label>
          <label class="info-line">Creation Date/Time
            <input [ngModel]="stamp(document().fileCreationDate, document().fileCreationTime)" (ngModelChange)="setStamp('fileCreationDate', 'fileCreationTime', $event)" />
          </label>
          <label class="info-line">Created By
            <input [ngModel]="document().fileCreator" (ngModelChange)="set('fileCreator', $event)" />
          </label>
          <label class="info-line">Modification Date/Time
            <input [ngModel]="stamp(document().fileModificationDate, document().fileModificationTime)" (ngModelChange)="setStamp('fileModificationDate', 'fileModificationTime', $event)" />
          </label>
          <label class="info-line">Modified by
            <input [ngModel]="document().fileModifiedBy" (ngModelChange)="set('fileModifiedBy', $event)" />
          </label>
        </fieldset>

        <fieldset>
          <legend>Project Info</legend>
          <label class="info-line">Project file (version)
            <input readonly [value]="document().fileName" />
          </label>
          <label class="info-line">XDD v1.1 file - stripped
            <input readonly value="" />
          </label>
          <label class="info-line">EDS file
            <input readonly value="" />
          </label>
          <label class="info-line">DCF file
            <input readonly value="" />
          </label>
          <label class="info-line">CANopenNode file (ver)
            <input readonly value="" />
          </label>
          <label class="info-line">Documentation file
            <input readonly value="" />
          </label>
        </fieldset>
      </div>

      <div class="info-col">
        <div class="info-split">
          <fieldset>
            <legend>Baudrates</legend>
            <div class="info-checks">
              @for (option of visibleBauds; track option.key) {
                <label class="check">
                  <input type="checkbox" [ngModel]="document().baudRates[option.key]" (ngModelChange)="setBaud(option.key, $event)" />
                  {{ option.label }}
                </label>
              }
            </div>
          </fieldset>
          <fieldset>
            <legend>General and Master Features</legend>
            <label class="info-line">Granularity
              <input type="number" min="0" max="64" [ngModel]="document().granularity" (ngModelChange)="setNumber('granularity', $event)" />
            </label>
            <label class="info-line">RPDO count
              <input readonly [value]="document().nrOfRxPdo" />
            </label>
            <label class="info-line">TPDO count
              <input readonly [value]="document().nrOfTxPdo" />
            </label>
            <div class="info-checks">
              <label class="check"><input type="checkbox" [ngModel]="document().lssSlave" (ngModelChange)="set('lssSlave', $event)" /> LSS Slave</label>
              <label class="check"><input type="checkbox" [ngModel]="document().lssMaster" (ngModelChange)="set('lssMaster', $event)" /> LSS Master</label>
              <label class="check"><input type="checkbox" [ngModel]="document().ngSlave" (ngModelChange)="set('ngSlave', $event)" /> Node guarding Slave</label>
              <label class="check"><input type="checkbox" [ngModel]="document().ngMaster" (ngModelChange)="set('ngMaster', $event)" /> Node guarding Master</label>
            </div>
            <label class="info-line">No of monitored nodes
              <input type="number" min="0" [ngModel]="document().nrOfNgMonitoredNodes" (ngModelChange)="setNumber('nrOfNgMonitoredNodes', $event)" />
            </label>
          </fieldset>
        </div>

        <fieldset>
          <legend>Device commissioning</legend>
          <label class="info-line">Concrete node ID
            <input class="peach" readonly value="" />
          </label>
          <label class="info-line">Node name
            <input class="peach" readonly value="" />
          </label>
          <label class="info-line">Baudrate
            <input class="peach" readonly value="" />
          </label>
          <label class="info-line">Net number
            <input class="peach" readonly value="" />
          </label>
          <label class="info-line">Net name
            <input class="peach" readonly value="" />
          </label>
          <label class="info-line">CANopen Manager
            <input type="checkbox" disabled />
          </label>
          <label class="info-line">LSS Serial no
            <input class="peach" readonly value="" />
          </label>
        </fieldset>
      </div>

      <fieldset class="info-wide">
        <legend>Additional device information</legend>
        <label class="info-line">Revision number
          <input readonly value="" />
        </label>
        <label class="info-line">Order code
          <input [ngModel]="document().orderCode" (ngModelChange)="set('orderCode', $event)" />
        </label>
        <label class="info-line">Commissioning network name
          <input readonly value="" />
        </label>
      </fieldset>
    </div>
  `,
})
export class DeviceInfoComponent {
  readonly document = input.required<DeviceDocument>();
  readonly changed = output<void>();
  readonly visibleBauds = BAUD_OPTIONS.filter((option) => option.key !== 'b100');

  set<K extends keyof DeviceDocument>(key: K, value: DeviceDocument[K]): void {
    this.document()[key] = value;
    this.changed.emit();
  }

  setNumber(key: 'granularity' | 'nrOfNgMonitoredNodes', value: number | string): void {
    const parsed = Number(value);
    this.document()[key] = Number.isFinite(parsed) ? parsed : 0;
    this.changed.emit();
  }

  setBaud(key: keyof BaudRates, value: boolean): void {
    this.document().baudRates[key] = value;
    this.changed.emit();
  }

  stamp(date: string, time: string): string {
    return [date, time].filter((part) => part).join(' ');
  }

  setStamp(
    dateKey: 'fileCreationDate' | 'fileModificationDate',
    timeKey: 'fileCreationTime' | 'fileModificationTime',
    value: string,
  ): void {
    const text = value.trim();
    const split = text.indexOf(' ');
    if (split === -1) {
      this.document()[dateKey] = text;
      this.document()[timeKey] = '';
    } else {
      this.document()[dateKey] = text.slice(0, split);
      this.document()[timeKey] = text.slice(split + 1);
    }
    this.changed.emit();
  }
}
