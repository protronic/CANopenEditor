import { Injectable, computed, signal } from '@angular/core';

export type DialogKind = 'confirm' | 'error' | 'warning';

export interface DialogRequest {
  kind: DialogKind;
  title: string;
  text: string;
  resolve: (ok: boolean) => void;
}

/** In-app replacement for confirm() and alert(); requests are shown one after another. */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly queue = signal<DialogRequest[]>([]);
  readonly current = computed(() => this.queue()[0] ?? null);

  confirm(text: string, title = 'Confirm'): Promise<boolean> {
    return this.open('confirm', title, text);
  }

  error(text: string, title = 'Error'): Promise<void> {
    return this.open('error', title, text).then(() => undefined);
  }

  warning(text: string, title = 'Warning'): Promise<void> {
    return this.open('warning', title, text).then(() => undefined);
  }

  close(ok: boolean): void {
    const [first, ...rest] = this.queue();
    if (!first) {
      return;
    }
    this.queue.set(rest);
    first.resolve(ok);
  }

  private open(kind: DialogKind, title: string, text: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.queue.update((queue) => [...queue, { kind, title, text, resolve }]);
    });
  }
}
