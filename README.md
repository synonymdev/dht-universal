# dht-universal

Universal wrapper for `@hyperswarm/dht` and `@hyperswarm/dht-relay` working in Node.js and the Browser

## Installation

```sh
npm install dht-universal
```

## Usage

In browser, it will use the `@hyperswarm/dht-relay` with a `WebSocket` transport, so you need to pass a relay URL to the constructor, and wait for it to be ready to confirm the websocket is open.

### Drop-in replacement initialization

```js
import { DHT } from 'dht-universal';
const node = new DHT({ relay: 'wss://dht-relay.example.com/' });
await node.ready();
```

### Async initialization

You can also use the static async function `create` to try multiple relays until one works.

```js
import { DHT } from 'dht-universal';

const node = await DHT.create({
  relays: ['wss://dht-relay.example.com/'],
  ...opts,
});
// No need to call `await node.ready()`
```

## API

Should be the same as [@hyperswarm/dht](https://github.com/hyperswarm/dht#api).

### API test coverage:

The goal of this module is to ensure the usability of the DHT in the browser within the common use cases namely Hyperswarm and replicating Hypercores through Corestore:

```js
import Corestore from 'corestore';
import Hyperswarm from 'hyperswarm';
import ram from 'random-access-memory';
import DHT from 'dht-universal';

(async () => {
  const dht = new DHT({ relay: 'wss://dht-relay.example.com/' });
  const swarm = new Hyperswarm({ dht });
  const store = new Corestore(ram);
  await store.ready();

  swarm.on('connection', (socket) => {
    store.replicate(socket);
  });

  const core = store.get({ key: <0x012...def>});
  await core.ready();

  swarm.join(core.discoveryKey, { server: true, client: true });
  await swarm.flush();

  await core.update();
  const block = await core.get(core.length - 1);
})();
```

Other unit tests are available but might be removed later.

## Setup Relay

This module exposes a helper function to easily run a relay server.

```js
import { setupRelay } from 'dht-universal/setup-relay.js';

const { port, closeRelay } = await setupRelay({ dhtOpts, port });
```
