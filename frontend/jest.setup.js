import '@testing-library/jest-dom';
import 'whatwg-fetch';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = global.ResizeObserver || ResizeObserverMock;

class WorkerMock {
  postMessage() {}
  terminate() {}
  addEventListener() {}
  removeEventListener() {}
}

global.Worker = global.Worker || WorkerMock;
global.URL.createObjectURL = global.URL.createObjectURL || jest.fn(() => "blob:mock");
global.URL.revokeObjectURL = global.URL.revokeObjectURL || jest.fn();

HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
  drawImage: jest.fn(),
  getImageData: jest.fn(() => ({ data: [] })),
  putImageData: jest.fn(),
}));

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

window.scrollTo = window.scrollTo || jest.fn();
