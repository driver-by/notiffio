'use strict';

const lowdb = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

class DataStorage {
    constructor(dbname) {
        if (!dbname) {
            throw new Error('DataStorage.constructor dbname is required');
        }
        this.SUBSCRIPTION_NAME_DELIMITER = '/';
        this.SETTING_STREAM_START_MESSAGE = 'streamStart';
        this.SETTING_STREAM_STOP_MESSAGE = 'streamStop';
        this.SETTING_STREAM_PROCEED_MESSAGE = 'streamProceed';
        this.SETTING_ANNOUNCEMENT_ADD_MESSAGE = 'announcementAdd';
        this.SETTING_ANNOUNCEMENT_EDIT_MESSAGE = 'announcementEdit';
        this.SETTING_ANNOUNCEMENT_REMOVE_MESSAGE = 'announcementRemove';
        this._dbname = dbname;
        this._init();
    }

    getSubscriptionName(service, channel) {
        return service + this.SUBSCRIPTION_NAME_DELIMITER + channel;
    }

    serverAdd(server) {
        const result = this._serverGet(server.id);
        if (!result) {
            this._serverAdd(server);
        }

        return result;
    }

    serverGet(serverId) {
        const result = this._serverGet(serverId);

        return result;
    }

    serverRemove(serverId) {
        this.subscriptionRemove(serverId);
        this._db.get('servers')
            .remove({id: serverId})
            .write();
    }

    subscriptionsGetByLastCheck(lastCheck, service) {
        return this._db.get('subscriptions')
            .filter(subscription => subscription.service === service && subscription.lastCheck < lastCheck)
            .value();
    }

    subscriptionFind(service, channel) {
        const subscriptionName = this.getSubscriptionName(service, channel);
        return this._subscriptionFind(subscriptionName);
    }

