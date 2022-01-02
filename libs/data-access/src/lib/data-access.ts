import { MongoClient } from 'mongodb';

export class DataAccess {
  private readonly SUBSCRIPTION_NAME_DELIMITER = '/';

  private readonly url: string;
  private client: MongoClient;

  constructor(url: string) {
    if (!url) {
      throw new Error('DataAccess.constructor. DB url is required');
    }
    this.url = url;
    this.client = new MongoClient(this.url);
  }

  connect(): Promise<MongoClient> {
    return this.client.connect();
  }

  getSubscriptionName(service: string, channel: string): string {
    return service + this.SUBSCRIPTION_NAME_DELIMITER + channel;
  }
}
