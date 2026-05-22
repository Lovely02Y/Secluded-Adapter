import { flashTransferUpload, calculateSha1StreamBytes } from './FlashTransfer.js';
import crypto from 'crypto';
import pb from '../protobuf/index.js';
import path from 'path';

function uuid() {
  const hex = crypto.randomBytes(16).toString('hex');
  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
}

let ids = 1;
export const UploadflashTransfer = async (id, files, opts = {}) => {
  !Array.isArray(files) && (files = [files]);
  const filelists = [];
  for (const _file of files) {
    const uid = uuid();
    let name;
    try {
      name = _file.name || path.basename(String(_file.file));
    } catch {
      name = `${Bot[id].nickname}的闪传`;
    }
    const buffer = await Bot.Buffer(_file.file, opts);
    const size = buffer.length;
    const sha1States = await calculateSha1StreamBytes(buffer);
    const sha1 = sha1States.at(-1);
    const file_type = _file.file_type || getFileSubTypeByBuffer(buffer);
    filelists.push({
      buffer,
      name,
      size,
      sha1: sha1.toString('hex'),
      uid,
      sha1States,
      file_type,
    });
  }
  let flashTransfer_name = '',
    allsize = 0;
  filelists.forEach((file, index) => {
    const name = file.name;
    if (index === 0) {
      flashTransfer_name = name;
    } else if (!flashTransfer_name.includes(name)) {
      flashTransfer_name += `、${name}`;
    }
    allsize += file.size;
  });

  opts.flash_name && (flashTransfer_name = opts.flash_name);

  const proto1 = {
    1: 37839,
    2: 1,
    4: {
      1: 1,
      2: {
        2: flashTransfer_name,
        3: flashTransfer_name,
        4: filelists.length,
        5: allsize,
        10: {
          1: Bot[id].uid,
          2: Bot[id].nickname,
          3: {},
          4: {},
        },
        16: 1,
        20: 0,
        21: 0,
        23: 0,
      },
      3: 14,
    },
    12: 1,
  };

  const rsp1 = await Bot[id].sendUni(`OidbSvcTrpcTcp.0x93cf_1`, pb.encode(proto1));
  const flash_id = rsp1[4][1],
    expired = rsp1[4][4],
    flash_url = rsp1[4][3];
  const flash_file = [];
  filelists.forEach((file) => {
    flash_file.push({
      1: flash_id,
      2: file.uid,
      3: 0,
      4: {},
      5: 1,
      6: 1,
      7: file.file_type || 11, // file_type
      8: file.name,
      9: file.name,
      10: 0,
      11: file.size,
      12: 0,
    });
  });
  const proto2 = {
    1: 37840,
    2: 1,
    4: {
      1: 1,
      2: flash_id,
      3: flash_id,
      4: flash_file,
      5: 1,
      6: 1,
    },
    12: 1,
  };
  await Bot[id].sendUni(`OidbSvcTrpcTcp.0x93d0_1`, pb.encode(proto2));
  const { result_cover, result_preview } = await Uploardflashimage(id, flash_id, opts); // 上传封面和预览图
  if (opts.send) {
    const group_id = opts.group_id,
      user_id = opts.user_id,
      isGroup = opts.isGroup;
    const user_uid = String(Bot[id].fl.get(user_id)?.user_uid);
    const proto3 = {
      1: 37847,
      2: 1,
      4: {
        1: {
          1: isGroup ? 2 : 1,
          ...(isGroup
            ? {
                3: {
                  1: group_id,
                },
              }
            : {
                2: {
                  1: user_uid,
                },
              }),
        },
        2: flash_id,
      },
      12: isGroup ? 1 : 0,
    };
    if (!isGroup && !user_uid.startsWith('u_')) {
      logger.warn('无效的好友 uid: ' + user_uid + `(${user_id})`);
    } else {
      await Bot[id].sendUni(`OidbSvcTrpcTcp.0x93d7_1`, pb.encode(proto3));
    }
  }
  const result_files = [];
  for (const _file of filelists) result_files.push(await UpLoadFiles(id, _file.buffer, flash_id, _file.uid, _file.sha1, _file.name, 22, {}, _file.file_type));
  return {
    flash_id,
    expired,
    flash_url,
    result_cover,
    result_preview,
    result_files,
  };
};

