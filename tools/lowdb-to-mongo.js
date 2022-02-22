'use strict';

const lowdb = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');

const db = lowdb(new FileSync('db.json'));
const dotenv = require('dotenv/config');
const { MongoClient } = require('mongodb');

const servers = db.get('servers').value();
const subscriptions = db.get('subscriptions').value();
const serviceData = db.get('serviceData').value();

const url = process.env.MONGO_URL;
const dbName = process.env.MONGO_DB;
const mongo = new MongoClient(`${url}?authSource=${dbName}`);

let serversBefore = servers.length;
let subscriptionsBefore = subscriptions.length;
let dataBefore = Object.keys(serviceData.twitchtv.games).length;
let serversInserted = 0;
let subscriptionsInserted = 0;
let dataInserted = 0;
let noServers = 0;
return mongo
  .connect()
  .then((client) => client.db(dbName))
  .then((db) => {
    const serversMongo = db.collection('servers');
    const subscriptionsMongo = db.collection('subscriptions');
    const serviceDataMongo = db.collection('serviceData');
    const promises = [];
    promises.push(serversMongo.createIndex({ id: 'text' }));
    promises.push(serversMongo.createIndex({ id: 1 }, { unique: true }));
    promises.push(subscriptionsMongo.createIndex({ name: 'text' }));
    promises.push(
      subscriptionsMongo.createIndex({ name: 1 }, { unique: true })
    );
    promises.push(
      subscriptionsMongo.createIndex({
        service: 1,
        lastCheckStarted: 1,
        lastCheck: 1,
      })
    );
    promises.push(
      serviceDataMongo.createIndex({ service: 'text', key: 'text' })
    );
    promises.push(
      serviceDataMongo.createIndex({ service: 1, key: 1 }, { unique: true })
    );

    const subscriptionServersMap = new Map();
    servers.forEach((server) => {
      const serverToInsert = {
        id: server.id,
        name: server.name,
        settings: server.settings,
      };
      if (server.subscriptions) {
        server.subscriptions.forEach((sub) => {
          const key = sub.name.toLowerCase();
          const serversList = subscriptionServersMap.get(key);
          const serverToList = {
            serverId: server.id,
            channelId: sub.channelId,
          };
          if (serversList) {
            serversList.push(serverToList);
            subscriptionServersMap.set(key, serversList);
          } else {
            subscriptionServersMap.set(key, [serverToList]);
          }
          if (sub.settings) {
            const safeKey = getSafeVariableName(key);
            serverToInsert.settingsBySubscription =
              serverToInsert.settingsBySubscription || {};
            serverToInsert.settingsBySubscription[safeKey] = {};
            Object.keys(sub.settings).forEach((settingName) => {
              serverToInsert.settingsBySubscription[safeKey][settingName] =
                sub.settings[settingName];
            });
          }
        });
      }
      promises.push(serversMongo.insertOne(serverToInsert));
      serversInserted++;
    });

    subscriptions.forEach((subscription) => {
      const key = subscription.name.toLowerCase();
      const servers = subscriptionServersMap.get(key);
      if (servers && servers.length) {
        const subscriptionToInsert = {
          ...subscription,
          name: subscription.name.toLowerCase(),
          servers: subscriptionServersMap.get(key),
        };
        subscriptionsInserted++;
        promises.push(subscriptionsMongo.insertOne(subscriptionToInsert));
      } else {
        noServers++;
      }
    });

    Object.keys(serviceData.twitchtv.games).forEach((gameId) => {
      const serviceDataToInsert = {
        service: 'twitchtv',
        key: `game${gameId}`,
        value: serviceData.twitchtv.games[gameId].name,
      };
      dataInserted++;
      promises.push(serviceDataMongo.insertOne(serviceDataToInsert));
    });

    return Promise.all(promises);
  })
  .then(() => {
    console.log(
      `Finished all\nInserted servers: ${serversInserted} (before: ${serversBefore}).\nInserted subscriptoins: ${subscriptionsInserted} (before: ${subscriptionsBefore}).\nInserted data: ${dataInserted} (before: ${dataBefore})\nNo servers found: ${noServers}.`
    );
    mongo.close();
  });

function getSafeVariableName(varName) {
  return varName ? varName.replace(/[\.]/gi, '') : varName;
}
