import { Component, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BAUD_OPTIONS, BaudRates, DeviceDocument } from './model/device';
import { DialogService } from './state/dialog.service';
import { granularityMessage, pdoGranularityIssues } from './xdd/pdo';
import { usedHeartbeatConsumers } from './xdd/heartbeat';

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
              <input type="number" min="1" max="64" step="1" [value]="document().granularity" (change)="setNumber('granularity', $any($event.target))" />
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
            <div class="info-line info-action">
              <label for="nr-of-monitored-nodes">No of monitored nodes</label>
              <input id="nr-of-monitored-nodes" type="number" min="0" max="127" step="1" [value]="document().nrOfNgMonitoredNodes" (change)="setNumber('nrOfNgMonitoredNodes', $any($event.target))" />
              <button type="button" class="system" (click)="refreshMonitoredNodes()" title="Count the used entries of 0x1016 Consumer heartbeat time">Refresh</button>
            </div>
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

  readonly numberFields = {
    granularity: { label: 'Granularity', min: 1, max: 64 },
    nrOfNgMonitoredNodes: { label: 'No of monitored nodes', min: 0, max: 127 },
  } as const;
  private readonly dialogs = inject(DialogService);

  /** Invalid input is never replaced silently: a warning offers the correction, Cancel keeps the old value. */
  /** Sets "No of monitored nodes" to the number of used entries of 0x1016. */
  refreshMonitoredNodes(): void {
    const value = Math.min(127, usedHeartbeatConsumers(this.document()));
    if (value !== this.document().nrOfNgMonitoredNodes) {
      this.document().nrOfNgMonitoredNodes = value;
      this.changed.emit();
    }
  }

  async setNumber(key: 'granularity' | 'nrOfNgMonitoredNodes', input: HTMLInputElement): Promise<void> {
    const { label, min, max } = this.numberFields[key];
    const text = input.value.trim();
    const parsed = text === '' ? Number.NaN : Number(text);
    let value: number | null = parsed;
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      const rule = `"${label}" allows only whole numbers from ${min} to ${max}.`;
      if (Number.isFinite(parsed)) {
        const corrected = Math.min(max, Math.max(min, Math.round(parsed)));
        value = (await this.dialogs.confirm(`${rule} Change the value ${text} to ${corrected}?`, 'Warning')) ? corrected : null;
      } else {
        await this.dialogs.warning(rule);
        value = null;
      }
    }
    if (value == null) {
      input.value = String(this.document()[key]);
      input.focus();
      return;
    }
    input.value = String(value);
    if (value !== this.document()[key]) {
      this.document()[key] = value;
      this.changed.emit();
      const issues = key === 'granularity' ? pdoGranularityIssues(this.document()) : [];
      if (issues.length > 0) {
        void this.dialogs.warning(granularityMessage(value, issues, 'Adjust the PDO mapping or the granularity.'));
      }
      const consumers = key === 'nrOfNgMonitoredNodes' ? usedHeartbeatConsumers(this.document()) : 0;
      if (value < consumers) {
        void this.dialogs.warning(`0x1016 Consumer heartbeat time monitors ${consumers} nodes, `
          + `but "No of monitored nodes" is ${value}.`);
      }
    }
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
