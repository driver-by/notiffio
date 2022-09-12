## Notiffio

Discord bot, sending notifications (only Russian l10n for now) to selected channels on different events, using [discord.js](https://github.com/discordjs). Currently supports:
- goodgame.ru stream start/stop
- goodgame.ru announcement add/edit/remove
- twitch.tv stream start/stop

### Start to use the bot

##### Add to your server with [a link](https://discordapp.com/oauth2/authorize?&client_id=552560239304507403&scope=bot&permissions=256064)

Use slash commands to start:
- **/notify help** - show help
- **/subscribe {channel URL}** - add notification for twitch/goodgame channel
- **/list** - list of all notifications on a server
- **/unsubscribe {channel URL}** - remove notification
- **/settings help** - show help for settings command

### Self-host this bot
Requirements:
- Mongo DB
- Node.js (npm)

Setup:
- Register you bot on [discord developers portal](https://discordapp.com/developers/applications)
- Download the source code
- Run `npm install` or `npm ci`
- Add `.env` file to pass ENV params 
  + `SECRET_KEY` token from Bot settings on [dev portal](https://discord.com/developers/applications) under `Bot` - `Token`
  + `CLIENT_ID` client id from Bot General Information on [dev portal](https://discord.com/developers/applications) under `General` - `Application ID`
  + `TWITCH_CLIENT_ID` with Twitch API Client ID (visit [dev console](https://dev.twitch.tv/console/apps/create) to register)
  + `TWITCH_SECRET` with Twitch API secret code
  + `MONGO_URL` Mongo DB connection URL `mongodb://...`
  + `MONGO_DB` name of DB in Mongo
  + `UPDATE_INTERVAL` (optional) check each subscription every `UPDATE_INTERVAL` milliseconds
  + `TOTAL_SHARDS` (optional) number of shards to run ('auto' is the default)
- Run `nx build sharding && nx build bot` (you might need to either reopen the console or install `@nrwl/cli` globally to get `nx` cli - `npm i -g @nrwl/cli`)
- Run `node dist/apps/sharding/main.js`
- Use the invitation link for notiffio above to invite the bot to your server, but replace client_id with your `General information` - `Client ID`
- Enjoy 🤖

Node v16+ is required.
