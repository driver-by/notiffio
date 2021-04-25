const ChannelDetails = require('../models/channel-details');
const StreamingService = require('./streaming-service');
const {ApiClient} = require('twitch');
const {ClientCredentialsAuthProvider} = require('twitch-auth');
const {STATUS_DEAD, STATUS_LIVE} = require('../models/statuses');

const MAX_CHANNELS_PER_REQUEST = 20; // Default value of items per-page in twitch API

class TwitchService extends StreamingService {
    constructor(dataStorage, config = {}) {
        super(dataStorage, config);
        this.name = 'twitch.tv';
        const authProvider = new ClientCredentialsAuthProvider(
            process.env.TWITCH_CLIENT_ID,
            process.env.TWITCH_SECRET,
        );
        this._client = new ApiClient({authProvider});
    }

    async getChannelStatuses(channels) {
        let promises = [];
        let usersAll = [];
        let streamsAll = [];

        for (let i = 0; i < channels.length; i += MAX_CHANNELS_PER_REQUEST) {
            const channelsPart = channels.slice(i, i + MAX_CHANNELS_PER_REQUEST);
            promises.push(
                this._client.helix.users.getUsersByNames(channelsPart)
                    .then(users => {
                        usersAll = usersAll.concat(users);
                        return this._client.helix.streams
                            .getStreamsPaginated({
                                userId: users.map(user => user.id)
                            })
                            .getNext();
                    })
                    .then(streams => {
                        streamsAll = streamsAll.concat(streams);
                        return this._getGamesByIds(streams.map(stream => stream.gameId));
                    }),
            );
        }
        return Promise.all(promises).then(games => {
            let result = [];
            if (!usersAll.length) {
                return result;
            }
            // Flatten array
            games = Array.prototype.concat.apply([], games);
            let streamsMapByUser = {};
            if (streamsAll && streamsAll.length) {
                streamsAll.forEach(stream => streamsMapByUser[stream.userId] = stream);
            }
            let gamesMap = {};
            if (games && games.length) {
                games.forEach(game => gamesMap[game.id] = game);
            }
            usersAll.forEach(user => {
                if (!user) {
                    return;
                }
                const channelData = streamsMapByUser[user.id];
                result.push(new ChannelDetails({
                    name: user.name,
                    nickname: user.displayName,
                    avatar: user.profilePictureUrl,
                    id: user.id,
                    status: channelData && channelData.type === 'live' ? STATUS_LIVE : STATUS_DEAD,
                    title: channelData ? channelData.title : '',
                    game: channelData && gamesMap[channelData.gameId] ? gamesMap[channelData.gameId].name : '',
                    viewers: channelData ? channelData.viewers : null,
                    img: channelData ? channelData.thumbnailUrl
                        .replace('{width}', 320)
                        .replace('{height}', 180): null,
                    url: `https://twitch.tv/${user.name}`,
                }));
            });

            return result;
        });
    }

    _getGamesByIds(gameIds) {
        return new Promise((resolve, reject) => {
            if (!gameIds) {
                return [];
            }
            const data = this._dataStorage.serviceDataGet(this.name);
            const games = data && data.games || {};
            const gamesResult = [];
            const gamesIdsToSearchInApi = [];

            gameIds.forEach(gameId => {
                if (games[gameId]) {
                    gamesResult.push(games[gameId]);
                } else {
                    gamesIdsToSearchInApi.push(gameId);
                }
            });
            if (gamesIdsToSearchInApi.length) {
                this._client.helix.games.getGamesByIds(gamesIdsToSearchInApi)
                    .then(gamesFromApi => {
                        this._addGamesToStorage(gamesFromApi);
                        resolve(gamesResult.concat(gamesFromApi))
                    }, error => {
                        resolve(gamesResult);
                    });
            } else {
                resolve(gamesResult);
            }
        });
    }

    _addGamesToStorage(gamesArray) {
        const data = this._dataStorage.serviceDataGet(this.name) || {};
        data.games = data.games || {};
        gamesArray.forEach(game => data.games[game.id] = this._mapGameFromApi(game));
        this._dataStorage.serviceDataUpdate(this.name, data);
    }

    _mapGameFromApi(game) {
        const { id, name } = game;
        return {
            id,
            name,
        }
    }
}

module.exports = TwitchService;
