import { highwayUpload } from './highway.js';
import fs from 'fs';
import path from 'path';
import stream from 'stream';
import crypto from 'crypto';
import common from './Uploadntvideo.js';
import pb from '../protobuf/index.js';

export const UploadGroupfile = async (id, file, name, pid = '/', opts) => {
  let size, md5, sha1, readable;
  if (file instanceof Uint8Array) {
    const fileBuffer = Buffer.isBuffer(file) ? file : Buffer.from(file);
    size = fileBuffer.length;
    md5 = common.md5(fileBuffer);
    sha1 = common.sha(fileBuffer);
    name = name ? String(name) : 'file' + md5.toString('hex');
  } else {
    const filePath = String(file);
    size = (await fs.promises.stat(filePath)).size;
    [md5, sha1] = await common.fileHash(filePath);
    readable = common.Getreadable(filePath);
    name = name ? String(name) : path.basename(filePath);
  }

  const body = {
    1: {
      1: opts.group_id,
      2: 3,
      3: 102,
      4: 6,
      5: String(pid),
      6: name,
      7: '/storage/emulated/0/Pictures/files/s/' + name,
      8: size,
      9: sha1,
      11: md5,
      15: 1,
    },
  };
  const payload = await Bot[id].sendOidbSvcTrpcTcp('OidbSvcTrpcTcp.0x6d6_0', body, false);
  let rsp = payload[1];
  if (rsp[1] === -403) {
    body[1][3] = 104;
    const payload = await Bot[id].sendOidbSvcTrpcTcp('OidbSvcTrpcTcp.0x6d6_0', body, false);
    rsp = payload[1];
  }
  common.checkRsp(rsp);
  if (!rsp[10]) {
    const ext = pb.encode({
      1: 100,
      2: 1,
      3: 0,
      100: {
        100: {
          1: rsp[6],
          100: id,
          200: opts.group_id,
          400: opts.group_id,
        },
        200: {
          100: size,
          200: md5,
          300: sha1,
          600: rsp[7],
          700: rsp[9],
        },
        300: {
          100: 2,
          200: String(Bot[id].apk.subid),
          300: 2,
          400: '9e9c09dc',
          600: 4,
        },
        400: {
          100: name,
        },
        500: {
          200: {
            1: {
              1: 1,
              2: rsp[12],
            },
            2: rsp[14],
          },
        },
      },
    });
    const params = {
      uin: id,
      apk: {
        subid: Bot[id].apk.subid,
      },
      useHttp: false,
      sig: {
        bigdata: Bot[id].sig?.bigdata,
      },
    };

    let uploadStream = readable;
    if (!readable) {
      if (Buffer.isBuffer(file)) {
        uploadStream = stream.Readable.from(file, {
          objectMode: false,
        });
      } else {
        uploadStream = fs.createReadStream(String(file), {
          highWaterMark: 1024 * 256,
        });
      }
    }
    const uploadParams = {
      cmdid: 71,
      md5,
      size,
      ext,
    };

    await highwayUpload(uploadStream, uploadParams, params);
  }
  return await _feed(String(rsp[7]), rsp[6], opts, id);
};

