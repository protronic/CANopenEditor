import { Component, ElementRef, HostListener, effect, inject } from '@angular/core';
import { DialogService } from './state/dialog.service';

@Component({
  selector: 'app-dialog-host',
  standalone: true,
  template: `
    @if (dialogs.current(); as dialog) {
      <div class="modal-back dialog-back">
        <div class="modal dialog-box" [class]="dialog.kind" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title">
          <h3 id="dialog-title">{{ dialog.title }}</h3>
          <p>{{ dialog.text }}</p>
          <div class="modal-actions">
            <span class="modal-spacer"></span>
            <button type="button" class="dialog-ok" (click)="dialogs.close(true)">OK</button>
            @if (dialog.kind === 'confirm') {
              <button type="button" class="quiet" (click)="dialogs.close(false)">Cancel</button>
            }
          </div>
        </div>
      </div>
    }
  `,
})
export class DialogHostComponent {
  readonly dialogs = inject(DialogService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    effect(() => {
      if (this.dialogs.current()) {
        requestAnimationFrame(() => this.host.nativeElement.querySelector<HTMLButtonElement>('.dialog-ok')?.focus());
      }
    });
  }

  @HostListener('document:keydown.escape', ['$event'])
  cancel(event: Event): void {
    const dialog = this.dialogs.current();
    if (dialog) {
      event.stopPropagation();
      this.dialogs.close(dialog.kind !== 'confirm');
    }
  }
}
