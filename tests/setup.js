/**
 * Test setup file for Foundry VTT module testing
 * Mocks global objects that are available in Foundry VTT environment
 */

// Mock Foundry VTT global objects
global.game = {
  settings: {
    get: vi.fn(),
    register: vi.fn(),
    registerMenu: vi.fn(),
    settings: new Map()
  },
  journal: {
    get: vi.fn()
  }
};

global.ui = {
  notifications: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
};

global.Dialog = {
  confirm: vi.fn()
};

global.JournalEntry = {
  create: vi.fn()
};

global.Hooks = {
  on: vi.fn()
};

global.FormApplication = class FormApplication {
  static get defaultOptions() {
    return {};
  }
  getData() {
    return {};
  }
  async _updateObject() {
    return {};
  }
};

global.foundry = {
  utils: {
    mergeObject: (original, other) => ({ ...original, ...other })
  }
};

// Mock File API for browser environment
global.File = class MockFile {
  constructor(parts, filename, properties) {
    this.parts = parts;
    this.name = filename;
    this.type = properties?.type || '';
    this.size = parts.reduce((acc, part) => acc + (typeof part === 'string' ? part.length : part.size || 0), 0);
  }
};

global.FormData = class MockFormData {
  constructor() {
    this.data = new Map();
  }
  
  append(name, value) {
    this.data.set(name, value);
  }
  
  get(name) {
    return this.data.get(name);
  }
};

// Mock fetch API
global.fetch = vi.fn();
