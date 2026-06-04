import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";

let localStorageData: Record<string, string> = {};

beforeEach(() => {
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
  document.documentElement.removeAttribute("data-theme");
  vi.restoreAllMocks();
});
