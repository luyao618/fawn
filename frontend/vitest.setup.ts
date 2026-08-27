import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// jsdom gives every element a 0x0 layout box, so recharts' ResponsiveContainer
// measures nothing and warns that the chart has no width/height. Report a
// non-zero size through the ResizeObserver callback it subscribes with, so
// dashboard charts render quietly under test.
const CHART_WIDTH = 800;
const CHART_HEIGHT = 400;

class ResizeObserverMock {
  constructor(private callback: ResizeObserverCallback) {}

  observe(target: Element) {
    const contentRect = {
      width: CHART_WIDTH,
      height: CHART_HEIGHT,
      top: 0,
      left: 0,
      bottom: CHART_HEIGHT,
      right: CHART_WIDTH,
      x: 0,
      y: 0,
    };
    this.callback(
      [{ target, contentRect } as unknown as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }

  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;

Object.defineProperty(Element.prototype, 'scrollIntoView', {
  writable: true,
  value: vi.fn(),
});

Object.defineProperty(URL, 'createObjectURL', {
  writable: true,
  value: vi.fn((file: File) => `/mock-object-url/${file.name}`),
});

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });
