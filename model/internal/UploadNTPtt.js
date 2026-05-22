import crypto from 'crypto';
import { tmpdir } from 'os';
import path from 'path';
import { highwayUpload } from './highway.js';
import toSilk from './transform/toSilk.js';
import { getDuration } from './transform/silk-duration.js';
import { calculateSha1StreamBytes } from './Uploadntvideo.js';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import fs from 'fs';
import axios from 'axios';
import pb from '../protobuf/index.js';

const IS_WIN = process.platform === 'win32';
const TMP_DIR = tmpdir();

function uuid() {
  const hex = crypto.randomBytes(16).toString('hex');
  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
}

class DownloadTransform extends Transform {
  _size = 0;

  _transform(chunk, encoding, callback) {
    this._size += chunk.length;
    if (this._size <= 35 * 1024 * 1024) {
      this.push(chunk);
      callback();
    } else {
      callback(new Error('File exceeds 35MB limit'));
    }
  }
}

let common = {
  fileHash: async (filepath) => {
    const readable = fs.createReadStream(filepath);
    const md5 = await new Promise((resolve, reject) => {
      const hash = crypto.createHash('md5');
      readable.on('data', (chunk) => hash.update(chunk));
      readable.on('end', () => resolve(hash.digest()));
      readable.on('error', reject);
    });
    const sha1 = await new Promise((resolve, reject) => {
      const readable = fs.createReadStream(filepath);
      const hash = crypto.createHash('sha1');
      readable.on('data', (chunk) => hash.update(chunk));
      readable.on('end', () => resolve(hash.digest()));
      readable.on('error', reject);
    });
    return [md5, sha1];
  },
};

