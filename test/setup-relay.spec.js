import { expect } from 'aegir/utils/chai.js'
import { setupRelay } from '../src/setup-relay.js'

it('should not throw an error', async () => {
  const { port, closeRelay } = await setupRelay()

  expect(port).to.be.a('number')

  closeRelay()
})

it('should use the right port', async () => {
  const { port, closeRelay } = await setupRelay({ port: 8080 })

  expect(port).to.equal(8080)

  closeRelay()
})
