/**
 * Basic functionality for streaming services
 * Don't create instances of this class
 */
import { BaseService } from './base-service';
import { DataStorage } from '../data-storage';
import { getLogger } from '../services/logger';
import { STATUS_DEAD, STATUS_LIVE } from './statuses';
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

const logger = getLogger();

export type StreamingServiceConfig = { UPDATE_INTERVAL };

export abstract class StreamingService extends BaseService {
  protected readonly dataStorage: DataStorage;
  protected readonly UPDATE_INTERVAL: number;
  protected readonly REMOVE_SUBSCRIPTIONS_AFTER_NOT_FOUND_TIMES: number;
  protected readonly NOT_CHANGE_TO_DEAD_WITHIN = 60 * 1000;
  protected readonly NOTIFICATION_EXPIRED = 10 * 60 * 1000;
  protected readonly LIVE_AGAIN_WITHIN = 60 * 60 * 1000;
  protected readonly REMOVE_BROADCAST_AFTER = 10 * 60 * 1000;

  protected constructor(
    dataStorage: DataStorage,
    config: StreamingServiceConfig
  ) {
    super();
    this.name = 'StreamingService';
    this.dataStorage = dataStorage;
    this.UPDATE_INTERVAL = config.UPDATE_INTERVAL || 30 * 1000;
    this.REMOVE_SUBSCRIPTIONS_AFTER_NOT_FOUND_TIMES =
      (60 * 60 * 1000) / this.UPDATE_INTERVAL; // 60 min
  }

  async getChannelStatuses(channels): Promise<Array<ChannelDetails>> {
    return;
  }

  async update() {
    const subscriptionsToCheck =
      this.dataStorage.subscriptionsGetByLastCheckAndUpdate(
        this.UPDATE_INTERVAL,
        this.name
      );

    if (!subscriptionsToCheck || !subscriptionsToCheck.length) {
      return;
    }

    console.log('subscriptionsToCheck', subscriptionsToCheck.length);
    return this.getChannelStatuses(subscriptionsToCheck).then(
      this.processChannelStatuses.bind(this, subscriptionsToCheck),
      (error) => logger.error(`getChannelStatuses error`, error)
    );
  }

  processChannelStatuses(subscriptionsToCheck, result) {
    super.processChannelStatuses(subscriptionsToCheck, result);

    const subscriptionsByName = {};
    subscriptionsToCheck.forEach(
      (sub) => (subscriptionsByName[sub.name.toLowerCase()] = sub)
    );

    result.forEach((subscription, j) => {
      const subscriptionName = this.dataStorage
        .getSubscriptionName(this.name, subscription.name)
        .toLowerCase();
      const savedData = Object.assign(
        {},
        subscriptionsByName[subscriptionName]
      );
      const now = Date.now();
      // Don't send notification if last check was too long ago (bot was switched off)
      const skipNotificationAsItIsExpired =
        now - savedData.lastCheck > this.NOTIFICATION_EXPIRED;
      if (subscription.status !== savedData.lastStatus) {
        const firstCheck = !savedData.lastStatus;
        let skipStatusChange = false;
        if (
          !firstCheck &&
          subscription.status === STATUS_DEAD &&
          !skipNotificationAsItIsExpired
        ) {
          // Don't set as DEAD within some interval (might be temporary drop)
          if (savedData.firstDead) {
            if (now - savedData.firstDead < this.NOT_CHANGE_TO_DEAD_WITHIN) {
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
          savedData.previousStatus = savedData.lastStatus;
          savedData.lastStatus = subscription.status;
          if (!firstCheck) {
            if (!skipNotificationAsItIsExpired) {
              let eventName;
              if (subscription.status === STATUS_LIVE) {
                // If the game is the same and LIVE not long after DEAD, then LIVE_AGAIN event
                if (
                  savedData.statusChangedOnGame === subscription.game &&
                  now - savedData.statusChangeTimestamp < this.LIVE_AGAIN_WITHIN
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
                servers: savedData.servers,
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
      // Fallback broadcasts array from last info to prevent migration
      if (
        savedData.lastInfo &&
        savedData.lastInfo.broadcast &&
        !savedData.broadcasts
      ) {
        savedData.broadcasts = [savedData.lastInfo.broadcast];
      }
      if (savedData.broadcasts) {
        savedData.broadcasts = this.removeOldBroadcasts(savedData.broadcasts);
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
          servers: savedData.servers,
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
      this.dataStorage.updateSubscription(savedData.name, savedData);
    });
    const notFoundChannels = this.getNotFound(subscriptionsToCheck, result);
    this.updateNotFound(notFoundChannels);
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

  protected removeNotFound(channel) {
    if (!channel) {
      return;
    }
    this.emitEvent(EVENT_CHANNEL_NOT_FOUND, {
      servers: channel.servers,
      channel: channel.channel,
    });
    channel.servers.forEach((server) => {
      this.dataStorage.subscriptionRemove(
        server.serverId,
        server.channelId,
        channel.service,
        channel.channel
      );
    });
  }

  /**
   * Update notFoundTimes of channel and remove only after a lot of consequent "not found" events
   * Could be temporary issue with API so don't remove immediately
   * @param channels
   * @private
   */
  protected updateNotFound(channels) {
    channels.forEach((channel) => {
      channel.notFoundTimes = channel.notFoundTimes || 0;
      channel.notFoundTimes++;
      if (
        channel.notFoundTimes >= this.REMOVE_SUBSCRIPTIONS_AFTER_NOT_FOUND_TIMES
      ) {
        this.removeNotFound(channel);
      } else {
        channel.lastCheck = Date.now();
        this.dataStorage.updateSubscription(channel.name, channel);
      }
    });
  }
}
