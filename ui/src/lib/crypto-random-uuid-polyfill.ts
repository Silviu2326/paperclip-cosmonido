// Browsers expose crypto.randomUUID only in secure contexts (HTTPS or localhost).
// A board served over plain HTTP on a LAN or public IP would otherwise throw
// inside every send path that mints an idempotency key, and the composer would
// silently restore the draft. getRandomValues is available in every context.
if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID !== "function") {
  const randomUUID = (): `${string}-${string}-${string}-${string}-${string}` => {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6]! & 0x0f) | 0x40;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };
  Object.defineProperty(globalThis.crypto, "randomUUID", {
    value: randomUUID,
    configurable: true,
    writable: true,
  });
}

export {};
