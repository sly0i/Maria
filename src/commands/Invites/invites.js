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
    .setDescription('Voir le nombre d’invites d’un membre')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Membre à vérifier (toi par défaut)')
        .setRequired(false)
    ),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Serveur uniquement', 'Cette commande marche seulement sur un serveur.')],
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
        title: `Invites de ${target.username}`,
        description: [
          `✅ **Valides :** ${valid}`,
          `📥 **Joins :** ${stats.joins}`,
          `📤 **Leaves :** ${stats.left}`,
          `🚫 **Fakes :** ${stats.fake}`,
          claims.claimedRewardIds.length
            ? `🎁 **Récompenses réclamées :** ${claims.claimedRewardIds.length}`
            : '🎁 **Récompenses réclamées :** aucune',
          nextReward
            ? `🎯 **Prochaine récompense :** ${nextReward.label} (${nextReward.invites - valid} invites restantes)`
            : '🎯 **Prochaine récompense :** tu as atteint tous les paliers disponibles',
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
