import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js';
import { getColor } from '../config/bot.js';
import { logger } from '../utils/logger.js';
import {
  getInviteTrackingKey,
  getMemberInvitesKey,
} from '../utils/database.js';

export const INVITE_REWARDS_CLAIM_BUTTON = 'invite_rewards_claim';
export const INVITE_REWARDS_SELECT = 'invite_rewards_select';

export const DEFAULT_REWARDS = [
  { id: 'nitro_basic_1m', invites: 3, label: 'Discord Nitro Basic (1 month)', emoji: '💎', category: 'nitro' },
  { id: 'nitro_boost_1m', invites: 6, label: 'Discord Nitro Boost (1 month)', emoji: '💎', category: 'nitro' },
  { id: 'nitro_basic_1y', invites: 9, label: 'Discord Nitro Basic (1 year)', emoji: '💎', category: 'nitro' },
  { id: 'nitro_boost_1y', invites: 12, label: 'Discord Nitro Boost (1 year)', emoji: '💎', category: 'nitro' },
  { id: 'robux_450', invites: 3, label: '450 Robux', emoji: '🪙', category: 'robux' },
  { id: 'robux_1500', invites: 6, label: '1,500 Robux', emoji: '🪙', category: 'robux' },
  { id: 'robux_4500', invites: 9, label: '4,500 Robux', emoji: '🪙', category: 'robux' },
];

const DEFAULT_MIN_ACCOUNT_AGE_DAYS = 7;

function configKey(guildId) {
  return `guild:${guildId}:invite_rewards:config`;
}

function claimsKey(guildId, userId) {
  return `guild:${guildId}:invite_rewards:claims:${userId}`;
}

function vanityJoinKey(guildId) {
  return `guild:${guildId}:invite_rewards:vanity`;
}

function emptyInviteStats() {
  return {
    joins: 0,
    left: 0,
    fake: 0,
    invitedUsers: {},
  };
}

export function ensureInviteCache(client) {
  if (!client.inviteCache) {
    client.inviteCache = new Map();
  }
  return client.inviteCache;
}

export async function cacheGuildInvites(client, guild) {
  const inviteCache = ensureInviteCache(client);
  try {
    const invites = await guild.invites.fetch();
    const mapped = new Map();
    for (const invite of invites.values()) {
      mapped.set(invite.code, {
        code: invite.code,
        uses: invite.uses ?? 0,
        inviterId: invite.inviter?.id ?? null,
      });
    }
    inviteCache.set(guild.id, mapped);
    return mapped;
  } catch (error) {
    logger.warn(`Unable to cache invites for guild ${guild.id}:`, error.message);
    inviteCache.set(guild.id, new Map());
    return inviteCache.get(guild.id);
  }
}

export async function cacheAllGuildInvites(client) {
  const results = { success: 0, failed: 0 };
  for (const guild of client.guilds.cache.values()) {
    try {
      await cacheGuildInvites(client, guild);
      results.success += 1;
    } catch {
      results.failed += 1;
    }
  }
  return results;
}

export function updateCachedInvite(client, invite) {
  const inviteCache = ensureInviteCache(client);
  if (!inviteCache.has(invite.guild.id)) {
    inviteCache.set(invite.guild.id, new Map());
  }
  inviteCache.get(invite.guild.id).set(invite.code, {
    code: invite.code,
    uses: invite.uses ?? 0,
    inviterId: invite.inviter?.id ?? null,
  });
}

export function removeCachedInvite(client, guildId, code) {
  const inviteCache = ensureInviteCache(client);
  inviteCache.get(guildId)?.delete(code);
}

export async function getInviteRewardsConfig(client, guildId) {
  const stored = (await client.db.get(configKey(guildId))) || {};
  return {
    enabled: stored.enabled !== false,
    staffChannelId: stored.staffChannelId || null,
    panelChannelId: stored.panelChannelId || null,
    panelMessageId: stored.panelMessageId || null,
    minAccountAgeDays: Number.isInteger(stored.minAccountAgeDays)
      ? stored.minAccountAgeDays
      : DEFAULT_MIN_ACCOUNT_AGE_DAYS,
    rewards: Array.isArray(stored.rewards) && stored.rewards.length > 0
      ? stored.rewards
      : DEFAULT_REWARDS,
    notices: stored.notices || null,
  };
}

export async function saveInviteRewardsConfig(client, guildId, config) {
  await client.db.set(configKey(guildId), config);
  return config;
}

export async function getMemberInviteStats(client, guildId, userId) {
  const stats = (await client.db.get(getMemberInvitesKey(guildId, userId))) || emptyInviteStats();
  return {
    ...emptyInviteStats(),
    ...stats,
    invitedUsers: stats.invitedUsers && typeof stats.invitedUsers === 'object'
      ? stats.invitedUsers
      : {},
  };
}

export async function saveMemberInviteStats(client, guildId, userId, stats) {
  await client.db.set(getMemberInvitesKey(guildId, userId), stats);
  return stats;
}

