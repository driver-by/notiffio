const StreamingService = require('./streaming-service');
const ChannelDetails = require('../models/channel-details');
const axios = require('axios');
const events = require('./events');
const {STATUS_DEAD, STATUS_LIVE} = require('../models/statuses');

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
            const payload = channelsPart.map(channel => {
                return {url: `https://goodgame.ru/api/4/stream/${channel}`};
            });
            promises.push(
                axios.post(`https://goodgame.ru/api/4/combinedRequest`, payload)
            );
        }
        return Promise.all(promises).then(response => {
            let result = [];
            // Flatten array and combine objects inside
            response = Array.prototype.concat.apply([], response.map(r => r.data));
            if (!response || !response.length) {
                return result;
            }
            response.forEach(channel => {
                    if (!channel.success || !channel.data) {
                        return;
                    }
                    const channelData = channel.data;
                    if (channelData.broadcast) {
                        channelData.broadcast.start *= 1000;
                    }
                    result.push(new ChannelDetails({
                        name: channelData.channelkey,
                        nickname: channelData.streamer ? channelData.streamer.nickname : null,
                        id: channelData.id,
                        status: channelData.status ? STATUS_LIVE : STATUS_DEAD,
                        title: channelData.title,
                        game: channelData.game,
                        viewers: channelData.viewers,
                        img: channelData.poster,
                        url: channelData.link,
                        broadcast: channelData.broadcast,
                    }));
                });

            return result;
        });
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
