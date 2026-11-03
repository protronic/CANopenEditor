import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BAUD_OPTIONS, BaudRates, DeviceDocument } from './model/device';

@Component({
  selector: 'app-device-info',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="form-grid">
      <section>
        <h2>Device Info</h2>
        <label>Vendor name
          <input [ngModel]="document().vendorName" (ngModelChange)="set('vendorName', $event)" />
        </label>
        <label>Vendor ID
          <input [ngModel]="document().vendorId" (ngModelChange)="set('vendorId', $event)" />
        </label>
        <label>Product name
          <input [ngModel]="document().productName" (ngModelChange)="set('productName', $event)" />
        </label>
        <label>Product ID
          <input [ngModel]="document().productId" (ngModelChange)="set('productId', $event)" />
        </label>
        <label>Order code
          <input [ngModel]="document().orderCode" (ngModelChange)="set('orderCode', $event)" />
        </label>
        <label>SW version
          <input [ngModel]="document().versionSw" (ngModelChange)="set('versionSw', $event)" />
        </label>
        <label>FW version
          <input [ngModel]="document().versionFw" (ngModelChange)="set('versionFw', $event)" />
        </label>
        <label>HW version
          <input [ngModel]="document().versionHw" (ngModelChange)="set('versionHw', $event)" />
        </label>
      </section>

      <section>
        <h2>File Info</h2>
        <label>File name
          <input [ngModel]="document().fileName" (ngModelChange)="set('fileName', $event)" />
        </label>
        <label>File version
          <input [ngModel]="document().fileVersion" (ngModelChange)="set('fileVersion', $event)" />
        </label>
        <label>Description
          <textarea rows="4" [ngModel]="document().description" (ngModelChange)="set('description', $event)"></textarea>
        </label>
        <label>Created By
          <input [ngModel]="document().fileCreator" (ngModelChange)="set('fileCreator', $event)" />
        </label>
        <label>Creation Date
          <input [ngModel]="document().fileCreationDate" (ngModelChange)="set('fileCreationDate', $event)" />
        </label>
        <label>Creation Time
          <input [ngModel]="document().fileCreationTime" (ngModelChange)="set('fileCreationTime', $event)" />
        </label>
        <label>Modified by
          <input [ngModel]="document().fileModifiedBy" (ngModelChange)="set('fileModifiedBy', $event)" />
        </label>
        <label>Modification Date
          <input [ngModel]="document().fileModificationDate" (ngModelChange)="set('fileModificationDate', $event)" />
        </label>
        <label>Modification Time
          <input [ngModel]="document().fileModificationTime" (ngModelChange)="set('fileModificationTime', $event)" />
        </label>
      </section>

      <section>
        <h2>Baudrates</h2>
        <div class="checks">
          @for (option of baudOptions; track option.key) {
            <label class="check">
              <input type="checkbox" [ngModel]="document().baudRates[option.key]" (ngModelChange)="setBaud(option.key, $event)" />
              {{ option.label }}
            </label>
          }
        </div>
        <h2>General and Master Features</h2>
        <label>Granularity
          <input type="number" min="0" max="64" [ngModel]="document().granularity" (ngModelChange)="setNumber('granularity', $event)" />
        </label>
        <label>RPDO count
          <input type="number" min="0" [ngModel]="document().nrOfRxPdo" (ngModelChange)="setNumber('nrOfRxPdo', $event)" />
        </label>
        <label>TPDO count
          <input type="number" min="0" [ngModel]="document().nrOfTxPdo" (ngModelChange)="setNumber('nrOfTxPdo', $event)" />
        </label>
        <label>No of monitored nodes
          <input type="number" min="0" [ngModel]="document().nrOfNgMonitoredNodes" (ngModelChange)="setNumber('nrOfNgMonitoredNodes', $event)" />
        </label>
        <div class="checks">
          <label class="check"><input type="checkbox" [ngModel]="document().bootUpSlave" (ngModelChange)="set('bootUpSlave', $event)" /> Boot-up Slave</label>
          <label class="check"><input type="checkbox" [ngModel]="document().bootUpMaster" (ngModelChange)="set('bootUpMaster', $event)" /> Boot-up Master</label>
          <label class="check"><input type="checkbox" [ngModel]="document().lssSlave" (ngModelChange)="set('lssSlave', $event)" /> LSS Slave</label>
          <label class="check"><input type="checkbox" [ngModel]="document().lssMaster" (ngModelChange)="set('lssMaster', $event)" /> LSS Master</label>
          <label class="check"><input type="checkbox" [ngModel]="document().ngSlave" (ngModelChange)="set('ngSlave', $event)" /> Node guarding Slave</label>
          <label class="check"><input type="checkbox" [ngModel]="document().ngMaster" (ngModelChange)="set('ngMaster', $event)" /> Node guarding Master</label>
          <label class="check"><input type="checkbox" [ngModel]="document().groupMessaging" (ngModelChange)="set('groupMessaging', $event)" /> Group messaging</label>
          <label class="check"><input type="checkbox" [ngModel]="document().dynamicChannels" (ngModelChange)="set('dynamicChannels', $event)" /> Dynamic channels</label>
        </div>
      </section>

      <section>
        <h2>Dummy usage</h2>
        <p class="hint">Unused bits in a PDO mapping. Stored in the XDD as Dummy0001 to Dummy0007.</p>
        <div class="checks">
          @for (used of document().dummy; track $index) {
            <label class="check">
              <input type="checkbox" [ngModel]="used" (ngModelChange)="setDummy($index, $event)" />
              Dummy000{{ $index + 1 }}
            </label>
          }
        </div>
      </section>
    </div>
  `,
})
export class DeviceInfoComponent {
  readonly document = input.required<DeviceDocument>();
  readonly changed = output<void>();
  readonly baudOptions = BAUD_OPTIONS;

  set<K extends keyof DeviceDocument>(key: K, value: DeviceDocument[K]): void {
    this.document()[key] = value;
    this.changed.emit();
  }

  setNumber(key: 'granularity' | 'nrOfRxPdo' | 'nrOfTxPdo' | 'nrOfNgMonitoredNodes', value: number | string): void {
    const parsed = Number(value);
    this.document()[key] = Number.isFinite(parsed) ? parsed : 0;
    this.changed.emit();
  }

  setBaud(key: keyof BaudRates, value: boolean): void {
    this.document().baudRates[key] = value;
    this.changed.emit();
  }

  setDummy(index: number, value: boolean): void {
    this.document().dummy[index] = value;
    this.changed.emit();
  }
}
