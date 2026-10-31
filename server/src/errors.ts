export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public retryAt: string | null = null,
  ) {
    super(message);
  }
}
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unexpected error';