export const UploadFriendfile = async (id, file, filename, opts) => {
  let filesize, filemd5, filesha, filestream;
  if (file instanceof Uint8Array) {
    if (!Buffer.isBuffer(file)) file = Buffer.from(file);
    filesize = file.length;
    ((filemd5 = common.md5(file)), (filesha = common.sha(file)));
    filename = filename ? String(filename) : 'file' + filemd5.toString('hex');
    filestream = stream.Readable.from(file, {
      objectMode: false,
      highWaterMark: 524288,
    });
  } else {
    file = String(file);
    filesize = (await fs.promises.stat(file)).size;
    [filemd5, filesha] = await common.fileHash(file);
    filename = filename ? String(filename) : path.basename(file);
    filestream = fs.createReadStream(file, {
      highWaterMark: 524288,
    });
  }
  const body1700 = pb.encode({
    1: 1700,
    2: 6,
    19: {
      10: id,
      20: opts.user_id,
      30: filesize,
      40: filename,
      50: filemd5,
      60: filesha,
      70: '/storage/emulated/0/Android/data/com.tencent.mobileqq/Tencent/QQfile_recv/' + filename,
      80: 0,
      90: 0,
      100: 0,
      110: filemd5,
    },
    101: 3,
    102: 104,
    200: 1,
  });
  const payload = await Bot[id].sendUni('OfflineFilleHandleSvr.pb_ftn_CMD_REQ_APPLY_UPLOAD_V3-1700', body1700, false);
  const rsp1700 = payload[19];
  if (rsp1700[10] !== 0) drop(rsp1700[10], rsp1700[20]);
  const fid = rsp1700[90].toBuffer();

  if (!rsp1700[110]) {
    const ext = pb.encode({
      1: 100,
      2: 2,
      100: {
        100: {
          1: 3,
          100: id,
          200: opts.user_id,
          400: 0,
          700: payload,
        },
        200: {
          100: filesize,
          200: filemd5,
          300: filesha,
          400: filemd5,
          600: fid,
          700: rsp1700[220].toBuffer(),
        },
        300: {
          100: 2,
          200: String(Bot[id].apk.subid),
          300: 2,
          400: 'd92615c5',
          600: 4,
        },
        400: {
          100: filename,
        },
      },
      200: 1,
    });
    const params = {
      uin: id,
      apk: {
        subid: bot?.apk?.subid ?? '537294924',
      },
      useHttp: false,
      sig: {
        bigdata: Bot[id].sig?.bigdata,
      },
    };

    await highwayUpload(
      filestream,
      {
        md5: filemd5,
        size: filesize,
        cmdid: 69,
        ext,
      },
      params
    );
  }
  const body800 = pb.encode({
    1: 800,
    2: 7,
    10: {
      10: id,
      20: opts.user_id,
      30: fid,
    },
    101: 3,
    102: 104,
  });
  await Bot[id].sendUni('OfflineFilleHandleSvr.pb_ftn_CMD_REQ_UPLOAD_SUCC-800', body800, false);
  const proto3 = {
    2: {
      1: {
        1: 0,
        3: fid,
        4: filemd5,
        5: filename,
        6: filesize,
        9: 1,
      },
    },
  };
  await _sendMsg(proto3, `[文件：${filename}]`, opts, id);
  return String(fid);
};

async function _sendMsg(proto3, brief, opts, id) {
  const packet = {
    1: { 15: { 1: opts.user_id, 2: 4 } },
    2: pb.encode({ 1: 1, 2: 0, 3: 0 }),
    3: proto3,
    4: Bot[id].sig.seq,
    5: (0, crypto.randomBytes)(4).readUInt32BE(),
    6: (0, crypto.randomBytes)(4).readUInt32BE(),
  };
  await Bot[id].sendUni('MessageSvc.PbSendMsg', pb.encode(packet));
  Bot.makeLog('info', `succeed to send: [Private(${opts.user_id})] ` + brief, id);
}

const ErrorMessage = {
  [-1]: '客户端离线', // ClientNotOnline
  [-2]: '发包超时未收到服务器回应', // PacketTimeout
  [-10]: '查无此人', // UserNotExists
  [-20]: '未加入的群', // GroupNotJoined
  [-30]: '幽灵群员', // MemberNotExists
  [-60]: '发消息时传入的参数不正确', // MessageBuilderError
  [-70]: '群消息发送失败，可能被风控', // RiskMessageError
  [-80]: '群消息发送失败，请检查消息内容', // SensitiveWordsError
  [-90]: '签名api异常', // SignApiError
  [-110]: '上传图片/文件/视频等数据超时', // HighwayTimeout
  [-120]: '上传图片/文件/视频等数据遇到网络错误', // HighwayNetworkError
  [-130]: '没有上传通道', // NoUploadChannel
  [-140]: '不支持的file类型(没有流)', // HighwayFileTypeError
  [-150]: '文件安全校验未通过', // UnsafeFile
  [-160]: '离线(私聊)文件不存在', // OfflineFileNotExists
  [-170]: '群文件不存在(无法转发)', // GroupFileNotExists
  [-210]: '获取视频中的图片失败', // FFmpegVideoThumbError
  [-220]: '音频转换失败', // FFmpegPttTransError
  10: '消息过长',
  34: '消息过长',
  120: '在该群被禁言',
  121: 'AT全体剩余次数不足',
};

class ApiRejection extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function drop(code, message) {
  if (!message || !message.length) message = ErrorMessage[code];
  throw new ApiRejection(code, message);
}

