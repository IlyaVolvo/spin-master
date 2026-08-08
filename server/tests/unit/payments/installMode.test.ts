/**
 * Payments installMode bootstrap (env / CLI)
 */
import { resolvePaymentsInstallModeFromProcess } from '../../../src/services/systemConfigService';

describe('resolvePaymentsInstallModeFromProcess', () => {
  it('defaults to test', () => {
    expect(resolvePaymentsInstallModeFromProcess({}, [])).toBe('test');
  });

  it('reads PAYMENTS_INSTALL_MODE', () => {
    expect(
      resolvePaymentsInstallModeFromProcess({ PAYMENTS_INSTALL_MODE: 'production' }, []),
    ).toBe('production');
    expect(resolvePaymentsInstallModeFromProcess({ PAYMENTS_INSTALL_MODE: 'test' }, [])).toBe(
      'test',
    );
  });

  it('prefers CLI over env', () => {
    expect(
      resolvePaymentsInstallModeFromProcess(
        { PAYMENTS_INSTALL_MODE: 'production' },
        ['node', 'app', '--payments-install-mode=test'],
      ),
    ).toBe('test');
  });
});
