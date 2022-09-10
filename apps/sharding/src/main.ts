import { ShardingManager, ShardingManagerOptions } from 'discord.js';
import 'dotenv/config';
import { getLogger } from '../../../libs/logger/src';
import { CommandController } from '../../../libs/commands/src';

const SECRET_KEY = process.env.SECRET_KEY;
const CLIENT_ID = process.env.CLIENT_ID;
const options: ShardingManagerOptions = {
  token: SECRET_KEY,
};
if (process.env.TOTAL_SHARDS) {
  options.totalShards = <number | 'auto'>process.env.TOTAL_SHARDS;
}
const manager = new ShardingManager(`${__dirname}/../bot/main.js`, options);

const logger = getLogger();

manager.on('shardCreate', (shard) => {
  shard.on('spawn', () => {
    logger.info(`Shard has spawned: [${shard.id}]`);
  });
  shard.on('ready', () => {
    logger.info(`Shard [${shard.id}] is ready`);
  });
  shard.on('death', () => {
    logger.info(`Shard has died: [${shard.id}]`);
  });
  shard.on('error', (err) => {
    logger.error(`Error in  [${shard.id}] with : ${err} `);
    shard.respawn();
  });
});

manager.spawn();

const commandController = new CommandController();
commandController.registerCommands(CLIENT_ID, SECRET_KEY).then(
  (registered) => logger.info(`Commands registered`),
  (error) => logger.error(`Commands registration error`)
);
