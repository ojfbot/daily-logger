/** A known immutable admission/destination conflict, not an infrastructure error. */
export class AdmissionConflictError extends Error {
  readonly code = 'ADMISSION_CONFLICT'
}

export function requireAdmission(condition: unknown, message: string): asserts condition {
  if (!condition) throw new AdmissionConflictError(message)
}
