## Notiffio

Discord bot, sending notifications to selected channels on different events, using [discord.js](https://github.com/discordjs). Currently supports:
- goodgame.ru stream start/stop

### Start to use bot

##### Add to your server with [a link](https://discordapp.com/oauth2/authorize?&client_id=552560239304507403&scope=bot&permissions=256064)

Use commands to start:
- **!notify help** - show help
- **!notify {channel URL}** - add notification or remove if already in the list
- **!notify list** - list of all notifications on server
- **!notify remove** - remove all notifications from current channel
- **!notify remove all** - remove all notifications from entire server
- **!notify leave** - kick bot out of a server

### Self-host this bot

- Register you bot on [discord developers portal](https://discordapp.com/developers/applications)
- Download source code
- Run `npm install` or `npm ci`
- Add local.env file to pass ENV param `SECRET_KEY` with token you can find in your Bot settings on dev portal under `Bot` - `Token`
- Run `node index.js`
- Use invitation link for notiffio above to invite bot on server, but replace client_id with your `General information` - `Client ID`
- Enjoy 🤖

Node v10+ is required.
