export function getServiceInfo(url) {
  if (!url) {
    return null;
  }

  const match = url.match(
    /^(?:https?:\/\/)?(?:www\.)?(?:m\.)?(\w*\.\w*)\/([\w-_.]*)\/?([\w-_.]*)\/?/i
  );
  if (!match) {
    return null;
  }
  const [m, service, param1, param2] = match;
  let channel;
  switch (service) {
    case 'goodgame.ru':
      if (param1 === 'channel') {
        // Old way of links
        channel = param2;
      } else {
        channel = param1;
      }
      break;
    case 'twitch.tv':
      channel = param1;
      break;
  }
  if (!channel) {
    return null;
  }

  return { service, channel };
}

export function getServiceUrl({ service, channel }) {
  switch (service) {
    case 'goodgame.ru':
      return `https://goodgame.ru/channel/${channel}`;
    case 'twitch.tv':
      return `https://www.twitch.tv/${channel}`;
    default:
      throw new Error(`Wrong service ${service} in \`getServiceUrl\` function`);
  }
}
