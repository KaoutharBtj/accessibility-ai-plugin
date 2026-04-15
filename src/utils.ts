type AsyncFn<T> = (arg: T) => Promise<void>;

export interface DebouncedFn<T> {
  (arg: T): void;
  flush(arg: T): Promise<void>;
}

export function debounce<T>(fn: AsyncFn<T>, delayMs: number): DebouncedFn<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = (arg: T): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(arg).catch(console.error);
    }, delayMs);
  };

  debounced.flush = async (arg: T): Promise<void> => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    await fn(arg);
  };

  return debounced;
}
