// Typed errors with safe, user-facing messages. Never put secrets or document text in these.

export class AppError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
    public readonly code: string = "BAD_REQUEST",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class AuthError extends AppError {
  constructor(message = "Please sign in to continue.") {
    super(message, 401, "UNAUTHENTICATED");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to perform this action.") {
    super(message, 403, "FORBIDDEN");
  }
}

/** Used for resources the actor may not see — indistinguishable from "does not exist" (prevents IDOR probing). */
export class NotFoundError extends AppError {
  constructor(message = "Not found.") {
    super(message, 404, "NOT_FOUND");
  }
}

export class WorkflowError extends AppError {
  constructor(message: string) {
    super(message, 409, "INVALID_STATE");
  }
}

export function toSafeMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  return "Something went wrong. The error has been logged; please try again.";
}
