/**
 * Errors the HTTP layer maps to 4xx responses (not internal 500).
 * Domain-specific subclasses extend this type.
 */
export class ClientHttpError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'ClientHttpError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isClientHttpError(err: unknown): err is ClientHttpError {
  return err instanceof ClientHttpError;
}
