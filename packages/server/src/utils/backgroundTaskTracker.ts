export interface BackgroundTaskState {
  pending: number;
  waiting: boolean;
}

export type BackgroundTaskChangeCallback = (state: BackgroundTaskState) => void;

export class BackgroundTaskTracker {
  private pendingCount = 0;
  private _mainResponseEnded = false;
  private onChange?: BackgroundTaskChangeCallback;

  constructor(onChange?: BackgroundTaskChangeCallback) {
    this.onChange = onChange;
  }

  trackToolUse(input: unknown): void {
    if (
      typeof input === 'object' &&
      input !== null &&
      (input as { run_in_background?: unknown }).run_in_background === true
    ) {
      this.pendingCount++;
      this.notify();
    }
  }

  trackTaskDone(): void {
    this.pendingCount = Math.max(0, this.pendingCount - 1);
    this.notify();
  }

  markMainEnded(): void {
    this._mainResponseEnded = true;
    this.notify();
  }

  get mainResponseEnded(): boolean {
    return this._mainResponseEnded;
  }

  get isWaiting(): boolean {
    return this._mainResponseEnded && this.pendingCount > 0;
  }

  get isFullyDone(): boolean {
    return this._mainResponseEnded && this.pendingCount === 0;
  }

  get pending(): number {
    return this.pendingCount;
  }

  private notify(): void {
    this.onChange?.({ pending: this.pendingCount, waiting: this.isWaiting });
  }
}
