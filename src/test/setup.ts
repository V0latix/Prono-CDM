import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";

let localStorageData: Record<string, string> = {};

// Certains tests (intégration D1/Worker) tournent en environnement Node sans DOM
// via `// @vitest-environment node`. Ce setup global est partagé : on ne touche
// au DOM que quand il existe réellement.
const hasDom = typeof window !== "undefined";

// recharts (ResponsiveContainer) utilise ResizeObserver, absent de jsdom : on le
// stubbe pour que les vues contenant un graphe (Classement) rendent sans crash.
if (hasDom && typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

beforeEach(() => {
  if (!hasDom) return;
  localStorageData = {};
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      clear: vi.fn(() => {
        localStorageData = {};
      }),
      getItem: vi.fn((key: string) => localStorageData[key] ?? null),
      removeItem: vi.fn((key: string) => {
        delete localStorageData[key];
      }),
      setItem: vi.fn((key: string, value: string) => {
        localStorageData[key] = String(value);
      })
    }
  });
});

afterEach(() => {
  if (hasDom) {
    document.documentElement.removeAttribute("data-theme");
    window.sessionStorage.clear();
  }
  vi.restoreAllMocks();
});
