import net from 'net';
import http from 'http';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import internal from 'stream';

const WS_MAGIC_STRING = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export type TPlugServerConfig = {
    port: number;
    host: string;
};

enum PlugErrorType {
    BAD_REQUEST = 400,
}

class PlugError implements Error {
    name = 'PlugError';
    message: string;
    type: PlugErrorType;

    constructor(type: PlugErrorType) {
        this.type = type;
        if (type === PlugErrorType.BAD_REQUEST) {
            this.message = 'Bad request';
        }
        this.message = '';
    }

    get code() {
        return this.type;
    }
}

function Utf8ArrayToStr(array: Uint8Array) {
    var out, i, len, c;
    var char2, char3;

    out = '';
    len = array.length;
    i = 0;
    while (i < len) {
        c = array[i++];
        switch (c >> 4) {
            case 0:
            case 1:
            case 2:
            case 3:
            case 4:
            case 5:
            case 6:
            case 7:
                // 0xxxxxxx
                out += String.fromCharCode(c);
                break;
            case 12:
            case 13:
                // 110x xxxx   10xx xxxx
                char2 = array[i++];
                out += String.fromCharCode(((c & 0x1f) << 6) | (char2 & 0x3f));
                break;
            case 14:
                // 1110 xxxx  10xx xxxx  10xx xxxx
                char2 = array[i++];
                char3 = array[i++];
                out += String.fromCharCode(((c & 0x0f) << 12) | ((char2 & 0x3f) << 6) | ((char3 & 0x3f) << 0));
                break;
        }
    }

    return out;
}

/**
 * Connection class to read and write frames to the socket
 */
class PlugConnection {
    id: string

    constructor(id: string) {
        this.id = id;
    }

    send(message: string) {
        /**
       * Frame format:

            0                   1                   2                   3
            0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
          +-+-+-+-+-------+-+-------------+-------------------------------+
          |F|R|R|R| opcode|M| Payload len |    Extended payload length    |
          |I|S|S|S|  (4)  |A|     (7)     |             (16/64)           |
          |N|V|V|V|       |S|             |   (if payload len==126/127)   |
          | |1|2|3|       |K|             |                               |
          +-+-+-+-+-------+-+-------------+ - - - - - - - - - - - - - - - +
          |     Extended payload length continued, if payload len == 127  |
          + - - - - - - - - - - - - - - - +-------------------------------+
          |                               |Masking-key, if MASK set to 1  |
          +-------------------------------+-------------------------------+
          | Masking-key (continued)       |          Payload Data         |
          +-------------------------------- - - - - - - - - - - - - - - - +
          :                     Payload Data continued ...                :
          + - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - +
          |                     Payload Data continued ...                |
          +---------------------------------------------------------------+

      */
        //   const payload = Uint8Array.from([129])
        const payload = new ArrayBuffer(16)
            const content_length = message.length

            if (content_length <= 125) {
            payload.push(content_length)
            } else if (content_length < 2**16) {
            const buffer = new ArrayBuffer(2)
            const uint16_buffer = new Uint16Array(buffer)
            uint16_buffer[0] = content_length
            payload.push(126, uint16_buffer[0])
            } else {
            const maxUInt64 = BigInt("18446744073709551615");
            }

            payload.push()
            
    }

    receive(req: Buffer) {
        let i = 0;
        const bytes = Array.from(req).map(b => parseInt(b.toString(2), 2));
        const nextByte = () => {
            const ret = bytes[i];
            i += 1;
            return ret;
        };
        const readBytes = (count: number): number[] => {
            const ret = bytes.slice(i, count + i + 1);
            i += count;
            return ret;
        };

        const fin_opcode = nextByte();
        const is_fin = fin_opcode >>> 7 === 1;
        const masked_length_indicator = nextByte();
        const is_masked = masked_length_indicator >>> 7 === 1;
        // strip off the first bit (masking bit) to get content length using XOR operation
        const length_indicator = masked_length_indicator ^ 0x80;

        let content_length, encoded_content;
        let masking_key: number[];

        // Read bits 9-15 (inclusive) and interpret that as an unsigned integer. If it's 125 or less, then that's the length
        if (length_indicator <= 125) {
            content_length = length_indicator;
        } else if (length_indicator === 126) {
            // Read the next 16 bits and interpret those as 16-bit unsigned integer
            content_length =
                parseInt(
                    readBytes(2)
                        .map(b => b.toString(2))
                        .join(''),
                    2
                ) & 0xffff;
        } else {
            // Read the next 64 bits and interpret those as 64-bit unsigned integer. (The most significant bit must be 0.)
            content_length =
                parseInt(
                    readBytes(8)
                        .map(b => b.toString(2))
                        .join(''),
                    2
                ) & 0xffffffffffffffff;
        }

        masking_key = readBytes(4);
        encoded_content = readBytes(content_length);

        // to unmask the content, loop through the masking key
        const decoded_content = Utf8ArrayToStr(Uint8Array.from(encoded_content, (elt, i) => elt ^ masking_key[i % 4]));
        console.log(`[Plug] content_length=${content_length} fin=${is_fin} masked=${is_masked} msg=${decoded_content}`);
        return decoded_content;
    }
}

class PlugServer {
    private server: http.Server;
    private config: TPlugServerConfig;
    private clients: Map<string, PlugConnection>;

    constructor(options: TPlugServerConfig) {
        this.server = http.createServer();
        this.config = options;
        this.clients = new Map();
    }

    handshake(req: http.IncomingMessage) {
        /**
     *  GET /chat HTTP/1.1
        Host: example.com:8000
        Upgrade: websocket
        Connection: Upgrade
        Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
        Sec-WebSocket-Version: 13
     */

        const headers = req.headers;
        const method = req.method;
        const ws_key = headers['sec-websocket-key'];

        if (method === 'GET') {
            const ws_accept = `${ws_key}${WS_MAGIC_STRING}`;
            const shasum = crypto.createHash('sha1');
            shasum.update(ws_accept);
            const ws_accept_hash = shasum.digest('base64');
            return (
                'HTTP/1.1 101 Web Socket Protocol Handshake\r\n' +
                'Upgrade: websocket\r\n' +
                'Connection: Upgrade\r\n' +
                `Sec-WebSocket-Accept: ${ws_accept_hash}\r\n` +
                '\r\n'
            );
        } else {
            throw new PlugError(PlugErrorType.BAD_REQUEST);
        }
    }

    async accept() {
        this.server.on('upgrade', (req, socket, head) => {
            try {
                const response = this.handshake(req);
                console.log(`[Plug] Handshake accepted!`);
                socket.write(response);

                const conn_id = uuidv4()
                const conn = new PlugConnection(conn_id)
                this.clients.set(conn_id, conn);
                socket.pipe(socket);
            } catch (err) {
                socket.write(
                    'HTTP/1.1 400 Bad Request\r\n' +
                        'Content-Type: text/plain\r\n' +
                        'Connection: close\r\n' +
                        '\r\n' +
                        'Incorrect Request'
                );
                socket.pipe(socket);
            }
        });

        this.server.on('connection', socket => {
            socket.on('data', req => {
                this.clients.get('123')?.receive(req)
            });
        });

        this.server.listen(this.config.port, () => {
            console.log(`[Plug] Listening on port ${this.config.port}...`);
        });
    }
}

export default PlugServer;
