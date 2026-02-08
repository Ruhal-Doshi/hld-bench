/**
 * Simple execution timer.
 */
export function createTimer() {
  const start = performance.now();

  return {
    /** Elapsed time in milliseconds */
    elapsed(): number {
      return Math.round(performance.now() - start);
    },

    /** Elapsed time as a human-readable string */
    display(): string {
      const ms = this.elapsed();
      if (ms < 1000) return `${ms}ms`;
      const secs = (ms / 1000).toFixed(1);
      return `${secs}s`;
    },
  };
}
