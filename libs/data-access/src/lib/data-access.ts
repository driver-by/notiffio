import { Db, GenericListener, MongoClient } from 'mongodb';
import { SettingName } from './setting-name';
import { Status } from './status';

type SettingMap = Record<SettingName, string>;

export interface Server {
  id: string;
  name: string;
  settings?: SettingMap;
  settingsBySubscription?: Record<string, SettingMap>;
}

export interface SubscriptionServer {
  serverId: string;
  channelId: string;
}

export interface Broadcast {
  start: number;
  game: string;
  title: string;
}

export interface Subscription {
  name: string;
  service: string;
  channel: string;
  servers: SubscriptionServer[];
  statusChangeTimestamp: number;
  lastCheck: number;
  lastInfo: any;
  lastStatus: Status;
  previousStatus: Status;
  firstDead: number;
  statusChangedOnGame: string;
  broadcasts: Broadcast[];
  notFoundTimes: number;
  lastCheckStarted: number;
  additionalInfo: any;
}

export interface ServiceData {
  service: string;
  key: string;
  value: any;
}

enum Collection {
  Servers = 'servers',
  Subscriptions = 'subscriptions',
  ServiceData = 'serviceData',
}

export class DataAccess {
  private readonly SUBSCRIPTION_NAME_DELIMITER = '/';
  // 20 minutes
  private readonly MAX_UPDATE_INTERVAL = 20 * 60 * 1000;
  private readonly INCREASE_UPDATE_INTERVAL_FROM_DAYS = 14;
  private readonly INCREASE_UPDATE_INTERVAL_BY_MINUTES = 2;
  private readonly WEEK_DAYS = 7;

  private readonly url: string;
  private readonly dbName: string;

  private client: MongoClient;
  private db: Db;

  constructor(url: string, dbName: string) {
    if (!url) {
      throw new Error('DataAccess.constructor. DB url is required');
    }
    this.url = url;
    this.dbName = dbName;
    this.client = new MongoClient(`${url}?authSource=${dbName}`);
  }

  async connect(): Promise<MongoClient> {
    const client = await this.client.connect();
    this.afterConnect(client);
    return client;
  }

  getSubscriptionName(service: string, channel: string): string {
    return service + this.SUBSCRIPTION_NAME_DELIMITER + channel;
  }

  onErrorLog(callback: GenericListener) {
    this.client.addListener('commandFailed', callback);
  }

  async subscriptionAdd(
    serverId: string,
    channelId: string,
    serverName: string,
    service: string,
    channel: string
  ) {
    const servers = this.db.collection(Collection.Servers);
    const subscriptions = this.db.collection(Collection.Subscriptions);
    await servers.updateOne(
      <Server>{ id: serverId },
      { $set: { name: serverName } },
      { upsert: true }
    );
    const subscriptionName = this.getSubscriptionName(service, channel);
    const subscription = await subscriptions.findOne({
      name: subscriptionName,
    });

    let serversList = subscription?.servers || [];
    if (
      serversList.findIndex(
        this.getSubscriptionServerComparator(serverId, channelId)
      ) === -1
    ) {
      serversList.push({ serverId, channelId });
    }
    await subscriptions.updateOne(
      <Subscription>{ name: subscriptionName },
      {
        $set: {
          service: service,
          channel: channel,
          servers: serversList,
        },
      },
      { upsert: true }
    );
  }

  async serverAdd(serverId: string, serverName: string) {
    const servers = this.db.collection<Server>(Collection.Servers);
    return servers.insertOne({ id: serverId, name: serverName });
  }

  async serverRemove(serverId: string) {
    const servers = this.db.collection<Server>(Collection.Servers);
    await servers.deleteOne(<Server>{ id: serverId });
    await this.removeServerFromSubscription(serverId);
    await this.removeSubscriptionsWithNoServers();
  }

  async isSubscribed(
    serverId: string,
    channelId: string,
    subscriptionName: string
  ): Promise<boolean> {
    const subscriptions = this.db.collection<Subscription>(
      Collection.Subscriptions
    );
    const found = await subscriptions.findOne({
      name: subscriptionName,
      'servers.serverId': serverId,
      'servers.channelId': channelId,
    });
    return Boolean(found);
  }

  async subscriptionRemove(
    serverId: string,
    channelId: string,
    serviceName: string,
    channel: string
  ) {
    const subscriptionName = this.getSubscriptionName(serviceName, channel);
    await this.removeServerFromSubscription(serverId, {
      name: subscriptionName,
    });
    await this.removeSubscriptionsWithNoServers();
  }

  async removeSettingMessage(
    setting: SettingName,
    serverId: string,
    subscriptionName: string | null = null
  ) {
    return await this.updateSettingMessage(
      setting,
      serverId,
      undefined,
      subscriptionName
    );
  }

