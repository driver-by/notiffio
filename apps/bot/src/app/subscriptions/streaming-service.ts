/**
 * Basic functionality for streaming services
 * Don't create instances of this class
 */
import { BaseService } from './base-service';
import {
  EVENT_BROADCAST_ADD,
  EVENT_BROADCAST_CHANGE,
  EVENT_BROADCAST_REMOVE,
  EVENT_CHANNEL_NOT_FOUND,
  EVENT_GO_LIVE,
  EVENT_GO_LIVE_AGAIN,
  EVENT_GO_OFFLINE,
} from './events';
import { ChannelDetails } from './channel-details';
import { Status } from '../../../../../libs/data-access/src/lib/status';
import { DataAccess, Subscription } from '../../../../../libs/data-access/src';
import { getLogger } from '../../../../../libs/logger/src';

const logger = getLogger();

export type StreamingServiceConfig = { UPDATE_INTERVAL };

export abstract class StreamingService extends BaseService {
  protected readonly dataAccess: DataAccess;
  protected readonly UPDATE_INTERVAL: number;
  protected readonly REMOVE_SUBSCRIPTIONS_AFTER_NOT_FOUND_TIMES: number;
  protected readonly NOT_CHANGE_TO_DEAD_WITHIN = 60 * 1000;
  protected readonly NOTIFICATION_EXPIRED = 10 * 60 * 1000;
  protected readonly LIVE_AGAIN_WITHIN = 60 * 60 * 1000;
  protected readonly REMOVE_BROADCAST_AFTER = 10 * 60 * 1000;

  protected constructor(
    dataAccess: DataAccess,
    config: StreamingServiceConfig
  ) {
    super();
    this.name = 'StreamingService';
    this.dataAccess = dataAccess;
    this.UPDATE_INTERVAL = config.UPDATE_INTERVAL || 30 * 1000;
    this.REMOVE_SUBSCRIPTIONS_AFTER_NOT_FOUND_TIMES =
      (60 * 60 * 1000) / this.UPDATE_INTERVAL; // 60 min
  }

  async getChannelStatuses(channels): Promise<Array<ChannelDetails>> {
    return;
  }

  async update(shardIds: number[]) {
    const subscriptionsToCheck =
      await this.dataAccess.subscriptionsGetByLastCheckAndUpdate(
        this.UPDATE_INTERVAL,
        this.name,
        shardIds
      );

    if (!subscriptionsToCheck || !subscriptionsToCheck.length) {
      return;
    }

    return this.getChannelStatuses(subscriptionsToCheck).then(
      this.processChannelStatuses.bind(this, subscriptionsToCheck),
      (error) => logger.error(`getChannelStatuses error`, error)
    );
  }

