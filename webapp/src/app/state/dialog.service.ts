import { Injectable, computed, signal } from '@angular/core';

export type DialogKind = 'confirm' | 'error' | 'warning';

export interface DialogRequest {
  kind: DialogKind;
  title: string;
  text: string;
  /** Buttons offered instead of "OK"; "Cancel" is always added. */
  choices?: readonly string[];
  resolve: (result: boolean | string) => void;
}

/** In-app replacement for confirm() and alert(); requests are shown one after another. */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly queue = signal<DialogRequest[]>([]);
  readonly current = computed(() => this.queue()[0] ?? null);

  confirm(text: string, title = 'Confirm'): Promise<boolean> {
    return this.open('confirm', title, text).then((result) => result === true);
  }

  /** Resolves with the chosen button text, or null for "Cancel". */
  choose<T extends string>(text: string, choices: readonly T[], title = 'Confirm'): Promise<T | null> {
    return this.open('confirm', title, text, choices).then((result) => typeof result === 'string' ? result as T : null);
  }

  error(text: string, title = 'Error'): Promise<void> {
    return this.open('error', title, text).then(() => undefined);
  }

  warning(text: string, title = 'Warning'): Promise<void> {
    return this.open('warning', title, text).then(() => undefined);
  }

  close(result: boolean | string): void {
    const [first, ...rest] = this.queue();
    if (!first) {
      return;
    }
    this.queue.set(rest);
    first.resolve(result);
  }

  private open(kind: DialogKind, title: string, text: string, choices?: readonly string[]): Promise<boolean | string> {
    return new Promise((resolve) => {
      this.queue.update((queue) => [...queue, { kind, title, text, choices, resolve }]);
    });
  }
}
