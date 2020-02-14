'use strict';

const lowdb = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

class DataStorage {
    constructor(dbname) {
        if (!dbname) {
            throw new Error('DataStorage.constructor dbname is required');
        }
        this.SUBSCRIPTION_NAME_DELIMITER = '/';
        this._dbname = dbname;
        this._init();
    }

    getSubscriptionName(service, channel) {
        return service + this.SUBSCRIPTION_NAME_DELIMITER + channel;
    }

    serverGet(serverId) {
        const result = this._serverGet(serverId);

        return result;
    }

    subscriptionsGetByLastCheck(lastCheck) {
        return this._db.get('subscriptions')
            .filter(subscription => subscription.lastCheck < lastCheck)
            .value();
    }

    subscriptionGet(service, channel) {
        return this._db.get('subscriptions')
            .find({name: this.getSubscriptionName(service, channel)});
    }

    subscriptionAdd(serverId, channelId, channelName, service, channel) {
        this._initTable('servers');
        this._initTable('subscriptions');
        const server = this._serverGet(serverId);
        const subscription = this.subscriptionGet(service, channel).value();
        const subscriptionName = this.getSubscriptionName(service, channel);
        const subscriptionToServer = {
            name: subscriptionName,
            channelId,
            channelName,
        };

        if (server) {
            server.subscriptions = server.subscriptions || [];
            const index = server.subscriptions.findIndex(subscription => {
                return subscription.name === subscriptionName && subscription.channelId === channelId;
            });
            if (index === -1) {
                server.subscriptions.push(subscriptionToServer);
                this._db.get('servers')
                    .find({id: serverId})
                    .assign(server)
                    .write();
            }
        } else {
            this._db.get('servers')
                .push({id: serverId, subscriptions: [subscriptionToServer]})
                .write();
        }
        if (subscription) {
            subscription.servers = subscription.servers || [];
            if (subscription.servers.findIndex(server => server.serverId === serverId) === -1) {
                subscription.servers.push({serverId, channelId});
                this._db.get('subscriptions')
                    .find({name: subscriptionName})
                    .assign(subscription)
                    .write();
            }
        } else {
            this._db.get('subscriptions')
                .push({
                    name: subscriptionName,
                    service,
                    channel,
                    servers: [{serverId, channelId}],
                    status: null,
                    statusTimestamp: null,
                    statusChangeTimestamp: null,
                    lastCheck: null,
                    lastInfo: null,
                })
                .write();
        }
    }

    subscriptionRemove(serverId, channelId, serviceName, channel) {
        this._initTable('servers');
        this._initTable('subscriptions');
        const server = this._serverGet(serverId);
        const subscription = this.subscriptionGet(serviceName, channel).value();
        const subscriptionName = this.getSubscriptionName(serviceName, channel);

        if (server && server.subscriptions) {
            server.subscriptions = server.subscriptions.filter(subscription => {
                return subscription.name !== subscriptionName || subscription.channelId !== channelId;
            });
            this._db.get('servers')
                .find({id: serverId})
                .assign(server)
                .write();
        }
        if (subscription && subscription.servers) {
            subscription.servers = subscription.servers.filter(subscription => {
                return subscription.serverId !== serverId && subscription.channelId !== channelId;
            });
            if (subscription.servers.length) {
                this._db.get('subscriptions')
                    .find({name: subscriptionName, channelId})
                    .assign(subscription)
                    .write();
            } else {
                this._db.get('subscriptions')
                    .remove({name: this.getSubscriptionName(serviceName, channel)})
                    .write();
            }
        }
    }

    subscriptionsGet() {
        return this._db.get(`subscriptions`)
            .map(subscription => {
                return Object.assign(
                    {},
                    subscription,
                    {name: undefined},
                );
            })
            .value();
    }

    lastCheckGet(service, channel) {
        return this._db.get(`subscriptions`)
            .find({name: this.getSubscriptionName(service, channel)})
            .map('lastCheck')
            .value();
    }

    lastCheckSet(service, channel, value) {
        return this._db.get(`subscriptions`)
            .find({name: this.getSubscriptionName(service, channel)})
            .assign({lastCheck: value})
            .write();
    }

    isSubscribed(serverId, channelId, subscriptionName) {
        const server = this._serverGet(serverId);
        if (server && server.subscriptions) {
            const index = server.subscriptions.findIndex(subscription => {
                return subscription.name === subscriptionName && subscription.channelId === channelId;
            });
            return index !== -1;
        }
        return false;
    }

    _init() {
        this._db = lowdb(new FileSync(this._dbname));
    }

    _initTable(name) {
        if (!this._db.has(name).value()) {
            this._db.set(name, [])
                .write();
        }
    }

    _getServiceChannel(name) {
        const data = name.split(this.SUBSCRIPTION_NAME_DELIMITER);

        return {service: data[0], channel: data[1]};
    }

    _serverGet(serverId) {
        return this._db.get('servers')
            .find({id: serverId})
            .value();
    }
}

module.exports = DataStorage;
