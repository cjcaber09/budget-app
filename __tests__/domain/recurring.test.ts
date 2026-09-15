import { computeNextOccurrence, getDueOccurrences } from '../../src/domain/recurring';

describe('computeNextOccurrence', () => {
  it('adds one week for weekly frequency', () => {
    expect(computeNextOccurrence(new Date('2026-07-01T00:00:00.000Z'), 'weekly')).toEqual(
      new Date('2026-07-08T00:00:00.000Z')
    );
  });

  it('adds one month for monthly frequency', () => {
    expect(computeNextOccurrence(new Date('2026-07-01T00:00:00.000Z'), 'monthly')).toEqual(
      new Date('2026-08-01T00:00:00.000Z')
    );
  });
});

describe('getDueOccurrences', () => {
  it('returns a single occurrence when exactly one period has passed', () => {
    const result = getDueOccurrences(
      new Date('2026-07-01T00:00:00.000Z'),
      'monthly',
      new Date('2026-07-15T00:00:00.000Z')
    );

    expect(result).toEqual([new Date('2026-07-01T00:00:00.000Z')]);
  });

  it('returns multiple occurrences when several periods have been missed', () => {
    const result = getDueOccurrences(
      new Date('2026-05-01T00:00:00.000Z'),
      'monthly',
      new Date('2026-07-15T00:00:00.000Z')
    );

    expect(result).toEqual([
      new Date('2026-05-01T00:00:00.000Z'),
      new Date('2026-06-01T00:00:00.000Z'),
      new Date('2026-07-01T00:00:00.000Z'),
    ]);
  });

  it('returns an empty array when nothing is due yet', () => {
    const result = getDueOccurrences(
      new Date('2026-08-01T00:00:00.000Z'),
      'monthly',
      new Date('2026-07-15T00:00:00.000Z')
    );

    expect(result).toEqual([]);
  });
});