async function Uploardflashimage(id, flash_id, opts = {}) {
  let image = opts?.image || null;
  !image && (image = segment.image(`https://q.qlogo.cn/g?b=qq&s=0&nk=${id}`));
  const buffer = await Bot.Buffer(image.file, opts);
  const sha1 = crypto.createHash('sha1').update(buffer).digest('hex');
  const md5 = crypto.createHash('md5').update(buffer).digest('hex');
  const name = image.name || `${md5}.png`;
  const uid = uuid();
  const result_cover = await UpLoadFiles(id, buffer, flash_id, uid, sha1, name, 23, md5);
  const result_preview = await UpLoadFiles(id, buffer, flash_id, uid, sha1, name, 24, md5);
  return {
    result_cover, // 封面
    result_preview, // 预览图
  };
}

async function UpLoadFiles(id, filebuffer, flash_id, uid, sha1, name, type = 22, md5 = {}, file_type = null) {
  const proto = buildProto100(flash_id, uid, filebuffer.length, name, sha1, type, file_type);
  const rsp = await Bot[id].sendUni(`OidbSvcTrpcTcp.0x12a9_100`, pb.encode(proto)); // 请求上传
  const ukey = rsp[4][2]?.[1],
    appid = rsp[4][2][6][1][1][7],
    fid = rsp[4][2][6][1][1][2];
  if (ukey) await flashTransferUpload(filebuffer, ukey, appid);
  const proto103 = buildProto103(flash_id, uid, name, fid, md5, sha1, filebuffer.length, type, file_type);
  const data = await Bot[id].sendUni(`OidbSvcTrpcTcp.0x12a9_103`, pb.encode(proto103)); // 上报上传成功
  const result_upload = { appid, fid };
  if (data[3] !== 0) {
    result_upload.code = data[3];
    result_upload.msg = data[5];
  } else {
    result_upload.code = 0;
  }
  return result_upload;
}

/**
 * type决定本次上传资源类型，分为 封面(23)、预览图(24)、主文件(22)
 *
 * sub_type
 *
 * MP3 = 1,
 * VIDEO = 2,
 * DOC = 3,
 * ZIP = 4,
 * APK = 5,
 * XLS = 6,
 * PPT = 7,
 * CODE = 8,
 * PDF = 9,
 * TXT = 10,
 * UNKNOW = 11,
 * FOLDER = 25,
 * IMG = 26,
 */
function buildProto103(flash_id, uid, name, fid, md5 = {}, sha1, size, type = 22, file_type = null) {
  const proto = pb.decode(Buffer.from(fid, 'base64'));
  let sub_type,
    req,
    req_1,
    req_2,
    h = 0,
    w = 0;
  if (type === 22) {
    sub_type = 11;
    req = 1;
    req_1 = 0;
    req_2 = 0;
  } else if (type === 23) {
    sub_type = 26;
    req = 2;
    req_1 = 1;
    req_2 = 0;
    h = 500;
    w = 500;
  } else if (type === 24) {
    sub_type = 26;
    req = 1;
    req_1 = 0;
    req_2 = 1;
    h = 500;
    w = 500;
  } else {
    sub_type = 11;
    req = 1;
    req_1 = 0;
    req_2 = 0;
  }

  file_type && (sub_type = file_type);

  return {
    1: 4777,
    2: 103,
    4: {
      1: {
        1: {
          1: ids++,
          2: 103,
        },
        2: {
          101: 2,
          102: 4,
          103: type,
          200: 5,
        },
        3: {
          1: 1,
        },
      },
      12: {
        1: {
          1: {
            1: size,
            2: md5,
            3: sha1.toString('hex'),
            4: name,
            5: {
              1: 0,
              2: 0,
              3: 0,
              4: 0,
            },
            6: h,
            7: w,
            8: 0,
            9: 0,
          },
          2: fid,
          3: 1,
          4: Math.floor(proto[5] / 1000000),
          5: proto[10],
          6: 0,
        },
        2: {
          1: 2,
        },
        3: {
          1: 0,
          2: 0,
          3: 0,
          4: {},
        },
        10: {
          1: flash_id,
          2: flash_id,
          3: uid,
          4: req,
          5: req_1,
          6: req_2,
          7: sub_type,
          8: {},
          9: 0,
        },
      },
    },
    12: 1,
  };
}

