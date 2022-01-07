import { Db, GenericListener, MongoClient } from 'mongodb';
import { SettingName } from './setting-name';
import { Status } from './status';

export interface Server {
  id: string;
  name: string;
  settings?: Record<SettingName, string>;
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
}
