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

    serverGet(serverId) {
        const result = this._serverGet(serverId);

        return result ?
            {
                ...result,
                subscriptions: result.subscriptions ?
                    result.subscriptions.map(this._getServiceChannel.bind(this)) :
                    result.subscriptions,
            } :
            result;
    }

    subscriptionGet(service, channel) {
        return this._db.get('subscriptions')
            .find({name: this._getSubscriptionName(service, channel)})
            .cloneDeep()
            .value();
    }

    subscriptionAdd(serverId, service, channel) {
        this._initTable('servers');
        this._initTable('subscriptions');
        const server = this._serverGet(serverId);
        const subscription = this.subscriptionGet(service, channel);
        const subscriptionName = this._getSubscriptionName(service, channel);

        if (server) {
            server.subscriptions = server.subscriptions || [];
            if (server.subscriptions.indexOf(subscriptionName) === -1) {
                server.subscriptions.push(subscriptionName);
                this._db.get('servers')
                    .find({id: serverId})
                    .assign(server)
                    .write();
            }
        } else {
            this._db.get('servers')
                .push({id: serverId, subscriptions: [subscriptionName]})
                .write();
        }
        if (subscription) {
            subscription.servers = subscription.servers || [];
            if (subscription.servers.findIndex(serverId) === -1) {
                subscription.servers.push(serverId);
                this._db.get('subscriptions')
                    .find({name: subscriptionName})
                    .assign(subscription)
                    .write();
            }
        } else {
            this._db.get('subscriptions')
                .push({name: subscriptionName, servers: [serverId], status: null, statusTimestamp: null})
                .write();
        }
    }

    subscriptionRemove(serverId, service, channel) {
        this._initTable('servers');
        this._initTable('subscriptions');
        const server = this._serverGet(serverId);
        const subscription = this.subscriptionGet(service, channel);
        const subscriptionName = this._getSubscriptionName(service, channel);

        if (server && server.subscriptions) {
            server.subscriptions = server.subscriptions.filter(value => {
                return value !== subscriptionName;
            });
            this._db.get('servers')
                .find({id: serverId})
                .assign(server)
                .write();
        }
        if (subscription && subscription.servers) {
            subscription.servers = subscription.servers.filter(value => value !== serverId);
            if (subscription.servers.length) {
                this._db.get('subscriptions')
                    .find({name: subscriptionName})
                    .assign(subscription)
                    .write();
            } else {
                this._db.get('subscriptions')
                    .remove({name: subscriptionName})
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
                    this._getServiceChannel(subscription.name),
                    {name: undefined},
                );
            })
            .value();
    }

    lastCheckGet() {
        return this._db.get(`lastCheck`)
            .value();
    }

    lastCheckSet(value) {
        return this._db.set(`lastCheck`, value)
            .write();
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

    _getSubscriptionName(service, channel) {
        return service + this.SUBSCRIPTION_NAME_DELIMITER + channel;
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