export class RoomError extends Error {
  readonly code: string;

  constructor(
    code: string,
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "RoomError";
  }
}

export function requireRoom(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new RoomError(code, message);
}
