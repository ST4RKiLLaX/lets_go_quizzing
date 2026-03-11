import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  containsProfanityAggressive,
  resetProfanityCache,
} from '../src/lib/server/profanity.js';

describe('segmented profanity', () => {
  it('catches bitchass (bitch+ass)', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('bitchass'), true);
  });

  it('catches bitchfag (bitch+fag)', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('bitchfag'), true);
  });

  it('catches fagfuckbitch (fag+fuck+bitch)', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('fagfuckbitch'), true);
  });

  it('catches assbitch (ass+bitch)', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('assbitch'), true);
  });

  it('catches fuckbitchass (fuck+bitch+ass)', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('fuckbitchass'), true);
  });

  it('does not catch class', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('class'), false);
  });

  it('does not catch assassin', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('assassin'), false);
  });

  it('does not catch bass', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('bass'), false);
  });

  it('does not catch classass', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('classass'), false);
  });

  it('does not catch butterfly', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('butterfly'), false);
  });

  it('does not catch fagfuckbitchx (whole-token segmentation fails)', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('fagfuckbitchx'), false);
  });

  it('does not catch bitchfagx (whole-token segmentation fails)', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('bitchfagx'), false);
  });
});

describe('suffix variant aliases (Tier 1)', () => {
  it('catches fucky', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('fucky'), true);
  });

  it('catches fuckey and fuckie', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('fuckey'), true);
    assert.strictEqual(containsProfanityAggressive('fuckie'), true);
  });

  it('catches faggy', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('faggy'), true);
  });

  it('catches faggey and faggie', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('faggey'), true);
    assert.strictEqual(containsProfanityAggressive('faggie'), true);
  });

  it('catches shitty', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('shitty'), true);
  });

  it('catches bitchy', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('bitchy'), true);
  });

  it('catches cunty', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('cunty'), true);
  });

  it('catches slutty', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('slutty'), true);
  });

  it('catches twaty', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('twaty'), true);
  });

  it('aggressive filter allows cocky', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('cocky'), false);
  });

  it('aggressive filter allows sexy', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('sexy'), false);
  });

  it('aggressive filter allows classy', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('classy'), false);
  });
});

describe('spaced evasion', () => {
  it('catches f u u u c k k y (spaced with repeated letters)', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('f u u u c k k y'), true);
  });

  it('catches f u c k y (spaced)', () => {
    resetProfanityCache();
    assert.strictEqual(containsProfanityAggressive('f u c k y'), true);
  });
});
