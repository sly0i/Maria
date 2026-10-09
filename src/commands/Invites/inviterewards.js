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
    .setDescription('Invite rewards system (Nitro / Robux)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand
        .setName('panel')
        .setDescription('Post the rewards panel with the Claim button')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel to post the panel in (defaults to current)')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('staff')
        .setDescription('Set the staff channel for reward claim alerts')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Staff channel that will receive claims')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('leaderboard')
        .setDescription('Show the invite leaderboard')
        .addIntegerOption((option) =>
          option
            .setName('limit')
            .setDescription('Number of places (max 25)')
            .setMinValue(3)
            .setMaxValue(25)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('check')
        .setDescription('Check a member’s invites')
        .addUserOption((option) =>
          option.setName('user').setDescription('Member to check').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reset')
        .setDescription('Reset a member’s invites / claims')
        .addUserOption((option) =>
          option.setName('user').setDescription('Member to reset').setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('config')
        .setDescription('View the current rewards config')
    ),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Server only', 'This command can only be used in a server.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Permission', 'You need the Manage Server permission.')],
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
            embeds: [errorEmbed('Invalid channel', 'Choose a text channel.')],
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
          embeds: [successEmbed('Panel posted', `Rewards panel sent in ${channel}.`)],
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
              'Staff channel set',
              `Reward claim requests will be sent to ${channel}.`
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
            embeds: [errorEmbed('No data', 'Nobody has tracked invites yet.')],
            flags: MessageFlags.Ephemeral,
          });
        }

        const lines = rows.map((row, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `**${index + 1}.**`;
          return `${medal} <@${row.userId}> — **${row.valid}** valid (📥 ${row.joins} / 📤 ${row.left} / 🚫 ${row.fake})`;
        });

        return InteractionHelper.safeReply(interaction, {
          embeds: [
            createEmbed({
              title: 'Invite leaderboard',
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
                `✅ Valid: **${valid}**`,
                `📥 Joins: **${stats.joins}**`,
                `📤 Leaves: **${stats.left}**`,
                `🚫 Fakes: **${stats.fake}**`,
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
            successEmbed('Reset complete', `${user}'s invites and claims have been reset.`),
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
              title: 'Invite Rewards Config',
              description: [
                `Status: **${config.enabled ? 'enabled' : 'disabled'}**`,
                `Staff channel: ${config.staffChannelId ? `<#${config.staffChannelId}>` : '*not set*'}`,
                `Min account age: **${config.minAccountAgeDays} days**`,
                '',
                '**Rewards:**',
                rewardLines,
              ].join('\n'),
              color: 'primary',
            }),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      return InteractionHelper.safeReply(interaction, {
        embeds: [errorEmbed('Error', 'Unknown subcommand.')],
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
