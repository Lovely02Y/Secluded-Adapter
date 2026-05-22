import { highwayUpload, CmdID } from './highway.js';
import { Image } from '../image.js';
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

async function _offPicUp(id, imgs, ext) {
  const req = [];
  for (const img of imgs) {
    req.push({
      1: id,
      2: ext.id,
      3: 0,
      4: img.md5,
      5: img.size,
      6: img.md5.toString('hex'),
      7: 5,
      8: 9,
      9: 0,
      10: 0,
      11: 0, //retry
      12: 1, //bu
      13: img.origin ? 1 : 0,
      14: img.width,
      15: img.height,
      16: img.type,
      17: '9.1.90.26625',
      22: 0,
    });
  }
  const body = pb.encode({
    1: 1,
    2: req,
    // 10: 3
  });
  const payload = await Bot[id].sendUni('LongConn.OffPicUp', body, false);
  return payload[2];
}

async function _groupPicUp(id, imgs, ext) {
  const req = [];
  for (const img of imgs) {
    req.push({
      1: ext.id,
      2: id,
      3: 0,
      4: img.md5,
      5: img.size,
      6: img.md5.toString('hex'),
      7: 5,
      8: 9,
      9: 1, //bu
      10: img.width,
      11: img.height,
      12: img.type,
      13: '9.1.90.26625',
      14: 0,
      15: 1052,
      16: img.origin ? 1 : 0,
      18: 0,
      19: 0,
    });
  }
  const body = pb.encode({
    1: 3,
    2: 1,
    3: req,
  });
  const payload = await Bot[id].sendUni('ImgStore.GroupPicUp', body, false);
  return payload[3];
}

export const setAvatars = async (id, img) => {
  const image = new Image(id, segment.image(img), { dm: false, id });
  await image.task;
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
  await highwayUpload(
    image.readable,
    {
      cmdid: CmdID.SelfPortrait,
      md5: image.md5,
      size: image.size,
    },
    params
  ).finally(image.deleteTmpFile.bind(image));
};

export const uploadImages = async (id, _imgs, ext) => {
  !Array.isArray(_imgs) && (_imgs = [_imgs]);
  const imgs = [];
  for (let img of _imgs) {
    if (!img.fid) {
      imgs.push(img);
    } else if (img instanceof Image) {
      if (img.deleteTmpFile) img?.deleteTmpFile();
    }
  }
  logger.debug(`开始图片任务，共有${imgs.length}张图片`);
  const tasks = [];
  for (let i = 0; i < imgs.length; i++) {
    if (!(imgs[i] instanceof Image)) {
      imgs[i] = new Image(imgs[i], ext);
      logger.debug(imgs[i]);
    }
    const img = imgs[i];
    if (img.nt && img instanceof Image && img.nt_fileid) {
      try {
        img.setUrl(getNTPicURLbyFileid(id, img.nt_fileid));
      } catch {}
    }
    tasks.push(img.task);
  }
  const res1 = await Promise.allSettled(tasks);
  for (let i = 0; i < res1.length; i++) {
    if (res1[i].status === 'rejected') logger.warn(`图片${i + 1}失败, reason: ` + res1[i].reason?.message);
  }
  let n = 0;
  while (imgs.length > n) {
    let rsp = await (ext.dm ? _offPicUp : _groupPicUp)(id, imgs.slice(n, n + 20), ext);
    !Array.isArray(rsp) && (rsp = [rsp]);
    const tasks = [];
    for (let i = n; i < imgs.length; ++i) {
      if (i >= n + 20) break;
      tasks.push(_uploadImage(id, imgs[i], rsp[i % 20], ext));
    }
    const res2 = await Promise.allSettled(tasks);
    for (let i = 0; i < res2.length; i++) {
      if (res2[i].status === 'rejected') {
        res1[n + i] = res2[i];
        logger.warn(`图片${n + i + 1}上传失败, reason: ` + res2[i].reason?.message);
      }
    }
    n += 20;
  }
  logger.debug('图片任务上传完成');
  return res1;
};

async function _uploadImage(id, img, rsp, ext) {
  const j = ext.dm ? 1 : 0;
  if (rsp[2 + j] !== 0) throw new Error(String(rsp[3 + j]));
  img.fid = rsp[9 + j].toBuffer?.() || rsp[9 + j];
  if (img.task) await img.task;
  if (rsp[4 + j]) {
    img.deleteTmpFile();
    return;
  }
  if (!img.readable) {
    img.deleteCacheFile();
    return;
  }
  const ip = rsp[6 + j]?.[0] || rsp[6 + j];
  const port = rsp[7 + j]?.[0] || rsp[7 + j];
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
  return highwayUpload(
    img.readable,
    {
      cmdid: j ? CmdID.DmImage : CmdID.GroupImage,
      md5: img.md5,
      size: img.size,
      ticket: rsp[8 + j],
    },
    params,
    ip,
    port
  ).finally(img.deleteTmpFile.bind(img));
}

function getNTPicURLbyFileid(id, fileid) {
  const appidInFileId = pb.decode(Buffer.from(fileid, 'base64')).toJSON()[4];
  const { offNTPicRkey, groupNTPicRkey } = {
    offNTPicRkey: Bot[id].sig.rkey_info[10]?.rkey,
    groupNTPicRkey: Bot[id].sig.rkey_info[20]?.rkey,
  };
  let url = '';
  if ([1406, 1407].includes(appidInFileId)) {
    const newRkey = appidInFileId === 1406 ? offNTPicRkey : groupNTPicRkey;
    url = `https://gchat.qpic.cn/download?appid=${appidInFileId}&fileid=${fileid}${newRkey}&spec=0`;
  } else {
    // 异常 fileid，只能挨个尝试
    url = `https://gchat.qpic.cn/download?appid=1407&fileid=${fileid}${groupNTPicRkey}&spec=0`;
  }
  return url;
}