export const uploadPtt = async (id, elem, opts, transcoding = true, isAI = true, bs = true) => {
  logger.debug(`开始语音任务`);

  if (typeof elem.file === 'string' && elem.file.startsWith('protobuf://')) {
    return elem;
  }

  try {
    let { file, temp = false } = elem;
    if (file instanceof Buffer) {
      file = await _saveFileToTmpDir(file);
      temp = true;
    } else {
      file = file;
      if (file.startsWith('base64://')) {
        file = await _saveFileToTmpDir(file);
        temp = true;
      } else if (file.startsWith('protobuf://')) {
        return _video;
      } else if (file.startsWith('https://') || file.startsWith('http://')) {
        file = await _downloadFileToTmpDir(file);
        temp = true;
      }
      file = file.replace(/^file:\/{2}/, '');
      IS_WIN && file.startsWith('/') && (file = file.slice(1));
    }
    const silkFile = await toSilk(file);
    let result = Math.ceil(((await getDuration(silkFile)) || 0) / 1000);
    if (!elem?.seconds && result) elem.seconds = result;
    let buf = transcoding ? silkFile : file;

    let recordsize;
    let readable;
    let md5, sha;
    let sha1FilePath;

    if (transcoding) {
      recordsize = silkFile.length;
      const tempFilePath = path.join(TMP_DIR, uuid());
      await fs.promises.writeFile(tempFilePath, silkFile);
      sha1FilePath = tempFilePath;

      readable = fs.createReadStream(tempFilePath);
      [md5, sha] = await common.fileHash(tempFilePath);
      readable.on('close', () => {
        fs.promises.unlink(tempFilePath).catch(() => {});
      });
    } else {
      recordsize = (await fs.promises.stat(buf)).size;
      readable = fs.createReadStream(buf);
      [md5, sha] = await common.fileHash(buf);
      sha1FilePath = buf;
    }

    const body = {
      1: {
        // head
        1: {
          1: 1, //req id
          2: 100, //command
        },
        // scene
        2: {
          101: 2, //req type
          102: 3, //business type
          103: 0,
          200: opts.isGroup ? 2 : 1, // scene type 1:c2c 2:group
          ...(opts.isGroup
            ? {
                202: {
                  1: opts.id,
                },
              }
            : {
                201: {
                  1: 2,
                  2: String(Bot[id].uid),
                },
              }),
        },
        // client
        3: {
          1: 2,
        }, // agent type
      },
      // body
      2: {
        // files
        1: {
          1: {
            1: recordsize,
            2: md5.toString('hex'),
            3: sha.toString('hex'),
            4: md5.toString('hex') + '.amr',
            5: {
              1: 3,
              2: 0,
              3: 0,
              4: 1,
            },
            6: 0,
            7: 0,
            8: elem.seconds || 10,
            9: 0,
          },
          2: 0,
        },
        2: 1,
        3: 0,
        4: crypto.randomBytes(4).readUInt32BE(),
        5: opts.isGroup ? 2 : 1,
        6: {
          1: {
            1: 0,
            2: {},
          },
          2: {
            3: {},
          },
          3: {
            11: '',
            12: {},
          },
          ...(opts.isGroup
            ? {}
            : {
                10: 0,
              }),
        },
        7: 0,
        8: 1,
        9: {},
      },
    };

    const resp1 = await Bot[id].sendOidbSvcTrpcTcp(opts.isGroup ? 'OidbSvcTrpcTcp.0x126E_100' : 'OidbSvcTrpcTcp.0x126d_100', body);
    let sha1 = await calculateSha1StreamBytes(sha1FilePath);

    if (resp1[2]?.[1]) {
      const params = {
        uin: id,
        apk: {
          subid: Bot[id].apk.subid,
        },
        useHttp: false,
        sig: {
          bigdata: Bot[id].sig.bigdata,
        },
      };

      const ext = pb.encode({
        1: resp1[2][6][1][1][2],
        2: resp1[2][1],
        5: {
          1: resp1[2][3].map((x) => ({
            1: {
              1: 1,
              2: int32ip2str(x[1]),
            },
            2: x[2],
          })),
        },
        6: resp1[2][6][1],
        10: 1024 * 1024,
        11: {
          1: sha1,
        },
      });
      await highwayUpload(
        readable,
        {
          cmdid: opts.isGroup ? 1008 : 1007,
          md5,
          size: recordsize,
          ext,
        },
        params
      );
    }

    const protobuf = pb.encode({
      1: 48,
      2: {
        1: {
          1: resp1[2][6][1][1],
          5: 0,
          6: '',
        },
        2: {
          1: {
            1: 0,
            2: '',
          },
          2: {
            3: '',
          },
          3: {
            1: id,
            2: 2,
            5: {
              1: 15,
              2: 'Powered By 堀学长',
            },
            11: '',
            12: {
              ...(bs
                ? {
                    1: 1,
                  }
                : {
                    1: 0,
                  }),
              7: 0,
              ...(isAI
                ? {
                    9: 1,
                  }
                : {}),
            },
          },
          10: 3,
        },
      },
      3: opts.isGroup ? 22 : 12,
    });

    return {
      type: 'record',
      file: 'protobuf://' + Buffer.from(protobuf).toString('base64'),
    };
  } catch (error) {
    throw error;
  }
};

async function _saveFileToTmpDir(file) {
  const buf = file instanceof Buffer ? file : Buffer.from(file.slice(9), 'base64');
  const savePath = path.join(TMP_DIR, uuid());
  await fs.promises.writeFile(savePath, buf);
  return savePath;
}

async function _downloadFileToTmpDir(url, headers = {}) {
  const savePath = path.join(TMP_DIR, uuid());

  try {
    const response = await axios.get(url, {
      headers,
      responseType: 'stream',
    });

    await pipeline(response.data, new DownloadTransform(), fs.createWriteStream(savePath));

    return savePath;
  } catch (err) {
    try {
      await fs.promises.unlink(savePath);
    } catch {}
    throw err;
  }
}

function int32ip2str(ip) {
  if (typeof ip === 'string') return ip;
  ip = ip & 0xffffffff;
  return [ip & 0xff, (ip & 0xff00) >> 8, (ip & 0xff0000) >> 16, ((ip & 0xff000000) >> 24) & 0xff].join('.');
}
