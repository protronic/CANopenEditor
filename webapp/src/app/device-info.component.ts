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
        <h2>Gerät</h2>
        <label>Produktname
          <input [ngModel]="document().productName" (ngModelChange)="set('productName', $event)" />
        </label>
        <label>Hersteller
          <input [ngModel]="document().vendorName" (ngModelChange)="set('vendorName', $event)" />
        </label>
        <label>Hersteller-ID
          <input [ngModel]="document().vendorId" (ngModelChange)="set('vendorId', $event)" />
        </label>
        <label>Produkt-ID
          <input [ngModel]="document().productId" (ngModelChange)="set('productId', $event)" />
        </label>
        <label>Bestellnummer
          <input [ngModel]="document().orderCode" (ngModelChange)="set('orderCode', $event)" />
        </label>
        <label>Beschreibung
          <textarea rows="4" [ngModel]="document().description" (ngModelChange)="set('description', $event)"></textarea>
        </label>
      </section>

      <section>
        <h2>Versionen</h2>
        <label>Software
          <input [ngModel]="document().versionSw" (ngModelChange)="set('versionSw', $event)" />
        </label>
        <label>Firmware
          <input [ngModel]="document().versionFw" (ngModelChange)="set('versionFw', $event)" />
        </label>
        <label>Hardware
          <input [ngModel]="document().versionHw" (ngModelChange)="set('versionHw', $event)" />
        </label>
        <h2>Datei</h2>
        <label>Dateiname
          <input [ngModel]="document().fileName" (ngModelChange)="set('fileName', $event)" />
        </label>
        <label>Dateiversion
          <input [ngModel]="document().fileVersion" (ngModelChange)="set('fileVersion', $event)" />
        </label>
        <label>Erstellt von
          <input [ngModel]="document().fileCreator" (ngModelChange)="set('fileCreator', $event)" />
        </label>
        <label>Erstellt am
          <input [ngModel]="document().fileCreationDate" (ngModelChange)="set('fileCreationDate', $event)" />
        </label>
        <label>Erstellt um
          <input [ngModel]="document().fileCreationTime" (ngModelChange)="set('fileCreationTime', $event)" />
        </label>
        <label>Geändert von
          <input [ngModel]="document().fileModifiedBy" (ngModelChange)="set('fileModifiedBy', $event)" />
        </label>
        <label>Geändert am
          <input [ngModel]="document().fileModificationDate" (ngModelChange)="set('fileModificationDate', $event)" />
        </label>
        <label>Geändert um
          <input [ngModel]="document().fileModificationTime" (ngModelChange)="set('fileModificationTime', $event)" />
        </label>
      </section>

      <section>
        <h2>Baudraten</h2>
        <div class="checks">
          @for (option of baudOptions; track option.key) {
            <label class="check">
              <input type="checkbox" [ngModel]="document().baudRates[option.key]" (ngModelChange)="setBaud(option.key, $event)" />
              {{ option.label }}
            </label>
          }
        </div>
        <h2>Netzwerk</h2>
        <label>Granularität
          <input type="number" min="0" max="64" [ngModel]="document().granularity" (ngModelChange)="setNumber('granularity', $event)" />
        </label>
        <label>Anzahl RPDO
          <input type="number" min="0" [ngModel]="document().nrOfRxPdo" (ngModelChange)="setNumber('nrOfRxPdo', $event)" />
        </label>
        <label>Anzahl TPDO
          <input type="number" min="0" [ngModel]="document().nrOfTxPdo" (ngModelChange)="setNumber('nrOfTxPdo', $event)" />
        </label>
        <label>Überwachte Knoten (NG)
          <input type="number" min="0" [ngModel]="document().nrOfNgMonitoredNodes" (ngModelChange)="setNumber('nrOfNgMonitoredNodes', $event)" />
        </label>
        <div class="checks">
          <label class="check"><input type="checkbox" [ngModel]="document().bootUpSlave" (ngModelChange)="set('bootUpSlave', $event)" /> Boot-up Slave</label>
          <label class="check"><input type="checkbox" [ngModel]="document().bootUpMaster" (ngModelChange)="set('bootUpMaster', $event)" /> Boot-up Master</label>
          <label class="check"><input type="checkbox" [ngModel]="document().lssSlave" (ngModelChange)="set('lssSlave', $event)" /> LSS Slave</label>
          <label class="check"><input type="checkbox" [ngModel]="document().lssMaster" (ngModelChange)="set('lssMaster', $event)" /> LSS Master</label>
          <label class="check"><input type="checkbox" [ngModel]="document().ngSlave" (ngModelChange)="set('ngSlave', $event)" /> Node Guarding Slave</label>
          <label class="check"><input type="checkbox" [ngModel]="document().ngMaster" (ngModelChange)="set('ngMaster', $event)" /> Node Guarding Master</label>
          <label class="check"><input type="checkbox" [ngModel]="document().groupMessaging" (ngModelChange)="set('groupMessaging', $event)" /> Group Messaging</label>
          <label class="check"><input type="checkbox" [ngModel]="document().dynamicChannels" (ngModelChange)="set('dynamicChannels', $event)" /> Dynamische Kanäle</label>
        </div>
      </section>

      <section>
        <h2>Dummy-Einträge</h2>
        <p class="hint">Ungenutzte Bits im PDO-Mapping. Der Wert wird im XDD als Dummy0001 bis Dummy0007 gespeichert.</p>
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
