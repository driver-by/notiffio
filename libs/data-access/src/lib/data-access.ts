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
    this.client.addListener('error', callback);
  }

  async subscriptionAdd(
    serverId: string,
    channelId: string,
    serverName: string,
    channelName: string,
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

  async serverRemove(serverId: string) {
    const servers = this.db.collection(Collection.Servers);
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
    text: string,
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
    return await serviceData.updateMany(
      <ServiceData[]>keyValue.map((data) => {
        return { service: serviceName, key: data.key, value: data.value };
      }),
      { upsert: true }
    );
  }

  private async afterConnect(client: MongoClient) {
    this.db = await client.db(this.dbName);
    this.initSchema(this.db);
  }

  private async initSchema(db: Db) {
    const servers = db.collection(Collection.Servers);
    const subscriptions = db.collection(Collection.Subscriptions);
    await servers.createIndex({ id: 'text' });
    await servers.createIndex({ id: 1 }, { unique: true });
    await subscriptions.createIndex({ name: 'text' });
    await subscriptions.createIndex({ name: 1 }, { unique: true });
    await subscriptions.createIndex({ service: 'text', key: 'text' });
    await subscriptions.createIndex({ service: 1, key: 1 }, { unique: true });
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
    value: string
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
    value: string
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

  private getSafeVariableName(varName) {
    return varName.replace(/[\.]/gi, '');
  }
}