function buildProto100(flash_id, uid, size, name, sha1, type = 22, file_type = null) {
  let sub_type,
    req,
    req_1,
    req_2,
    h = 0,
    w = 0;
  if (type === 22) {
    sub_type = 11;
    req = 1;
    req_1 = 0;
    req_2 = 0;
  } else if (type === 23) {
    sub_type = 26;
    req = 2;
    req_1 = 1;
    req_2 = 0;
    h = 500;
    w = 500;
  } else if (type === 24) {
    sub_type = 26;
    req = 1;
    req_1 = 0;
    req_2 = 1;
    h = 500;
    w = 500;
  } else {
    sub_type = 11;
    req = 1;
    req_1 = 0;
    req_2 = 0;
  }

  file_type && (sub_type = file_type);

  return {
    1: 4777,
    2: 100,
    4: {
      1: {
        1: {
          1: ids++,
          2: 100,
        },
        2: {
          101: 2,
          102: 4,
          103: type,
          200: 5,
        },
        3: {
          1: 1,
        },
      },
      2: {
        1: {
          1: {
            1: size,
            2: {},
            3: sha1,
            4: name,
            5: {
              1: 0,
              2: 0,
              3: 0,
              4: 0,
            },
            6: h,
            7: w,
            8: 0,
            9: 0,
          },
          2: 0,
        },
        2: 0,
        3: 0,
        4: 0,
        5: 0,
        6: {
          1: {
            1: 0,
            2: {},
          },
          2: {
            3: {},
          },
          3: {
            11: {},
            12: {},
          },
          10: 0,
        },
        7: 0,
        8: 0,
        9: {
          1: flash_id,
          2: flash_id,
          3: uid,
          4: req,
          5: req_1,
          6: req_2,
          7: sub_type,
          8: {},
          9: 0,
        },
      },
    },
    12: 1,
  };
}

/**
 * @param {Buffer} buffer - 文件 Buffer 数据
 * @returns {number} 对应的 sub_type 值
 */
