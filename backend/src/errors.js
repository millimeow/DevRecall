export class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export class ValidationError extends AppError {
  constructor(message) { super(422, message); }
}
export class ModelUnavailable extends AppError {
  constructor(message) { super(503, message); }
}
