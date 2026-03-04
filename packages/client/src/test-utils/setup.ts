import '@testing-library/jest-dom';
import '../i18n'; // Initialize i18n for tests (Epic 22) — forces ko via import.meta.env.MODE

// Mock scrollIntoView which is not supported in jsdom
Element.prototype.scrollIntoView = () => {};

// Mock ResizeObserver which is not supported in jsdom
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock window.matchMedia which is not supported in jsdom
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});