function getFileSubTypeByBuffer(buffer) {
  const fileTypeRules = [
    // 1. 图片（IMG=26）- 优先级最高，封面/预览图核心类型
    {
      subType: 26,
      test: (buf) => {
        // JPEG: ff d8 ff
        if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
        // PNG: 89 50 4e 47
        if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
        // GIF: 47 49 46 38
        if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return true;
        // WEBP: 52 49 46 46 ?? ?? ?? ?? 57 45 42 50
        if (buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return true;
        return false;
      },
    },
    // 2. MP3 (1)
    {
      subType: 1,
      test: (buf) => {
        if (buf.length < 3) return false;
        if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true;
        if (buf[0] === 0xFF && (buf[1] & 0xF0) === 0xF0) {
          const layer = (buf[1] >> 1) & 0x03;
          const version = (buf[1] >> 3) & 0x03;
          return layer !== 0 && version !== 3;
        }
        return false;
      }
    },
    // 3. 视频 (2)
    {
      subType: 2,
      test: (buf) => {
        // MP4: 00 00 00 18 66 74 79 70
        if (buf.length >= 8 && buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70) return true;
        // AVI: 52 49 46 46 ?? ?? ?? ?? 41 56 49 20
        return buf.length >= 12 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x41 && buf[9] === 0x56 && buf[10] === 0x49 && buf[11] === 0x20;
      },
    },
    // 4. PDF (9)
    {
      subType: 9,
      test: (buf) => buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46, // %%PDF
    },
    // 5. 办公文档（DOC/PPT/XLS）- 优先于 ZIP 判断
    {
      subType: 3, // DOC (3)
      test: (buf) => {
        // .docx: ZIP 包 + 包含 word/ 目录
        if (buf.length >= 100 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
          return buf.toString('utf8', 30, 100).includes('word/');
        }
        // .doc: D0 CF 11 E0 A1 B1 1A E1
        return buf.length >= 8 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0 && buf[4] === 0xa1 && buf[5] === 0xb1 && buf[6] === 0x1a && buf[7] === 0xe1 && buf.toString('utf8', 30, 100).includes('word/');
      },
    },
    {
      subType: 7, // PPT (7)
      test: (buf) => {
        // .pptx: ZIP 包 + ppt/ 目录
        if (buf.length >= 100 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
          return buf.toString('utf8', 30, 100).includes('ppt/');
        }
        // .ppt: 旧格式 + ppt/ 目录
        return buf.length >= 8 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0 && buf[4] === 0xa1 && buf[5] === 0xb1 && buf[6] === 0x1a && buf[7] === 0xe1 && buf.toString('utf8', 30, 100).includes('ppt/');
      },
    },
    {
      subType: 6, // XLS (6)
      test: (buf) => {
        // .xlsx: ZIP 包 + xl/ 目录
        if (buf.length >= 100 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
          return buf.toString('utf8', 30, 100).includes('xl/');
        }
        // .xls: 旧格式 + xl/ 目录
        return buf.length >= 8 && buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0 && buf[4] === 0xa1 && buf[5] === 0xb1 && buf[6] === 0x1a && buf[7] === 0xe1 && buf.toString('utf8', 30, 100).includes('xl/');
      },
    },
    // 6. APK (5) - 优先于通用 ZIP 判断！！！
    {
      subType: 5,
      test: (buf) => {
        // 条件1：是 ZIP 包（50 4B 03 04）
        if (!(buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04)) {
          return false;
        }
        // 条件2：包含 APK 特征文件（扩大读取范围，兼容不同位置）
        const content = buf.toString('utf8', 0, buf.length);
        return content.includes('AndroidManifest.xml') || content.includes('classes.dex');
      },
    },
    // 7. 通用 ZIP (4) - 最后判断 ZIP！！！
    {
      subType: 4,
      test: (buf) => {
        // ZIP 魔数：50 4B 03 04 / 50 4B 05 06 / 50 4B 07 08
        return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && ((buf[2] === 0x03 && buf[3] === 0x04) || (buf[2] === 0x05 && buf[3] === 0x06) || (buf[2] === 0x07 && buf[3] === 0x08));
      },
    },
    // 8. 代码 (8)
    {
      subType: 8,
      test: (buf) => {
        const content = buf.toString('utf8', 0, 200);
        return content.includes('//') || content.includes('/*') || content.includes('function') || content.includes('class');
      },
    },
    // 9. 文本 (10)
    {
      subType: 10,
      test: (buf) => {
        for (let i = 0; i < Math.min(buf.length, 100); i++) {
          const b = buf[i];
          if (!(b === 9 || b === 10 || b === 13 || (b >= 32 && b <= 126))) {
            return false;
          }
        }
        return true;
      },
    },
  ];

  for (const rule of fileTypeRules) {
    try {
      if (rule.test(buffer)) {
        return rule.subType;
      }
    } catch (e) {
      continue;
    }
  }
  return 11;
}
