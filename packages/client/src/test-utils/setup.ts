import '@testing-library/jest-dom';

// Mock scrollIntoView which is not supported in jsdom
Element.prototype.scrollIntoView = () => {};

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
