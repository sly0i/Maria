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
          embeds: [errorEmbed('Serveur uniquement', 'Utilise ce bouton sur un serveur.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const config = await getInviteRewardsConfig(client, interaction.guildId);
      if (!config.enabled) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Désactivé', 'Le système de récompenses est désactivé.')],
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
          ? `Il te faut **${nextReward.invites}** invites valides pour **${nextReward.label}** (tu en as **${validInvites}**).`
          : `Tu as **${validInvites}** invites valides et aucune récompense disponible.`;

        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Rien à réclamer', detail)],
          flags: MessageFlags.Ephemeral,
        });
      }

      return InteractionHelper.safeReply(interaction, {
        embeds: [
          createEmbed({
            title: '🎁 Réclamer une récompense',
            description: `Tu as **${validInvites}** invites valides.\nChoisis une récompense ci-dessous :`,
            color: 'primary',
          }),
        ],
        components: [buildRewardSelectRow(claimable)],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger.error('Error in invite rewards claim button:', error);
      return InteractionHelper.safeReply(interaction, {
        embeds: [errorEmbed('Erreur', 'Impossible de charger tes récompenses pour le moment.')],
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
          embeds: [errorEmbed('Serveur uniquement', 'Utilise ce menu sur un serveur.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const rewardId = interaction.values?.[0];
      const result = await claimReward(client, interaction.guildId, interaction.user.id, rewardId);

      if (!result.ok) {
        const messages = {
          unknown_reward: 'Cette récompense n’existe plus.',
          not_enough_invites: `Pas assez d’invites (tu as ${result.validInvites}, il en faut ${result.required}).`,
          already_claimed: 'Tu as déjà réclamé cette récompense.',
        };
        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Claim refusé', messages[result.reason] || 'Impossible de réclamer.')],
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
            .setTitle('🎁 Nouvelle demande de récompense')
            .setDescription(
              [
                `**Membre :** ${interaction.user} (\`${interaction.user.id}\`)`,
                `**Récompense :** ${reward.emoji || ''} **${reward.label}**`,
                `**Invites valides :** ${validInvites}`,
                `**Catégorie :** ${reward.category}`,
                '',
                'Un staff doit envoyer manuellement le Nitro gift / Robux au membre.',
              ].join('\n')
            )
            .setTimestamp()
            .setFooter({ text: 'Invite Rewards' });

          await staffChannel.send({
            content: 'Nouvelle réclamation invites',
            embeds: [staffEmbed],
          });
        }
      }

      return InteractionHelper.safeReply(interaction, {
        embeds: [
          successEmbed(
            'Récompense réclamée',
            [
              `Tu as réclamé **${reward.label}** ${reward.emoji || ''}`.trim(),
              '',
              config.staffChannelId
                ? 'Le staff a été notifié et te contactera pour te livrer la récompense.'
                : 'Le staff n’a pas encore de salon de notification — contacte un admin.',
            ].join('\n')
          ),
        ],
        components: [],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger.error('Error in invite rewards select menu:', error);
      return InteractionHelper.safeReply(interaction, {
        embeds: [errorEmbed('Erreur', 'Impossible de finaliser ta réclamation.')],
        flags: MessageFlags.Ephemeral,
        components: [],
      });
    }
  },
};
