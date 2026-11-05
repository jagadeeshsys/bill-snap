export function createPromiseQueue() {
  let tail = Promise.resolve();

  return function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = tail.then(operation);
    tail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  };
}

export function createRetryablePromise<T>(factory: () => Promise<T>) {
  let current: Promise<T> | null = null;

  return {
    get(): Promise<T> {
      if (!current) {
        const attempt = Promise.resolve().then(factory);
        current = attempt;
        void attempt.catch(() => {
          if (current === attempt) current = null;
        });
      }

      return current;
    },
    peek(): Promise<T> | null {
      return current;
    },
    clear(): void {
      current = null;
    },
  };
}
