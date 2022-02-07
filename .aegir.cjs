'use strict';
const crypto = require('crypto');
const ws = require('isomorphic-ws');
const ram = require('random-access-memory');
const DHT = require('@hyperswarm/dht');
const { relay } = require('@hyperswarm/dht-relay');
const Stream = require('@hyperswarm/dht-relay/ws');
const Hyperswarm = require('hyperswarm');
const Corestore = require('corestore');
const path = require('path');

const esbuild = {
  inject: [path.join(__dirname, './scripts/node-globals.js')],
};

const setupBootstrap = async () => {
  const node = new DHT({ ephemeral: true, bootstrap: [] });
  await node.ready();

  const nodes = [node];

  const bootstrap = [{ host: '127.0.0.1', port: node.address().port }];

  for (let i = 1; i < 4; i++) {
    const dht = (nodes[i] = new DHT({ ephemeral: false, bootstrap }));
    await dht.ready();
  }

  return {
    bootstrap,
    closeBootstrap: () => Promise.all(nodes.map((node) => node.destroy())),
  };
};

const setupNode = async (bootstrap) => {
  const node = new DHT({ bootstrap });
  await node.ready();

  const server = node.createServer();
  server.on('connection', (socket) => {
    socket.write('hello');
    socket.end();
  });

  const topic = crypto
    .createHash('sha256')
    .update(node.defaultKeyPair.publicKey)
    .digest();

  await node.announce(topic, node.defaultKeyPair).finished();
  await server.listen();

  return {
    DHT_NODE_KEY: node.defaultKeyPair.publicKey.toString('hex'),
    TOPIC: topic.toString('hex'),
    closeNode: () => node.destroy(),
  };
};

const setupCore = async (bootstrap) => {
  const node = new DHT({ bootstrap });
  await node.ready();
  const swarm = new Hyperswarm({ dht: node });

  const store = new Corestore(ram);
  await store.ready();

  let sockets = [];
  swarm.on('connection', (socket, info) => {
    sockets.push(socket);
    store.replicate(socket);
  });

  const core = store.get({ name: 'foo', valueEncoding: 'json' });
  await core.ready();

  await core.append({ foo: 'err' });
  await core.append({ foo: 'bar' });

  await swarm
    .join(core.discoveryKey, { server: true, client: false })
    .flushed();

  return {
    CORE_KEY: core.key.toString('hex'),
    closeCoreNode: () => Promise.all([node.destroy(), swarm.destroy()]),
  };
};

const setupRelay = async (bootstrap) => {
  const dht = new DHT({ bootstrap });
  await dht.ready();

  const server = new ws.WebSocketServer({ port: 0 });

  server.on('connection', (socket) => {
    relay(dht, new Stream(false, socket));
  });

  return {
    // @ts-ignore
    RELAY_URL: 'ws://127.0.0.1:' + server.address().port,
    closeRelay: () => {
      return Promise.all([dht.destroy(), server.close()]);
    },
  };
};

/** @type {import('aegir').PartialOptions} */
module.exports = {
  test: {
    browser: {
      config: {
        buildConfig: esbuild,
      },
    },
    async before(options) {
      const { bootstrap, closeBootstrap } = await setupBootstrap();
      const { DHT_NODE_KEY, TOPIC, closeNode } = await setupNode(bootstrap);
      const { CORE_KEY, closeCoreNode } = await setupCore(bootstrap);
      const { RELAY_URL, closeRelay } = await setupRelay(bootstrap);

      return {
        closeNode,
        closeRelay,
        closeCoreNode,
        closeBootstrap,
        env: {
          BOOTSTRAP: JSON.stringify(bootstrap),
          DHT_NODE_KEY,
          TOPIC,
          RELAY_URL,
          CORE_KEY,
        },
      };
    },
    async after(options, before) {
      await before.closeNode();
      await before.closeRelay();
      await before.closeCoreNode();
      await before.closeBootstrap();
    },
  },
  build: {
    config: esbuild,
  },
};
