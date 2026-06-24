import { highwayUpload } from './highway.js';
import common, { calculateSha1StreamBytes, _saveFileToTmpDir } from './Uploadntvideo.js';
import { flashTransferUpload } from './FlashTransfer.js';
import probe from 'probe-image-size';
import crypto from 'crypto';
import pb from '../protobuf/index.js';
import { segment, ChainElemTypes } from '../elements.js';

export function initializeSegment() {
  if (!global.segment) {
    global.segment = {};
  }
  for (const type of ChainElemTypes) {
    if (!global.segment[type] && segment[type] && typeof segment[type] === 'function') {
      global.segment[type] = segment[type];
    }
  }
  return global.segment;
}

initializeSegment();

const TYPE = {
  jpg: 1000,
  png: 1001,
  webp: 1002,
  bmp: 1005,
  gif: 2000,
  face: 4,
};

let req_id = 1;
export const uploadNTImages = async (id, _image, opts) => {
  let resp1 = {};
  let { file, headers, asface, origin, summary, width, height } = _image;
  try {
    if (String(file).startsWith('protobuf://')) return _image;
    file = await Bot.Buffer(file, { headers });
    const size = file.length;
    const { type: type_raw, width: width_raw, height: height_raw } = probe.sync(file);
    if (!width) width = width_raw;
    if (!height) height = height_raw;
    const type = TYPE[type_raw] || 1000;
    const path = await _saveFileToTmpDir(file);
    const [md5, sha1] = await common.fileHash(path);

    const fileInfos = [
      {
        1: {
          1: size,
          2: md5.toString('hex'),
          3: sha1.toString('hex'),
          4: md5.toString('hex') + (type_raw || 'jpg'),
          5: {
            1: 1,
            2: type,
            3: 0,
            4: 0,
          },
          6: width,
          7: height,
          8: 0,
          9: origin ? 1 : 0,
        },
        2: 0,
      },
    ];
    const extBizInfo = {
      10: 0,
      1: {
        1: asface ? 1 : 0,
        2: summary,
        [opts.dm ? 11 : 12]: {
          1: asface ? 1 : 0,
          3: 0,
          4: 0,
          9: summary,
          10: 0,
          34: 0,
        },
      },
    };
    const sceneInfo = {
      101: 2,
      102: 1, // type = 1
      103: 0,
      200: opts.dm ? 1 : 2,
    };

    if (opts.dm) {
      sceneInfo[201] = {
        1: 2,
        2: String(Bot[id].uid),
      };

      if (opts.group_id) {
        sceneInfo[201][3] = {
          3: {
            3: opts.group_id,
            4: sceneInfo[201][2],
          },
        };
      }
    }

    if (!opts.dm) {
      sceneInfo[202] = {
        1: opts.id,
      };
    }

    const proto = {
      1: {
        1: {
          1: req_id++,
          2: 100,
        },
        2: sceneInfo,
        3: {
          1: 2,
        },
      },
      2: {
        1: fileInfos,
        2: 1,
        3: 0,
        4: crypto.randomBytes(4).readUInt32BE(),
        5: opts.dm ? 1 : 2,
        6: extBizInfo,
        7: 0,
        8: 0,
        9: {},
      },
    };

    resp1 = await Bot[id].sendOidbSvcTrpcTcp(`OidbSvcTrpcTcp.0x11c${opts.dm ? '5' : '4'}_100`, proto);
    const sha1Stream = await calculateSha1StreamBytes(path);
    //const readable = common.Getreadable(path);

    if (resp1[2]?.[1]) {
      /*
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
          1: sha1Stream,
        },
      });
      await highwayUpload(
        readable,
        {
          cmdid: opts.isGroup ? 1004 : 1003,
          md5,
          size,
          ext,
        },
        params
      );
      */
     const ukey = resp1[2]?.[1]
     const appid = opts.isGroup ? 1407 : 1406
     await flashTransferUpload(file, ukey, appid);
    }
  } catch (e) {
    logger.warn('图片上传失败：' + e);
  }
  const _body = {
    1: 48,
    2: resp1?.[2]?.[6],
    3: opts.dm ? 10 : 20,
  };
  return {
    code: resp1?.[2]?.[6] ? 0 : 1,
    type: 'image',
    file: 'protobuf://' + Buffer.from(pb.encode(_body)).toString('base64'),
    nt: true,
    asface,
    origin,
    summary,
    width,
    height,
  };
};

function int32ip2str(ip) {
  if (typeof ip === 'string') return ip;
  ip = ip & 0xffffffff;
  return [ip & 0xff, (ip & 0xff00) >> 8, (ip & 0xff0000) >> 16, ((ip & 0xff000000) >> 24) & 0xff].join('.');
}
