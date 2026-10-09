import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import { createEmbed, errorEmbed, successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import {
  getInviteRewardsConfig,
  saveInviteRewardsConfig,
  buildRewardsPanelEmbed,
  buildClaimButtonRow,
  getInviteLeaderboard,
  getMemberInviteStats,
  getValidInviteCount,
  resetMemberInvites,
  DEFAULT_REWARDS,
} from '../../services/inviteRewardsService.js';

export default {
  data: new SlashCommandBuilder()
    .setName('inviterewards')
    .setDescription('Système de récompenses d’invites (Nitro / Robux)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('panel')
        .setDescription('Poster le panel de récompenses avec le bouton Réclamer')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Salon où poster le panel (défaut: salon actuel)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('staff')
        .setDescription('Définir le salon staff pour les demandes de récompense')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Salon staff qui recevra les claims')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('leaderboard')
        .setDescription('Voir le classement des invites')
        .addIntegerOption((option) =>
          option
            .setName('limit')
            .setDescription('Nombre de places (max 25)')
            .setMinValue(3)
            .setMaxValue(25)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('check')
        .setDescription('Vérifier les invites d’un membre')
        .addUserOption((option) =>
          option.setName('user').setDescription('Membre à vérifier').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reset')
        .setDescription('Reset les invites / claims d’un membre')
        .addUserOption((option) =>
          option.setName('user').setDescription('Membre à reset').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('config')
        .setDescription('Voir la config actuelle des récompenses')
    ),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Serveur uniquement', 'Cette commande marche seulement sur un serveur.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Permission', 'Il te faut la permission Gérer le serveur.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const subcommand = interaction.options.getSubcommand();
      const client = interaction.client;
      const guildId = interaction.guildId;

      if (subcommand === 'panel') {
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        if (!channel?.isTextBased?.()) {
          return InteractionHelper.safeReply(interaction, {
            embeds: [errorEmbed('Salon invalide', 'Choisis un salon texte.')],
            flags: MessageFlags.Ephemeral,
          });
        }

        const config = await getInviteRewardsConfig(client, guildId);
        const embed = buildRewardsPanelEmbed(config);
        const message = await channel.send({
          embeds: [embed],
          components: [buildClaimButtonRow()],
        });

        config.enabled = true;
        config.panelChannelId = channel.id;
        config.panelMessageId = message.id;
        await saveInviteRewardsConfig(client, guildId, config);

        return InteractionHelper.safeReply(interaction, {
          embeds: [successEmbed('Panel posté', `Panel de récompenses envoyé dans ${channel}.`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (subcommand === 'staff') {
        const channel = interaction.options.getChannel('channel', true);
        const config = await getInviteRewardsConfig(client, guildId);
        config.staffChannelId = channel.id;
        await saveInviteRewardsConfig(client, guildId, config);

        return InteractionHelper.safeReply(interaction, {
          embeds: [
            successEmbed(
              'Salon staff défini',
              `Les demandes de récompense seront envoyées dans ${channel}.`
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (subcommand === 'leaderboard') {
        const limit = interaction.options.getInteger('limit') || 10;
        const rows = await getInviteLeaderboard(client, guildId, limit);

        if (!rows.length) {
          return InteractionHelper.safeReply(interaction, {
            embeds: [errorEmbed('Aucune donnée', 'Personne n’a encore d’invites trackées.')],
            flags: MessageFlags.Ephemeral,
          });
        }

        const lines = rows.map((row, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
          return `${medal} <@${row.userId}> — **${row.valid}** valides (📥 ${row.joins} / 📤 ${row.left} / 🚫 ${row.fake})`;
        });

        return InteractionHelper.safeReply(interaction, {
          embeds: [
            createEmbed({
              title: 'Classement invites',
              description: lines.join('\n'),
              color: 'primary',
            }),
          ],
        });
      }

      if (subcommand === 'check') {
        const user = interaction.options.getUser('user', true);
        const stats = await getMemberInviteStats(client, guildId, user.id);
        const valid = getValidInviteCount(stats);

        return InteractionHelper.safeReply(interaction, {
          embeds: [
            createEmbed({
              title: `Invites — ${user.username}`,
              description: [
                `✅ Valides : **${valid}**`,
                `📥 Joins : **${stats.joins}**`,
                `📤 Leaves : **${stats.left}**`,
                `🚫 Fakes : **${stats.fake}**`,
              ].join('\n'),
              color: 'primary',
              thumbnail: user.displayAvatarURL(),
            }),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (subcommand === 'reset') {
        const user = interaction.options.getUser('user', true);
        await resetMemberInvites(client, guildId, user.id);
        return InteractionHelper.safeReply(interaction, {
          embeds: [
            successEmbed('Reset effectué', `Invites et claims de ${user} ont été réinitialisés.`),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (subcommand === 'config') {
        const config = await getInviteRewardsConfig(client, guildId);
        const rewardLines = (config.rewards || DEFAULT_REWARDS)
          .map((reward) => `• \`${reward.invites}\` → **${reward.label}** (${reward.category})`)
          .join('\n');

        return InteractionHelper.safeReply(interaction, {
          embeds: [
            createEmbed({
              title: 'Config Invite Rewards',
              description: [
                `État : **${config.enabled ? 'activé' : 'désactivé'}**`,
                `Salon staff : ${config.staffChannelId ? `<#${config.staffChannelId}>` : '*non défini*'}`,
                `Âge mini compte : **${config.minAccountAgeDays} jours**`,
                '',
                '**Récompenses :**',
                rewardLines,
              ].join('\n'),
              color: 'primary',
            }),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      return InteractionHelper.safeReply(interaction, {
        embeds: [errorEmbed('Erreur', 'Sous-commande inconnue.')],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      return handleInteractionError(interaction, error, {
        type: 'command',
        commandName: 'inviterewards',
      });
    }
  },
};
