// @ts-ignore
import DHT from '@hyperswarm/dht'
// @ts-ignore
import { relay } from '@hyperswarm/dht-relay'
// @ts-ignore
import Stream from '@hyperswarm/dht-relay/ws'
import ws from 'isomorphic-ws'

/**
 *
 * @param {object} opts
 * @param {DHTOpts} [opts.dhtOpts]
 * @param {number} [opts.port=0]
 * @returns
 */
export const setupRelay = async ({ dhtOpts, socketServerOpts } = {}) => {
  const dht = new DHT(dhtOpts)
  await dht.ready()

  const server = new ws.WebSocketServer(socketServerOpts)

  server.on('connection', (socket) => {
    relay(dht, new Stream(false, socket))
  })

  return {
    // @ts-ignore
    port: server.address().port,
    closeRelay: () => {
      return Promise.all([dht.destroy(), server.close()])
    }
  }
}

/**
 * @typedef {import('./interfaces').DHTOpts} DHTOpts
 */
