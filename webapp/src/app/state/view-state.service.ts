import { Injectable } from '@angular/core';
import { DeviceDocument } from '../model/device';

/** Remembers per open device where the user was in each view, e.g. the selected object or PDO. */
@Injectable({ providedIn: 'root' })
export class ViewStateService {
  private readonly states = new WeakMap<DeviceDocument, Map<string, unknown>>();

  get<T>(document: DeviceDocument, view: string): T | undefined {
    return this.states.get(document)?.get(view) as T | undefined;
  }

  set<T>(document: DeviceDocument, view: string, state: T): void {
    let views = this.states.get(document);
    if (!views) {
      views = new Map();
      this.states.set(document, views);
    }
    views.set(view, state);
  }
}
