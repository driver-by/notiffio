import * as lowdb from 'lowdb';
import { LowdbAsync } from 'lowdb';

const FileSync = require('lowdb/adapters/FileSync');

const serviceDataTableName = 'serviceData';

export class DataStorage {
  readonly SUBSCRIPTION_NAME_DELIMITER = '/';
  readonly SETTING_STREAM_START_MESSAGE = 'streamStart';
  readonly SETTING_STREAM_STOP_MESSAGE = 'streamStop';
  readonly SETTING_STREAM_PROCEED_MESSAGE = 'streamProceed';
  readonly SETTING_ANNOUNCEMENT_ADD_MESSAGE = 'announcementAdd';
  readonly SETTING_ANNOUNCEMENT_EDIT_MESSAGE = 'announcementEdit';
  readonly SETTING_ANNOUNCEMENT_REMOVE_MESSAGE = 'announcementRemove';
  readonly SETTING_EMBED_ALLOW = 'embedsPlus';
  readonly SETTING_EMBED_REMOVE = 'embedsMinus';
  private readonly dbname: string;
  private db: lowdb.LowdbAsync<any>;

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
    this.SETTING_EMBED_ALLOW = 'embedsPlus';
    this.SETTING_EMBED_REMOVE = 'embedsMinus';
    this.dbname = dbname;
    this.init();
  }

  // implemented
  getSubscriptionName(service, channel) {
    return service + this.SUBSCRIPTION_NAME_DELIMITER + channel;
  }

  // NR
  serverAdd(server) {
    const result = this.serverGetById(server.id);
    if (!result) {
      this.serverAddToDb(server);
    }

    return result;
  }

  // NR
  serverGet(serverId) {
    const result = this.serverGetById(serverId);

    return result;
  }

  // implemented
  serverRemove(serverId) {
    this.subscriptionRemoveList(serverId);
    (<any>this.db.get('servers')).remove({ id: serverId }).write();
  }

  // implemented
  serviceDataGet(serviceName) {
    const saveServiceName = this.getSafeVariableName(serviceName);
    return this.db.get(`${serviceDataTableName}.${saveServiceName}`).value();
  }

  // implemented
  serviceDataUpdate(serviceName, data) {
    return this.serviceDataSet(serviceName, data);
  }

  subscriptionsGetByLastCheckAndUpdate(updateInterval, service) {
    // 20 minutes
    const MAX_UPDATE_INTERVAL = 20 * 60 * 1000;
    const INCREASE_UPDATE_INTERVAL_FROM_DAYS = 14;
    const INCREASE_UPDATE_INTERVAL_BY = 2;
    const WEEK_DAYS = 7;
    const subscriptionsDb: any = this.db.get('subscriptions');
    const subscriptions = subscriptionsDb.value();
    const result = [];
    subscriptions.forEach((subscription, i) => {
      const lastCheckStartedDiff = subscription.lastCheckStarted
        ? Date.now() - subscription.lastCheckStarted
        : Infinity;
      // Increase check period if no stream for a long time
      const statusChangeTimestampDiffDays = subscription.statusChangeTimestamp
        ? (Date.now() - subscription.statusChangeTimestamp) /
          (1000 * 60 * 60 * 24)
        : 0;
      let updateIntervalIncreasedIfNoStreamingForALongTime = updateInterval;
      // Starting from 2 weeks increase by 2 minutes for every week until max
      if (statusChangeTimestampDiffDays >= INCREASE_UPDATE_INTERVAL_FROM_DAYS) {
        updateIntervalIncreasedIfNoStreamingForALongTime =
          updateInterval +
          INCREASE_UPDATE_INTERVAL_BY *
            Math.ceil(
              (statusChangeTimestampDiffDays -
                INCREASE_UPDATE_INTERVAL_FROM_DAYS) /
                WEEK_DAYS
            );
      }
      if (
        updateIntervalIncreasedIfNoStreamingForALongTime > MAX_UPDATE_INTERVAL
      ) {
        updateIntervalIncreasedIfNoStreamingForALongTime = MAX_UPDATE_INTERVAL;
      }
      if (
        subscription.service === service &&
        subscription.lastCheck <
          Date.now() - updateIntervalIncreasedIfNoStreamingForALongTime &&
        lastCheckStartedDiff >= updateIntervalIncreasedIfNoStreamingForALongTime
      ) {
        result.push(subscription);
        // Save `lastCheckStarted` to prevent double check of the same item and double notifications
        subscriptions[i].lastCheckStarted = Date.now();
      }
    });
    subscriptionsDb.assign(subscriptions).write();

    return result;
  }

  // NR
  subscriptionFind(service, channel) {
    const subscriptionName = this.getSubscriptionName(service, channel);
    return this.subscriptionFindByName(subscriptionName);
  }

  // implemented
  subscriptionAdd(
    serverId,
    channelId,
    serverName,
    channelName,
    service,
    channel
  ) {
    this.initTable('servers');
    this.initTable('subscriptions');
    const server = this.serverGetById(serverId);
    const subscription = this.subscriptionFind(service, channel).value();
    const subscriptionName = this.getSubscriptionName(service, channel);
    const subscriptionToServer = {
      name: subscriptionName,
      channelId,
      channelName,
    };

    if (server) {
      server.subscriptions = server.subscriptions || [];
      const index = server.subscriptions.findIndex((subscription) => {
        return (
          subscription.name.toLowerCase() === subscriptionName.toLowerCase() &&
          subscription.channelId === channelId
        );
      });
      if (index === -1) {
        server.subscriptions.push(subscriptionToServer);
        (<any>this.db.get('servers'))
          .find({ id: serverId })
          .assign(server)
          .write();
      }
    } else {
      (<any>this.db.get('servers'))
        .push({
          id: serverId,
          name: serverName,
          subscriptions: [subscriptionToServer],
        })
        .write();
    }
    if (subscription) {
      subscription.servers = subscription.servers || [];
      if (
        subscription.servers.findIndex(
          (server) =>
            server.serverId === serverId && server.channelId === channelId
        ) === -1
      ) {
        subscription.servers.push({ serverId, channelId });
        this.subscriptionFindByName(subscriptionName)
          .assign(subscription)
          .write();
      }
    } else {
      (<any>this.db.get('subscriptions'))
        .push({
          name: subscriptionName,
          service,
          channel,
          servers: [{ serverId, channelId }],
          statusChangeTimestamp: null,
          lastCheck: null,
          lastInfo: null,
          lastStatus: null,
          previousStatus: null,
        })
        .write();
    }
  }

  // implemented
  subscriptionRemove(serverId, channelId, serviceName, channel) {
    this.initTable('servers');
    this.initTable('subscriptions');
    const server = this.serverGetById(serverId);
    const subscription = this.subscriptionFind(serviceName, channel).value();
    const subscriptionName = this.getSubscriptionName(serviceName, channel);

    if (server && server.subscriptions) {
      server.subscriptions = server.subscriptions.filter((subscription) => {
        return (
          subscription.name.toLowerCase() !== subscriptionName.toLowerCase() ||
          subscription.channelId !== channelId
        );
      });
      (<any>this.db.get('servers'))
        .find({ id: serverId })
        .assign(server)
        .write();
    }
    if (subscription && subscription.servers) {
      subscription.servers = subscription.servers.filter((subscription) => {
        return (
          subscription.serverId !== serverId ||
          subscription.channelId !== channelId
        );
      });
      if (subscription.servers.length) {
        this.subscriptionFindByName(subscriptionName)
          .assign(subscription)
          .write();
      } else {
        this.subscriptionRemoveByName(subscriptionName);
      }
    }
  }

  subscriptionRemoveList(serverId, channelId?) {
    const server = this.serverGetById(serverId);
    let removeSubscriptions = null;

    if (!server || !server.subscriptions) {
      return;
    }
    if (channelId) {
      // Remove everything from channel
      removeSubscriptions = server.subscriptions.filter(
        (sub) => sub.channelId === channelId
      );
      server.subscriptions = server.subscriptions.filter(
        (sub) => sub.channelId !== channelId
      );
    } else {
      // Remove everything from server
      removeSubscriptions = server.subscriptions;
      server.subscriptions = [];
    }
    (<any>this.db.get('servers')).find({ id: serverId }).assign(server).write();

    // Remove server/channel from subscriptions table
    if (!removeSubscriptions || !removeSubscriptions.length) {
      return;
    }
    removeSubscriptions.forEach((removingSubscription) => {
      const subDb = this.subscriptionFindByName(removingSubscription.name);
      const sub = subDb.value();

      if (!sub || !sub.servers) {
        return;
      }
      if (channelId) {
        sub.servers = sub.servers.filter(
          (server) =>
            server.channelId !== channelId || server.serverId !== serverId
        );
      } else {
        sub.servers = sub.servers.filter(
          (server) => server.serverId !== serverId
        );
      }
      if (sub.servers.length) {
        subDb.assign(sub).write();
      } else {
        this.subscriptionRemoveByName(removingSubscription.name);
      }
    });
  }

  updateSubscription(subscriptionName, subscription) {
    this.subscriptionFindByName(subscriptionName).assign(subscription).write();
  }

  /**
   * Updates the additional info data of subscriptions from the map
   * @param subscriptionsInfoMap - {subscriptionName: additionalInfo,..}
   */
  updateSubscriptionAdditionalInfoMap(subscriptionsInfoMap) {
    const subscriptionsDb: any = this.db.get('subscriptions');
    const subscriptions = subscriptionsDb.value();
    subscriptions.forEach((subscription, i) => {
      if (subscriptionsInfoMap[subscription.name]) {
        subscriptions[i].additionalInfo =
          subscriptionsInfoMap[subscription.name];
      }
    });
    subscriptionsDb.assign(subscriptions).write();
  }

  // implemented
  isSubscribed(serverId, channelId, subscriptionName) {
    const server = this.serverGetById(serverId);
    if (server && server.subscriptions) {
      const index = server.subscriptions.findIndex((subscription) => {
        return (
          subscription.name.toLowerCase() === subscriptionName.toLowerCase() &&
          subscription.channelId === channelId
        );
      });
      return index !== -1;
    }
    return false;
  }

  // implemented
  getSettingMessage(setting, serverId, subscriptionName = null) {
    const msg = this.serverSubscriptionSettingsGet(
      serverId,
      subscriptionName,
      setting
    );
    if (msg === null || msg === undefined) {
      return this.serverSettingsGet(serverId, setting);
    }

    return msg;
  }

  // implemented
  updateSettingMessage(setting, serverId, text, subscriptionName = null) {
    if (subscriptionName) {
      return this.serverSubscriptionSettingSet(
        serverId,
        subscriptionName,
        setting,
        text
      );
    } else {
      return this.serverSettingSet(serverId, setting, text);
    }
  }

  // implemented
  removeSettingMessage(setting, serverId, subscriptionName = null) {
    return this.updateSettingMessage(
      setting,
      serverId,
      undefined,
      subscriptionName
    );
  }

  // implemented
  private async init() {
    this.db = await lowdb(new FileSync(this.dbname));
  }

  // NR
  private initTable(name) {
    if (!this.db.has(name).value()) {
      this.db.set(name, []).write();
    }
  }

  // NR
  private subscriptionFindByName(name) {
    return (<any>this.db.get('subscriptions')).find(
      (sub) => sub.name.toLowerCase() === name.toLowerCase()
    );
  }

  // NR
  private subscriptionRemoveByName(name) {
    (<any>this.db.get('subscriptions'))
      .remove((sub) => sub.name.toLowerCase() === name.toLowerCase())
      .write();
  }

  // NR
  private serverAddToDb(server) {
    this.initTable('servers');
    (<any>this.db.get('servers'))
      .push({ id: server.id, name: server.name, subscriptions: [] })
      .write();
  }

  // NR
  private serverGetById(serverId) {
    return (<any>this.db.get('servers')).find({ id: serverId }).value();
  }

  // implemented
  private serverSettingsGet(serverId, settingName) {
    const server = this.serverGetById(serverId);

    if (settingName) {
      return server && server.settings && server.settings[settingName];
    } else {
      return server ? server.settings : undefined;
    }
  }

  // implemented
  private serverSubscriptionSettingsGet(
    serverId,
    subscriptionName,
    settingName
  ) {
    const server = this.serverGetById(serverId);

    if (!server || !server.subscriptions) {
      return null;
    }
    const subscription = server.subscriptions.find(
      (s) => s.name === subscriptionName
    );
    if (settingName) {
      return (
        subscription &&
        subscription.settings &&
        subscription.settings[settingName]
      );
    } else {
      return subscription ? subscription.settings : undefined;
    }
  }

  // implemented
  private serverSettingSet(serverId, settingName, value) {
    let server = this.serverGetById(serverId);

    if (!server) {
      this.serverAdd({ id: serverId });
    }
    server = this.serverGetById(serverId);
    server.settings = server.settings || {};
    if (value === undefined) {
      delete server.settings[settingName];
    } else {
      server.settings[settingName] = value;
    }
    (<any>this.db.get('servers')).find({ id: serverId }).assign(server).write();

    return value;
  }

  // implemented
  private serverSubscriptionSettingSet(
    serverId,
    subscriptionName,
    settingName,
    value
  ) {
    const server = this.serverGetById(serverId);

    if (!server || !server.subscriptions) {
      return null;
    }
    const subscription = server.subscriptions.find(
      (s) => s.name === subscriptionName
    );
    if (!subscription) {
      return null;
    }
    subscription.settings = subscription.settings || {};
    if (value === undefined) {
      delete subscription.settings[settingName];
    } else {
      subscription.settings[settingName] = value;
    }
    (<any>this.db.get('servers')).find({ id: serverId }).assign(server).write();

    return value;
  }

  // NR
  private serviceDataSet(serviceName, value) {
    const saveServiceName = this.getSafeVariableName(serviceName);
    return this.db
      .set(`${serviceDataTableName}.${saveServiceName}`, value)
      .write();
  }

  private getSafeVariableName(varName) {
    return varName.replace(/[\.]/gi, '');
  }
}
