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
 * @param {*} [opts.dhtOpts]
 * @param {number} [opts.port=0]
 * @returns
 */
export const setupRelay = async ({ dhtOpts, port = 0 } = {}) => {
  const dht = new DHT(dhtOpts)
  await dht.ready()

  const server = new ws.WebSocketServer({ port })

  const proxies = []

  server.on('connection', async (socket) => {
    const stream = new Stream(false, socket)
    const proxy = await relay(dht, stream)
    proxies.push(proxy)
  })

  return {
    // @ts-ignore
    port: server.address().port,
    closeRelay: () => {
      return Promise.all([dht.destroy(), server.close()])
    }
  }
}
