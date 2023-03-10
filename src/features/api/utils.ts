export function successResult<R>(data: R): { success: true; data: R } {
  return { success: true, data };
}

export function failureResult(error: string): { success: false; error: string } {
  return { success: false, error };
}
