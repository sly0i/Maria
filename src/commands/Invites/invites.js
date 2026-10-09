import { SlashCommandBuilder, MessageFlags } from 'discord.js';
import { createEmbed, errorEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import {
  getMemberInviteStats,
  getValidInviteCount,
  getMemberClaims,
  getInviteRewardsConfig,
} from '../../services/inviteRewardsService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Check a member’s invite count')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Member to check (defaults to you)')
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Server only', 'This command can only be used in a server.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const target = interaction.options.getUser('user') || interaction.user;
      const stats = await getMemberInviteStats(interaction.client, interaction.guildId, target.id);
      const valid = getValidInviteCount(stats);
      const claims = await getMemberClaims(interaction.client, interaction.guildId, target.id);
      const config = await getInviteRewardsConfig(interaction.client, interaction.guildId);

      const nextReward = (config.rewards || [])
        .filter((reward) => !claims.claimedRewardIds.includes(reward.id) && reward.invites > valid)
        .sort((a, b) => a.invites - b.invites)[0];

      const embed = createEmbed({
        title: `${target.username}'s Invites`,
        description: [
          `✅ **Valid:** ${valid}`,
          `📥 **Joins:** ${stats.joins}`,
          `📤 **Leaves:** ${stats.left}`,
          `🚫 **Fakes:** ${stats.fake}`,
          claims.claimedRewardIds.length
            ? `🎁 **Rewards claimed:** ${claims.claimedRewardIds.length}`
            : '🎁 **Rewards claimed:** none',
          nextReward
            ? `🎯 **Next reward:** ${nextReward.label} (${nextReward.invites - valid} invites left)`
            : '🎯 **Next reward:** you have reached every available tier',
        ].join('\n'),
        color: 'primary',
        thumbnail: target.displayAvatarURL(),
      });

      return InteractionHelper.safeReply(interaction, {
        embeds: [embed],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      return handleInteractionError(interaction, error, {
        type: 'command',
        commandName: 'invites',
      });
    }
  },
};