async function _feed(fid, busid, opts, id) {
  const body = pb.encode({
    5: {
      1: opts.group_id,
      2: 4,
      3: {
        1: busid,
        2: fid,
        3: (0, crypto.randomBytes)(4).readInt32BE(),
        5: 1,
      },
    },
  });
  const payload = await Bot[id].sendOidbSvcTrpcTcp('OidbSvcTrpcTcp.0x6d9_4', body, false);
  let rsp = payload[5];
  common.checkRsp(rsp);
  rsp = rsp[4];
  common.checkRsp(rsp);
  return await _resolve(rsp[3], opts, id);
}

export async function stat(id, fid, opts) {
  try {
    return await _resolve(fid, opts, id);
  } catch (e) {
    const files = await dir(id, (pid = '/'), 0, 100, opts);
    for (let file of files) {
      if (!file.is_dir) break;
      if (file.fid === fid) return file;
    }
    throw e;
  }
}

export async function forward(id, stat, pid = '/', name, opts) {
  const body = {
    1: {
      1: opts.group_id,
      2: 3,
      3: 102,
      4: 5,
      5: String(pid),
      6: String(name || stat.name),
      7: '/storage/emulated/0/Pictures/files/s/' + (name || stat.name),
      8: Number(stat.size),
      9: Buffer.from(stat.sha1, 'hex'),
      11: Buffer.from(stat.md5, 'hex'),
      15: 1,
    },
  };
  const payload = await Bot[id].sendOidbSvcTrpcTcp('OidbSvcTrpcTcp.0x6d6_0', body, false);
  let rsp = payload[1];
  if (rsp[1] === -403) {
    body[1][3] = 104;
    const payload = await Bot[id].sendOidbSvcTrpcTcp('OidbSvcTrpcTcp.0x6d6_0', body, false);
    rsp = payload[1];
  }
  common.checkRsp(rsp);
  if (!rsp[10]) drop(-170, '文件不存在，无法被转发');
  return await _feed(String(rsp[7]), rsp[6], opts, id);
}

export async function mv(id, fid, pid, opts) {
  const file = await _resolve(fid, opts, id);
  const body = pb.encode({
    6: {
      1: opts.group_id,
      2: 5,
      3: file.busid,
      4: file.fid,
      5: file.pid,
      6: String(pid),
    },
  });
  const payload = await Bot[id].sendOidbSvcTrpcTcp('OidbSvcTrpcTcp.0x6d6_5', body, false);
  const rsp = payload[6];
  common.checkRsp(rsp);
  return true;
}

export async function rename(id, fid, name, opts) {
  fid = String(fid);
  let rsp;
  if (!fid.startsWith('/')) {
    //rename file
    const file = await _resolve(fid, opts, id);
    const body = pb.encode({
      5: {
        1: opts.group_id,
        2: 4,
        3: file.busid,
        4: file.fid,
        5: file.pid,
        6: String(name),
      },
    });
    const payload = await Bot[id].sendOidbSvcTrpcTcp('OidbSvcTrpcTcp.0x6d6_4', body, false);
    rsp = payload[5];
  } else {
    //rename dir
    const body = pb.encode({
      3: {
        1: opts.group_id,
        2: 2,
        3: String(fid),
        4: String(name),
      },
    });
    const payload = await Bot[id].sendOidbSvcTrpcTcp('OidbSvcTrpcTcp.0x6d7_2', body, false);
    rsp = payload[3];
  }
  common.checkRsp(rsp);
  return true;
}

export async function download(id, fid, opts) {
  const file = await _resolve(fid, opts, id);
  const body = pb.encode({
    3: {
      1: opts.group_id,
      2: 3,
      3: file.busid,
      4: file.fid,
    },
  });
  const payload = await Bot[id].sendOidbSvcTrpcTcp('OidbSvcTrpcTcp.0x6d6_2', body, false);
  const rsp = payload[3];
  common.checkRsp(rsp);
  return {
    name: file.name,
    url: encodeURI(`http://${rsp[5]}/ftn_handler/${rsp[6].toHex()}/?fname=${file.name}`),
    size: file.size,
    md5: file.md5,
    duration: file.duration,
    fid: file.fid,
  };
}

export async function ls(id, pid = '/', start = 0, limit = 100, opts) {
  return dir(id, pid, start, limit, opts);
}

