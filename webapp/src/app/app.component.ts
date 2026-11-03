import { Component, signal } from '@angular/core';
import { DeviceInfoComponent } from './device-info.component';
import { ObjectDictionaryComponent } from './object-dictionary.component';
import { PdoViewComponent } from './pdo-view.component';
import { OpenDevice, ProjectStore } from './state/project.store';

type EditorTab = 'info' | 'od' | 'pdo';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [DeviceInfoComponent, ObjectDictionaryComponent, PdoViewComponent],
  template: `
    <div class="shell">
      <header class="top">
        <div class="brand">
          <span class="mark">OD</span>
          <div>
            <strong>CANopen Editor</strong>
            <small>Objektverzeichnis, nur XDD</small>
          </div>
        </div>
        <div class="actions">
          <button type="button" (click)="store.newDevice()">Neu</button>
          <button type="button" (click)="picker.click()">Öffnen</button>
          <button type="button" (click)="save()" [disabled]="!store.selected()">Speichern</button>
          <button type="button" class="quiet" (click)="loadExample()">Beispiel</button>
          <input #picker hidden type="file" accept=".xdd,application/xml" (change)="openFile($event)" />
        </div>
      </header>

      @if (store.error(); as error) {
        <p class="banner error">{{ error }}</p>
      } @else if (store.status()) {
        <p class="banner">{{ store.status() }}</p>
      }

      <div class="workspace">
        <aside>
          <h2>Geräte</h2>
          @for (device of store.devices(); track device.id) {
            <div class="device" [class.active]="device.id === store.selectedId()" (click)="store.select(device.id)">
              <div>
                <strong>{{ device.document.productName || 'Unbenannt' }}</strong>
                <small>{{ device.fileName }}{{ device.dirty ? ' · geändert' : '' }}</small>
              </div>
              <button type="button" (click)="close(device, $event)" aria-label="Gerät schließen">×</button>
            </div>
          } @empty {
            <p class="hint">Noch kein Gerät geöffnet.</p>
          }
        </aside>

        <main>
          @if (store.selected(); as device) {
            <div class="main-head">
              <div class="tabs">
                <button type="button" [class.active]="tab() === 'info'" (click)="tab.set('info')">Gerät</button>
                <button type="button" [class.active]="tab() === 'od'" (click)="tab.set('od')">Objektverzeichnis</button>
                <button type="button" [class.active]="tab() === 'pdo'" (click)="tab.set('pdo')">PDO</button>
              </div>
              <span class="schema">XDD {{ device.document.schemaVersion }} · Speichern schreibt XDD 1.1</span>
            </div>
            <div class="pane" [hidden]="tab() !== 'info'">
              <app-device-info [document]="device.document" (changed)="store.touch(device.id)" />
            </div>
            <div class="pane" [hidden]="tab() !== 'od'">
              <app-object-dictionary [document]="device.document" (changed)="store.touch(device.id)" />
            </div>
            <div class="pane" [hidden]="tab() !== 'pdo'">
              <app-pdo-view [document]="device.document" (changed)="store.touch(device.id)" />
            </div>
          } @else {
            <section class="empty">
              <h2>CANopen-Objektverzeichnis</h2>
              <p>Diese Webapp bildet den Editor aus der Desktop-Anwendung ab: Geräteinformationen, Objektverzeichnis und PDO.</p>
              <p>Gelesen und geschrieben wird ausschließlich das Dateiformat <strong>XDD</strong> (CiA 311, XML Device Description). EDS, DCF, XDC, Dokumentation und C-Quelltext werden weder importiert noch exportiert.</p>
              <div class="actions">
                <button type="button" (click)="store.newDevice()">Neues Gerät</button>
                <button type="button" (click)="loadExample()">Beispiel-XDD öffnen</button>
              </div>
            </section>
          }
        </main>
      </div>
    </div>
  `,
})
export class AppComponent {
  readonly tab = signal<EditorTab>('info');

  constructor(readonly store: ProjectStore) {}

  openFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (!file.name.toLowerCase().endsWith('.xdd')) {
      this.store.error.set('Es werden nur XDD-Dateien gelesen. Andere Formate werden weder importiert noch exportiert.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.store.openXml(file.name, String(reader.result ?? ''));
    };
    reader.onerror = () => {
      this.store.error.set('Die Datei konnte nicht gelesen werden.');
    };
    reader.readAsText(file);
  }

  save(): void {
    const device = this.store.selected();
    if (!device) {
      return;
    }
    const result = this.store.serialize(device);
    const blob = new Blob([result.xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.fileName;
    anchor.click();
    URL.revokeObjectURL(url);
    this.store.markSaved(device.id, result.fileName);
  }

  close(device: OpenDevice, event: Event): void {
    event.stopPropagation();
    const name = device.document.productName || device.fileName;
    if (device.dirty && !confirm(`„${name}“ hat ungespeicherte Änderungen. Schließen?`)) {
      return;
    }
    this.store.close(device.id);
  }

  async loadExample(): Promise<void> {
    try {
      const response = await fetch('minimal_project.xdd');
      if (!response.ok) {
        throw new Error('Beispiel nicht gefunden');
      }
      this.store.openXml('minimal_project.xdd', await response.text());
    } catch {
      this.store.error.set('Das Beispiel-XDD konnte nicht geladen werden.');
    }
  }
}
