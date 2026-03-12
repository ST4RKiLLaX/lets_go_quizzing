import { describe, it, expect } from 'vitest';
import { containsProfanityAggressive, resetProfanityCache } from '../src/lib/server/profanity.js';

describe('segmented profanity', () => {
  it('catches bitchass (bitch+ass)', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('bitchass')).toBe(true);
  });

  it('catches bitchfag (bitch+fag)', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('bitchfag')).toBe(true);
  });

  it('catches fagfuckbitch (fag+fuck+bitch)', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('fagfuckbitch')).toBe(true);
  });

  it('catches assbitch (ass+bitch)', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('assbitch')).toBe(true);
  });

  it('catches fuckbitchass (fuck+bitch+ass)', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('fuckbitchass')).toBe(true);
  });

  it('does not catch class', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('class')).toBe(false);
  });

  it('does not catch assassin', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('assassin')).toBe(false);
  });

  it('does not catch bass', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('bass')).toBe(false);
  });

  it('does not catch classass', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('classass')).toBe(false);
  });

  it('does not catch butterfly', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('butterfly')).toBe(false);
  });

  it('does not catch fagfuckbitchx (whole-token segmentation fails)', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('fagfuckbitchx')).toBe(false);
  });

  it('does not catch bitchfagx (whole-token segmentation fails)', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('bitchfagx')).toBe(false);
  });
});

describe('suffix variant aliases (Tier 1)', () => {
  it('catches fucky', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('fucky')).toBe(true);
  });

  it('catches fuckey and fuckie', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('fuckey')).toBe(true);
    expect(containsProfanityAggressive('fuckie')).toBe(true);
  });

  it('catches faggy', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('faggy')).toBe(true);
  });

  it('catches faggey and faggie', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('faggey')).toBe(true);
    expect(containsProfanityAggressive('faggie')).toBe(true);
  });

  it('catches shitty', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('shitty')).toBe(true);
  });

  it('catches bitchy', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('bitchy')).toBe(true);
  });

  it('catches cunty', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('cunty')).toBe(true);
  });

  it('catches slutty', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('slutty')).toBe(true);
  });

  it('catches twaty', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('twaty')).toBe(true);
  });

  it('aggressive filter allows cocky', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('cocky')).toBe(false);
  });

  it('aggressive filter allows sexy', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('sexy')).toBe(false);
  });

  it('aggressive filter allows classy', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('classy')).toBe(false);
  });
});

describe('spaced evasion', () => {
  it('catches f u u u c k k y (spaced with repeated letters)', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('f u u u c k k y')).toBe(true);
  });

  it('catches f u c k y (spaced)', () => {
    resetProfanityCache();
    expect(containsProfanityAggressive('f u c k y')).toBe(true);
  });
});
