const BaseService = require('./base-service');
const {STATUS_DEAD, STATUS_LIVE} = require('../models/statuses');
const events = require('./events');
const logger = require('../logger').getLogger();

/**
 * Basic functionality for streaming services
 * Don't create instances of this class
 */
class StreamingService extends BaseService {
    constructor(dataStorage) {
        super();
        this.name = 'StreamingService';
        this._dataStorage = dataStorage;
        this.UPDATE_INTERVAL = 20 * 1000;
        this.NOT_CHANGE_TO_DEAD_WITHIN = 60 * 1000;
        this.NOTIFICATION_EXPIRED = 10 * 60 * 1000;
        this.LIVE_AGAIN_WITHIN = 60 * 60 * 1000;
        this.REMOVE_BROADCAST_AFTER = 10 * 60 * 1000;
    }

    async getChannelStatuses(channels) {

    }

    async update() {
        const now = Date.now();
        const subscriptionsToCheck = this._dataStorage.subscriptionsGetByLastCheck(
            now - this.UPDATE_INTERVAL,
            this.name,
        );

        if (!subscriptionsToCheck || !subscriptionsToCheck.length) {
            return;
        }
        const channelsToCheck = subscriptionsToCheck.map(sub => sub.channel);

        return this.getChannelStatuses(channelsToCheck)
            .then(
                this._processChannelStatuses.bind(this, subscriptionsToCheck),
                error => logger.error(`getChannelStatuses error`, error)
            );
    }

    _processChannelStatuses(subscriptionsToCheck, result) {
        super._processChannelStatuses(subscriptionsToCheck, result);

        const subscriptionsByName = {};
        subscriptionsToCheck.forEach(sub => subscriptionsByName[sub.name.toLowerCase()] = sub);

        result.forEach((subscription, j) => {
            const subscriptionName = this._dataStorage.getSubscriptionName(this.name, subscription.name).toLowerCase();
            const savedData = Object.assign({}, subscriptionsByName[subscriptionName]);
            const now = Date.now();
            // Don't send notification if last check was too long ago (bot was switched off)
            const skipNotificationAsItIsExpired = now - savedData.lastCheck > this.NOTIFICATION_EXPIRED;
            if (subscription.status !== savedData.lastStatus) {
                const firstCheck = !savedData.lastStatus;
                let skipStatusChange = false;
                if (!firstCheck && subscription.status === STATUS_DEAD &&
                    !skipNotificationAsItIsExpired) {
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
                                if (savedData.statusChangedOnGame === subscription.game &&
                                    now - savedData.statusChangeTimestamp < this.LIVE_AGAIN_WITHIN) {
                                    eventName = events.EVENT_GO_LIVE_AGAIN;
                                } else {
                                    eventName = events.EVENT_GO_LIVE;
                                }
                            } else {
                                eventName = events.EVENT_GO_OFFLINE;
                            }
                            this._emitEvent(eventName, {
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
            if (savedData.lastInfo && savedData.lastInfo.broadcast && !savedData.broadcasts) {
                savedData.broadcasts = [savedData.lastInfo.broadcast];
            }
            if (savedData.broadcasts) {
                savedData.broadcasts = this._removeOldBroadcasts(savedData.broadcasts);
                savedBroadcast = savedData.broadcasts.find(b => this._broadcastEquals(b, subscription.broadcast));
            } else {
                savedData.broadcasts = [];
            }
            if (!savedBroadcast) {
                savedData.broadcasts.push(subscription.broadcast);
            }

            if (subscription.broadcast && !savedBroadcast) {
                // Send "Add" only if start is in future
                if (subscription.broadcast.start > now) {
                    eventName = events.EVENT_BROADCAST_ADD;
                }
            } else if (!subscription.broadcast && savedData.broadcasts.length) {
                savedBroadcast = savedData.broadcasts[savedData.broadcasts.length - 1];
                // Send "Remove" only if start was in future, otherwise it was naturally finished
                if (savedBroadcast && savedBroadcast.start > now) {
                    eventName = events.EVENT_BROADCAST_REMOVE;
                }
                savedData.broadcasts = [];
            } else if (subscription.broadcast && savedBroadcast && (
                    subscription.broadcast.start !== savedBroadcast.start ||
                    subscription.broadcast.game !== savedBroadcast.game
                )) {
                // Send "Change" only if start was in future, otherwise it was naturally finished
                if (savedBroadcast.start > now) {
                    eventName = events.EVENT_BROADCAST_CHANGE;
                }
            }
            if (eventName && !skipNotificationAsItIsExpired) {
                this._emitEvent(eventName, {
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
            this._dataStorage.updateSubscription(savedData.name, savedData)
        });
        const notFoundChannels = this._getNotFound(subscriptionsToCheck, result);
        this._removeNotFound(notFoundChannels);
    }

    _broadcastEquals(b1, b2) {
        return b1.start === b2.start || b1.title === b2.title;
    }

    _removeOldBroadcasts(broadcasts) {
        if (!broadcasts) {
            return broadcasts;
        }
        return broadcasts.filter(b => b.start > Date.now() - this.REMOVE_BROADCAST_AFTER);
    }

    _emitEvent(eventName, params) {
        super._emitEvent(eventName, params);
    }

    _getNotFound(channelsToBeFound, channels) {
        const channelsNames = channels.map(c => c.name.toLowerCase());
        return channelsToBeFound.filter(c => channelsNames.indexOf(c.channel.toLowerCase()) === -1);
    }

    _removeNotFound(channels) {
        if (!channels) {
            return;
        }
        channels.forEach(channel => {
            this._emitEvent(events.EVENT_CHANNEL_NOT_FOUND, {
                servers: channel.servers,
                channel: channel.channel,
            });
            channel.servers.forEach(server => {
                this._dataStorage.subscriptionRemove(
                    server.serverId,
                    server.channelId,
                    channel.service,
                    channel.channel,
                );
            });
        });
    }

}

module.exports = StreamingService;
