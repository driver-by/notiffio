const StreamingService = require('./streaming-service');
const ChannelDetails = require('../models/channel-details');
const axios = require('axios');
const events = require('./events');

const MAX_CHANNELS_PER_REQUEST = 50;

class GoodgameService extends StreamingService {
    constructor(dataStorage) {
        super(dataStorage);
        this.name = 'goodgame.ru';
    }

    async getChannelStatuses(channels) {
        let promises = [];

        for (let i = 0; i < channels.length; i += MAX_CHANNELS_PER_REQUEST) {
            const channelsPart = channels.slice(i, i + MAX_CHANNELS_PER_REQUEST);
            promises.push(
                axios.get(`https://goodgame.ru/api/getggchannelstatus?id=${channelsPart.join(',')}&fmt=json`)
            );
        }
        return Promise.all(promises).then(response => {
            let result = [];
            // Flatten array and combine objects inside
            response = Array.prototype.concat.apply([], response.map(r => r.data));
            if (!response || !response.length) {
                return result;
            }
            response = Object.assign.apply({}, response);
            Object.keys(response)
                .forEach(i => {
                    const channel = response[i];
                    result.push(new ChannelDetails({
                        name: channel.key,
                        id: channel.stream_id,
                        status: channel.status,
                        title: channel.title,
                        game: channel.games,
                        viewers: channel.viewers,
                        emdebCode: channel.embed,
                        img: channel.img,
                        thumb: channel.thumb,
                        description: channel.description,
                        url: channel.url,
                    }));
                });

            return result;
        });
    }

    getNickName(subscription) {
        return subscription.channelInfo ? subscription.channelInfo.nickname : subscription.channel;
    }

    _processChannelStatuses(subscriptionsToCheck, result) {
        super._processChannelStatuses(subscriptionsToCheck, result);
        const notFoundChannels = this._getNotFound(subscriptionsToCheck, result);
        this._removeNotFound(notFoundChannels);
    }

    _getNotFound(channelsToBeFound, channels) {
        const channelsNames = channels.map(c => c.name);
        return channelsToBeFound.filter(c => channelsNames.indexOf(c.channel) === -1);
    }

    _removeNotFound(channels) {
        if (!channels) {
            return;
        }
        channels.forEach(channel => {
            this._emitEvent(events.EVENT_CHANNEL_NOT_FOUND, {
                servers: channel.servers,
                channel: channel.channel,
            });
            channel.servers.forEach(server => {
                this._dataStorage.subscriptionRemove(
                    server.serverId,
                    server.channelId,
                    channel.service,
                    channel.channel,
                );
            });
        });
    }

}

module.exports = GoodgameService;
