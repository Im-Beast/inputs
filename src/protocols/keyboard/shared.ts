export interface KeyEvent {
  key: string;

  shift: boolean;
  /**
  - Super key on Linux
  - Windows key on Windows
  - Command key on macOS
  */
  meta: boolean;
  ctrl: boolean;
  alt: boolean;
}

export type KeyEventModifiers = Partial<Omit<KeyEvent, "key">>;

export function keyEvent(key: string, modifiers?: KeyEventModifiers): [KeyEvent] {
  return [{
    key,

    shift: false,
    meta: false,
    ctrl: false,
    alt: false,

    ...modifiers,
  }];
}
