const events = require('./events');

/**
 * Basic functionality for all services
 * Don't create instances of this class
 */
class BaseService {
    constructor() {
        this.name = 'BaseService';
        this._subscriptions = {};
    }

    async getChannelStatuses(channels) {

    }

    /**
     * Subscribe callback to event by name
     * @param eventName
     * @param fn
     */
    on(eventName, fn) {
        this._subscriptions[eventName] = this._subscriptions[eventName] || [];
        // Prevent adding the same function twice
        if (this._subscriptions[eventName].indexOf(fn) !== -1) {
            return;
        }
        this._subscriptions[eventName].push(fn);
    }

    /**
     * Unsubscribe callback from event
     * @param eventName
     * @param fn
     */
    off(eventName, fn) {
        this._subscriptions[eventName] = this._subscriptions[eventName].filter(f => f !== fn);
    }

    _processChannelStatuses(subscriptionsToCheck, result) {

    }

    /**
     * Emit event by name with params
     * @param eventName
     * @param params
     * @private
     */
    _emitEvent(eventName, params) {
        if (this._subscriptions[eventName]) {
            this._subscriptions[eventName].forEach(fn => fn(eventName, params));
        }
        // Also invoke all EVENT_ALL callbacks
        if (this._subscriptions[events.EVENT_ALL]) {
            this._subscriptions[events.EVENT_ALL].forEach(fn => fn(eventName, params));
        }
    }
}

module.exports = BaseService;