export function getValidInviteCount(stats) {
  const joins = Number(stats?.joins || 0);
  const left = Number(stats?.left || 0);
  const fake = Number(stats?.fake || 0);
  return Math.max(0, joins - left - fake);
}

export async function getMemberClaims(client, guildId, userId) {
  const claims = (await client.db.get(claimsKey(guildId, userId))) || {};
  return {
    claimedRewardIds: Array.isArray(claims.claimedRewardIds) ? claims.claimedRewardIds : [],
    history: Array.isArray(claims.history) ? claims.history : [],
  };
}

export async function saveMemberClaims(client, guildId, userId, claims) {
  await client.db.set(claimsKey(guildId, userId), claims);
  return claims;
}

function isFakeJoin(member, minAccountAgeDays) {
  if (member.user?.bot) {
    return true;
  }
  const ageMs = Date.now() - member.user.createdTimestamp;
  const minMs = Math.max(0, minAccountAgeDays) * 24 * 60 * 60 * 1000;
  return ageMs < minMs;
}

async function resolveUsedInvite(client, member) {
  const guild = member.guild;
  const inviteCache = ensureInviteCache(client);
  const cached = inviteCache.get(guild.id) || new Map();

  let currentInvites;
  try {
    currentInvites = await guild.invites.fetch();
  } catch (error) {
    logger.warn(`Could not fetch invites on join for guild ${guild.id}:`, error.message);
    return null;
  }

  let usedInvite = null;
  for (const invite of currentInvites.values()) {
    const previous = cached.get(invite.code);
    const previousUses = previous?.uses ?? 0;
    const currentUses = invite.uses ?? 0;
    if (currentUses > previousUses) {
      usedInvite = {
        code: invite.code,
        uses: currentUses,
        inviterId: invite.inviter?.id || previous?.inviterId || null,
      };
      break;
    }
  }

  // Refresh cache after comparison
  const refreshed = new Map();
  for (const invite of currentInvites.values()) {
    refreshed.set(invite.code, {
      code: invite.code,
      uses: invite.uses ?? 0,
      inviterId: invite.inviter?.id ?? null,
    });
  }
  inviteCache.set(guild.id, refreshed);

  if (usedInvite) {
    return usedInvite;
  }

  // Possible vanity URL join
  try {
    if (guild.features.includes('VANITY_URL') && guild.vanityURLCode) {
      const vanity = await guild.fetchVanityData();
      const previousVanityUses = (await client.db.get(vanityJoinKey(guild.id))) || 0;
      if ((vanity.uses || 0) > previousVanityUses) {
        await client.db.set(vanityJoinKey(guild.id), vanity.uses || 0);
        return { code: guild.vanityURLCode, uses: vanity.uses, inviterId: null, vanity: true };
      }
      await client.db.set(vanityJoinKey(guild.id), vanity.uses || 0);
    }
  } catch {
    // Vanity may be unavailable without permissions
  }

  return null;
}

export async function trackMemberJoinInvite(client, member) {
  if (!member?.guild || member.user?.bot) {
    return null;
  }

  const config = await getInviteRewardsConfig(client, member.guild.id);
  if (!config.enabled) {
    return null;
  }

  const usedInvite = await resolveUsedInvite(client, member);
  if (!usedInvite?.inviterId || usedInvite.inviterId === member.id) {
    return { usedInvite, attributed: false };
  }

  const fake = isFakeJoin(member, config.minAccountAgeDays);
  const stats = await getMemberInviteStats(client, member.guild.id, usedInvite.inviterId);
  stats.joins += 1;
  if (fake) {
    stats.fake += 1;
  }
  stats.invitedUsers[member.id] = {
    userId: member.id,
    joinedAt: new Date().toISOString(),
    inviteCode: usedInvite.code,
    fake,
  };
  await saveMemberInviteStats(client, member.guild.id, usedInvite.inviterId, stats);

  // Keep a reverse lookup for leave handling
  await client.db.set(`guild:${member.guild.id}:invite_rewards:invited_by:${member.id}`, {
    inviterId: usedInvite.inviterId,
    inviteCode: usedInvite.code,
    fake,
    joinedAt: new Date().toISOString(),
  });

  // Soft index of tracked inviters
  const tracking = (await client.db.get(getInviteTrackingKey(member.guild.id))) || { inviters: [] };
  if (!tracking.inviters.includes(usedInvite.inviterId)) {
    tracking.inviters.push(usedInvite.inviterId);
    await client.db.set(getInviteTrackingKey(member.guild.id), tracking);
  }

  return {
    usedInvite,
    attributed: true,
    fake,
    inviterId: usedInvite.inviterId,
    validInvites: getValidInviteCount(stats),
  };
}