  async updateSettingMessage(
    setting: SettingName,
    serverId: string,
    text: any,
    subscriptionName: string | null = null
  ) {
    if (subscriptionName) {
      return await this.serverSubscriptionSettingSet(
        serverId,
        subscriptionName,
        setting,
        text
      );
    } else {
      return await this.serverSettingSet(serverId, setting, text);
    }
  }

  async getSettingMessage(
    setting: SettingName,
    serverId: string,
    subscriptionName: string = null
  ): Promise<string | undefined> {
    const msg = await this.serverSubscriptionSettingsGet(
      serverId,
      subscriptionName,
      setting
    );
    if (msg === null || msg === undefined) {
      return await this.serverSettingsGet(serverId, setting);
    }

    return msg;
  }

  async serviceDataGet(
    serviceName: string,
    dataKeys: string[]
  ): Promise<ServiceData[]> {
    const serviceData = this.db.collection<ServiceData>(Collection.ServiceData);
    const saveServiceName = this.getSafeVariableName(serviceName);
    const result = await serviceData.find({
      service: saveServiceName,
      key: { $in: dataKeys },
    });
    return result.toArray();
  }

  async serviceDataSet(serviceName: string, keyValue: Record<string, any>[]) {
    const serviceData = this.db.collection<ServiceData>(Collection.ServiceData);
    const promises = [];
    keyValue.forEach((data) => {
      promises.push(
        serviceData.updateOne(
          { service: serviceName, key: data.key },
          { $set: { value: data.value } }
        ),
        { upsert: true }
      );
    });
    return Promise.all(promises);
  }

  async subscriptionsGetByLastCheckAndUpdate(
    updateInterval: number,
    service: string
  ): Promise<Subscription[]> {
    const subscriptions = this.db.collection<Subscription>(
      Collection.Subscriptions
    );
    const subs = await subscriptions.find(
      {
        service,
        // lastCheckStarted empty or earlier than max update interval (checking process dropped for some reason?)
        $and: [
          {
            $or: [
              {
                lastCheckStarted: {
                  $lte: Date.now() - this.MAX_UPDATE_INTERVAL,
                },
              },
              {
                lastCheckStarted: { $eq: null },
              },
              {
                lastCheckStarted: { $eq: undefined },
              },
            ],
          },
          {
            $or: [
              {
                lastCheck: {
                  $lte: Date.now() - updateInterval,
                },
              },
              {
                lastCheck: { $eq: null },
              },
              {
                lastCheck: { $eq: undefined },
              },
            ],
          },
        ],
      },
      {
        sort: { lastCheck: 1 },
      }
    );
    const result = [];
    await subs.forEach((subscription) => {
      const updateIntervalIncreasedIfNoStreamingForALongTime =
        this.getUpdateIntervalIncreasedIfNoStreamingForALongTime(
          updateInterval,
          subscription.statusChangeTimestamp
        );
      if (
        !subscription.lastCheck ||
        subscription.lastCheck <=
          Date.now() - updateIntervalIncreasedIfNoStreamingForALongTime
      ) {
        result.push(subscription);
      }
    });

    return result;
  }

  async setLastCheckStartedToNow(subscriptionsData: Subscription[]) {
    if (!subscriptionsData?.length) {
      return;
    }
    const subscriptions = this.db.collection<Subscription>(
      Collection.Subscriptions
    );
    const subscriptionsNames = subscriptionsData.map((s) => s.name);
    return await subscriptions.updateMany(
      { name: { $in: subscriptionsNames } },
      { $set: { lastCheckStarted: Date.now() } }
    );
  }

  async subscriptionRemoveList(serverId: string, channelId?: string) {
    const subscriptions = this.db.collection<Subscription>(
      Collection.Subscriptions
    );
    const serversCondition = channelId ? { serverId, channelId } : { serverId };
    await subscriptions.updateMany(
      {},
      {
        $pull: { servers: serversCondition },
      }
    );
    await this.removeSubscriptionsWithNoServers();
  }

  async updateSubscription(
    subscriptionName: string,
    subscription: Subscription
  ) {
    const subscriptions = this.db.collection<Subscription>(
      Collection.Subscriptions
    );
    return await subscriptions.updateOne(
      { name: subscriptionName },
      {
        $set: subscription,
      }
    );
  }

  async updateSubscriptionAdditionalInfo(subscriptionName, additionalInfo) {
    const subscriptions = this.db.collection<Subscription>(
      Collection.Subscriptions
    );
    return subscriptions.updateOne(
      { name: subscriptionName },
      { $set: { additionalInfo } }
    );
  }

