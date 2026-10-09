import { Events } from 'discord.js';
import { removeCachedInvite } from '../services/inviteRewardsService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.InviteDelete,
  once: false,

  async execute(invite, client) {
    try {
      if (!invite?.guild) return;
      removeCachedInvite(client || invite.client, invite.guild.id, invite.code);
    } catch (error) {
      logger.debug('Error removing deleted invite from cache:', error);
    }
  },
};
