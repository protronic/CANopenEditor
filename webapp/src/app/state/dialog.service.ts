import { Injectable, computed, signal } from '@angular/core';

export type DialogKind = 'confirm' | 'error' | 'warning';

/** Text with an optional list of single-line items (e.g. warnings) and a closing question. */
export interface DialogContent {
  text: string;
  items?: readonly string[];
  footer?: string;
}

export interface DialogRequest extends DialogContent {
  kind: DialogKind;
  title: string;
  /** Buttons offered instead of "OK"; "Cancel" is always added. */
  choices?: readonly string[];
  resolve: (result: boolean | string) => void;
}

/** In-app replacement for confirm() and alert(); requests are shown one after another. */
@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly queue = signal<DialogRequest[]>([]);
  readonly current = computed(() => this.queue()[0] ?? null);

  confirm(text: string | DialogContent, title = 'Confirm'): Promise<boolean> {
    return this.open('confirm', title, text).then((result) => result === true);
  }

  /** Resolves with the chosen button text, or null for "Cancel". */
  choose<T extends string>(text: string | DialogContent, choices: readonly T[], title = 'Confirm'): Promise<T | null> {
    return this.open('confirm', title, text, choices).then((result) => typeof result === 'string' ? result as T : null);
  }

  error(text: string | DialogContent, title = 'Error'): Promise<void> {
    return this.open('error', title, text).then(() => undefined);
  }

  warning(text: string | DialogContent, title = 'Warning'): Promise<void> {
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

  private open(kind: DialogKind, title: string, text: string | DialogContent, choices?: readonly string[]): Promise<boolean | string> {
    const content = typeof text === 'string' ? { text } : text;
    return new Promise((resolve) => {
      this.queue.update((queue) => [...queue, { ...content, kind, title, choices, resolve }]);
    });
  }
}
