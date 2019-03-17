class Scheduler {
    constructor(interval, getLastTimestamp, callback) {
        this._interval = interval;
        this._getLastTimestamp = getLastTimestamp;
        this._callback = callback;
    }

    start() {
        this._tick();
        this._intervalInstance = setInterval(this._tick.bind(this), 1000);
    }

    stop() {
        clearInterval(this._intervalInstance);
    }

    _tick() {
        const timestamp = this._getLastTimestamp();
        if (!timestamp || Date.now() - parseInt(timestamp) > this._interval) {
            this._callback();
        }
    }
}

module.exports = Scheduler;