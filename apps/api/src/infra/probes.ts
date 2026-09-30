/**
 * A dependency the API needs (database, cache). Readiness checks call
 * `ping`; shutdown calls `close`.
 */
export interface DependencyProbe {
  readonly name: string;
  ping(): Promise<void>;
  close(): Promise<void>;
}