    subscriptionAdd(serverId, channelId, serverName, channelName, service, channel) {
        this._initTable('servers');
        this._initTable('subscriptions');
        const server = this._serverGet(serverId);
        const subscription = this.subscriptionFind(service, channel).value();
        const subscriptionName = this.getSubscriptionName(service, channel);
        const subscriptionToServer = {
            name: subscriptionName,
            channelId,
            channelName,
        };

        if (server) {
            server.subscriptions = server.subscriptions || [];
            const index = server.subscriptions.findIndex(subscription => {
                return subscription.name.toLowerCase() === subscriptionName.toLowerCase() &&
                    subscription.channelId === channelId;
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
                .push({id: serverId, name: serverName, subscriptions: [subscriptionToServer]})
                .write();
        }
        if (subscription) {
            subscription.servers = subscription.servers || [];
            if (subscription.servers.findIndex(server => server.serverId === serverId &&
                server.channelId === channelId) === -1) {
                subscription.servers.push({serverId, channelId});
                this._subscriptionFind(subscriptionName)
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
                    statusChangeTimestamp: null,
                    lastCheck: null,
                    lastInfo: null,
                    lastStatus: null,
                    previousStatus: null,
                })
                .write();
        }
    }

    subscriptionRemove(serverId, channelId, serviceName, channel) {
        this._initTable('servers');
        this._initTable('subscriptions');
        const server = this._serverGet(serverId);
        const subscription = this.subscriptionFind(serviceName, channel).value();
        const subscriptionName = this.getSubscriptionName(serviceName, channel);

        if (server && server.subscriptions) {
            server.subscriptions = server.subscriptions.filter(subscription => {
                return subscription.name.toLowerCase() !== subscriptionName.toLowerCase() ||
                    subscription.channelId !== channelId;
            });
            this._db.get('servers')
                .find({id: serverId})
                .assign(server)
                .write();
        }
        if (subscription && subscription.servers) {
            subscription.servers = subscription.servers.filter(subscription => {
                return subscription.serverId !== serverId || subscription.channelId !== channelId;
            });
            if (subscription.servers.length) {
                this._subscriptionFind(subscriptionName)
                    .assign(subscription)
                    .write();
            } else {
                this._subscriptionRemove(subscriptionName);
            }
        }
    }

    subscriptionRemoveList(serverId, channelId) {
        const server = this._serverGet(serverId);
        let removeSubscriptions = null;

        if (!server || !server.subscriptions) {
            return;
        }
        if (channelId) {
            // Remove everything from channel
            removeSubscriptions = server.subscriptions.filter(sub => sub.channelId === channelId);
            server.subscriptions = server.subscriptions.filter(sub => sub.channelId !== channelId);
        } else {
            // Remove everything from server
            removeSubscriptions = server.subscriptions;
            server.subscriptions = [];
        }
        this._db.get('servers')
            .find({id: serverId})
            .assign(server)
            .write();

        // Remove server/channel from subscriptions table
        if (!removeSubscriptions || !removeSubscriptions.length) {
            return;
        }
        removeSubscriptions.forEach(removingSubscription => {
            const subDb = this._subscriptionFind(removingSubscription.name);
            let sub = subDb.value();

            if (!sub || !sub.servers || !sub.servers.length) {
                return;
            }
            if (channelId) {
                sub.servers = sub.servers.filter(server => server.channelId !== channelId ||
                    server.serverId !== serverId);
            } else {
                sub.servers = sub.servers.filter(server => server.serverId !== serverId);
            }
            if (sub.servers.length) {
                subDb.assign(sub)
                    .write();
            } else {
                this._subscriptionRemove(removingSubscription.name);
            }
        });
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

    updateSubscription(subscriptionName, subscription) {
        this._subscriptionFind(subscriptionName)
            .assign(subscription)
            .write();
    }

    isSubscribed(serverId, channelId, subscriptionName) {
        const server = this._serverGet(serverId);
        if (server && server.subscriptions) {
            const index = server.subscriptions.findIndex(subscription => {
                return subscription.name.toLowerCase() === subscriptionName.toLowerCase() &&
                    subscription.channelId === channelId;
            });
            return index !== -1;
        }
        return false;
    }

    getSettingMessage(setting, serverId, subscriptionName) {
        return this._serverSubscriptionSettingsGet(serverId, subscriptionName, setting) ||
            this._serverSettingsGet(serverId, setting);
    }

    updateSettingMessage(setting, serverId, text, subscriptionName) {
        if (subscriptionName) {
            return this._serverSubscriptionSettingSet(serverId, subscriptionName, setting, text);
        } else {
            return this._serverSettingSet(serverId, setting, text);
        }
    }

    removeSettingMessage(setting, serverId, subscriptionName) {
        return this.updateSettingMessage(setting, serverId, undefined, subscriptionName);
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

    _subscriptionFind(name) {
        return this._db.get('subscriptions')
            .find(sub => sub.name.toLowerCase() === name.toLowerCase())
    }

    _subscriptionRemove(name) {
        this._db.get('subscriptions')
            .remove(sub => sub.name.toLowerCase() === name.toLowerCase())
            .write();
    }

    _getServiceChannel(name) {
        const data = name.split(this.SUBSCRIPTION_NAME_DELIMITER);

        return {service: data[0], channel: data[1]};
    }

    _serverAdd(server) {
        this._initTable('servers');
        this._db.get('servers')
            .push({id: server.id, name: server.name, subscriptions: []})
            .write();
    }

    _serverGet(serverId) {
        return this._db.get('servers')
            .find({id: serverId})
            .value();
    }

    _serverSettingsGet(serverId, settingName) {
        const server = this._serverGet(serverId);

        if (settingName) {
            return server && server.settings && server.settings[settingName];
        } else {
            return server ? server.settings : null;
        }
    }

    _serverSubscriptionSettingsGet(serverId, subscriptionName, settingName) {
        const server = this._serverGet(serverId);

        if (!server || !server.subscriptions) {
            return null;
        }
        const subscription = server.subscriptions.find(s => s.name === subscriptionName);
        if (settingName) {
            return subscription && subscription.settings && subscription.settings[settingName];
        } else {
            return subscription ? subscription.settings : null;
        }
    }

    _serverSettingSet(serverId, settingName, value) {
        const server = this._serverGet(serverId);

        server.settings = server.settings || {};
        if (value === undefined) {
            delete server.settings[settingName];
        } else {
            server.settings[settingName] = value;
        }
        this._db.get('servers')
            .find({id: serverId})
            .assign(server)
            .write();

        return value;
    }

    _serverSubscriptionSettingSet(serverId, subscriptionName, settingName, value) {
        const server = this._serverGet(serverId);

        if (!server || !server.subscriptions) {
            return null;
        }
        const subscription = server.subscriptions.find(s => s.name === subscriptionName);
        if (!subscription) {
            return null;
        }
        subscription.settings = subscription.settings || {};
        if (value === undefined) {
            delete subscription.settings[settingName];
        } else {
            subscription.settings[settingName] = value;
        }
        this._db.get('servers')
            .find({id: serverId})
            .assign(server)
            .write();

        return value;
    }

}

module.exports = DataStorage;
