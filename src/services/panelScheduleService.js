import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { logger } from '../utils/logger.js';
import { getColor } from '../config/bot.js';

export const ALLOWED_INTERVALS_MINUTES = [5, 10];
export const MAX_SCHEDULED_PANELS_PER_GUILD = 5;

function schedulesKey(guildId) {
  return `guild:${guildId}:panel_schedules`;
}

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

export function buildPanelPayload(options = {}) {
  const description = options.description
    ? String(options.description).replace(/\\n/g, '\n')
    : null;

  return {
    title: options.title || null,
    description,
    color: normalizeHexColor(options.color) || null,
    image: options.image || null,
    thumbnail: options.thumbnail || null,
    footer: options.footer || null,
    author: options.author || null,
    content: options.content || null,
    timestamp: Boolean(options.timestamp),
  };
}

export function validatePanelPayload(payload) {
  if (
    !payload.title &&
    !payload.description &&
    !payload.image &&
    !payload.thumbnail &&
    !payload.author &&
    !payload.footer
  ) {
    return 'Provide at least one of: title, description, image, thumbnail, author, or footer.';
  }

  if (payload.color === null && payload._rawColor) {
    return 'Use a hex color like `#5865F2` or `5865F2`.';
  }

  for (const [label, url] of [
    ['image', payload.image],
    ['thumbnail', payload.thumbnail],
  ]) {
    if (url && !isValidUrl(url)) {
      return `The ${label} must be a valid http/https URL.`;
    }
  }

  return null;
}

export function createPanelEmbed(payload) {
  const embed = new EmbedBuilder();
  try {
    embed.setColor(payload.color || getColor('primary') || '#5865F2');
  } catch {
    embed.setColor('#5865F2');
  }

  if (payload.title) embed.setTitle(String(payload.title).slice(0, 256));
  if (payload.description) embed.setDescription(String(payload.description).slice(0, 4096));
  if (payload.author) embed.setAuthor({ name: String(payload.author).slice(0, 256) });
  if (payload.footer) embed.setFooter({ text: String(payload.footer).slice(0, 2048) });
  if (payload.image && isValidUrl(payload.image)) embed.setImage(payload.image);
  if (payload.thumbnail && isValidUrl(payload.thumbnail)) embed.setThumbnail(payload.thumbnail);
  if (payload.timestamp) embed.setTimestamp();

  return embed;
}

function makeScheduleId() {
  return `pnl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function listPanelSchedules(client, guildId) {
  const schedules = (await client.db.get(schedulesKey(guildId))) || [];
  return Array.isArray(schedules) ? schedules : [];
}

async function savePanelSchedules(client, guildId, schedules) {
  await client.db.set(schedulesKey(guildId), schedules);
  return schedules;
}

export async function createPanelSchedule(client, {
  guildId,
  channelId,
  createdBy,
  intervalMinutes,
  payload,
  replacePrevious = true,
}) {
  if (!ALLOWED_INTERVALS_MINUTES.includes(intervalMinutes)) {
    throw new Error(`Interval must be one of: ${ALLOWED_INTERVALS_MINUTES.join(', ')} minutes`);
  }

  const schedules = await listPanelSchedules(client, guildId);
  if (schedules.length >= MAX_SCHEDULED_PANELS_PER_GUILD) {
    throw new Error(`This server already has ${MAX_SCHEDULED_PANELS_PER_GUILD} scheduled panels. Stop one first.`);
  }

  const now = Date.now();
  const schedule = {
    id: makeScheduleId(),
    guildId,
    channelId,
    createdBy,
    intervalMinutes,
    intervalMs: intervalMinutes * 60 * 1000,
    payload,
    replacePrevious: replacePrevious !== false,
    enabled: true,
    lastMessageId: null,
    lastSentAt: null,
    nextRunAt: now, // send ASAP on first tick
    createdAt: new Date(now).toISOString(),
  };

  schedules.push(schedule);
  await savePanelSchedules(client, guildId, schedules);
  return schedule;
}

export async function stopPanelSchedule(client, guildId, scheduleId) {
  const schedules = await listPanelSchedules(client, guildId);
  const next = schedules.filter((item) => item.id !== scheduleId);
  if (next.length === schedules.length) {
    return null;
  }
  await savePanelSchedules(client, guildId, next);
  return scheduleId;
}

async function sendScheduledPanel(client, schedule) {
  const guild = client.guilds.cache.get(schedule.guildId) || await client.guilds.fetch(schedule.guildId).catch(() => null);
  if (!guild) return { ok: false, reason: 'guild_missing' };

  const channel = guild.channels.cache.get(schedule.channelId)
    || await guild.channels.fetch(schedule.channelId).catch(() => null);
  if (!channel?.isTextBased?.()) return { ok: false, reason: 'channel_missing' };

  const me = guild.members.me;
  const perms = me ? channel.permissionsFor(me) : null;
  if (!perms?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])) {
    return { ok: false, reason: 'missing_permissions' };
  }

  if (schedule.replacePrevious && schedule.lastMessageId && perms.has(PermissionFlagsBits.ManageMessages)) {
    try {
      const previous = await channel.messages.fetch(schedule.lastMessageId);
      await previous.delete();
    } catch {
      // Previous message may already be gone
    }
  }

  const message = await channel.send({
    content: schedule.payload?.content || undefined,
    embeds: [createPanelEmbed(schedule.payload || {})],
  });

  return { ok: true, messageId: message.id };
}

export async function processDuePanelSchedules(client) {
  if (!client?.db || !client.guilds?.cache) return { processed: 0, sent: 0, failed: 0 };

  let processed = 0;
  let sent = 0;
  let failed = 0;
  const now = Date.now();

  for (const guild of client.guilds.cache.values()) {
    const schedules = await listPanelSchedules(client, guild.id);
    if (!schedules.length) continue;

    let changed = false;
    for (const schedule of schedules) {
      if (!schedule.enabled) continue;
      const nextRunAt = Number(schedule.nextRunAt || 0);
      if (nextRunAt > now) continue;

      processed += 1;
      try {
        const result = await sendScheduledPanel(client, schedule);
        if (result.ok) {
          schedule.lastMessageId = result.messageId;
          schedule.lastSentAt = new Date(now).toISOString();
          schedule.nextRunAt = now + Number(schedule.intervalMs || schedule.intervalMinutes * 60 * 1000);
          sent += 1;
        } else {
          // Back off a bit on failure so we don't hammer missing channels
          schedule.nextRunAt = now + Math.min(Number(schedule.intervalMs || 300000), 5 * 60 * 1000);
          failed += 1;
          logger.debug(`Scheduled panel ${schedule.id} skipped: ${result.reason}`);
        }
        changed = true;
      } catch (error) {
        failed += 1;
        schedule.nextRunAt = now + 5 * 60 * 1000;
        changed = true;
        logger.warn(`Failed to send scheduled panel ${schedule.id}:`, error.message);
      }
    }

    if (changed) {
      await savePanelSchedules(client, guild.id, schedules);
    }
  }

  return { processed, sent, failed };
}
