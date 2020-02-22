const AbstractService = require('./abstract-service');
const ChannelDetails = require('../models/channel-details');
const request = require('request-promise-native');

const MAX_CHANNELS_PER_REQUEST = 50;

class GoodgameService extends AbstractService {
    static getChannelStatuses(channels) {
        let promises = [];

        for (let i = 0; i < channels.length; i += MAX_CHANNELS_PER_REQUEST) {
            const channelsPart = channels.slice(i, i + MAX_CHANNELS_PER_REQUEST);
            promises.push(request({
                uri: `https://goodgame.ru/api/getggchannelstatus?id=${channelsPart.join(',')}&fmt=json`,
                json: true,
            }));
        }
        return Promise.all(promises).then(response => {
            let result = [];
            // Flatten array and combine objects inside
            response = Array.prototype.concat.apply([], response);
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
}

module.exports = {name: 'goodgame.ru', service: GoodgameService};
