import { describe, expect, it } from 'vitest';
import { NOTICE, NoticeContent, NoticeLanguage } from './notice';

describe('privacy notice', () => {
  it('is valid and itemises the same six things, in the same order, in both languages', () => {
    const keys = (l: NoticeLanguage) => NoticeContent.parse(NOTICE[l]).items.map((i) => i.key);
    expect(keys('en')).toEqual(['phone', 'dob', 'name', 'email', 'card', 'credit_score']);
    expect(keys('hi')).toEqual(keys('en'));
    expect(NOTICE.hi.rights).toHaveLength(NOTICE.en.rights.length);
  });

  it('says what the DPDP alignment requires', () => {
    const n = NOTICE.en;
    expect(n.scoreCheck).toBe('We’ll check your credit score with a credit bureau to confirm eligibility.');
    expect(n.board).toContain('Data Protection Board of India');
    expect(n.rights.map((r) => r.title)).toEqual(['Access', 'Correction', 'Erasure', 'Nominate someone']);
    expect(n.withdraw).toContain('Your membership ends, but existing loans and policies with partners continue.');
    expect(n.later).toBe('We’ll only ask about personalised savings later, if it can save you money.');
    expect(NOTICE.hi.board).toContain('Data Protection Board of India');
  });

  it('bundles no marketing consent and no Smart Savings', () => {
    for (const l of NoticeLanguage.options) {
      const text = JSON.stringify(NOTICE[l]).toLowerCase();
      expect(text).not.toContain('smart savings');
      expect(text).not.toMatch(/stress|risk|blocked/);
    }
  });

  it('is actually translated', () => {
    expect(NOTICE.hi.summary).toMatch(/[ऀ-ॿ]/);
    expect(NOTICE.hi.agree).not.toBe(NOTICE.en.agree);
  });
});
