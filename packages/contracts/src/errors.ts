export const ErrorCode = {
  E_BAD_REQUEST: "E_BAD_REQUEST",
  E_UNAUTHORIZED: "E_UNAUTHORIZED",
  E_FORBIDDEN_SCOPE: "E_FORBIDDEN_SCOPE",
  E_NOT_FOUND: "E_NOT_FOUND",
  E_CONFLICT: "E_CONFLICT",
  E_SANDBOX_UNAVAILABLE: "E_SANDBOX_UNAVAILABLE",
  E_QUOTA_EXCEEDED: "E_QUOTA_EXCEEDED",
  E_BUDGET_EXCEEDED: "E_BUDGET_EXCEEDED",
  E_EGRESS_DENIED: "E_EGRESS_DENIED",
  E_BOUNDS_EXHAUSTED: "E_BOUNDS_EXHAUSTED",
  E_TRUST_VIOLATION: "E_TRUST_VIOLATION",
  E_CHECKPOINT_FAILED: "E_CHECKPOINT_FAILED",
  E_PTY_GONE: "E_PTY_GONE",
  E_RATE_LIMITED: "E_RATE_LIMITED",
  E_INTERNAL: "E_INTERNAL"
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface AppError {
  code: ErrorCode;
  message: string;
  detail?: Record<string, unknown>;
  retryable: boolean;
}

export const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  ErrorCode.E_SANDBOX_UNAVAILABLE,
  ErrorCode.E_PTY_GONE,
  ErrorCode.E_RATE_LIMITED,
  ErrorCode.E_INTERNAL
]);

export function isRetryable(code: ErrorCode): boolean {
  return RETRYABLE.has(code);
}