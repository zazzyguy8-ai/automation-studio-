/** Instagram is pushing back (checkpoint, action block, logged out...). Stop the whole run. */
export class AbortRunError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = 'AbortRunError';
    this.kind = kind;
  }
}

/** This one target cannot be messaged; move on to the next one. */
export class SkipTargetError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'SkipTargetError';
  }
}
