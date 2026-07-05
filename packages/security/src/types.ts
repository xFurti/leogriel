export type AuditSeverity = 'info' | 'warning' | 'error';

export interface AuditFinding {
  rule: string;
  severity: AuditSeverity;
  skill: string;
  message: string;
  path?: string;
}

export interface AuditReport {
  status: 'ok' | 'warnings' | 'errors';
  findings: AuditFinding[];
  scanned: number;
}