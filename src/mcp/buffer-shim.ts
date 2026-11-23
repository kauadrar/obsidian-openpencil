export const Buffer = {
  byteLength(input: string | Uint8Array): number {
    if (typeof input === 'string') {
      return new TextEncoder().encode(input).byteLength
    }
    return input.byteLength
  },
  from(input: string | Uint8Array): Uint8Array {
    if (typeof input === 'string') {
      return new TextEncoder().encode(input)
    }
    return input
  },
}