export async function dir(id, pid = '/', start = 0, limit = 100, opts) {
  const body = pb.encode({
    2: {
      1: opts.group_id,
      2: 1,
      3: String(pid),
      5: Number(limit) || 100,
      13: Number(start) || 0,
    },
  });
  const payload = await Bot[id].sendOidbSvcTrpcTcp('OidbSvcTrpcTcp.0x6d8_1', body, false);
  const rsp = payload[2];
  common.checkRsp(rsp);
  const arr = [];
  if (!rsp[5]) return arr;
  const files = Array.isArray(rsp[5]) ? rsp[5] : [rsp[5]];
  for (let file of files) {
    if (file[3]) arr.push(genGfsFileStat(file[3]));
    else if (file[2]) arr.push(genGfsDirStat(file[2]));
  }
  return arr;
}

export async function df(id, opts) {
  const [a, b] = await Promise.all([
    (async () => {
      const body = pb.encode({
        4: {
          1: opts.group_id,
          2: 3,
        },
      });
      const payload = await Bot[id].sendOidbSvcTrpcTcp('OidbSvcTrpcTcp.0x6d8_3', body, false);
      const rsp = payload[4];
      const total = Number(rsp[4]),
        used = Number(rsp[5]),
        free = total - used;
      return {
        /** 总空间 */
        total,
        /** 已使用的空间 */
        used,
        /** 剩余空间 */
        free,
      };
    })(),
    (async () => {
      const body = pb.encode({
        3: {
          1: opts.group_id,
          2: 2,
        },
      });
      const payload = await Bot[id].sendOidbSvcTrpcTcp('OidbSvcTrpcTcp.0x6d8_2', body, false);
      const rsp = payload[3];
      const file_count = Number(rsp[4]),
        max_file_count = Number(rsp[6]);
      return {
        /** 文件数 */
        file_count,
        /** 文件数量上限 */
        max_file_count,
      };
    })(),
  ]);
  return Object.assign(a, b);
}

export async function mkdir(id, name, opts) {
  const body = pb.encode({
    1: {
      1: opts.group_id,
      2: 0,
      3: '/',
      4: String(name),
    },
  });
  const payload = await Bot[id].sendOidbSvcTrpcTcp('OidbSvcTrpcTcp.0x6d7_0', body, false);
  const rsp = payload[1];
  common.checkRsp(rsp);
  return genGfsDirStat(rsp[4]);
}

function genGfsDirStat(file) {
  return {
    fid: String(file[1]),
    pid: String(file[2]),
    name: String(file[3]),
    create_time: file[4],
    modify_time: file[5],
    user_id: file[6],
    file_count: file[8] || 0,
    is_dir: true,
  };
}

export async function rm(id, fid, opts) {
  fid = String(fid);
  let rsp;
  if (!fid.startsWith('/')) {
    //rm file
    const file = await _resolve(fid, opts, id);
    const body = pb.encode({
      4: {
        1: opts.group_id,
        2: 3,
        3: file.busid,
        4: file.pid,
        5: file.fid,
      },
    });
    const payload = await Bot[id].sendOidbSvcTrpcTcp('OidbSvcTrpcTcp.0x6d6_3', body, false);
    rsp = payload[4];
  } else {
    //rm dir
    const body = pb.encode({
      2: {
        1: opts.group_id,
        2: 1,
        3: String(fid),
      },
    });
    const payload = await Bot[id].sendOidbSvcTrpcTcp('OidbSvcTrpcTcp.0x6d7_1', body, false);
    rsp = payload[2];
  }
  common.checkRsp(rsp);
  return true;
}

export async function _resolve(fid, opts, id) {
  const body = pb.encode({
    1: {
      1: opts.group_id,
      2: 0,
      4: String(fid),
    },
  });
  const payload = await Bot[id].sendOidbSvcTrpcTcp('OidbSvcTrpcTcp.0x6d8_0', body, false);
  const rsp = payload[1];
  return genGfsFileStat(rsp[4]);
}

function genGfsFileStat(file) {
  const stat = {
    fid: String(file[1]),
    pid: String(file[16]),
    name: String(file[2]),
    busid: file[4],
    size: file[5],
    md5: file[12]?.toHex(),
    sha1: file[10]?.toHex(),
    create_time: file[6],
    duration: file[7],
    modify_time: file[8],
    user_id: file[15],
    download_times: file[9],
    is_dir: false,
  };
  if (stat.fid.startsWith('/')) stat.fid = stat.fid.slice(1);
  return stat;
}
