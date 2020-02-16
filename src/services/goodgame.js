const AbstractService = require('./abstract-service');
const ChannelDetails = require('../models/channel-details');
const request = require('request-promise-native');

class GoodgameService extends AbstractService {
    static getChannelStatuses(channels) {
        return request({
            uri: `https://goodgame.ru/api/getggchannelstatus?id=${channels.join(',')}&fmt=json`,
            json: true,
        }).then(response => {
            let result = [];

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
