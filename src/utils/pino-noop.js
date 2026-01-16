// Mock pino module for SSR to avoid pino-pretty transport issues
// pino-pretty cannot run in serverless/edge environments

const noop = () => {};

const mockLogger = {
  trace: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
  child: () => mockLogger,
  level: 'silent',
};

function pino() {
  return mockLogger;
}

pino.destination = () => process.stdout;
pino.transport = () => process.stdout;

module.exports = pino;
module.exports.default = pino;
module.exports.pino = pino;
