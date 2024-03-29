import { StreamingService, StreamingServiceConfig } from './streaming-service';
import axios from 'axios';
import { ChannelDetails } from './channel-details';
import { Status } from '../../../../../libs/data-access/src/lib/status';
import { DataAccess } from '../../../../../libs/data-access/src';

const MAX_CHANNELS_PER_REQUEST = 50;

export class GoodgameService extends StreamingService {
  constructor(dataAccess: DataAccess, config: StreamingServiceConfig) {
    super(dataAccess, config);
    this.name = 'goodgame.ru';
  }

  async getChannelStatuses(channels): Promise<Array<ChannelDetails>> {
    const promises = [];

    for (let i = 0; i < channels.length; i += MAX_CHANNELS_PER_REQUEST) {
      const channelsPart = channels.slice(i, i + MAX_CHANNELS_PER_REQUEST);
      const payload = channelsPart.map((channel) => {
        return { url: `https://goodgame.ru/api/4/stream/${channel.channel}` };
      });
      promises.push(
        axios.post(`https://goodgame.ru/api/4/combinedRequest`, payload)
      );
    }
    return Promise.all(promises).then((response) => {
      const result: Array<ChannelDetails> = [];
      // Flatten array and combine objects inside
      response = Array.prototype.concat.apply(
        [],
        response.map((r) => r.data)
      );
      if (!response || !response.length) {
        return result;
      }
      response.forEach((channel) => {
        if (!channel.success || !channel.data) {
          return;
        }
        const channelData = channel.data;
        if (channelData.broadcast) {
          channelData.broadcast.start *= 1000;
        }
        if (channelData.poster && !channelData.poster.startsWith('http')) {
          channelData.poster = 'https://goodgame.ru' + channelData.poster;
        }
        if (
          channelData.streamer &&
          channelData.streamer.avatar &&
          !channelData.streamer.avatar.startsWith('http')
        ) {
          channelData.streamer.avatar =
            'https://goodgame.ru' + channelData.streamer.avatar;
        }
        result.push(<ChannelDetails>{
          name: channelData.channelkey,
          nickname: channelData.streamer ? channelData.streamer.nickname : null,
          avatar: channelData.streamer ? channelData.streamer.avatar : null,
          id: channelData.id,
          status: channelData.status ? Status.Live : Status.Dead,
          title: channelData.title,
          game: channelData.game,
          viewers: channelData.viewers,
          img: channelData.poster,
          url: channelData.link,
          broadcast: channelData.broadcast,
          service: this.name,
        });
      });

      return result;
    });
  }
}
