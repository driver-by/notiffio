import { ShardingManager } from 'discord.js';
import 'dotenv/config';

const SECRET_KEY = process.env.SECRET_KEY;
const manager = new ShardingManager(`${__dirname}/../bot/main.js`, {
  token: SECRET_KEY,
  totalShards: 2,
});

manager.on('shardCreate', (shard) => {
  shard.on('spawn', () => {
    console.log(`Spawned shard: [${shard.id}]`);
  });
  shard.on('ready', () => {
    console.log(` Shard [${shard.id}] is ready`);
  });
  shard.on('death', () => {
    console.log(`Died shard: [${shard.id}]`);
  });
  shard.on('error', (err) => {
    console.log(`Error in  [${shard.id}] with : ${err} `);
    shard.respawn();
  });
});

manager.spawn();