  async processChannelStatuses(subscriptionsToCheck, result) {
    await super.processChannelStatuses(subscriptionsToCheck, result);

    const subscriptionsByName = {};
    subscriptionsToCheck.forEach(
      (sub) => (subscriptionsByName[sub.name.toLowerCase()] = sub)
    );
    const promises = [];

    result.forEach((subscription, j) => {
      const subscriptionName = this.dataAccess.getSubscriptionName(
        this.name,
        subscription.name
      );
      const subscriptionData = subscriptionsByName[subscriptionName];
      const savedData = <Subscription>{};
      const now = Date.now();
      // Don't send notification if last check was too long ago (bot was switched off)
      const skipNotificationAsItIsExpired =
        subscriptionData.lastCheck &&
        now - subscriptionData.lastCheck > this.NOTIFICATION_EXPIRED;
      if (subscription.status !== subscriptionData.lastStatus) {
        const firstCheck = !subscriptionData.lastStatus;
        let skipStatusChange = false;
        if (
          !firstCheck &&
          subscription.status === Status.Dead &&
          !skipNotificationAsItIsExpired
        ) {
          // Don't set as DEAD within some interval (might be temporary drop)
          if (subscriptionData.firstDead) {
            if (
              now - subscriptionData.firstDead <
              this.NOT_CHANGE_TO_DEAD_WITHIN
            ) {
              skipStatusChange = true;
            } else {
              savedData.firstDead = null;
            }
          } else {
            savedData.firstDead = now;
            skipStatusChange = true;
          }
        }
        if (!skipStatusChange) {
          savedData.firstDead = null;
          savedData.previousStatus = subscriptionData.lastStatus;
          savedData.lastStatus = subscription.status;
          if (!firstCheck) {
            if (!skipNotificationAsItIsExpired) {
              let eventName;
              if (subscription.status === Status.Live) {
                // If the game is the same and LIVE not long after DEAD, then LIVE_AGAIN event
                if (
                  subscriptionData.statusChangedOnGame === subscription.game &&
                  now - subscriptionData.statusChangeTimestamp <
                    this.LIVE_AGAIN_WITHIN
                ) {
                  eventName = EVENT_GO_LIVE_AGAIN;
                } else {
                  eventName = EVENT_GO_LIVE;
                }
              } else {
                eventName = EVENT_GO_OFFLINE;
              }
              this.emitEvent(eventName, {
                subscription,
                servers: subscriptionData.servers,
              });
            }
            savedData.statusChangeTimestamp = now;
            savedData.statusChangedOnGame = subscription.game;
          }
        }
      }
      // Check for broadcasts changes
      // Goodgame returns only one broadcast even if there are more.
      // Save broadcasts in array to prevent multiple events because of few broadcast changes.
      let eventName;
      let savedBroadcast;
      if (subscriptionData.broadcasts) {
        savedData.broadcasts = this.removeOldBroadcasts(
          subscriptionData.broadcasts
        );
        savedBroadcast = savedData.broadcasts.find((b) =>
          this.broadcastEquals(b, subscription.broadcast)
        );
      } else {
        savedData.broadcasts = [];
      }
      if (!savedBroadcast) {
        savedData.broadcasts.push(subscription.broadcast);
      }

      if (subscription.broadcast && !savedBroadcast) {
        // Send "Add" only if start is in future
        if (subscription.broadcast.start > now) {
          eventName = EVENT_BROADCAST_ADD;
        }
      } else if (!subscription.broadcast && savedData.broadcasts.length) {
        savedBroadcast = savedData.broadcasts[savedData.broadcasts.length - 1];
        // Send "Remove" only if start was in future, otherwise it was naturally finished
        if (savedBroadcast && savedBroadcast.start > now) {
          eventName = EVENT_BROADCAST_REMOVE;
        }
        savedData.broadcasts = [];
      } else if (
        subscription.broadcast &&
        savedBroadcast &&
        (subscription.broadcast.start !== savedBroadcast.start ||
          subscription.broadcast.game !== savedBroadcast.game)
      ) {
        // Send "Change" only if start was in future, otherwise it was naturally finished
        if (savedBroadcast.start > now) {
          eventName = EVENT_BROADCAST_CHANGE;
        }
      }
      if (eventName && !skipNotificationAsItIsExpired) {
        this.emitEvent(eventName, {
          broadcast: subscription.broadcast,
          broadcastPrevious: savedBroadcast,
          subscription,
          servers: subscriptionData.servers,
        });
      }
      if (savedBroadcast) {
        // Update saved data about broadcast
        savedBroadcast.start = subscription.broadcast.start;
        savedBroadcast.title = subscription.broadcast.title;
        savedBroadcast.game = subscription.broadcast.game;
      }

      savedData.lastCheck = now;
      savedData.lastInfo = subscription;
      savedData.notFoundTimes = 0;
      savedData.lastCheckStarted = null;
      promises.push(
        this.dataAccess.updateSubscription(subscriptionData.name, savedData)
      );
    });
    const notFoundChannels = this.getNotFound(subscriptionsToCheck, result);
    promises.push(this.updateNotFound(notFoundChannels));

    return Promise.all(promises);
  }

  protected broadcastEquals(b1, b2) {
    return b1.start === b2.start || b1.title === b2.title;
  }

  protected removeOldBroadcasts(broadcasts) {
    if (!broadcasts) {
      return broadcasts;
    }
    return broadcasts.filter(
      (b) => b.start > Date.now() - this.REMOVE_BROADCAST_AFTER
    );
  }

  emitEvent(eventName, params) {
    super.emitEvent(eventName, params);
  }

  protected getNotFound(channelsToBeFound, channels) {
    const channelsNames = channels.map((c) => c.name.toLowerCase());
    return channelsToBeFound.filter(
      (c) => channelsNames.indexOf(c.channel.toLowerCase()) === -1
    );
  }

  protected async removeNotFound(channel) {
    if (!channel) {
      return;
    }
    const promises = [];
    this.emitEvent(EVENT_CHANNEL_NOT_FOUND, {
      servers: channel.servers,
      channel: channel.channel,
    });
    channel.servers.forEach((server) => {
      promises.push(
        this.dataAccess.subscriptionRemove(
          server.serverId,
          server.channelId,
          channel.service,
          channel.channel
        )
      );
    });
    return Promise.all(promises);
  }

  /**
   * Update notFoundTimes of channel and remove only after a lot of consequent "not found" events
   * Could be temporary issue with API so don't remove immediately
   * @param channels
   * @private
   */
  protected async updateNotFound(channels) {
    const promises = [];
    channels.forEach((channel) => {
      const saveData = <Subscription>{};
      saveData.notFoundTimes = channel.notFoundTimes || 0;
      saveData.notFoundTimes++;
      if (
        saveData.notFoundTimes >=
        this.REMOVE_SUBSCRIPTIONS_AFTER_NOT_FOUND_TIMES
      ) {
        promises.push(this.removeNotFound(channel));
      } else {
        saveData.lastCheck = Date.now();
        promises.push(
          this.dataAccess.updateSubscription(channel.name, saveData)
        );
      }
    });
    return Promise.all(promises);
  }
}
