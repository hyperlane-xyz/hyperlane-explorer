// Mock @hyperlane-xyz/aleo-sdk for SSR to avoid @provablehq/wasm top-level fetch() error
// The WASM module tries to fetch a relative URL that can't resolve in Node.js during SSG

module.exports = {};
