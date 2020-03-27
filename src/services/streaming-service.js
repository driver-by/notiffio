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
    }

    async getChannelStatuses(channels) {

    }

    getNickName(subscription) {
        return subscription.channel;
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
        subscriptionsToCheck.forEach(sub => subscriptionsByName[sub.name] = sub);

        result.forEach((subscription, j) => {
            const subscriptionName = this._dataStorage.getSubscriptionName(this.name, subscription.name);
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
                        savedData.statusChangeTimestamp = now;
                        if (!skipNotificationAsItIsExpired) {
                            const nickname = this.getNickName(savedData);
                            if (subscription.status === STATUS_LIVE) {
                                this._emitEvent(events.EVENT_GO_LIVE, {
                                    nickname,
                                    subscription,
                                    servers: savedData.servers,
                                });
                            } else {
                                this._emitEvent(events.EVENT_GO_OFFLINE, {
                                    nickname,
                                    subscription,
                                    servers: savedData.servers,
                                });
                            }
                        }
                    }
                }
            }
            savedData.lastCheck = now;
            savedData.lastInfo = subscription;
            this._dataStorage.updateSubscription(savedData.name, savedData)
        });
    }

    _emitEvent(eventName, params) {
        super._emitEvent(eventName, params);
    }
}

module.exports = StreamingService;
