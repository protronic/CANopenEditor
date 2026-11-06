import { Directive, ElementRef, HostListener, effect, inject, input } from '@angular/core';

/**
 * Lets the host (a modal window) be moved by dragging its title (`h3`). The window stays inside the
 * viewport. Changing the bound value (e.g. the next queued dialog) puts the window back in the middle.
 */
@Directive({
  selector: '[appDraggable]',
  standalone: true,
})
export class DraggableDirective {
  readonly appDraggable = input<unknown>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private x = 0;
  private y = 0;
  private drag: { pointer: number; startX: number; startY: number; x: number; y: number; rect: DOMRect } | null = null;

  constructor() {
    effect(() => {
      this.appDraggable();
      this.move(0, 0);
    });
  }

  @HostListener('pointerdown', ['$event'])
  start(event: PointerEvent): void {
    const handle = (event.target as HTMLElement).closest('h3');
    if (event.button !== 0 || !handle || !this.host.nativeElement.contains(handle)) {
      return;
    }
    event.preventDefault();
    this.host.nativeElement.setPointerCapture(event.pointerId);
    this.host.nativeElement.classList.add('dragging');
    this.drag = {
      pointer: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: this.x,
      y: this.y,
      rect: this.host.nativeElement.getBoundingClientRect(),
    };
  }

  @HostListener('pointermove', ['$event'])
  dragTo(event: PointerEvent): void {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointer) {
      return;
    }
    const dx = clamp(event.clientX - drag.startX, -drag.rect.left, window.innerWidth - drag.rect.right);
    const dy = clamp(event.clientY - drag.startY, -drag.rect.top, window.innerHeight - drag.rect.bottom);
    this.move(drag.x + dx, drag.y + dy);
  }

  @HostListener('pointerup', ['$event'])
  @HostListener('pointercancel', ['$event'])
  end(event: PointerEvent): void {
    if (this.drag?.pointer === event.pointerId) {
      this.drag = null;
      this.host.nativeElement.classList.remove('dragging');
    }
  }

  private move(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.host.nativeElement.style.transform = x || y ? `translate(${x}px, ${y}px)` : '';
  }
}

/** Clamps to [min, max], widened to include 0 so a window larger than the viewport keeps its place. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(max, 0), Math.max(Math.min(min, 0), value));
}
