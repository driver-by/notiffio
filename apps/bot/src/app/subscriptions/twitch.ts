import { StreamingService, StreamingServiceConfig } from './streaming-service';
import { ClientCredentialsAuthProvider } from 'twitch-auth';
import { ApiClient } from 'twitch';
import { ChannelDetails } from './channel-details';
import { Status } from '../../../../../libs/data-access/src/lib/status';
import { DataAccess } from '../../../../../libs/data-access/src';

const MAX_CHANNELS_PER_REQUEST = 90; // Max of a twitch API is 100
const USER_DATA_TIME_OUTDATED = 24 * 60 * 60 * 1000;
const GAMES_KEY = 'game';

export class TwitchService extends StreamingService {
  private readonly client: ApiClient;
  constructor(dataAccess: DataAccess, config: StreamingServiceConfig) {
    super(dataAccess, config);
    this.name = 'twitch.tv';
    const authProvider = new ClientCredentialsAuthProvider(
      process.env.TWITCH_CLIENT_ID,
      process.env.TWITCH_SECRET
    );
    this.client = new ApiClient({ authProvider });
  }

  async getChannelStatuses(channels): Promise<Array<ChannelDetails>> {
    const promises = [];
    let usersAll = [];
    let streamsAll = [];

    for (let i = 0; i < channels.length; i += MAX_CHANNELS_PER_REQUEST) {
      const channelsPart = channels.slice(i, i + MAX_CHANNELS_PER_REQUEST);
      promises.push(
        this.getUserDataByName(channelsPart)
          .then((users) => {
            usersAll = usersAll.concat(users);
            return this.client.helix.streams
              .getStreamsPaginated({
                userId: users.map((user) => user.id),
              })
              .getNext();
          })
          .then((streams) => {
            streamsAll = streamsAll.concat(streams);
            return this.getGamesByIds(streams.map((stream) => stream.gameId));
          })
      );
    }
    return Promise.all(promises).then((games) => {
      const result: Array<ChannelDetails> = [];
      if (!usersAll.length) {
        return result;
      }
      // Flatten array
      games = Array.prototype.concat.apply([], games);
      const streamsMapByUser = {};
      if (streamsAll && streamsAll.length) {
        streamsAll.forEach(
          (stream) => (streamsMapByUser[stream.userId] = stream)
        );
      }
      const gamesMap = {};
      if (games && games.length) {
        games.forEach((game) => (gamesMap[game.id] = game));
      }
      usersAll.forEach((user) => {
        if (!user) {
          return;
        }
        const channelData = streamsMapByUser[user.id];
        result.push(<ChannelDetails>{
          name: user.name,
          nickname: user.displayName,
          avatar: user.profilePictureUrl,
          id: user.id,
          status:
            channelData && channelData.type === 'live'
              ? Status.Live
              : Status.Dead,
          title: channelData ? channelData.title : '',
          game:
            channelData && gamesMap[channelData.gameId]
              ? gamesMap[channelData.gameId].name
              : '',
          viewers: channelData ? channelData.viewers : null,
          img: channelData
            ? channelData.thumbnailUrl
                .replace('{width}', 320)
                .replace('{height}', 180)
            : null,
          url: `https://twitch.tv/${user.name}`,
        });
      });

      return result;
    });
  }

  private getGamesByIds(gameIds) {
    return new Promise(async (resolve, reject) => {
      if (!gameIds) {
        return [];
      }
      const data = await this.dataAccess.serviceDataGet(
        this.name,
        gameIds.map(this.getGameKey)
      );
      const games = {};
      data.forEach((dbRow) => {
        games[dbRow.key.slice(GAMES_KEY.length)] = dbRow.value;
      });
      const gamesResult = [];
      const gamesIdsToSearchInApi = [];

      gameIds.forEach((gameId) => {
        if (games[gameId]) {
          gamesResult.push({ id: gameId, name: games[gameId] });
        } else {
          gamesIdsToSearchInApi.push(gameId);
        }
      });
      if (gamesIdsToSearchInApi.length) {
        this.client.helix.games.getGamesByIds(gamesIdsToSearchInApi).then(
          async (gamesFromApi) => {
            await this.addGamesToStorage(gamesFromApi);
            resolve(gamesResult.concat(gamesFromApi));
          },
          (error) => {
            resolve(gamesResult);
          }
        );
      } else {
        resolve(gamesResult);
      }
    });
  }

  private async addGamesToStorage(gamesArray) {
    const addArray = gamesArray.map((game) => {
      return {
        [this.getGameKey(game.id)]: game.name,
      };
    });
    return await this.dataAccess.serviceDataSet(this.name, addArray);
  }

  private async getUserDataByName(channels) {
    const channelIds = [];
    const usersDataAlreadyGot = [];
    const channelNamesToSearch = [];

    // Find channels without ids and place in channelNamesToSearch
    // Additional API request is required
    channels.forEach((channel) => {
      if (this.isUserDataRelevant(channel.additionalInfo)) {
        channelIds.push(channel.additionalInfo.id);
        usersDataAlreadyGot.push(channel.additionalInfo);
      } else {
        channelNamesToSearch.push(channel.channel);
      }
    });
    const promiseNameSearch = channelNamesToSearch.length
      ? this.client.helix.users.getUsersByNames(channelNamesToSearch)
      : Promise.resolve([]);

    return promiseNameSearch.then((users) => {
      this.addUsersToStorage(users);
      return users.concat(usersDataAlreadyGot);
    });
  }

  private addUsersToStorage(usersArray) {
    const promises = [];
    usersArray.forEach((user) => {
      promises.push(
        this.dataAccess.updateSubscriptionAdditionalInfo(
          this.dataAccess.getSubscriptionName(this.name, user.name),
          this.mapUsersDataToAdditionaData(user)
        )
      );
    });

    return Promise.all(promises);
  }

  private mapUsersDataToAdditionaData(user) {
    return {
      id: user.id,
      name: user.name,
      displayName: user.displayName,
      profilePictureUrl: user.profilePictureUrl,
      timestamp: Date.now(),
    };
  }

  private isUserDataRelevant(additionalInfo) {
    return (
      additionalInfo &&
      additionalInfo.id &&
      Date.now() - additionalInfo.timestamp < USER_DATA_TIME_OUTDATED
    );
  }

  private getGameKey(gameId: string) {
    return `${GAMES_KEY}${gameId}`;
  }
}
