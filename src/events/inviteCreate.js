import { Events } from 'discord.js';
import { updateCachedInvite } from '../services/inviteRewardsService.js';
import { logger } from '../utils/logger.js';

export default {
  name: Events.InviteCreate,
  once: false,

  async execute(invite, client) {
    try {
      if (!invite?.guild) return;
      updateCachedInvite(client || invite.client, invite);
    } catch (error) {
      logger.debug('Error caching created invite:', error);
    }
  },
};
