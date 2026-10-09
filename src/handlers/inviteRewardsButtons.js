import { MessageFlags, EmbedBuilder } from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../utils/embeds.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { logger } from '../utils/logger.js';
import {
  INVITE_REWARDS_CLAIM_BUTTON,
  INVITE_REWARDS_SELECT,
  getInviteRewardsConfig,
  getMemberInviteStats,
  getValidInviteCount,
  getMemberClaims,
  getClaimableRewards,
  buildRewardSelectRow,
  claimReward,
} from '../services/inviteRewardsService.js';

export const inviteRewardsClaimHandler = {
  name: INVITE_REWARDS_CLAIM_BUTTON,
  async execute(interaction, client) {
    try {
      if (!interaction.inGuild()) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Server only', 'Use this button in a server.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const config = await getInviteRewardsConfig(client, interaction.guildId);
      if (!config.enabled) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Disabled', 'The rewards system is currently disabled.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const stats = await getMemberInviteStats(client, interaction.guildId, interaction.user.id);
      const validInvites = getValidInviteCount(stats);
      const claims = await getMemberClaims(client, interaction.guildId, interaction.user.id);
      const claimable = getClaimableRewards(config, validInvites, claims);

      if (!claimable.length) {
        const nextReward = (config.rewards || [])
          .filter((reward) => !claims.claimedRewardIds.includes(reward.id))
          .sort((a, b) => a.invites - b.invites)[0];

        const detail = nextReward
          ? `You need **${nextReward.invites}** valid invites for **${nextReward.label}** (you have **${validInvites}**).`
          : `You have **${validInvites}** valid invites and no rewards available.`;

        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Nothing to claim', detail)],
          flags: MessageFlags.Ephemeral,
        });
      }

      return InteractionHelper.safeReply(interaction, {
        embeds: [
          createEmbed({
            title: '🎁 Claim a reward',
            description: `You have **${validInvites}** valid invites.\nChoose a reward below:`,
            color: 'primary',
          }),
        ],
        components: [buildRewardSelectRow(claimable)],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger.error('Error in invite rewards claim button:', error);
      return InteractionHelper.safeReply(interaction, {
        embeds: [errorEmbed('Error', 'Could not load your rewards right now.')],
        flags: MessageFlags.Ephemeral,
      });
    }
  },
};

export const inviteRewardsSelectHandler = {
  name: INVITE_REWARDS_SELECT,
  async execute(interaction, client) {
    try {
      if (!interaction.inGuild()) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Server only', 'Use this menu in a server.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const rewardId = interaction.values?.[0];
      const result = await claimReward(client, interaction.guildId, interaction.user.id, rewardId);

      if (!result.ok) {
        const messages = {
          unknown_reward: 'That reward no longer exists.',
          not_enough_invites: `Not enough invites (you have ${result.validInvites}, need ${result.required}).`,
          already_claimed: 'You already claimed this reward.',
        };
        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Claim denied', messages[result.reason] || 'Unable to claim.')],
          flags: MessageFlags.Ephemeral,
          components: [],
        });
      }

      const { reward, validInvites, config } = result;

      if (config.staffChannelId) {
        const staffChannel = await interaction.guild.channels.fetch(config.staffChannelId).catch(() => null);
        if (staffChannel?.isTextBased?.()) {
          const staffEmbed = new EmbedBuilder()
            .setColor(0x57f287)
            .setTitle('🎁 New reward claim')
            .setDescription(
              [
                `**Member:** ${interaction.user} (\`${interaction.user.id}\`)`,
                `**Reward:** ${reward.emoji || ''} **${reward.label}**`,
                `**Valid invites:** ${validInvites}`,
                `**Category:** ${reward.category}`,
                '',
                'A staff member should manually send the Nitro gift / Robux to the member.',
              ].join('\n')
            )
            .setTimestamp()
            .setFooter({ text: 'Invite Rewards' });

          await staffChannel.send({
            content: 'New invite reward claim',
            embeds: [staffEmbed],
          });
        }
      }

      return InteractionHelper.safeReply(interaction, {
        embeds: [
          successEmbed(
            'Reward claimed',
            [
              `You claimed **${reward.label}** ${reward.emoji || ''}`.trim(),
              '',
              config.staffChannelId
                ? 'Staff has been notified and will contact you to deliver the reward.'
                : 'No staff notification channel is set yet — contact an admin.',
            ].join('\n')
          ),
        ],
        components: [],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger.error('Error in invite rewards select menu:', error);
      return InteractionHelper.safeReply(interaction, {
        embeds: [errorEmbed('Error', 'Could not finish your claim.')],
        flags: MessageFlags.Ephemeral,
        components: [],
      });
    }
  },
};
