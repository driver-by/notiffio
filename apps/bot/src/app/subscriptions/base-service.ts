/**
 * Basic functionality for all services
 * Don't create instances of this class
 */
import { EVENT_ALL } from './events';
import { ChannelDetails } from './channel-details';

export abstract class BaseService {
  name = 'BaseService';
  protected readonly subscriptions: Map<string, Array<object>>;

  protected constructor() {
    this.subscriptions = new Map();
  }

  async getChannelStatuses(channels): Promise<Array<ChannelDetails>> {
    return;
  }

  async update() {}

  /**
   * Subscribe callback to event by name
   * @param eventName
   * @param fn
   */
  on(eventName, fn) {
    if (!this.subscriptions.has(eventName)) {
      this.subscriptions.set(eventName, []);
    }
    const list = this.subscriptions.get(eventName);
    // Prevent adding the same function twice
    if (list.indexOf(fn) !== -1) {
      return;
    }
    list.push(fn);
  }

  /**
   * Unsubscribe callback from event
   * @param eventName
   * @param fn
   */
  off(eventName, fn) {
    this.subscriptions.set(
      eventName,
      this.subscriptions.get(eventName).filter((f) => f !== fn)
    );
  }

  async processChannelStatuses(subscriptionsToCheck, result): Promise<any> {}

  /**
   * Emit event by name with params
   * @param eventName
   * @param params
   * @private
   */
  emitEvent(eventName, params) {
    if (this.subscriptions.has(eventName)) {
      this.subscriptions
        .get(eventName)
        .forEach((fn: Function) => fn(eventName, params));
    }
    // Also invoke all EVENT_ALL callbacks
    if (this.subscriptions.has(EVENT_ALL)) {
      this.subscriptions
        .get(EVENT_ALL)
        .forEach((fn: Function) => fn(eventName, params));
    }
  }
}
