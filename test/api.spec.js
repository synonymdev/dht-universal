import { expect } from 'aegir/utils/chai.js';
import crypto from 'hypercore-crypto';
import b4a from 'b4a';

/**
 * @param {import ('../src/interfaces').DHTModule} DHT
 */
export const test = (DHT) => {
  const VALID_RELAY_SERVER = 'wss://dht-relay.synonym.to/';
  const INVALID_RELAY_SERVER = 'ws://invalid.something.net';

  const DHT_KEY = b4a.from(
    '3b6a27bcceb6a42d62a3a8d02a6f0d73653215771de243a63ac048a18b59da29',
    'hex',
  );

  const keyPair = crypto.keyPair(b4a.from('1'.repeat(64), 'hex'));

  let nodes = [];

  /**
   * @param {import('../src/interfaces').DHTOpts} [opts]
   */
  const createNode = async (opts) => {
    const node = await DHT.create({ keyPair });
    nodes.push(node);
    return node;
  };

  describe('DHT documented API', () => {
    after(async () => {
      await Promise.all(
        nodes.map((node) => {
          return node.destroy();
        }),
      );
    });

    describe('create options', () => {
      it('should accept a defaultKeyPair', async () => {
        const node = await createNode({ keyPair });
        expect(node.defaultKeyPair).to.eql(keyPair);
      });
    });

    describe('DHT.keyPair', () => {
      it('should create a keyPair without a seed', () => {
        const keyPair = DHT.keyPair();
        expect(Object.keys(keyPair)).to.eql(['publicKey', 'secretKey']);
      });

      it('should create a keyPair from a seed', () => {
        const _keyPair = DHT.keyPair(b4a.from('1'.repeat(64), 'hex'));
        expect(_keyPair).to.eql(keyPair);
      });
    });

    describe('node.destroy()', () => {
      it('should destroy node and close servers', async () => {
        const node = await DHT.create();
        const server = node.createServer();
        await server.listen();

        expect(server.closed).to.be.false();
        expect(node.destroyed).to.be.false();

        await node.destroy();

        expect(server.closed).to.be.true();
        expect(node.destroyed).to.be.true();
      });

      it('should force destroy node and skip close servers', async () => {
        const node = await DHT.create();
        const server = node.createServer();
        await server.listen();

        expect(server.closed).to.be.false();
        expect(node.destroyed).to.be.false();

        await node.destroy({ force: true });

        expect(server.closed).to.be.false();
        expect(node.destroyed).to.be.true();

        server.close();
      });
    });

    describe('node.createServer', () => {
      it('should create a server and accept an onconnection callback', async () => {
        const node1 = await createNode();

        const opened = await new Promise(async (resolve, reject) => {
          const server = node1.createServer((secretStream) => {
            secretStream.on('open', () => resolve(true));
            secretStream.on('data', (data) =>
              expect(data.toString()).to.equal('hello'),
            );
          });

          await server.listen();

          const node2 = await createNode();
          const secretStream = node2.connect(server.publicKey);
          secretStream.on('error', () => reject(error));
          secretStream.on('open', () => secretStream.write('hello'));
        });

        expect(opened).to.be.true();
      });

      it('should create a server and accept a firewall function', async () => {
        const node1 = await createNode();
        const node2 = await createNode();

        const firewalled = await new Promise(async (resolve, reject) => {
          const server = node1.createServer({
            firewall: (remotePublicKey, remoteHandshakePayload) => {
              expect(remotePublicKey).to.eql(node2.defaultKeyPair.publicKey);
              expect(remoteHandshakePayload).to.eql({
                version: 1,
                error: 0,
                firewall: 0,
                protocols: 3,
                holepunch: null,
                addresses: [],
              });

              resolve(true);
              return true;
            },
            onconnection: (secretStream) => resolve(false),
          });

          await server.listen();

          const secretStream = node2.connect(server.publicKey);
          secretStream.on('error', () => reject(error));
          secretStream.on('open', () => resolve(false));
        });

        expect(firewalled).to.be.true();
      });
    });

    describe('server.close()', () => {
      it('should close the server and keep the node running', async () => {
        const node = await DHT.create({ keyPair });
        const server = node.createServer();
        await server.listen();

        expect(server.closed).to.be.false();
        expect(node.destroyed).to.be.false();

        await server.close();

        expect(server.closed).to.be.true();
        expect(node.destroyed).to.be.false();

        await node.destroy();
        expect(node.destroyed).to.be.true();
      });
    });

    describe('server.listen()', () => {
      it('should listen on the same keyPair as node.defaultKeypair', async () => {
        const node1 = await createNode();

        const opened = await new Promise(async (resolve, reject) => {
          const server = node1.createServer((secretStream) => {
            secretStream.on('open', () => resolve(true));
            secretStream.on('data', (data) =>
              expect(data.toString()).to.equal('hello'),
            );
          });

          await server.listen();

          expect(server.publicKey).to.eql(node1.defaultKeyPair.publicKey);

          const node2 = await createNode();
          const secretStream = node2.connect(server.publicKey);
          secretStream.on('error', () => reject(error));
          secretStream.on('open', () => secretStream.write('hello'));
        });

        expect(opened).to.be.true();
      });

      it('should listen on another keyPair than the node.defaultKeypair', async () => {
        const node1 = await createNode({ keyPair });

        const opened = await new Promise(async (resolve, reject) => {
          const server = node1.createServer((secretStream) => {
            secretStream.on('open', () => resolve(true));
            secretStream.on('data', (data) =>
              expect(data.toString()).to.equal('hello'),
            );
          });

          const customKeyPair = crypto.keyPair(b4a.from('f'.repeat(64), 'hex'));

          await server.listen(customKeyPair);

          expect(server.publicKey).to.eql(customKeyPair.publicKey);
          expect(server.publicKey).to.not.eql(node1.defaultKeyPair.publicKey);

          const node2 = await createNode();
          const secretStream = node2.connect(server.publicKey);
          secretStream.on('error', () => reject(error));
          secretStream.on('open', () => secretStream.write('hello'));
        });

        expect(opened).to.be.true();
      });
    });

    describe('server.on()', () => {
      it('should emit event "connection"', async () => {
        const node1 = await createNode();

        const opened = await new Promise(async (resolve, reject) => {
          const server = node1.createServer((secretStream) => {
            secretStream.on('open', () => resolve(true));
            secretStream.on('data', (data) =>
              expect(data.toString()).to.equal('hello'),
            );
          });

          await server.listen();

          expect(server.publicKey).to.eql(node1.defaultKeyPair.publicKey);

          const node2 = await createNode();
          const secretStream = node2.connect(server.publicKey);
          secretStream.on('error', () => reject(error));
          secretStream.on('open', () => secretStream.write('hello'));
        });

        expect(opened).to.be.true();
      });

      it('should emit event "listening"', async () => {
        const node1 = await createNode();

        const listening = await new Promise(async (resolve, reject) => {
          const server = node1.createServer();

          server.on('listening', () => {
            resolve(true);
          });

          await server.listen();
        });

        expect(listening).to.be.true();
      });

      it('should emit event "close"', async () => {
        const node1 = await createNode();

        const server = node1.createServer();
        await server.listen();

        const closing = await new Promise(async (resolve, reject) => {
          server.on('close', () => resolve(true));
          server.close();
        });

        expect(closing).to.be.true();
      });
    });

    describe('server.address()', () => {
      it('should return correct address interface', async () => {
        const node1 = await createNode({ keyPair });
        const server = node1.createServer();
        await server.listen();

        const address = server.address();

        expect(typeof address.host).to.equal('string');
        expect(typeof address.port).to.equal('number');
        expect(address.publicKey).to.equal(keyPair.publicKey);
      });
    });

    describe('server.publicKey', () => {
      it("should return the server's publicKey", async () => {
        const node1 = await createNode({ keyPair });
        const server = node1.createServer();
        await server.listen();

        expect(server.publicKey).to.equal(keyPair.publicKey);
      });
    });

    // // Skipping until this PR is merged: https://github.com/hyperswarm/dht-relay/pull/3
    // it.skip('should create the same server publicKey deterministically', async () => {
    //   const node = await createNode({ keyPair });

    //   const server = node.createServer();
    //   await server.listen();

    //   expect(server.publicKey).to.eql(
    //     b4a.from(
    //       'd04ab232742bb4ab3a1368bd4615e4e6d0224ab71a016baf8520a332c9778737',
    //       'hex',
    //     ),
    //   );
    // });

    // // Skipping until this issue is resolved: https://github.com/hyperswarm/dht-relay/issues/4
    // it.skip('should listen to the default publicKey if no key was passed', async () => {
    //   const node = await createNode();

    //   const server = node.createServer();
    //   await server.listen();

    //   expect(server.publicKey).to.eql(node.defaultKeyPair.publicKey);
    // });

    // it('should listen to on the given key', async () => {
    //   const node = await createNode();

    //   const server = node.createServer();
    //   await server.listen(keyPair);

    //   expect(server.publicKey).to.eql(
    //     b4a.from(
    //       'd04ab232742bb4ab3a1368bd4615e4e6d0224ab71a016baf8520a332c9778737',
    //       'hex',
    //     ),
    //   );
    // });

    // // it('should connect to a running node', async () => {
    // //   const node = await createNode();
    // //   const secretStream = node.connect(DHT_KEY);

    // //   await new Promise((resolve) => {
    // //     secretStream.on('error', (error) => {
    // //       resolve();
    // //       throw error;
    // //     });
    // //     secretStream.on('open', () => {
    // //       expect(secretStream.remotePublicKey).to.eql(DHT_KEY);

    // //       pushNode(node);
    // //       resolve();
    // //     });
    // //   });
    // // });

    // it("should throw an error if it couldn't find the peer", async () => {
    //   const node = await createNode();
    //   const secretStream = node.connect(b4a.from('0'.repeat(32), 'hex'));

    //   return new Promise((resolve, reject) => {
    //     secretStream.on('error', (error) => {
    //       expect(error.message).to.eql('Could not find peer');
    //       resolve();
    //     });
    //     secretStream.on('open', () => {
    //       expect(true).to.eql(false, 'Should not have opened');
    //       resolve();
    //     });
    //   });
    // });

    // it('should create DHT node and accept a connection from another', async () => {
    //   const node1 = await createNode();
    //   const server = node1.createServer();
    //   await server.listen();

    //   const node2 = await DHT();
    //   const secretStream = node2.connect(server.address().publicKey);

    //   expect(secretStream.remotePublicKey).to.eql(server.address().publicKey);
    //   expect(node1.defaultKeyPair.publicKey).to.not.eql(
    //     node2.defaultKeyPair.publicKey,
    //   );
    //   expect(secretStream.publicKey).to.eql(node2.defaultKeyPair.publicKey);
    // });

    // it('should destroy node', async () => {
    //   const node = await DHT();

    //   expect(node.destroyed).to.eql(false);

    //   await node.destroy();

    //   expect(node.destroyed).to.eql(true);
    // });

    // it('should try relay servers until one is working', async () => {
    //   const node = await DHT({
    //     relays: [INVALID_RELAY_SERVER, VALID_RELAY_SERVER],
    //   });
    //   const secretStream = node.connect(DHT_KEY);

    //   expect(secretStream.remotePublicKey).to.equal(DHT_KEY);

    //   pushNode(node);
    // });

    // it.skip('should throw an error if no relays worked', async () => {
    //   try {
    //     await DHT({ relays: [INVALID_RELAY_SERVER] });
    //   } catch (error) {
    //     expect(error.message).to.equal(
    //       'Could not connect to any of the DHT relays',
    //     );
    //   }
    // });
  });
};
