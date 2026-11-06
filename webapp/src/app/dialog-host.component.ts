import { Component, ElementRef, HostListener, effect, inject } from '@angular/core';
import { DraggableDirective } from './draggable.directive';
import { DialogService } from './state/dialog.service';

@Component({
  selector: 'app-dialog-host',
  standalone: true,
  imports: [DraggableDirective],
  template: `
    @if (dialogs.current(); as dialog) {
      <div class="modal-back dialog-back">
        <div class="modal dialog-box" [appDraggable]="dialog" [class]="dialog.kind" [class.wide]="!!dialog.items?.length" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title">
          <h3 id="dialog-title">{{ dialog.title }}</h3>
          <p>{{ dialog.text }}</p>
          @if (dialog.items?.length) {
            <ul class="dialog-items">
              @for (item of dialog.items; track $index) {
                <li>{{ item }}</li>
              }
            </ul>
          }
          @if (dialog.kind === 'prompt') {
            <input #answer class="dialog-input" [value]="dialog.input ?? ''" (keydown)="$event.key === 'Enter' && dialogs.close(answer.value)" aria-labelledby="dialog-title" />
          }
          @if (dialog.footer) {
            <p>{{ dialog.footer }}</p>
          }
          <div class="modal-actions">
            @if (dialog.choices; as choices) {
              @for (choice of choices; track choice; let first = $first) {
                <button type="button" [class.dialog-ok]="first" (click)="dialogs.close(choice)">{{ choice }}</button>
              }
              <span class="modal-spacer"></span>
            } @else {
              <button type="button" class="dialog-ok" (click)="ok()">OK</button>
              <span class="modal-spacer"></span>
            }
            @if (dialog.kind === 'confirm' || dialog.kind === 'prompt') {
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
        requestAnimationFrame(() => {
          const input = this.host.nativeElement.querySelector<HTMLInputElement>('.dialog-input');
          if (input) {
            input.focus();
            input.select();
          } else {
            this.host.nativeElement.querySelector<HTMLButtonElement>('.dialog-ok')?.focus();
          }
        });
      }
    });
  }

  /** "OK" returns the entered text for a prompt. */
  ok(): void {
    const input = this.host.nativeElement.querySelector<HTMLInputElement>('.dialog-input');
    this.dialogs.close(this.dialogs.current()?.kind === 'prompt' ? input?.value ?? '' : true);
  }

  @HostListener('document:keydown.escape', ['$event'])
  cancel(event: Event): void {
    const dialog = this.dialogs.current();
    if (dialog) {
      event.stopPropagation();
      this.dialogs.close(dialog.kind !== 'confirm' && dialog.kind !== 'prompt');
    }
  }
}
