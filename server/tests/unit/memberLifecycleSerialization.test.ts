import {
  maskLifecycleSecretValue,
  memberLifecycleChangesFromAudit,
  memberLifecycleSecretChange,
} from '../../src/utils/memberSerialization';

describe('member lifecycle serialization', () => {
  it('masks password values as stars', () => {
    expect(maskLifecycleSecretValue('password', 'hashed')).toBe('********');
    expect(maskLifecycleSecretValue('password', '')).toBe('(none)');
    expect(memberLifecycleSecretChange('password', 'old-hash', 'new-plain')).toEqual({
      field: 'password',
      from: '********',
      to: '********',
      secret: true,
    });
  });

  it('masks score PIN length with stars', () => {
    expect(maskLifecycleSecretValue('scorePin', '1234')).toBe('****');
    expect(memberLifecycleSecretChange('scorePin', '1234', '5678')).toEqual({
      field: 'scorePin',
      from: '****',
      to: '****',
      secret: true,
    });
  });

  it('builds revealable profile change rows from audit data', () => {
    const changes = memberLifecycleChangesFromAudit(
      { rating: 1600, phone: '555-0100' },
      { rating: 1500, phone: null },
      { rating: 1600, phone: '555-0100' },
    );
    expect(changes).toEqual([
      { field: 'rating', from: 1500, to: 1600, secret: false },
      { field: 'phone', from: null, to: '555-0100', secret: false },
    ]);
  });
});