export async function trackMemberLeaveInvite(client, member) {
  if (!member?.guild || member.user?.bot) {
    return null;
  }

  const link = await client.db.get(`guild:${member.guild.id}:invite_rewards:invited_by:${member.id}`);
  if (!link?.inviterId) {
    return null;
  }

  const stats = await getMemberInviteStats(client, member.guild.id, link.inviterId);
  const invited = stats.invitedUsers?.[member.id];
  if (!invited || invited.leftAt) {
    return null;
  }

  stats.left += 1;
  stats.invitedUsers[member.id] = {
    ...invited,
    leftAt: new Date().toISOString(),
  };
  await saveMemberInviteStats(client, member.guild.id, link.inviterId, stats);

  return {
    inviterId: link.inviterId,
    validInvites: getValidInviteCount(stats),
  };
}

export function getClaimableRewards(config, validInvites, claims) {
  const claimed = new Set(claims.claimedRewardIds || []);
  return (config.rewards || []).filter(
    (reward) => validInvites >= reward.invites && !claimed.has(reward.id)
  );
}

export function buildRewardsPanelEmbed(config, options = {}) {
  const rewards = config.rewards || DEFAULT_REWARDS;
  const nitro = rewards.filter((r) => r.category === 'nitro');
  const robux = rewards.filter((r) => r.category === 'robux');
  const other = rewards.filter((r) => r.category !== 'nitro' && r.category !== 'robux');

  const formatRewardLine = (reward) =>
    `→ \`[ ${reward.invites} Invites ]\` = **${reward.label}** ${reward.emoji || ''}`.trim();

  const sections = [];
  if (nitro.length) {
    sections.push(nitro.map(formatRewardLine).join('\n'));
  }
  if (robux.length) {
    sections.push(robux.map(formatRewardLine).join('\n'));
  }
  if (other.length) {
    sections.push(other.map(formatRewardLine).join('\n'));
  }

  const divider = '▬▬▬▬▬▬▬▬▬▬';
  const notices = config.notices || [
    '📌 Inviting alt accounts or bots = **ban**',
    '📌 Breaking Discord Terms of Service = exclusion from the event',
    '📌 Valid invites = joins − leaves − fakes (too-new accounts)',
  ];

  const description = [
    'Invite members and **claim your rewards** now!',
    divider,
    sections.join(`\n${divider}\n`),
    divider,
    '**NOTICES**',
    ...notices,
    '',
    '**READY TO CLAIM?**',
    'Click the button below once you reach the required invite count.',
  ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(getColor('primary') || 0x5865f2)
    .setDescription(description)
    .setFooter({
      text: `Rewards system | ${options.timestampLabel || new Date().toLocaleString('en-US')}`,
    });

  return embed;
}

export function buildClaimButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(INVITE_REWARDS_CLAIM_BUTTON)
      .setLabel('Claim')
      .setEmoji('🎁')
      .setStyle(ButtonStyle.Primary)
  );
}

export function buildRewardSelectRow(claimableRewards) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(INVITE_REWARDS_SELECT)
    .setPlaceholder('Choose your reward')
    .addOptions(
      claimableRewards.slice(0, 25).map((reward) => ({
        label: reward.label.slice(0, 100),
        description: `${reward.invites} invites required`.slice(0, 100),
        value: reward.id,
        emoji: reward.emoji || undefined,
      }))
    );

  return new ActionRowBuilder().addComponents(menu);
}

export async function claimReward(client, guildId, userId, rewardId) {
  const config = await getInviteRewardsConfig(client, guildId);
  const reward = (config.rewards || []).find((item) => item.id === rewardId);
  if (!reward) {
    return { ok: false, reason: 'unknown_reward' };
  }

  const stats = await getMemberInviteStats(client, guildId, userId);
  const validInvites = getValidInviteCount(stats);
  if (validInvites < reward.invites) {
    return { ok: false, reason: 'not_enough_invites', validInvites, required: reward.invites };
  }

  const claims = await getMemberClaims(client, guildId, userId);
  if (claims.claimedRewardIds.includes(reward.id)) {
    return { ok: false, reason: 'already_claimed', reward, validInvites };
  }

  claims.claimedRewardIds.push(reward.id);
  claims.history.push({
    rewardId: reward.id,
    label: reward.label,
    claimedAt: new Date().toISOString(),
    validInvitesAtClaim: validInvites,
  });
  await saveMemberClaims(client, guildId, userId, claims);

  return { ok: true, reward, validInvites, config, claims };
}

export async function getInviteLeaderboard(client, guildId, limit = 10) {
  const tracking = (await client.db.get(getInviteTrackingKey(guildId))) || { inviters: [] };
  const rows = [];

  for (const inviterId of tracking.inviters || []) {
    const stats = await getMemberInviteStats(client, guildId, inviterId);
    rows.push({
      userId: inviterId,
      joins: stats.joins,
      left: stats.left,
      fake: stats.fake,
      valid: getValidInviteCount(stats),
    });
  }

  rows.sort((a, b) => b.valid - a.valid || b.joins - a.joins);
  return rows.slice(0, Math.max(1, Math.min(limit, 25)));
}

export async function resetMemberInvites(client, guildId, userId) {
  await saveMemberInviteStats(client, guildId, userId, emptyInviteStats());
  await saveMemberClaims(client, guildId, userId, { claimedRewardIds: [], history: [] });
}
