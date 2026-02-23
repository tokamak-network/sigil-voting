/**
 * Structured audit logging for coordinator actions.
 * Outputs JSON lines to stdout for easy parsing by log aggregators.
 */

export interface AuditEntry {
  timestamp: string
  action: string
  pollId?: number
  result: 'success' | 'failure' | 'skipped'
  txHash?: string
  error?: string
}

export function auditLog(entry: Omit<AuditEntry, 'timestamp'>): void {
  const log: AuditEntry = {
    timestamp: new Date().toISOString(),
    ...entry,
  }
  console.log(JSON.stringify(log))
}
