const MAX_PARALLEL = Math.max(
  1,
  Math.min(16, parseInt(process.env.LEOGRIEL_PARALLEL ?? process.env.SKILLCTL_PARALLEL ?? '6', 10) || 6),
);

function createConcurrencyLimiter(maxConcurrent: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      const run = async () => {
        active++;
        try {
          resolve(await fn());
        } catch (e) {
          reject(e);
        } finally {
          active--;
          if (queue.length > 0) queue.shift()!();
        }
      };
      if (active < maxConcurrent) run();
      else queue.push(run);
    });
  };
}

const fetchLimiter = createConcurrencyLimiter(MAX_PARALLEL);

export async function limitedFetch<T>(fn: () => Promise<T>): Promise<T> {
  return fetchLimiter(fn);
}
