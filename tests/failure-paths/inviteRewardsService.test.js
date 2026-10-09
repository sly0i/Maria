import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_REWARDS,
  getValidInviteCount,
  getClaimableRewards,
  buildRewardsPanelEmbed,
  buildClaimButtonRow,
  claimReward,
} from '../../src/services/inviteRewardsService.js';

function createMemoryClient(seed = {}) {
  const store = new Map(Object.entries(seed));
  return {
    db: {
      async get(key, defaultValue = null) {
        if (!store.has(key)) return defaultValue;
        return structuredClone(store.get(key));
      },
      async set(key, value) {
        store.set(key, structuredClone(value));
        return true;
      },
    },
    _store: store,
  };
}

test('getValidInviteCount never goes below zero', () => {
  assert.equal(getValidInviteCount({ joins: 5, left: 2, fake: 1 }), 2);
  assert.equal(getValidInviteCount({ joins: 1, left: 3, fake: 2 }), 0);
  assert.equal(getValidInviteCount(null), 0);
});

test('getClaimableRewards returns only unmet unclaimed tiers', () => {
  const config = { rewards: DEFAULT_REWARDS };
  const claims = { claimedRewardIds: ['nitro_basic_1m', 'robux_450'] };
  const claimable = getClaimableRewards(config, 6, claims);

  assert.deepEqual(
    claimable.map((reward) => reward.id).sort(),
    ['nitro_boost_1m', 'robux_1500'].sort()
  );
});

test('buildRewardsPanelEmbed includes nitro, robux and claim CTA', () => {
  const embed = buildRewardsPanelEmbed({ rewards: DEFAULT_REWARDS }, { timestampLabel: 'test' });
  const description = embed.data.description || '';

  assert.match(description, /Discord Nitro Basic \(1 mois\)/);
  assert.match(description, /450 Robux/);
  assert.match(description, /PRÊT À RÉCLAMER/);
  assert.equal(embed.data.footer.text.includes('Système de récompenses'), true);
});

test('buildClaimButtonRow creates Réclamer primary button', () => {
  const row = buildClaimButtonRow();
  const button = row.components[0];
  assert.equal(button.data.custom_id, 'invite_rewards_claim');
  assert.equal(button.data.label, 'Réclamer');
});

test('claimReward blocks under-threshold and double claim', async () => {
  const client = createMemoryClient({
    'guild:g1:invites:u1': { joins: 3, left: 0, fake: 0, invitedUsers: {} },
  });

  const denied = await claimReward(client, 'g1', 'u1', 'nitro_boost_1m');
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'not_enough_invites');

  const first = await claimReward(client, 'g1', 'u1', 'nitro_basic_1m');
  assert.equal(first.ok, true);
  assert.equal(first.reward.id, 'nitro_basic_1m');

  const second = await claimReward(client, 'g1', 'u1', 'nitro_basic_1m');
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'already_claimed');
});
