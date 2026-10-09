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
  ALLOWED_INTERVALS_MINUTES,
  buildPanelPayload,
  validatePanelPayload,
  createPanelEmbed,
  createPanelSchedule,
  listPanelSchedules,
  stopPanelSchedule,
  isValidUrl,
  normalizeHexColor,
} from '../../services/panelScheduleService.js';

export { isValidUrl, normalizeHexColor };

function collectPayloadFromOptions(interaction) {
  const rawColor = interaction.options.getString('color');
  const payload = buildPanelPayload({
    title: interaction.options.getString('title'),
    description: interaction.options.getString('description'),
    color: rawColor,
    image: interaction.options.getString('image'),
    thumbnail: interaction.options.getString('thumbnail'),
    footer: interaction.options.getString('footer'),
    author: interaction.options.getString('author'),
    content: interaction.options.getString('content'),
    timestamp: interaction.options.getBoolean('timestamp') ?? false,
  });

  if (rawColor && !payload.color) {
    payload._rawColor = rawColor;
  }

  return payload;
}

function addEmbedOptions(subcommand) {
  return subcommand
    .addStringOption((option) =>
      option.setName('title').setDescription('Embed title').setMaxLength(256).setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('description')
        .setDescription('Embed description (use \\n for new lines)')
        .setMaxLength(4000)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('color')
        .setDescription('Hex color (e.g. #5865F2)')
        .setMaxLength(7)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option.setName('image').setDescription('Large image URL').setRequired(false)
    )
    .addStringOption((option) =>
      option.setName('thumbnail').setDescription('Small top-right image URL').setRequired(false)
    )
    .addStringOption((option) =>
      option.setName('footer').setDescription('Footer text').setMaxLength(2048).setRequired(false)
    )
    .addStringOption((option) =>
      option.setName('author').setDescription('Author name').setMaxLength(256).setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('content')
        .setDescription('Optional message text above the embed')
        .setMaxLength(2000)
        .setRequired(false)
    )
    .addChannelOption((option) =>
      option
        .setName('channel')
        .setDescription('Channel to post in (defaults to current)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false)
    )
    .addBooleanOption((option) =>
      option
        .setName('timestamp')
        .setDescription('Show current timestamp on the embed')
        .setRequired(false)
    );
}

async function ensureChannelSendable(interaction, channel) {
  if (!channel?.isTextBased?.()) {
    await InteractionHelper.safeReply(interaction, {
      embeds: [errorEmbed('Invalid channel', 'Choose a text or announcement channel.')],
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  const me = interaction.guild.members.me;
  const perms = me ? channel.permissionsFor(me) : null;
  if (!perms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
    await InteractionHelper.safeReply(interaction, {
      embeds: [
        errorEmbed(
          'Missing permissions',
          `I need View Channel, Send Messages, and Embed Links in ${channel}.`
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  return true;
}

export default {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Create custom embed panels (one-shot or auto-scheduled)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((subcommand) =>
      addEmbedOptions(
        subcommand
          .setName('post')
          .setDescription('Post a custom embed once')
      )
    )
    .addSubcommand((subcommand) =>
      addEmbedOptions(
        subcommand
          .setName('schedule')
          .setDescription('Auto-send a custom embed every 5 or 10 minutes')
          .addIntegerOption((option) =>
            option
              .setName('interval')
              .setDescription('How often to send the embed')
              .setRequired(true)
              .addChoices(
                { name: 'Every 5 minutes', value: 5 },
                { name: 'Every 10 minutes', value: 10 }
              )
          )
          .addBooleanOption((option) =>
            option
              .setName('replace')
              .setDescription('Delete the previous auto message before posting the next one (default: true)')
              .setRequired(false)
          )
      )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('List scheduled auto-panels for this server')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('stop')
        .setDescription('Stop a scheduled auto-panel')
        .addStringOption((option) =>
          option
            .setName('id')
            .setDescription('Schedule ID from /panel list')
            .setRequired(true)
        )
    ),

  async execute(interaction) {
    try {
      if (!interaction.inGuild()) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Server only', 'This command can only be used in a server.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Permission', 'You need the Manage Messages permission.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const subcommand = interaction.options.getSubcommand();
      const client = interaction.client;
      const guildId = interaction.guildId;

      if (subcommand === 'list') {
        const schedules = await listPanelSchedules(client, guildId);
        if (!schedules.length) {
          return InteractionHelper.safeReply(interaction, {
            embeds: [errorEmbed('No schedules', 'There are no auto-panels running on this server.')],
            flags: MessageFlags.Ephemeral,
          });
        }

        const lines = schedules.map((schedule) => {
          const title = schedule.payload?.title || schedule.payload?.description?.slice(0, 40) || 'Untitled';
          const next = schedule.nextRunAt
            ? `<t:${Math.floor(schedule.nextRunAt / 1000)}:R>`
            : 'soon';
          return [
            `🆔 \`${schedule.id}\``,
            `📺 <#${schedule.channelId}> · every **${schedule.intervalMinutes}m**`,
            `📝 ${title}`,
            `⏱ Next: ${next}`,
          ].join('\n');
        });

        return InteractionHelper.safeReply(interaction, {
          embeds: [
            createEmbed({
              title: 'Scheduled panels',
              description: lines.join('\n\n'),
              color: 'primary',
            }),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (subcommand === 'stop') {
        const id = interaction.options.getString('id', true).trim();
        const stopped = await stopPanelSchedule(client, guildId, id);
        if (!stopped) {
          return InteractionHelper.safeReply(interaction, {
            embeds: [errorEmbed('Not found', `No schedule with ID \`${id}\`. Use \`/panel list\`.`)],
            flags: MessageFlags.Ephemeral,
          });
        }

        return InteractionHelper.safeReply(interaction, {
          embeds: [successEmbed('Schedule stopped', `Auto-panel \`${id}\` has been stopped.`)],
          flags: MessageFlags.Ephemeral,
        });
      }

      const payload = collectPayloadFromOptions(interaction);
      const validationError = validatePanelPayload(payload);
      if (validationError) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Invalid panel', validationError)],
          flags: MessageFlags.Ephemeral,
        });
      }
      delete payload._rawColor;

      const channel = interaction.options.getChannel('channel') || interaction.channel;
      if (!(await ensureChannelSendable(interaction, channel))) {
        return;
      }

      if (subcommand === 'post') {
        const message = await channel.send({
          content: payload.content || undefined,
          embeds: [createPanelEmbed(payload)],
        });

        return InteractionHelper.safeReply(interaction, {
          embeds: [
            successEmbed(
              'Panel posted',
              `Your embed was posted in ${channel}.\n[Jump to message](${message.url})`
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (subcommand === 'schedule') {
        const interval = interaction.options.getInteger('interval', true);
        const replace = interaction.options.getBoolean('replace');
        if (!ALLOWED_INTERVALS_MINUTES.includes(interval)) {
          return InteractionHelper.safeReply(interaction, {
            embeds: [errorEmbed('Invalid interval', 'Choose 5 or 10 minutes.')],
            flags: MessageFlags.Ephemeral,
          });
        }

        let schedule;
        try {
          schedule = await createPanelSchedule(client, {
            guildId,
            channelId: channel.id,
            createdBy: interaction.user.id,
            intervalMinutes: interval,
            payload,
            replacePrevious: replace !== false,
          });
        } catch (error) {
          return InteractionHelper.safeReply(interaction, {
            embeds: [errorEmbed('Could not schedule', error.message)],
            flags: MessageFlags.Ephemeral,
          });
        }

        // Send first copy immediately so staff sees it
        const firstMessage = await channel.send({
          content: payload.content || undefined,
          embeds: [createPanelEmbed(payload)],
        });

        const schedules = await listPanelSchedules(client, guildId);
        const stored = schedules.find((item) => item.id === schedule.id);
        if (stored) {
          stored.lastMessageId = firstMessage.id;
          stored.lastSentAt = new Date().toISOString();
          stored.nextRunAt = Date.now() + schedule.intervalMs;
          await client.db.set(`guild:${guildId}:panel_schedules`, schedules);
        }

        return InteractionHelper.safeReply(interaction, {
          embeds: [
            successEmbed(
              'Auto-panel scheduled',
              [
                `Embed will auto-send in ${channel} every **${interval} minutes**.`,
                `ID: \`${schedule.id}\``,
                `Replace previous message: **${replace !== false ? 'yes' : 'no'}**`,
                '',
                'Use `/panel list` to view schedules, `/panel stop id:...` to stop.',
                `[Jump to first message](${firstMessage.url})`,
              ].join('\n')
            ),
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
        commandName: 'panel',
      });
    }
  },
};
