// Déclarations minimales des modules Node utilisés par les tests (évite
// d'ajouter @types/node au projet).
declare module 'node:test' {
  export function test(name: string, fn: () => void | Promise<void>): void;
}
declare module 'node:assert/strict' {
  const assert: {
    (value: unknown, message?: string): void;
    equal(a: unknown, b: unknown, message?: string): void;
    deepEqual(a: unknown, b: unknown, message?: string): void;
    ok(value: unknown, message?: string): void;
  };
  export default assert;
}
