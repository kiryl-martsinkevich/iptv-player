describe('core package bootstrap', () => {
  it('imports without error', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const core = require('../src/index');
    expect(core).toBeDefined();
  });
});