  async getSubscriptionsList(serverId: string): Promise<Subscription[]> {
    const subscriptions = this.db.collection<Subscription>(
      Collection.Subscriptions
    );
    return subscriptions.find({ 'servers.serverId': serverId }).toArray();
  }

  private async afterConnect(client: MongoClient) {
    this.db = await client.db(this.dbName);
    this.initSchema(this.db);
  }

  private async initSchema(db: Db) {
    const servers = db.collection(Collection.Servers);
    const subscriptions = db.collection(Collection.Subscriptions);
    const serviceData = db.collection(Collection.ServiceData);
    await servers.createIndex({ id: 'text' });
    await servers.createIndex({ id: 1 }, { unique: true });
    await subscriptions.createIndex({ name: 'text' });
    await subscriptions.createIndex({ name: 1 }, { unique: true });
    await subscriptions.createIndex({
      service: 1,
      lastCheckStarted: 1,
      lastCheck: 1,
    });
    await serviceData.createIndex({ service: 'text', key: 'text' });
    await serviceData.createIndex({ service: 1, key: 1 }, { unique: true });
  }

  private getSubscriptionServerComparator(serverId, channelId) {
    return (server) =>
      server.serverId === serverId && server.channelId === channelId;
  }

  private async removeServerFromSubscription(
    serverId: string,
    subscriptionCondition = {}
  ) {
    const subscriptions = this.db.collection<Subscription>(
      Collection.Subscriptions
    );
    return await subscriptions.updateMany(subscriptionCondition, {
      $pull: { servers: { serverId } },
    });
  }

  private async removeSubscriptionsWithNoServers() {
    const subscriptions = this.db.collection(Collection.Subscriptions);
    return await subscriptions.deleteMany({
      $or: [{ servers: [] }, { servers: null }, { servers: undefined }],
    });
  }

  private async serverSubscriptionSettingSet(
    serverId: string,
    subscriptionName: string,
    settingName: SettingName,
    value: any
  ) {
    const servers = this.db.collection<Server>(Collection.Servers);
    return await servers.updateOne(
      <Server>{ id: serverId },
      {
        $set: {
          [`settingsBySubscription.${subscriptionName}.${settingName}`]: value,
        },
      },
      { upsert: true }
    );
  }

  private async serverSettingSet(
    serverId: string,
    settingName: SettingName,
    value: any
  ) {
    const servers = this.db.collection<Server>(Collection.Servers);
    return await servers.updateOne(
      <Server>{ id: serverId },
      { $set: { [`settings.${settingName}`]: value } },
      { upsert: true }
    );
  }

  private async serverSettingsGet(
    serverId: string,
    settingName: SettingName
  ): Promise<string | undefined> {
    const servers = this.db.collection<Server>(Collection.Servers);

    const setting = await servers.findOne({ id: serverId });

    return setting?.settings?.[settingName] || undefined;
  }

  private async serverSubscriptionSettingsGet(
    serverId: string,
    subscriptionName: string,
    settingName: SettingName
  ): Promise<string | undefined> {
    const servers = this.db.collection<Server>(Collection.Servers);

    const setting = await servers.findOne({ id: serverId });

    return setting?.settings?.[subscriptionName]?.[settingName] || undefined;
  }

  private getUpdateIntervalIncreasedIfNoStreamingForALongTime(
    updateInterval: number,
    statusChangeTimestamp: number
  ) {
    // Increase check period if no stream for a long time
    const statusChangeTimestampDiffDays = statusChangeTimestamp
      ? (Date.now() - statusChangeTimestamp) / (1000 * 60 * 60 * 24)
      : 0;
    let updateIntervalIncreasedIfNoStreamingForALongTime = updateInterval;
    // Starting from 2 weeks increase by 2 minutes for every week until max
    if (
      statusChangeTimestampDiffDays >= this.INCREASE_UPDATE_INTERVAL_FROM_DAYS
    ) {
      updateIntervalIncreasedIfNoStreamingForALongTime =
        updateInterval +
        this.INCREASE_UPDATE_INTERVAL_BY_MINUTES *
          Math.ceil(
            (statusChangeTimestampDiffDays -
              this.INCREASE_UPDATE_INTERVAL_FROM_DAYS) /
              this.WEEK_DAYS
          );
    }
    if (
      updateIntervalIncreasedIfNoStreamingForALongTime >
      this.MAX_UPDATE_INTERVAL
    ) {
      updateIntervalIncreasedIfNoStreamingForALongTime =
        this.MAX_UPDATE_INTERVAL;
    }

    return updateIntervalIncreasedIfNoStreamingForALongTime;
  }

  private getSafeVariableName(varName) {
    return varName.replace(/[\.]/gi, '');
  }
}
