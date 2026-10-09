import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  EmbedBuilder,
} from 'discord.js';
import { errorEmbed, successEmbed } from '../../utils/embeds.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { handleInteractionError } from '../../utils/errorHandler.js';
import { getColor } from '../../config/bot.js';

export function isValidUrl(str) {
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeHexColor(input) {
  if (!input) return null;
  const value = input.trim();
  if (/^#[0-9A-Fa-f]{6}$/.test(value)) return value;
  if (/^[0-9A-Fa-f]{6}$/.test(value)) return `#${value}`;
  return null;
}

export default {
  data: new SlashCommandBuilder()
    .setName('panel')
    .setDescription('Create and post a custom embed panel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('Embed title')
        .setMaxLength(256)
        .setRequired(false)
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
        .setDescription('Hex color (e.g. #5865F2 or 5865F2)')
        .setMaxLength(7)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('image')
        .setDescription('Large image URL at the bottom of the embed')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('thumbnail')
        .setDescription('Small image URL in the top-right')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('footer')
        .setDescription('Footer text')
        .setMaxLength(2048)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('author')
        .setDescription('Author name at the top of the embed')
        .setMaxLength(256)
        .setRequired(false)
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

      const title = interaction.options.getString('title');
      const rawDescription = interaction.options.getString('description');
      const colorInput = interaction.options.getString('color');
      const image = interaction.options.getString('image');
      const thumbnail = interaction.options.getString('thumbnail');
      const footer = interaction.options.getString('footer');
      const author = interaction.options.getString('author');
      const content = interaction.options.getString('content');
      const timestamp = interaction.options.getBoolean('timestamp') ?? false;
      const channel = interaction.options.getChannel('channel') || interaction.channel;

      const description = rawDescription
        ? rawDescription.replace(/\\n/g, '\n')
        : null;

      if (!title && !description && !image && !thumbnail && !author && !footer) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [
            errorEmbed(
              'Empty panel',
              'Provide at least one of: title, description, image, thumbnail, author, or footer.'
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      if (colorInput && !normalizeHexColor(colorInput)) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Invalid color', 'Use a hex color like `#5865F2` or `5865F2`.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      for (const [label, url] of [
        ['image', image],
        ['thumbnail', thumbnail],
      ]) {
        if (url && !isValidUrl(url)) {
          return InteractionHelper.safeReply(interaction, {
            embeds: [errorEmbed('Invalid URL', `The ${label} must be a valid http/https URL.`)],
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      if (!channel?.isTextBased?.()) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [errorEmbed('Invalid channel', 'Choose a text or announcement channel.')],
          flags: MessageFlags.Ephemeral,
        });
      }

      const me = interaction.guild.members.me;
      const perms = me ? channel.permissionsFor(me) : null;
      if (!perms?.has(['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
        return InteractionHelper.safeReply(interaction, {
          embeds: [
            errorEmbed(
              'Missing permissions',
              `I need View Channel, Send Messages, and Embed Links in ${channel}.`
            ),
          ],
          flags: MessageFlags.Ephemeral,
        });
      }

      const embed = new EmbedBuilder();
      const hex = normalizeHexColor(colorInput);
      try {
        embed.setColor(hex || getColor('primary') || '#5865F2');
      } catch {
        embed.setColor('#5865F2');
      }

      if (title) embed.setTitle(title);
      if (description) embed.setDescription(description);
      if (author) embed.setAuthor({ name: author });
      if (footer) embed.setFooter({ text: footer });
      if (image) embed.setImage(image);
      if (thumbnail) embed.setThumbnail(thumbnail);
      if (timestamp) embed.setTimestamp();

      const message = await channel.send({
        content: content || undefined,
        embeds: [embed],
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
    } catch (error) {
      return handleInteractionError(interaction, error, {
        type: 'command',
        commandName: 'panel',
      });
    }
  },
};
