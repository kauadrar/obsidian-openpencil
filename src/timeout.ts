// A promise that rejects with `message` if `promise` has not settled within `ms`. No imports, so the node test
// runner can load this file directly.
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, expired]).finally(() => clearTimeout(timer))
}
