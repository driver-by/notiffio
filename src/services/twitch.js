const ChannelDetails = require('../models/channel-details');
const StreamingService = require('./streaming-service');
const {ApiClient} = require('twitch');
const {ClientCredentialsAuthProvider} = require('twitch-auth');
const {STATUS_DEAD, STATUS_LIVE} = require('../models/statuses');

const MAX_CHANNELS_PER_REQUEST = 90; // Max of a twitch API is 100
const USER_DATA_TIME_OUTDATED = 24 * 60 * 60 * 1000;

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
                this._getUserDataByName(channelsPart)
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

    async _getUserDataByName(channels) {
        const channelIds = [];
        const usersDataAlreadyGot = [];
        const channelNamesToSearch = [];

        // Find channels without ids and place in channelNamesToSearch
        // Additional API request is required
        channels.forEach(channel => {
            if (this._isUserDataRelevant(channel.additionalInfo)) {
                channelIds.push(channel.additionalInfo.id);
                usersDataAlreadyGot.push(channel.additionalInfo);
            } else {
                channelNamesToSearch.push(channel.channel);
            }
        });
        const promiseNameSearch = channelNamesToSearch.length
            ? this._client.helix.users.getUsersByNames(channelNamesToSearch)
            : Promise.resolve([]);

        return promiseNameSearch.then(users => {
            this._addUsersToStorage(users);
            return users.concat(usersDataAlreadyGot);
        });
    }

    _addUsersToStorage(usersArray) {
        const dataMap = {};
        usersArray.forEach(user => {
            dataMap[this._dataStorage.getSubscriptionName(this.name, user.name)] = this._mapUsersDataToAdditionaData(user);
        });
        this._dataStorage.updateSubscriptionAdditionalInfoMap(dataMap);
    }

    _mapUsersDataToAdditionaData(user) {
        return {
            id: user.id,
            name: user.name,
            displayName: user.displayName,
            profilePictureUrl: user.profilePictureUrl,
            timestamp: Date.now(),
        };
    }

    _isUserDataRelevant(additionalInfo) {
        return additionalInfo
            && additionalInfo.id
            && (Date.now() - additionalInfo.timestamp < USER_DATA_TIME_OUTDATED);
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
