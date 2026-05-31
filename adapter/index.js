const startTime = new Date();
logger.info(logger.yellow('- 正在加载 Secluded 适配器插件'));

import crypto from 'crypto';
import pb from '../model/protobuf/index.js';
import makeConfig from '../../../lib/plugins/config.js';
import axios from 'axios';
import { PrivateMessage, GroupMessage, genDmMessageId, parseDmMessageId, genGroupMessageId, parseGroupMessageId } from '../model/message.js';
import { Converter } from '../model/converter.js';
import { uploadntVideo } from '../model/internal/Uploadntvideo.js';
import { uploadNTImages } from '../model/internal/Uploadntimage.js';
import { uploadPtt } from '../model/internal/UploadNTPtt.js';
import { uploadImages, setAvatars } from '../model/internal/uploadimage.js';
import { UploadGroupfile, UploadFriendfile, rm, mkdir, df, ls, download, stat, rename, mv, forward } from '../model/internal/Uploadfile.js';
import { gzip as _gzip, gunzip as _gunzip } from 'zlib';
import { promisify } from 'util';
import { Cookies } from '../model/internal/GetBotCookies.js';
import imageSize from 'image-size';
import FormData from 'form-data';
import path from 'path';
import fs from 'fs';
import { parseMultimsg } from '../model/parser.js';
import https from 'https';
import { ntMsgListenerdeal } from '../model/internal/onlinepush.js';
import { Image } from '../model/image.js';
import schedule from 'node-schedule';
import { segment } from '../model/elements.js';
import { UploadflashTransfer } from '../model/internal/UploardFlashTransfer.js';

const RandomUInt = () => crypto.randomBytes(4).readUInt32BE();
const gunzip = promisify(_gunzip);
const gzip = promisify(_gzip);

const { config, configSave } = await makeConfig(
  'Secluded',
  {
    tips: '',
    permission: 'master',
    bot: {},
    http_url: 'http://127.0.0.1:80',
    ws_url: 'ws://127.0.0.1:24804',
    http_secretToken: null,
    ws_secretToken: 'SecretToken',
    token: [],
    maxConcurrent: 6,
  },
  {
    tips: ['欢迎使用 TRSS-Yunzai Secluded Plugin ! 作者：堀学长', '参考：https://gitee.com/Milchstraber/Secluded-Plugin'],
  }
);

async function getImageSize(file) {
  try {
    const buffer = await Bot.Buffer(file);
    return imageSize(new Uint8Array(buffer));
  } catch (error) {
    return {
      width: 500,
      height: 500,
    };
  }
}

function isObject(obj) {
  return obj !== null && typeof obj === 'object';
}

function code2uin(code) {
  let left = Math.floor(code / 1000000);
  if (left >= 0 && left <= 10) left += 202;
  else if (left >= 11 && left <= 19) left += 469;
  else if (left >= 20 && left <= 66) left += 2080;
  else if (left >= 67 && left <= 156) left += 1943;
  else if (left >= 157 && left <= 209) left += 1990;
  else if (left >= 210 && left <= 309) left += 3890;
  else if (left >= 310 && left <= 335) left += 3490;
  else if (left >= 336 && left <= 386) left += 2265;
  else if (left >= 387 && left <= 599) left += 3490;
  return left * 1000000 + (code % 1000000);
}

function uuid() {
  let hex = crypto.randomBytes(16).toString('hex');
  return hex.substring(0, 8) + '-' + hex.substring(8, 12) + '-' + hex.substring(12, 16) + '-' + hex.substring(16, 20) + '-' + hex.substring(20);
}

function int32ip2str(ip) {
  if (typeof ip === 'string') return ip;
  ip = ip & 0xffffffff;
  return [ip & 0xff, (ip >> 8) & 0xff, (ip >> 16) & 0xff, (ip >> 24) & 0xff].join('.');
}

const QQ_domains_lists = ['qun', 'aq', 'connect', 'docs', 'game', 'gamecenter', 'haoma', 'id', 'kg', 'mail', 'mma', 'office', 'openmobile', 'qqweb', 'qzone', 'ti', 'v', 'vip', 'y', 'pay', 'now', 'q', 'weiyun'].map((item) => item + '.qq.com');

const adapter = new (class SecludedAdapter {
  constructor() {
    this.id = 'QQ';
    this.name = 'Secluded';
    this.path = this.name;
    this.echo = new Map();
    this.version = '0.0.1';
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000;
    this.token = null;
    this.seq = Math.floor(10000 + (crypto.randomBytes(2).readUInt16BE() / 65535) * 50001);
    this.maxConcurrent = config.maxConcurrent; // 最大并发数
    this.currentConcurrent = 0; // 当前并发数
    this.queue = []; // 等待队列
  }

  get Proto() {
    return pb;
  }

  async Http_Sec_Send(data) {
    const response = await axios.post(config.http_url + '/send?' + `token=${config.http_secretToken}`, data);
    return response.data;
  }

  async sendUni(id, cmd, body, isToJson = true, raw = false) {
    const dat = body.toString('hex'),
      data = {
        cmd: 'SendOicqMsg',
        rsp: true,
        data: [
          {
            Account: String(id),
            Reply: 'Reply',
            Cmd: cmd,
            Dat: dat,
          },
        ],
      };
    const rsp = await this.Http_Sec_Send(data.data);
    const payload = rsp.Dat;
    if (raw) return payload;
    if (isToJson) return pb.decode(payload)?.toJSON();
    return pb.decode(payload);
  }

  async sendApi(data) {
    const { default: sec_ws } = await import('./WebSocket.js');
    data = {
      cmd: 'SendOicqMsg',
      rsp: true,
      data,
    };
    return sec_ws.Ws_send_Sec(data, 1);
  }

  async sendOidbSvcTrpcTcp(id, cmd, src, isToJson, raw = false, nt = true) {
    let type1, type2;
    if (Array.isArray(cmd) && cmd.length > 2) {
      ((type1 = cmd[1]), (type2 = cmd[2]));
      cmd = String(cmd[0]);
    } else {
      cmd = Array.isArray(cmd) ? String(cmd[0]) : cmd;
      const sp = cmd.replace('OidbSvcTrpcTcp.', '').replace('OidbSvc.', '').split('_');
      ((type1 = parseInt(sp[0], 16)), (type2 = parseInt(sp[1])));
    }
    const _body = pb.encode({
      1: type1,
      2: type2,
      4: src,
      12: nt ? 1 : 0,
    });
    const data = await this.sendUni(id, cmd, _body, isToJson, raw);
    if (raw) return data;
    return data[4];
  }

  async sendOidb(id, cmd, src, isToJson) {
    const sp = cmd.replace('OidbSvc.', '').replace('oidb_', '').split('_');
    const type1 = parseInt(sp[0], 16),
      type2 = parseInt(sp[1]);
    const _body = pb.encode({
      1: type1,
      2: isNaN(type2) ? 1 : type2,
      3: 0,
      4: src,
      12: 1,
    });
    return await this.sendUni(id, cmd, _body, isToJson);
  }

  async refreshRkey(id, cmd, payload) {
    if (!Bot.uin.includes(id)) await this.connect(id);
    const rsp = pb.decode(payload)[4];
    const rkeys = rsp[4][1];
    let C2Crkey, Grouprkey, expired;
    for (const v of rkeys) {
      if (v[5] === 10) C2Crkey = v[1];
      if (v[5] === 20) Grouprkey = v[1];
      expired = v[4] + v[2] - 120;
    }
    Bot[id].sig.rkey_info = {
      10: {
        rkey: C2Crkey,
      },
      20: {
        rkey: Grouprkey,
      },
      time: expired,
    };
  }

  async getRkey(id, force = false) {
    try {
      if (force || Date.now() / 1000 > Bot[id].sig.rkey_info.time) {
        const body = {
          1: {
            1: {
              1: 1,
              2: 202,
            },
            2: {
              101: 2,
              102: 1,
              200: 0,
            },
            3: {
              1: 2,
            },
          },
          4: {
            1: [10, 20],
            2: 2,
          },
        };
        const rsp = await this.sendOidbSvcTrpcTcp(id, 'OidbSvcTrpcTcp.0x9067_202', body);
        const rkeys = rsp[4][1];
        let C2Crkey, Grouprkey, expired;
        for (const v of rkeys) {
          if (v[5] === 10) C2Crkey = v[1];
          if (v[5] === 20) Grouprkey = v[1];
          expired = v[4] + v[2] - 120;
        }
        Bot[id].sig.rkey_info = {
          10: {
            rkey: C2Crkey,
          },
          20: {
            rkey: Grouprkey,
          },
          time: expired,
        };
        return Bot[id].sig.rkey_info;
      }
      return Bot[id].sig.rkey_info;
    } catch (error) {
      return {
        10: {
          rkey: '&rkey=CAQSKDOc_jvbthUjAatuFPQIo-x9wwcDhDGd8SOEu5FyJWNxNMabJTTRpO8',
        },
        20: {
          rkey: '&rkey=CAQSKDOc_jvbthUjZrMxJG2jNZ-rIWue47Q3PGKb_GWljzyvOUZOv0-EVao',
        },
      };
    }
  }

  async FriendOperation(id, force = false) {
    const fileDir = path.join('./data/Secluded', id.toString());
    const filePath = path.join(fileDir, 'FriendOperation.json');
    if (fs.existsSync(filePath) && !force) {
      const fileContent = await fs.promises.readFile(filePath, 'utf-8');
      const cachedData = JSON.parse(fileContent);
      const cacheTime = new Date(cachedData.time);
      const currentTime = new Date();
      const timeDiff = currentTime - cacheTime;
      if (timeDiff < 3600000) {
        return this.dealEvent(id, 'OidbSvcTrpcTcp.0xfd4_1', cachedData.data);
      }
    }
    const body = {
      2: 300,
      4: 0,
      5: {
        1: 0,
      },
      6: 0,
      7: 0,
      10001: [
        {
          1: 1,
          2: {
            1: [102, 103, 20002, 27394, 20037, 20009],
          },
        },
        {
          1: 4,
          2: {
            1: [100, 101, 102],
          },
        },
      ],
      10002: [],
      10003: 0,
    };
    const data = await this.sendOidbSvcTrpcTcp(id, 'OidbSvcTrpcTcp.0xfd4_1', body, false, true, false);
    const saveData = {
      time: new Date().toISOString(),
      data,
    };
    await fs.promises.mkdir(fileDir, { recursive: true });
    await fs.promises.writeFile(
      filePath,
      JSON.stringify(
        saveData,
        (key, value) => {
          if (typeof value === 'bigint') {
            return value.toString() + 'n';
          }
          return value;
        },
        2
      ),
      'utf-8'
    );
    return pb.decode(data);
  }

  async handleGroupsOperation(id, data) {
    let gl_count = 0;
    const groups = Array.isArray(data[2]) ? data[2] : [data[2]];
    for (const o of groups) {
      const group_id = o[3],
        group_name = o[4][5],
        create_time = o[4][2],
        member_count = o[4][4],
        ownerUid = o[4][1][2];
      const max_member_count = o[4][3],
        description = o[4][18] || '',
        question = o[4][19] || '',
        announcement = o[4][30];
      const group_data = { group_id, group_name, create_time, member_count, max_member_count, description, question, announcement, ownerUid };
      Bot[id].gl.set(group_id, group_data);
      gl_count++;
      await this.getMemberinfo(id, group_id);
    }
    return gl_count;
  }

  async GroupsOperation(id, force = false) {
    const fileDir = path.join('./data/Secluded', id.toString());
    const filePath = path.join(fileDir, 'GroupsOperation.json');
    if (fs.existsSync(filePath) && !force) {
      const fileContent = await fs.promises.readFile(filePath, 'utf-8');
      const cachedData = JSON.parse(fileContent);
      const cacheTime = new Date(cachedData.time);
      const currentTime = new Date();
      const timeDiff = currentTime - cacheTime;
      if (timeDiff < 3600000) {
        return await this.handleGroupsOperation(id, cachedData.data);
      }
    }
    const body = {
      1: {
        1: {
          1: 1,
          2: 1,
          3: 1,
          4: 1,
          5: 1,
          8: 1,
          9: 1,
          10: 1,
          11: 1,
          12: 1,
          13: 1,
          14: 1,
          15: 1,
          16: 1,
          17: 1,
          18: 1,
          19: 1,
          20: 1,
          22: 1,
          23: 1,
          24: 1,
          25: 1,
          26: 1,
          27: 1,
          28: 1,
          29: 1,
          30: 1,
          31: 1,
          32: 1,
          5001: 1,
          5002: 1,
          5003: 1,
        },
        2: {
          1: 1,
          2: 1,
          3: 1,
          4: 1,
          5: 1,
          6: 1,
          7: 1,
          8: 1,
        },
        3: {
          5: 1,
          6: 1,
        },
      },
    };
    const data = await this.sendOidbSvcTrpcTcp(id, 'OidbSvcTrpcTcp.0xfe5_2', body);
    const saveData = {
      time: new Date().toISOString(),
      data,
    };
    await fs.promises.mkdir(fileDir, { recursive: true });
    await fs.promises.writeFile(
      filePath,
      JSON.stringify(
        saveData,
        (key, value) => {
          if (typeof value === 'bigint') {
            return value.toString() + 'n';
          }
          return value;
        },
        2
      ),
      'utf-8'
    );
    const gl_count = await this.handleGroupsOperation(id, data);
    return gl_count;
  }

  async GetClientKey(id, force = false) {
    if (force || Date.now() / 1000 > Bot[id].sig.client_key_info.time) {
      const body = {
        1: 4138,
        2: 1,
        4: {},
        12: 1,
      };
      const payload = await this.sendUni(id, 'OidbSvcTrpcTcp.0x102a_1', pb.encode(body));
      const client_key = payload[4][3];
      const expired = payload[4][4] + Date.now() / 1000 - 600;
      Bot[id].sig.client_key_info = {
        client_key,
        time: expired,
      };
    }
    return Bot[id].sig.client_key_info.client_key;
  }

  handlebigdata(id, rsp) {
    rsp = pb.decode(rsp);
    const decoded = rsp[1281];
    const sig_session = decoded[1].toBuffer(),
      session_key = decoded[2].toBuffer();
    let primary = { ip: '', port: 0 };
    const backupIps = [];
    for (let v of Array.isArray(decoded[3]) ? decoded[3] : [decoded[3]]) {
      if (v[1] === 10 && v[2] && Array.isArray(v[2])) {
        for (let i = 0; i < v[2].length; i++) {
          const server = v[2][i];
          if (server[2] && server[3]) {
            const ip = int32ip2str(server[2]);
            const port = server[3];
            const serverInfo = { ip, port };

            if (i === 0) {
              primary = serverInfo; // 第一个IP作为主要IP
            } else {
              backupIps.push(serverInfo); // 其他IP作为备用IP
            }
          }
        }
        break; // 找到v[1] === 10的数组后就可以退出循环
      }
    }
    const bigdata = {
      ip: primary?.ip || backupIps[0]?.ip,
      port: primary?.port || backupIps[0]?.port,
      backup_ips: backupIps,
      sig_session,
      session_key,
    };
    if (Bot.uin.includes(id)) Bot[id].sig.bigdata = bigdata;
    return bigdata;
  }

  async GetBigdata(id, force = false) {
    const fileDir = path.join('./data/Secluded', id.toString());
    const filePath = path.join(fileDir, 'Bigdata.json');
    if (fs.existsSync(filePath)) {
      const fileContent = await fs.promises.readFile(filePath, 'utf-8');
      const cachedData = JSON.parse(fileContent);
      const cacheTime = new Date(cachedData.time);
      const currentTime = new Date();
      const timeDiff = currentTime - cacheTime;
      if (timeDiff < 180000000 && !force) {
        return this.handlebigdata(id, cachedData.data);
      }
    }
    const rsp = await this.sendUni(
      id,
      'HttpConn.0x6ff_501',
      pb.encode({
        1281: {
          1: id,
          2: 0,
          3: 537320212,
          4: 1,
          6: 3,
          7: [10, 21],
          9: 2,
          10: 9,
          //    11: 8,
          //    15: '1.0.1',
        },
      }),
      false,
      true
    );
    const saveData = {
      time: new Date().toISOString(),
      data: rsp,
    };
    await fs.promises.mkdir(fileDir, { recursive: true });
    await fs.promises.writeFile(
      filePath,
      JSON.stringify(
        saveData,
        (key, value) => {
          if (typeof value === 'bigint') {
            return value.toString() + 'n';
          }
          return value;
        },
        2
      ),
      'utf-8'
    );
    return this.handlebigdata(id, rsp);
  }

  async getMsg(id, message_id, cnt = 20, opts) {
    const messages = [];
    cnt = isNaN(Number(cnt)) ? 1 : Number(cnt);
    if (opts.dm) {
      let user_uid = opts.user_uid,
        time;
      if (isNaN(Number(message_id))) {
        ({ time } = parseDmMessageId(message_id));
      } else {
        time = message_id;
      }
      const body = {
        1: user_uid,
        2: Number(time > 0 ? time : (await this._getLastSeq(id, opts)) + time),
        3: 0,
        4: cnt,
        5: 2,
      };
      const obj = await this.sendUni(id, 'trpc.msg.register_proxy.RegisterProxy.SsoGetRoamMsg', pb.encode(body), false);
      if (obj[1] > 0 || !obj[7]) return messages;
      !Array.isArray(obj[7]) && (obj[7] = [obj[7]]);
      for (const proto of obj[7]) {
        try {
          messages.push(new PrivateMessage(id, proto, id, true));
        } catch {}
      }
      return messages;
    } else {
      let group_id, seq;
      if (isNaN(Number(message_id))) {
        ({ group_id, seq } = parseGroupMessageId(message_id));
      } else {
        seq = message_id;
        group_id = opts.group_id;
      }
      if (!seq) seq = await this._getLastSeq(id, opts);
      const body = pb.encode({
        1: {
          1: group_id,
          2: seq - cnt + 1,
          3: Number(seq),
        },
        2: 1,
      });
      const payload = await this.sendUni(id, 'trpc.msg.register_proxy.RegisterProxy.SsoGetGroupMsg', body, false);
      const obj = payload[3],
        messages = [];
      if (obj[1] > 0 || !obj[6]) return [];
      !Array.isArray(obj[6]) && (obj[6] = [obj[6]]);
      for (const proto of obj[6]) {
        try {
          messages.push(new GroupMessage(id, proto, true));
        } catch {}
      }
      return messages;
    }
  }

  async _getLastSeq(id, opts) {
    if (opts.dm) {
      const proto = await this.sendUni(
        id,
        'trpc.msg.msg_svc.MsgService.SsoGetPeerSeq',
        pb.encode({
          1: opts.user_uid,
        }),
        false
      );
      if (proto[1] > 0) return Number(Math.floor(Date.now() / 1000));
      return Number(proto[5]);
    } else {
      const body = {
        1: Bot[id].apk.subid,
        2: {
          1: opts.id,
          2: {
            22: 0,
          },
        },
      };
      const payload = await this.sendOidbSvcTrpcTcp(id, 'OidbSvcTrpcTcp.0x88d_0', body, false);
      const proto = payload[1][3][22];
      return proto;
    }
  }

  async _recallMsg(id, message_id, dm = false) {
    let body, cmd;
    if (dm) {
      return false;
    } else {
      const { group_id, seq, rand } = parseGroupMessageId(message_id);
      cmd = 'trpc.msg.msg_svc.MsgService.SsoGroupRecallMsg';
      body = {
        1: 1,
        2: group_id,
        3: {
          1: seq,
          2: rand,
          3: 0,
        },
        4: {
          1: 0,
        },
      };
    }
    const rsp = await this.sendUni(id, cmd, pb.encode(body));
    if (!dm && rsp[2] === 'Success') return true;
    if (dm && rsp[3] === 1) return true;
    return false;
  }

  async recallMsg(id, message_id, opts) {
    Bot.makeLog('info', `撤回消息：${message_id}`, id);
    if (!Array.isArray(message_id)) message_id = [message_id];
    const msgs = [];
    for (const i of message_id) {
      msgs.push(await this._recallMsg(id, i, opts.dm));
    }
    return msgs;
  }

  async _setting(id, obj, opts) {
    const body = {
      1: opts.id,
      2: obj,
    };
    const payload = await this.sendOidb(id, 'OidbSvc.0x89a_0', body, false);
    return payload[3] === 0;
  }

  async setName(id, name, opts) {
    return this._setting(id, { 3: String(name) }, opts);
  }

  async muteAll(id, yes, opts) {
    return this._setting(id, { 17: yes ? 0xffffffff : 0 }, opts);
  }

  async announce(id, content, opts) {
    return this._setting(id, { 4: String(content) }, opts);
  }

  async setMessageRateLimit(id, times, opts) {
    if (![5, 10, 0].includes(times)) {
      Bot.makeLog('error', `[Group: ${opts.id}]设置发言频率失败: 参数不合法`, id);
      return false;
    }
    return this._setting(id, { 38: times }, opts);
  }

  async setGroupJoinType(id, type, question, answer, opts) {
    switch (type) {
      /** 允许任何人加群 */
      case 'AnyOne':
        return this._setting(id, { 16: 1, 29: 1 }, opts);
      /** 不允许任何人加群 */
      case 'None':
        return this._setting(id, { 16: 3 }, opts);
      /** 需要身份验证 */
      case 'requireAuth':
        return this._setting(id, { 16: 2 }, opts);
      /** 需要回答问题并由管理员审核 */
      case 'QAjoin':
        if (!question) {
          Bot.makeLog('error', `[Group: ${opts.id}]设置加群方式失败: 未传入question`, id);
          return false;
        }
        return this._setting(id, { 30: question }, opts);
      /** 正确回答问题 */
      case 'Correct':
        if (!question) {
          Bot.makeLog('error', `[Group: ${opts.id}]设置加群方式失败: 未传入question`, id);
          return false;
        }
        if (!answer) {
          Bot.makeLog('error', `[Group: ${opts.id}]设置加群方式失败: 未传入answer`, id);
          return false;
        }
        return this._setting(id, { 30: question, 31: answer }, opts);
      default:
        Bot.makeLog('error', `[Group: ${opts.id}]设置加群方式失败: 未知类型${type}`, id);
        return false;
    }
  }

  async sign(id, opts) {
    const body = {
      2: {
        1: String(id),
        2: String(opts.group_id),
        3: '9.0.90',
      },
    };
    const rsp = await this.sendOidb(id, 'OidbSvc.0xeb7_1', body, false);
    return { result: rsp[3] & 0xffffffff };
  }

  async setReaction(bot, seq, id, type = 1, opts) {
    const body = {
      2: opts.id,
      3: seq,
      4: `${id}`,
      5: type,
    };
    return this.sendOidbSvcTrpcTcp(bot, 'OidbSvcTrpcTcp.0x9082_1', body, false);
  }

  async delReaction(bot, seq, id, type = 1, opts) {
    const body = {
      2: opts.id,
      3: seq,
      4: `${id}`,
      5: type,
    };
    return this.sendOidbSvcTrpcTcp(bot, 'OidbSvcTrpcTcp.0x9082_2', body, false);
  }

  async invite(id, user_id, group_id, opts) {
    const body = {
      1: 1880,
      2: 1,
      4: {
        1: Number(group_id),
        2: {
          1: Number(user_id),
          //"2": group_id
        },
        3: {},
        4: 0,
        5: 0,
        6: {},
        7: 0,
        10: 0,
      },
      12: 1,
    };
    const resp = await this.sendUni(id, 'OidbSvcTrpcTcp.0x758_1', pb.encode(body), false);
    return resp[3] === 0;
  }

  async setRemark(id, remark, opts) {
    const body = pb.encode({
      1: {
        1: opts.id,
        2: code2uin(opts.id),
        3: String(remark || ''),
      },
    });
    await this.sendOidb(id, 'OidbSvc.0xf16_1', body, false);
  }

  getMemberMap(id, group_id) {
    return Bot[id].gml.get(group_id);
  }

  getMemberArray(id, group_id) {
    const memberMap = this.getMemberMap(id, group_id);
    return Array.from(memberMap.values());
  }

  getMemberList(id, group_id) {
    const memberArray = this.getMemberArray(id, group_id);
    return memberArray.map((member) => member.user_id);
  }

  async addEssence(id, message_id, opts) {
    const { group_id, user_id, seq, rand, time, pktnum } = parseGroupMessageId(message_id);
    const body = {
      1: group_id,
      2: seq,
      3: rand,
    };
    const ret = (await this.sendOidb(id, 'OidbSvc.0xeac_1', body, false))[4];
    if (ret[1]) {
      Bot.makeLog('error', `[Group: ${opts.id}] 加精群消息失败: ${ret[2]}(${ret[1]})`, id);
      return false;
    } else {
      return '设置精华成功';
    }
  }

  async removeEssence(id, message_id, opts) {
    const { group_id, user_id, seq, rand, time, pktnum } = parseGroupMessageId(message_id);
    const body = {
      1: group_id,
      2: seq,
      3: rand,
    };
    const ret = (await this.sendOidb(id, 'OidbSvc.0xeac_2', body, false))[4];
    if (ret[1]) {
      Bot.makeLog('error', `[Group: ${opts.id}] 移除群精华消息失败: ${ret[2]}(${ret[1]})`, id);
      return false;
    } else {
      return '移除群精华消息成功';
    }
  }

  async setGrouptodo(id, message_id, opts) {
    const { group_id, user_id, seq, rand, time, pktnum } = parseGroupMessageId(message_id);
    const body = {
      1: 3984,
      2: 1,
      4: {
        1: group_id,
        2: seq,
      },
    };
    const rsp = await this.sendUni(id, 'OidbSvcTrpcTcp.0xf90_1', pb.encode(body), false);
    return rsp[3] === 0;
  }

  async delGrouptodo(id, opts) {
    const body = {
      1: 3984,
      2: 3,
      4: {
        1: opts.group_id,
      },
    };
    const rsp = await this.sendUni(id, 'OidbSvcTrpcTcp.0xf90_3', pb.encode(body), false);
    return rsp[3] === 0;
  }

  async GroupsetUserCard(id, user_id, name = '猫娘', opts) {
    const user_uid = Bot[id].gml.get(opts.id)?.get(user_id)?.uid;
    if (!user_uid) return false;
    const body = {
      1: 2300,
      2: 3,
      4: {
        1: opts.group_id,
        3: {
          1: user_uid,
          8: String(name),
        },
      },
    };
    const payload = await this.sendUni(id, 'OidbSvcTrpcTcp.0x8fc_3', pb.encode(body), false);
    return payload[3] === 0;
  }

  async mute(id, duration = 1800, group_id, user_id) {
    if (duration > 2592000 || duration < 0) duration = 2592000;
    const body = {
      1: 4691,
      2: 1,
      4: {
        1: group_id,
        2: 1,
        3: {
          1: Number(user_id),
          2: duration,
        },
      },
      12: 1,
    };
    const rsp = await this.sendUni(id, 'OidbSvcTrpcTcp.0x1253_1', pb.encode(body), false);
    if (rsp[3] === 0) return true;
    Bot.makeLog('warn', `[Group: ${group_id} Member：${user_id}]设置禁言失败: ${rsp[5].toString()}`, id);
    return false;
  }

  async sendGroupFile(id, file, name = path.basename(file), pid = '/', opts) {
    const data = await UploadGroupfile(id, file, name, pid, opts);
    return data;
  }

  getGroupFs(id, opts) {
    return {
      upload: (file, name, pid) => this.sendGroupFile(id, file, name, pid, opts),
      rm: (fid) => rm(id, fid, opts),
      mkdir: (name) => mkdir(id, name, opts),
      df: () => df(id, opts),
      ls: (pid = '/', start = 0, limit = 100) => ls(id, pid, start, limit, opts),
      download: (fid) => download(id, fid, opts),
      stat: (fid) => stat(id, fid, opts),
      rename: (fid, name) => rename(id, fid, name, opts),
      mv: (fid, pid) => mv(id, fid, pid, opts),
      forward: (stat, pid, name) => forward(id, stat, pid, name, opts),
    };
  }

  async sendGroupNotice(id, msg, image, opts) {
    const cookies = await Bot[id].getCookies('qun.qq.com');
    const data = {
      qid: opts.group_id,
      bkn: Bot[id].bkn,
      text: msg,
      pinned: 0,
      type: 1,
      settings: '{ is_show_edit_card: 1, tip_window_type: 1, confirm_required: 1 }',
    };
    if (image) {
      const res = await this._uploadImg(id, await Bot.Buffer(image), cookies);
      if (res.ec == 0) {
        const p = JSON.parse(res.id.replace(/&quot;/g, '"'));
        data.pic = p.id;
        data.imgWidth = p.w;
        data.imgHeight = p.h;
      }
    }

    let url = `https://web.qun.qq.com/cgi-bin/announce/add_qun_notice?bkn=${Bot[id].bkn}`;
    const response = await axios.post(url, new URLSearchParams(data), {
      headers: {
        Cookie: cookies,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36',
      },
    });
    return response.data;
  }

  async _uploadImg(id, buffer, cookies) {
    const form = new FormData();
    const bknValue = Bot[id].bkn;
    form.append('bkn', String(bknValue));
    form.append('source', 'troopNotice');
    form.append('m', '0');
    form.append('pic_up', buffer, {
      filename: '_-1537414416_1735663690596_1735663690653_wifi_0.jpg',
      contentType: 'image/png',
    });
    const headers = {
      ...form.getHeaders(),
      Cookie: cookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36',
    };
    const response = await axios.post('https://web.qun.qq.com/cgi-bin/announce/upload_img', form, {
      headers,
    });
    return response.data;
  }

  async RequestJoinGroup(id, group_id, msg = '') {
    const body = {
      1: 4588,
      2: 1,
      4: {
        1: Number(group_id),
        2: {
          1: 3,
          2: 10014,
          3: msg,
          4: '<?xml version="1.0" encoding="utf-8"?>\n<msg templateID="1" brief="" serviceID="104"><item layout="2"><picture cover=""/><title>新人入群</title></item><source/></msg>',
          5: {},
          6: {},
          7: {},
          8: {
            2: 2,
          },
        },
      },
      12: 1,
    };
    const rsp = await this.sendUni(id, 'OidbSvcTrpcTcp.0x11ec_1', pb.encode(body));
    return rsp[3] === 0;
  }

  async cancel_Group_pay(id, collection) {
    const cookies = await Bot[id].getCookies('tenpay.com', false, true);

    const queryParams = new URLSearchParams({
      collection_no: collection.toString(),
      uin: id.toString(),
      pskey: cookies.p_skey,
      skey: cookies.skey,
      skey_type: '2',
    });

    const url = `https://mqq.tenpay.com/cgi-bin/qcollect/qpay_collect_close.cgi?${queryParams}`;

    const cookie = `uin=${cookies.uin}; skey=${cookies.skey}; p_uin=${cookies.uin}; p_skey=${cookies.p_skey}`;

    const response = await axios.get(url, {
      headers: {
        Cookie: cookie,
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12; AOSP Build/SQ1A.220205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/101.0.4951.61 Mobile Safari/537.36 V1_AND_SQ_9.1.95_10460_YYB_D QQ/9.1.95.27050 NetType/WIFI WebP/0.4.1 AppId/537297317 Pixel/1080 StatusBarHeight/2 SimpleUISwitch/0 QQTheme/1000 StudyMode/0 CurrentMode/0 CurrentFontScale/1.0 GlobalDensityScale/0.90000004 AllowLandscape/true InMagicWin/0',
        Accept: '*/*',
        Host: 'mqq.tenpay.com',
        Connection: 'keep-alive',
      },
      timeout: 15000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      validateStatus: (status) => status < 500,
    });

    const { data: result } = response;

    if (result.retcode && result.retcode != 0) {
      return {
        code: -1,
        msg: '取消群收款失败',
        reason: result.retmsg || '未知错误',
        retcode: result.retcode,
      };
    }
    return {
      code: 0,
      msg: '取消群收款成功',
      collection: collection,
    };
  }

  async get_Group_pay(id, collection) {
    const cookies = await Bot[id].getCookies('tenpay.com', false, true);

    const queryParams = new URLSearchParams({
      collection_no: collection.toString(),
      uin: id.toString(),
      pskey: cookies.p_skey,
      skey: cookies.skey,
      skey_type: '2',
    });

    const url = `https://mqq.tenpay.com/cgi-bin/qcollect/qpay_collect_detail.cgi?${queryParams}`;

    const cookie = `uin=${cookies.uin}; skey=${cookies.skey}; p_uin=${cookies.uin}; p_skey=${cookies.p_skey}`;

    const response = await axios.get(url, {
      headers: {
        Cookie: cookie,
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12; AOSP Build/SQ1A.220205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/101.0.4951.61 Mobile Safari/537.36 V1_AND_SQ_9.1.95_10460_YYB_D QQ/9.1.95.27050 NetType/WIFI WebP/0.4.1 AppId/537297317 Pixel/1080 StatusBarHeight/2 SimpleUISwitch/0 QQTheme/1000 StudyMode/0 CurrentMode/0 CurrentFontScale/1.0 GlobalDensityScale/0.90000004 AllowLandscape/true InMagicWin/0',
        Accept: '*/*',
        Host: 'mqq.tenpay.com',
        Connection: 'keep-alive',
      },
      timeout: 15000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      validateStatus: (status) => status < 500,
    });

    const { data: result } = response;
    if (result.retcode && result.retcode != 0) {
      return {
        code: -1,
        msg: '查询群收款详情失败',
        reason: result.retmsg || '未知错误',
        retcode: result.retcode,
      };
    }
    const formattedData = {
      code: result.state ? (parseInt(result.state) === 2 ? 0 : result.send_msg_reason ? (String(result.send_msg_reason) === '账单已过期' ? 2 : -1) : -1) : -3,
      msg: result.state ? (parseInt(result.state) === 2 ? '已全部支付完成' : result.send_msg_reason ? (String(result.send_msg_reason) === '账单已过期' ? '已取消支付状态' : '未全部支付完成') : '未全部支付完成') : '获取结果错误',
      robot: parseInt(result.seller_uin) || 0,
      title: result.memo || '',
      total_amount: result.amount ? (parseInt(result.amount) / 100).toString() : '0',
      received_amount: result.recv_amount ? (parseInt(result.recv_amount) / 100).toString() : '0',
      receive_type: result.recv_type || '',
      group_id: parseInt(result.group_id) || 0,
      status: parseInt(result.state) || 0,
      payers: [],
      can_send_message: result.can_send_msg || '',
      message_reason: result.send_msg_reason || '',
      paid_count: 0,
      total_payers: 0,
      remaining_payers: 0,
      collection: collection,
    };
    if (result.payer_list && Array.isArray(result.payer_list)) {
      let totalPayers = 0;
      let paidCount = 0;

      for (const payer of result.payer_list) {
        const payerState = parseInt(payer.state) || -1;

        if (payerState !== -1) {
          totalPayers++;
        }
        if (payerState === 2) {
          paidCount++;
        }

        formattedData.payers.push({
          code: payer.state ? (parseInt(payer.state) === 2 ? 0 : -1) : -2,
          msg: payer.state ? (parseInt(payer.state) === 2 ? '已进行支付' : '未进行支付') : '获取状态错误',
          amount: payer.amount ? (parseInt(payer.amount) / 100).toString() : '0',
          name: String(payer.name || ''),
          status: payerState,
          uin: parseInt(payer.uin) || 0,
        });
      }
      formattedData.paid_count = paidCount;
      formattedData.total_payers = totalPayers;
      formattedData.remaining_payers = totalPayers - paidCount;
    }

    return {
      code: 0,
      msg: '查询群收款详情成功',
      data: formattedData,
    };
  }

  async send_Group_pay(id, group_id, user_ids, memo, amount) {
    !Array.isArray(user_ids) && (user_ids = [user_ids]);
    const payerList = [];
    const seenUins = new Set();
    let totalAmount = 0;
    let totalUin = 0;
    const responseData = [];

    for (const user_id of user_ids) {
      if (seenUins.has(user_id)) {
        continue;
      }
      const userAmount = parseFloat(amount);
      if (isNaN(userAmount) || userAmount <= 0) {
        continue;
      }
      const amountInCents = Math.floor(userAmount * 100);
      if (amountInCents < 1) {
        continue;
      }
      payerList.push({
        amount: amountInCents,
        uin: user_id.toString(),
      });
      seenUins.add(user_id);
      totalAmount += amountInCents;
      totalUin++;
      responseData.push({
        amount: (amountInCents / 100).toFixed(2),
        uin: user_id,
      });
    }

    const cookies = await Bot[id].getCookies('tenpay.com', false, true);

    const queryParams = new URLSearchParams({
      type: '1',
      amount: totalAmount.toString(),
      num: totalUin.toString(),
      recv_type: '1',
      group_id: group_id.toString(),
      is_collect_all: '0',
      average_amount: '0',
      uin: id,
      pskey: cookies.p_skey,
      skey: cookies.skey,
      skey_type: '2',
    });
    const url = `https://mqq.tenpay.com/cgi-bin/qcollect/qpay_collect_create.cgi?${queryParams}&payer_list=${JSON.stringify(payerList)}&memo=${encodeURIComponent(memo)}`;

    const cookie = `uin=${cookies.uin}; skey=${cookies.skey}; p_uin=${cookies.uin}; p_skey=${cookies.p_skey}`;

    const response = await axios.get(url, {
      headers: {
        Cookie: cookie,
        'User-Agent': 'Mozilla/5.0 (Linux; Android 12; AOSP Build/SQ1A.220205.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/101.0.4951.61 Mobile Safari/537.36 V1_AND_SQ_9.1.95_10460_YYB_D QQ/9.1.95.27050 NetType/WIFI WebP/0.4.1 AppId/537297317 Pixel/1080 StatusBarHeight/2 SimpleUISwitch/0 QQTheme/1000 StudyMode/0 CurrentMode/0 CurrentFontScale/1.0 GlobalDensityScale/0.90000004 AllowLandscape/true InMagicWin/0',
        Accept: '*/*',
        Host: 'mqq.tenpay.com',
        Connection: 'keep-alive',
        Referer: `https://mqq.tenpay.com/mqq/groupreceipts/index.shtml?uin=${group_id}&type=4&_wv=1027&_wvx=4`,
      },
      timeout: 15000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      validateStatus: (status) => status < 500,
    });

    const { data: result } = response;
    if (result.collection_no) {
      return {
        code: 0,
        msg: '发送群收款成功',
        collection: result.collection_no,
        amount: (totalAmount / 100).toFixed(2),
        total_uin: totalUin,
        data: responseData,
      };
    } else {
      return {
        code: -1,
        msg: '发送群收款失败',
        data: result,
      };
    }
  }

  async setGroupDoNotDisturb(id, enable, opts) {
    const body = {
      1: 2688,
      2: 1,
      4: {
        1: {
          1: opts.group_id,
          2: {
            1: Bot[id].fl.get(id).user_uid,
            4: enable ? 4 : 1,
          },
          3: 1,
          4: 1,
        },
      },
      12: 0,
    };
    const rsp = await this.sendUni(id, 'OidbSvcTrpcTcp.0xa80_1', pb.encode(body));
    return rsp[3] === 0;
  }

  pickGroup(id, group_id) {
    group_id = Number(group_id);
    let data = {
      ...Bot[id].gl.get(group_id),
      group_id,
    };
    const default_opt = {
      isGroup: true,
      dm: false,
      group_id,
      id: group_id,
      mlist: Bot[id].gml.get(group_id),
    };
    return {
      ...data,
      ...default_opt,
      setTitle: (user_id, title) => this.setTitle(id, title, group_id, user_id),
      pokeMember: (user_id) => this.sendGroupPoke(id, group_id, user_id),
      makeForwardMsg: (MsgList) => this.makeForwardMsg(id, MsgList, default_opt),
      recallMsg: (message_id) => this.recallMsg(id, message_id, default_opt),
      sendMsg: (msg) => this.sendMsg(id, msg, default_opt),
      pickMember: this.pickMember.bind(this, id, group_id),
      getMsg: async (message_id) => (await this.getChatHistory(id, message_id, 1)).pop(),
      getChatHistory: (message_id, cnt) => this.getMsg(id, message_id, cnt, default_opt),
      _setting: (obj) => this._setting(id, obj, default_opt),
      setName: (name) => this.setName(id, name, default_opt),
      muteAll: (yes = true) => this.muteAll(id, yes, default_opt),
      announce: (msg, image) => this.sendGroupNotice(id, msg, image, default_opt),
      sendGroupNotice: (msg, image) => this.sendGroupNotice(id, msg, image, default_opt),
      setMessageRateLimit: (times) => this.setMessageRateLimit(id, times, default_opt),
      setGroupJoinType: (type, question, answer) => this.setGroupJoinType(id, type, question, answer, default_opt),
      sign: () => this.sign(id, default_opt),
      setReaction: (seq, ids, type = 1) => this.setReaction(id, seq, ids, type, default_opt),
      delReaction: (seq, ids, type = 1) => this.delReaction(id, seq, ids, type, default_opt),
      invite: (user_id) => this.invite(id, user_id, group_id, default_opt),
      setRemark: (remark) => this.setRemark(id, remark, default_opt),
      getMemberMap: () => this.getMemberMap(id, group_id),
      getMemberArray: () => this.getMemberArray(id, group_id),
      getMemberList: () => this.getMemberList(id, group_id),
      getAvatarUrl() {
        return `https://p.qlogo.cn/gh/${group_id}/${group_id}/0`;
      },
      addEssence: (message_id) => this.addEssence(id, message_id, default_opt),
      removeEssence: (message_id) => this.removeEssence(id, message_id, default_opt),
      setGrouptodo: (message_id) => this.setGrouptodo(id, message_id, default_opt),
      delGrouptodo: () => this.delGrouptodo(id, default_opt),
      setCard: (user_id, name) => this.GroupsetUserCard(id, user_id, name, default_opt),
      muteMember: (user_id, duration) => this.mute(id, duration, group_id, user_id),
      sendFile: (file, name, pid) => this.sendGroupFile(id, file, name, pid, default_opt),
      fs: this.getGroupFs(id, default_opt),
      RequestJoinGroup: this.RequestJoinGroup.bind(this, id, group_id),
      send_Group_pay: (user_ids, memo, amount) => this.send_Group_pay(id, group_id, user_ids, memo, amount),
      get_Group_pay: (collection) => this.get_Group_pay(id, collection),
      cancel_Group_pay: (collection) => this.cancel_Group_pay(id, collection),
      setGroupDoNotDisturb: (enable = true) => this.setGroupDoNotDisturb(id, enable, default_opt),
      uploadImages: (image) => this.uploadGroupImages(id, image, default_opt),
      quit: () => this.setGroupLeave(id, default_opt),
      kickMember: (user_id, msg, block) => this.kick(id, msg, block, group_id, user_id),
      transfer: (SourceUin, TargetUin) => this.Grouptransfer(id, SourceUin, TargetUin, default_opt),
      setAvatar: (image) => this.setGroupAvatar(id, image, default_opt),
      setAdmin: (user_id, yes) => this.setAdmin(id, yes, group_id, user_id),
      get is_owner() {
        return Bot[id].gml?.get(group_id)?.get(id)?.role === 'owner';
      },
      get is_admin() {
        return Bot[id].gml?.get(group_id)?.get(id)?.role === 'admin' || this.is_owner;
      },
      get mute_left() {
        return Bot[id].gl.get(group_id)?.shutup_time_me || 0;
      },
      get all_muted() {
        return Bot[id].gl.get(data.group_id)?.all_muted || false;
      },
    };
  }

  async setGroupAvatar(id, file, opts) {
    const img = new Image(id, { type: 'image', file }, opts);
    await img.task;
    const url = `http://htdata3.qq.com/cgi-bin/httpconn?htcmd=0x6ff0072&ver=5520&ukey=${Bot[id].sig.skey}&range=0&uin=${id}&seq=1&groupuin=${opts.group_id}&filetype=3&imagetype=5&userdata=0&subcmd=1&subver=101&clip=0_0_0_0&filesize=` + img.size;
    await axios.post(url, img.readable, { headers: { 'Content-Length': String(img.size) } });
    img.deleteTmpFile();
  }

  async Grouptransfer(id, SourceUin, TargetUin, opts) {
    const sourcemember = opts.mlist.get(SourceUin);
    const targetmember = opts.mlist.get(TargetUin);
    const body = {
      1: 2206,
      2: 0,
      4: {
        1: opts.group_id,
        2: sourcemember.user_uid,
        3: targetmember.user_uid,
      },
    };
    const data = await this.sendUni(id, 'OidbSvcTrpcTcp.0x89e_0', pb.encode(body));
    return data[3] === 0;
  }

  async setGroupLeave(id, opts) {
    const data = await this.sendUni(
      id,
      'OidbSvcTrpcTcp.0x1097_1',
      pb.encode({
        1: 4247,
        2: 1,
        4: {
          1: opts.group_id,
        },
        12: 1,
      })
    );
    return data[3] === 0;
  }

  async getFriendInfo(id, user_id, opts) {
    await this.FriendOperation(id, true);
    return Bot[id].fl.get(user_id);
  }

  pickFriend(id, user_id, opts) {
    user_id = Number(user_id);
    let data = {
      ...Bot[id].fl?.get(user_id),
      user_id,
    };
    const default_opt = {
      ...opts,
      ...Bot[id].fl?.get(user_id),
      isGroup: false,
      dm: true,
      user_id,
      id: user_id,
      SameGroup: opts?.group_id || false,
    };

    return {
      ...data,
      ...default_opt,
      recallMsg: (message_id) => this.recallMsg(id, message_id, default_opt),
      makeForwardMsg: (MsgList) => this.makeForwardMsg(id, MsgList, default_opt),
      sendMsg: (msg) => this.sendMsg(id, msg, default_opt),
      thumbUp: (times) => this.thumbUp(id, times, user_id, default_opt),
      getAvatarUrl() {
        return `https://q.qlogo.cn/g?b=qq&s=0&nk=${user_id}`;
      },
      sendFile: (file, name) => this.sendFriendFile(id, file, name, default_opt),
      getInfo: () => this.getFriendInfo(id, user_id, default_opt),
      searchSameGroup: () => this.searchSameGroup(id, default_opt),
      setGroupReq: (gid, seq, action = 1, reason = '', Filtered = false) => this.HandleGroupRequestOperation(id, action, seq, gid, Filtered, reason),
      setFriendReq: (action = true, Filtered = false) => this.HandleFriendRequestOperation(id, user_id, action, Filtered),
      setFriendDoNotDisturb: (enable = true) => this.setFriendDoNotDisturb(id, enable, default_opt),
      getFriendShareJson: () => this.getFriendShareJson(id, default_opt),
      delete: (block = false) => this.deleteFriend(id, user_id, block),
      addFriend: (verify_message, answer, name) => this.addFriend(id, user_id, verify_message, answer, name),
    };
  }

  async deleteFriend(id, user_id, block = false) {
    const data = await this.sendUni(
      id,
      'OidbSvcTrpcTcp.0x126b_0',
      pb.encode({
        1: 4715,
        2: 0,
        4: {
          1: {
            1: user_id,
            2: {
              1: 130,
              2: 109,
              3: {
                1: 8,
                2: 8,
                3: 50,
              },
            },
            3: block ? 1 : 0,
            4: 0,
          },
        },
        12: 1,
      })
    );
    return data[3] === 0;
  }

  async addFriend(id, user_id, verify_message = '', answer, name = null) {
    const isUID = typeof user_id === 'string' && user_id.startsWith('u_');
    const body = {
      1: 1986,
      2: 5,
      4: {
        1: id,
        2: user_id,
        3: 1,
        4: 1,
        5: 0,
        7: verify_message,
        9: 1,
        11: answer ? 3041 : 3999,
        12: answer ? 12 : 0,
        18: name,
        20: 0,
        26: answer ? answer : {},
        28: 1,
        29: 1,
        30: {},
        32: {
          1: {
            100: 0,
            101: 0,
            102: 0,
          },
        },
      },
      12: isUID ? 0 : 1,
    };
    const data = await this.sendUni(id, 'OidbSvcTrpcTcp.0x7c2_5', pb.encode(body));
    return data[3] === 0;
  }

  async getFriendShareJson(id, opts) {
    const body = {
      1: 4790,
      2: 0,
      4: {
        1: Number(opts.user_id),
        3: `mqqapi://card/show_pslcard?src_type=internal&source=sharecard&version=1&uin=${opts.user_id}`,
      },
      12: 1,
    };
    const rsp = await this.sendUni(id, 'OidbSvcTrpcTcp.0x11ca_0', pb.encode(body));
    return rsp[4][1];
  }

  async setFriendDoNotDisturb(id, enable, opts) {
    const generateTimestampData = () => {
      const buf = Buffer.allocUnsafe(8);
      const timestamp = Math.floor(Date.now() / 1000);
      buf.writeUInt32BE(timestamp, 0);
      buf.writeUInt32BE(0xffffffff, 4);
      return buf;
    };
    const body = {
      1: 1494,
      2: 19,
      4: {
        1: 0,
        2: {
          1: opts.user_uid || opts.user_id,
          400: {
            1: 13579,
            2: enable ? generateTimestampData() : null,
          },
        },
        3: 1,
      },
      12: opts?.user_uid ? 0 : 1,
    };
    const rsp = await this.sendUni(id, 'OidbSvcTrpcTcp.0x5d6_19', pb.encode(body));
    return rsp[3] === 0;
  }

  async HandleGroupRequestOperation(id, action = 1 /* 1 同意/ 2 拒绝/ 3 忽略 */, seq, gid, Filtered = false, message = '') {
    if (typeof action === 'boolean') action = action ? 1 : 2;
    const subCmd = Filtered ? 2 : 1;
    const body = {
      1: 4296,
      2: subCmd,
      4: {
        1: 5,
        2: {
          1: seq,
          2: 0,
          3: gid,
          4: message,
          5: 0,
          6: `{\"flow_id\":\"\",\"action\": ${action},\"comment\":\"\"}`,
          7: {
            1: seq,
            2: gid,
            3: 1,
            4: Bot[id].sig.seq,
          },
        },
      },
      12: 0,
    };
    const data = await this.sendUni(id, `OidbSvcTrpcTcp.0x10c8_${subCmd}`, pb.encode(body));
    return data[3] === 0;
  }

  async HandleFriendRequestOperation(id, user_id, action, Filtered = false) {
    if (typeof action === 'boolean') action = action ? 3 : 5;
    const body = {
      1: Filtered ? 3442 : 2909,
      2: Filtered ? 0 : 44,
      4: {
        1: Filtered ? id : action,
        2: user_id,
      },
      12: 1,
    };
    const data = await this.sendUni(id, Filtered ? 'OidbSvcTrpcTcp.0xd72_0' : 'OidbSvcTrpcTcp.0xb5d_44', pb.encode(body));
    return data[3] === 0;
  }

  async searchSameGroup(id, opts) {
    let body = pb.encode({
      1: 3316,
      2: 0,
      3: 0,
      4: {
        1: id,
        2: opts.user_id,
        4: 1,
        5: [
          {
            3: {
              1: id,
              2: opts.user_id,
            },
            5: 3436,
          },
          {
            3: {
              1: {
                1: {
                  6: `${opts.user_id}`,
                },
                2: 1,
              },
            },
            5: 3460,
          },
        ],
        6: 0,
      },
      6: 'android 9.0.90',
    });
    const res = await this.sendUni(id, 'OidbSvc.0xcf4', body);
    if (!res[4][12][1]) {
      return [];
    }
    return res[4][12][1].map((item) => {
      return {
        groupName: item['3'],
        Group_Id: item['1'],
      };
    });
  }

  async sendFriendFile(id, file, name = path.basename(file), opts) {
    const data = await UploadFriendfile(id, file, name, opts);
    return data;
  }

  async sendGroupPoke(id, group_id, user_id) {
    const body = pb.encode({
      1: user_id,
      2: group_id,
    });
    const payload = await this.sendOidb(id, 'OidbSvc.0xed3', body, false);
    return payload[3] === 0;
  }

  async setAdmin(id, yes = true, group_id, user_id) {
    const buf = Buffer.allocUnsafe(9);
    buf.writeUInt32BE(group_id);
    buf.writeUInt32BE(user_id, 4);
    buf.writeUInt8(yes ? 1 : 0, 8);
    const payload = await this.sendOidb(id, 'OidbSvc.0x55c_1', buf, false);
    const ret = payload[3] === 0;
    return ret;
  }

  async setTitle(id, title, group_id, user_id) {
    const body = {
      1: 2300,
      2: 2,
      4: {
        1: group_id,
        3: {
          1: Number(user_id),
          5: String(title),
          6: -1,
          7: String(title),
        },
      },
      12: 1,
    };
    const payload = await this.sendUni(id, 'OidbSvcTrpcTcp.0x8fc_2', pb.encode(body), false);
    return payload[3] === 0;
  }

  async getMemberInfo(id, group_id, user_id) {
    await Bot[id].reloadGroupMember(group_id);
    return Bot[id].gml.get(group_id).get(user_id);
  }

  async kick(id, msg = '你已被移除群聊!', block, group_id, user_id) {
    const body = pb.encode({
      1: group_id,
      2: {
        1: 5,
        2: user_id,
        3: block ? 1 : 0,
      },
      5: msg,
    });
    const payload = await this.sendOidb(id, 'OidbSvc.0x8a0_0', body, false);
    const ret = payload[4][2][1] === 0;
    return ret;
  }

  async setScreenMsg(id, isScreen = true, group_id, user_id) {
    const body = pb.encode({
      1: {
        1: {
          1: group_id,
          [isScreen ? 5 : 6]: isScreen
            ? {
                1: user_id,
              }
            : user_id,
        },
      },
    });
    const payload = await this.sendOidb(id, isScreen ? 'OidbSvc.0x8bb_7' : 'OidbSvc.0x8bb_9', body, false);
    return payload[3] === 0;
  }

  pickMember(id, group_id, user_id) {
    ((user_id = Number(user_id)), (group_id = Number(group_id)));
    let data = {
      ...Bot[id].gml.get(group_id)?.get(user_id),
      group_id,
      user_id,
    };
    return {
      ...data,
      ...this.pickFriend(id, user_id, data),
      setAdmin: (yes) => this.setAdmin(id, yes, group_id, user_id),
      setTitle: (title) => this.setTitle(id, title, group_id, user_id),
      getInfo: async () => this.getMemberInfo(id, group_id, user_id),
      kick: (msg, block = false) => this.kick(id, msg, block, group_id, user_id),
      setScreenMsg: (isScreen) => this.setScreenMsg(id, isScreen, group_id, user_id),
      poke: () => this.sendGroupPoke(id, group_id, user_id),
      mute: (duration) => this.mute(id, Number(duration), group_id, user_id),
      addFriend: (verify_message, answer) => this.addFriend(id, user_id, verify_message, answer),
      send_Group_pay: (memo, amount) => this.send_Group_pay(id, group_id, user_id, memo, amount),
      get_Group_pay: (collection) => this.get_Group_pay(id, collection),
      cancel_Group_pay: (collection) => this.cancel_Group_pay(id, collection),
      getAvatarUrl() {
        return `https://q.qlogo.cn/g?b=qq&s=0&nk=${user_id}`;
      },
      get info() {
        return Bot[id].gml.get(group_id).get(user_id);
      },
      get is_friend() {
        return Bot[id].fl?.has(user_id);
      },
      get is_owner() {
        return Bot[id].gml?.get(group_id)?.get(user_id)?.role === 'owner';
      },
      get is_admin() {
        return Bot[id].gml?.get(group_id)?.get(user_id)?.role === 'admin' || this.is_owner;
      },
    };
  }

  pickUser(id, user_id, opts = {}) {
    return this.pickFriend(id, user_id, opts);
  }

  async setBotAvatar(id, image) {
    await setAvatars(id, image);
  }

  getFriendMap(id) {
    return Bot[id].fl;
  }

  getFriendList(id) {
    const FriendArray = this.getFriendArray(id);
    return FriendArray.map((friend) => friend.user_id);
  }

  getFriendArray(id) {
    const FriendMap = this.getFriendMap(id);
    return Array.from(FriendMap.values());
  }

  getGroupMap(id) {
    return Bot[id].gl;
  }

  getGroupList(id) {
    const GroupArray = this.getGroupArray(id);
    return GroupArray.map((i) => i.group_id);
  }

  getGroupArray(id) {
    const GroupMap = this.getGroupMap(id);
    return Array.from(GroupMap.values());
  }

  getGroupMemberMap(id) {
    return Bot[id].gml;
  }

  async setGender(id, gender) {
    const uinBuf = Buffer.alloc(4);
    uinBuf.writeUInt32BE(parseInt(id));
    const genderValue = gender === 1 ? 1 : 2;
    const genderBuf = Buffer.from([genderValue]);
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16BE(genderBuf.length);
    const body = {
      1: 1279,
      2: 9,
      4: Buffer.concat([uinBuf, Buffer.from([0x00, 0x00, 0x01, 0x4e, 0x29]), lenBuf, genderBuf]),
    };
    const data = await this.sendUni(id, 'OidbSvc.0x4ff_9_IMCore', pb.encode(body));
    return data[3] === 0;
  }

  /**
   * 设置生日
   * @param birthday `YYYYMMDD`格式的`string`（会过滤非数字字符）或`number`
   */
  async setBirthday(id, birthday) {
    const uinBuf = Buffer.alloc(4);
    uinBuf.writeUInt32BE(parseInt(id));
    let birthdayStr = birthday.toString().replace(/\D/g, '');
    if (birthdayStr.length !== 8) {
      throw new Error('生日格式必须为YYYYMMDD');
    }
    const year = parseInt(birthdayStr.substring(0, 4));
    const month = parseInt(birthdayStr.substring(4, 6));
    const day = parseInt(birthdayStr.substring(6, 8));
    const birthdayBuf = Buffer.alloc(4);
    birthdayBuf.writeUInt16BE(year, 0);
    birthdayBuf.writeUInt8(month, 2);
    birthdayBuf.writeUInt8(day, 3);
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16BE(birthdayBuf.length);
    const body = {
      1: 1279,
      2: 9,
      4: Buffer.concat([uinBuf, Buffer.from([0x00, 0x00, 0x01, 0x65, 0x93]), lenBuf, birthdayBuf]),
    };

    const data = await this.sendUni(id, 'OidbSvc.0x4ff_9_IMCore', pb.encode(body));
    return data[3] === 0;
  }

  async setNickname(id, nickname) {
    const uinBuf = Buffer.alloc(4);
    uinBuf.writeUInt32BE(parseInt(id));
    const nameBuf = Buffer.from(nickname, 'utf8');
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16BE(nameBuf.length);
    const body = {
      1: 1279,
      2: 9,
      4: Buffer.concat([uinBuf, Buffer.from([0x00, 0x00, 0x01, 0x4e, 0x22]), lenBuf, nameBuf]),
    };
    const data = await this.sendUni(id, 'OidbSvc.0x4ff_9_IMCore', pb.encode(body));
    return data[3] === 0;
  }

  async setSignature(id, sign) {
    const body = {
      1: 4394,
      2: 2,
      4: {
        1: id,
        2: {
          1: 102, // 20009  昵称
          2: sign,
        },
      },
      12: 0,
    };
    const payload = await this.sendUni(id, 'OidbSvcTrpcTcp.0x112a_2', pb.encode(body));
    return payload[3] === 0;
  }

  async setDescription(id, description) {
    const uinBuf = Buffer.alloc(4);
    uinBuf.writeUInt32BE(parseInt(id));
    const descriptionBuf = Buffer.from(description, 'utf8');
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16BE(descriptionBuf.length);
    const body = {
      1: 1279,
      2: 9,
      4: Buffer.concat([uinBuf, Buffer.from([0x00, 0x00, 0x01, 0x4e, 0x33]), lenBuf, descriptionBuf]),
    };
    const data = await this.sendUni(id, 'OidbSvc.0x4ff_9_IMCore', pb.encode(body));
    return data[3] === 0;
  }

  /**
   * 设置邮箱
   * @param email 邮箱地址
   */
  async setEmail(id, email) {
    const uinBuf = Buffer.alloc(4);
    uinBuf.writeUInt32BE(parseInt(id));

    const emailBuf = Buffer.from(email, 'utf8');
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16BE(emailBuf.length);

    const body = {
      1: 1279,
      2: 9,
      4: Buffer.concat([uinBuf, Buffer.from([0x00, 0x00, 0x01, 0x4e, 0x2b]), lenBuf, emailBuf]),
    };

    const data = await this.sendUni(id, 'OidbSvc.0x4ff_9_IMCore', pb.encode(body));
    return data[3] === 0;
  }

  /**
   * 设置所在地
   * @param countryCode 国家编码（十进制）
   * @param provinceCode 省份编码（十进制）
   * @param cityCode 城市编码（十进制，可选）
   */
  async setLocation(id, countryCode = 49, provinceCode, cityCode = 0, areaLevel = 0) {
    const uinBuf = Buffer.alloc(4);
    uinBuf.writeUInt32BE(parseInt(id));
    const locationBuf = Buffer.alloc(20);
    // 国家编码
    locationBuf.writeUInt32BE(countryCode, 0);
    // 省份编码
    locationBuf.writeUInt32BE(provinceCode, 4);
    // 城市编码
    locationBuf.writeUInt32BE(cityCode, 8);
    locationBuf.writeUInt16BE(0x4e49, 12); // "NI"
    locationBuf.writeUInt16BE(0x0004, 14);
    locationBuf.writeUInt32BE(0x00000000, 16);
    locationBuf.writeUInt32BE(areaLevel, 16);
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16BE(locationBuf.length);
    const body = {
      1: 1279,
      2: 9,
      4: Buffer.concat([uinBuf, Buffer.from([0x00, 0x00, 0x02, 0x4e, 0x40]), lenBuf, locationBuf]),
    };
    const data = await this.sendUni(id, 'OidbSvc.0x4ff_9_IMCore', pb.encode(body));
    return data[3] === 0;
  }

  /**
   * 设置故乡
   * @param country 国家编码（数字或3字符代码）
   * @param province 省份编码（数字或字符串，可选）
   * @param city 城市编码（数字或字符串，可选）
   * @param areaLevel 地区层级（数字，可选）
   */
  async setHometown(id, country = 49, province = 0, city = 0, areaLevel = 0) {
    const uinBuf = Buffer.alloc(4);
    uinBuf.writeUInt32BE(parseInt(id));
    const hometownBuf = Buffer.alloc(20);
    const isNumeric = typeof country === 'number';
    if (isNumeric) {
      hometownBuf.writeUInt32BE(country, 0); // 国家
      hometownBuf.writeUInt32BE(province, 4); // 省份
      hometownBuf.writeUInt32BE(city, 8); // 城市
    } else {
      // 国家（3字符 + 1填充）
      hometownBuf.write(country.substring(0, 3), 0, 3, 'ascii');
      hometownBuf.writeUInt8(0, 3);
      // 省份（全0，因为阿富汗没有省份层级）
      hometownBuf.writeUInt32BE(0, 4);
      if (typeof city === 'string') {
        hometownBuf.write(city.substring(0, 3), 8, 3, 'ascii');
        hometownBuf.writeUInt8(0, 11);
      } else {
        hometownBuf.writeUInt32BE(0, 8);
      }
    }
    hometownBuf.writeUInt16BE(0x4e4b, 12); // "NK"
    hometownBuf.writeUInt16BE(0x0004, 14);
    hometownBuf.writeUInt32BE(areaLevel, 16);
    const lenBuf = Buffer.alloc(2);
    lenBuf.writeUInt16BE(hometownBuf.length);
    const body = {
      1: 1279,
      2: 9,
      4: Buffer.concat([uinBuf, Buffer.from([0x00, 0x00, 0x02, 0x5d, 0xc2]), lenBuf, hometownBuf]),
    };
    const data = await this.sendUni(id, 'OidbSvc.0x4ff_9_IMCore', pb.encode(body));
    return data[3] === 0;
  }

  async getChatHistory(id, message_id, count = 20) {
    if (message_id.length > 28) {
      const { group_id, seq } = (0, parseGroupMessageId)(message_id);
      return this.pickGroup(id, group_id).getChatHistory(seq, count);
    } else {
      const { user_id, time } = (0, parseDmMessageId)(message_id);
      return this.pickFriend(id, user_id).getChatHistory(time, count);
    }
  }

  async fetch_custom_face(id) {
    const body = {
      1: {
        1: 109,
        2: '12',
      },
      2: id,
      3: 1,
      4: {
        1: 1,
      },
      6: 1,
    };
    const response = await this.sendUni(id, 'Faceroam.OpReq', pb.encode(body));
    if (response?.['1'] === 0 && response?.['4']?.['6']) {
      const linkArray = response['4']['6'].map((item) => item['3']);
      return linkArray.reverse();
    }
    return [];
  }

  async connect(id) {
    if (Bot.uin.includes(id)) return false;
    if (!this.token) this.token = await this.calculateToken(config.http_secretToken);
    const deviceinfo = await this.Getdeviceinfo(Number(id));
    Bot[id] = {
      adapter: this,
      sig: {
        bigdata: {},
        skey: '',
        pskeys: new Map(),
        skey_time: 0,
        client_key_info: {
          client_key: '',
          time: 0,
        },
        seq: this.seq++,
        rkey_info: {
          10: {},
          20: {},
          time: 0,
        },
      },
      device: deviceinfo?.data || deviceinfo,
      stat: {
        start_time: Math.floor(Date.now() / 1000),
        recv_msg_cnt: 0,
        recv_pkt_cnt: 0,
        sent_pkt_cnt: 0,
        lost_pkt_cnt: 0,
        sent_msg_cnt: 0,
        msg_cnt_per_min: 0,
        remote_ip: '',
        remote_port: '',
        ver: this.version,
      },
      qzone_event: new Map(),
      cookies: {},
      get statistics() {
        return this.stat;
      },
      start_time: Math.floor(Date.now() / 1000),
      info: {},
      get uin() {
        return this.info.user_id;
      },
      get uid() {
        return this.info.user_uid;
      },
      get nickname() {
        return this.info.nickname;
      },
      get avatar() {
        return `https://q.qlogo.cn/g?b=qq&s=0&nk=${this.uin}`;
      },
      fl: new Map(),
      gl: new Map(),
      gml: new Map(),
      uid2uin: new Map(),
      gid_uid2uin: new Map(),
      qzone_event: new Map(),
      uin2uid: new Map(),

      sendMsgtoPhone: this.sendMsgtoPhone.bind(this, id),
      getPSkey: this.GetPSkey.bind(this, id),
      GetClientKey: this.GetClientKey.bind(this, id),
      setAvatar: this.setBotAvatar.bind(this, id),

      getFriendArray: () => this.getFriendArray(id),
      getFriendList: () => this.getFriendList(id),
      getFriendMap: () => this.getFriendMap(id),
      getGroupArray: () => this.getGroupArray(id),
      getGroupList: () => this.getGroupList(id),
      getGroupMap: () => this.getGroupMap(id),
      getGroupMemberMap: () => this.getGroupMemberMap(id),

      setNickname: (nickname) => this.setNickname(id, nickname),
      setSignature: (signature = '') => this.setSignature(id, signature),
      setGender: (gender = 1) => this.setGender(id, gender),
      setBirthday: (birthday) => this.setBirthday(id, birthday),
      setDescription: (description = '') => this.setDescription(id, description),
      setEmail: (email) => this.setEmail(id, email),
      setHometown: (country, province, city, areaLevel) => this.setHometown(id, country, province, city, areaLevel),
      setLocation: (country, province, city, areaLevel) => this.setLocation(id, country, province, city, areaLevel),

      getMsg: async (message_id) => (await this.getChatHistory(id, message_id, 1)).pop(),
      getChatHistory: (message_id, count = 20) => this.getChatHistory(id, message_id, count),
      sendLike: (user_id, times = 1) => this.pickFriend(id, user_id).thumbUp(times),

      sendUni: this.sendUni.bind(this, id),
      sendOidbSvcTrpcTcp: this.sendOidbSvcTrpcTcp.bind(this, id),
      sendOidb: this.sendOidb.bind(this, id),
      pickFriend: this.pickFriend.bind(this, id),
      pickGroup: this.pickGroup.bind(this, id),
      pickMember: this.pickMember.bind(this, id),

      inviteFriend: (group_id, user_id) => this.pickGroup(id, group_id).invite(user_id),
      deleteFriend: (user_id, block = true) => this.pickFriend(id, user_id).delete(block),
      sendGroupPoke: (group_id, user_id) => this.pickMember(id, group_id, user_id).poke(),

      reloadFriendList: () => this.FriendOperation(id, true),
      reloadGroupList: () => this.GroupsOperation(id, true),
      reloadGroupMember: (group_id, force = true) => this.getMemberinfo(id, group_id, force),
      refreshBigDataSession: this.GetBigdata.bind(this, id, true),

      getCookies: (domain, force = false, isJson = false) => this.GetCookies(id, domain, force, isJson),
      qzoneGet: this.qzoneGet.bind(this, id),
      fetch_custom_face: this.fetch_custom_face.bind(this, id),
      addFriend: this.addFriend.bind(this, id),
      refreshRkey: this.getRkey.bind(this, id, true),

      uploadNTC2CImages: this.uploadNTC2CImages.bind(this, id),
      setGroupLeave: (group_id) => this.pickGroup(id, group_id).quit(),
      setModel: this.setModel.bind(this, id),

      sendApi: this.sendApi.bind(this),

      version: {
        id: this.id,
        name: this.name,
        version: this.version,
      },
      apk: {
        subid: 537320212,
        version: this.version,
        display: this.name,
        ver: this.version,
      },
      request_list: [],
      bkn: '',
      pb,
      getCsrfToken() {
        return this.bkn;
      },
      getSystemMsg() {
        return this.request_list;
      },
    };

    if (!Bot.uin.includes(id)) Bot.uin.push(id);
    Bot[id].sdk = Bot[id];
    await this.FriendOperation(id); // 加载好友
    await this.GetClientKey(id);
    Bot.makeLog('mark', `Welcome, ${Bot[id].nickname} ! 正在加载资源...`, id);
    await this.GetPSkey(id);
    this.getRkey(id);
    await this.GroupsOperation(id); // 群列表
    this.GetBigdata(id);
    let totalUsers = 0;
    for (let innerMap of Bot[id].gml.values()) totalUsers += innerMap.size;
    Bot.makeLog('mark', `加载了${Bot[id].fl.size}个好友，${Bot[id].gl.size}个群, ${totalUsers}个群员`, id);
    Bot.makeLog('mark', `${this.name}(${this.id}) ${this.version} 已连接`, id);
    Bot.em(`connect.${id}`, { self_id: id });
    this.GetCookies(id);
    Bot[id].job = schedule.scheduleJob('0 10 0/1 * * ? ', async () => {
      (await this.getRkey(id), await this.GetPSkey(id), await this.GetClientKey(id));
      if (Math.floor(Date.now() / 1000) - Bot[id].sig.skey_time > 60 * 60 * 6) (await this.GetCookies(id), await this.GroupsOperation(id));
    });
  }

  async setModel(id, modelName, IMei) {
    const url = 'https://proxy.vip.qq.com/cgi-bin/srfentry.fcgi';
    const data = {
      13031: {
        req: {
          lUin: id,
          sModel: encodeURIComponent(modelName),
          iAppType: 0,
          sIMei: IMei,
          bShowInfo: true,
          sModelShow: encodeURIComponent(modelName),
          bRecoverDefault: !modelName,
        },
      },
    };

    const cookies = await Bot[id].getCookies('vip.qq.com', false, true);
    const cookie = `uin=${cookies.uin}; skey=${cookies.skey}; p_uin=${cookies.uin}; p_skey=${cookies.p_skey}`;
    const gtk = this.getGTK(cookies.p_skey);
    const params = {
      ts: Date.now(),
      g_tk: gtk,
      data: JSON.stringify(data),
      daid: 18,
    };
    const response = await axios.get(url, {
      params,
      headers: {
        Cookie: cookie,
      },
    });
    return response.data;
  }

  async GetPSkey(id, domain = QQ_domains_lists, force = false) {
    if (!Array.isArray(domain)) domain = [domain];
    let pskeys_cache = [];
    for (let i of domain) {
      const existingPskey = Bot[id].sig.pskeys.get(i);
      if (!force && existingPskey && existingPskey.pskey_time > Date.now() / 1000) pskeys_cache.push(existingPskey);
      if (pskeys_cache.length === domain.length) return pskeys_cache;
    }
    pskeys_cache = [];
    const body = {
      1: 4138,
      2: 0,
      3: 0,
      4: {
        1: domain,
      },
      12: 1,
    };
    const data = await this.sendUni(id, 'OidbSvcTrpcTcp.0x102a_0', pb.encode(body));
    let pskeys = data[4][1];
    if (!Array.isArray(pskeys)) pskeys = [pskeys];
    for (let i of pskeys) {
      const pskey = i[2];
      const expireTime = Date.now() / 1000 + 1800;
      const pskey_data = {
        domain: i[1],
        p_skey: pskey,
        pskey_time: expireTime,
        expire_time: Math.floor(expireTime),
      };
      Bot[id].sig.pskeys.set(i[1], pskey_data);
      pskeys_cache.push(pskey_data);
    }
    return pskeys_cache;
  }

  async GetCookies(id, domain = 'ti.qq.com', force = false, isJson = false) {
    const client_key = await this.GetClientKey(id, force);
    let CookieFnc = new Cookies(id, client_key);
    const cookie_data = await CookieFnc.getDomainCookies(domain);
    Bot[id].sig.skey_time = Math.floor(Date.now() / 1000);
    if (cookie_data?.skey) Bot[id].sig.skey = cookie_data.skey;
    if (cookie_data?.code === -1) {
      const client_key = await this.GetClientKey(id, true);
      CookieFnc = new Cookies(id, client_key);
      const cookie_data = await CookieFnc.getDomainCookies('qun.qq.com');
      Bot[id].sig.skey = cookie_data.skey;
      if (Bot[id].sig.pskeys.size > 0) {
        const cookies = Bot[id].cookies;
        for (const [domain, pskeyData] of Bot[id].sig.pskeys) {
          if (pskeyData.pskey_time > Date.now() / 1000) cookies[domain] = `uin=o${id}; skey=${cookie_data.skey}; p_uin=o${id}; p_skey=${pskeyData.p_skey}`;
        }
      }
      const p_skey = (await this.GetPSkey(id, domain, force)).find((i) => i.domain === domain)?.p_skey;
      const cookies = `uin=o${id}; skey=${Bot[id].sig.skey}; p_uin=o${id}; p_skey=${p_skey}`;
      Bot[id].cookies[domain] = cookies;
      if (isJson)
        return {
          uin: `o${id}`,
          skey: Bot[id].sig.skey,
          p_uin: `o${id}`,
          p_skey,
        };
      return cookies;
    }

    const p_skey = cookie_data.p_skey || (await this.GetPSkey(id, domain, force)).find((i) => i.domain === domain)?.p_skey;
    const cookies = `uin=o${id}; skey=${Bot[id].sig.skey}; p_uin=o${id}; p_skey=${p_skey}`;
    Bot[id].cookies[domain] = cookies;
    Bot[id].bkn = this.GTK(Bot[id].sig.skey);
    if (Bot[id].sig.pskeys.size > 0) {
      const cookies = Bot[id].cookies;
      for (const [domain, pskeyData] of Bot[id].sig.pskeys) {
        if (pskeyData.pskey_time > Date.now() / 1000) cookies[domain] = `uin=o${id}; skey=${cookie_data.skey}; p_uin=o${id}; p_skey=${pskeyData.p_skey}`;
      }
    }

    if (QQ_domains_lists.includes(domain)) {
      const pskey_data = {
        domain,
        p_skey,
        pskey_time: Bot[id].sig?.pskeys?.get(domain)?.pskey_time || Date.now() / 1000 + 1800,
      };
      Bot[id].sig.pskeys.set(domain, pskey_data);
    }
    if (isJson)
      return {
        uin: `o${id}`,
        skey: Bot[id].sig.skey,
        p_uin: `o${id}`,
        p_skey,
      };
    return cookies;
  }

  GTK(skey) {
    let hash = 5381;
    for (let i = 0; i < skey.length; i++) {
      hash += (((hash << 5) & 2147483647) + skey.charCodeAt(i)) & 2147483647;
      hash &= 2147483647;
    }
    return hash;
  }

  getGTK(pskey) {
    let hash = 5381;
    for (let i = 0; i < pskey.length; i++) {
      hash = hash * 33 + pskey.charCodeAt(i);
      if (hash > 0x7fffffff) {
        hash = hash & 0x7fffffff;
      }
    }
    return hash;
  }

  async Login(account = 1000000, fastLogin = false) {
    const params = {
      sign: this.token,
      account,
      appid: 0,
      online: true,
      ...(!fastLogin
        ? {
            gm: 'SL',
          }
        : {}),
    };
    const response = await axios.post(config.http_url + '/uin-list-set-online', params);
    return response.data;
  }

  async Cancel_Login(mid) {
    const params = {
      sign: this.token,
      mid,
      key: 'cancel',
      value: '1',
    };
    const response = await axios.post(config.http_url + '/uin-list-set-event', params);
    return response.data;
  }

  async Set_Debug(id) {
    const params = {
      sign: this.token,
      account: Number(id),
      key: 'debug',
      value: true,
    };
    const response = await axios.post(config.http_url + '/uin-list-set-switch', params);
    return response.data;
  }

  async Getdeviceinfo(account) {
    const params = {
      sign: this.token,
      account,
    };
    const response = await axios.post(config.http_url + '/device-info-pull', params);
    return response.data;
  }

  async Check_Login(mid) {
    const params = {
      sign: this.token,
      mid,
    };
    const response = await axios.post(config.http_url + '/uin-list-get-event', params);
    return response.data;
  }

  async calculateToken(secretToken) {
    const tokenString = `token:${secretToken}`;
    const hash = crypto.createHash('sha256');
    hash.update(tokenString);
    return hash.digest('hex');
  }

  async load() {
    this.token = await this.calculateToken(config.http_secretToken);
  }

  handleMessage(data) {
    this.handleServerEvent(data);
    /*
    const echo = data.seq;
    if (echo !== undefined) {
      this.handleResponse(data);
    } else {
      this.handleServerEvent(data);
    }
    */
  }

  handleResponse(response) {
    const cache = this.echo.get(response.seq);
    cache.resolve(response);
  }

  handleServerEvent(event) {
    switch (event.cmd) {
      case 'PushOicqMsg':
        this.handleOicqMsg(event.data);
        break;
      case 'Heartbeat':
        this.sendHeartbeat(event);
        break;
      default:
        Bot.makeLog('info', ['未知事件', event], 'Secluded');
    }
  }

  async sendHeartbeat(event) {
    const { default: sec_ws } = await import('./WebSocket.js');
    const authMessage = {
      cmd: 'SyncOicq',
      rsp: true,
      data: {
        pid: 'secluded.plugin.demo',
        name: 'demo-java',
        token: config.ws_secretToken,
      },
    };
    const k = await sec_ws.Ws_send_Sec(authMessage);
    const list = k.data.list;
    await Promise.all(
      list
        .filter((item) => {
          const num = Number(item);
          return num !== 0 && num !== 1000000;
        })
        .map((item) => this.connect(Number(item)))
    );
    sec_ws.send(JSON.stringify(event));
    Bot.makeLog('debug', ['[Secluded] 发送心跳'], 'Secluded');
  }

  async uploadNTC2CImages(id, file) {
    const payload = await uploadNTImages(id, segment.image(file), { dm: true, ...Bot[id].pickFriend(id) });
    if (payload.code !== 0) return {};
    let buf = Buffer.from(payload.file.replace('protobuf://', ''), 'base64');
    const proto = pb.decode(buf)[2];
    if (!proto) return {};
    const url = `https://${proto[1][2][3]}${proto[1][2][1]}${proto[1][2][2][1]}${proto[2][1][11][30]}`;
    return {
      ...payload,
      url,
    };
  }

  async makeMsg(id, msg, opts) {
    if (!Array.isArray(msg)) msg = [msg];
    const messages = [];
    const flash_msg = [];
    const forward = [];
    for (let message of msg) {
      if (typeof message === 'object')
        message = {
          ...message,
        };
      else
        message = {
          type: 'text',
          text: message,
        };
      switch (message.type) {
        case 'image':
          messages.push(await uploadNTImages(id, message, opts));
          break;
        case 'video':
          messages.push(await uploadntVideo(id, message, opts));
          break;
        case 'bubble':
          messages.push(await uploadntVideo(id, message, opts, true));
          break;
        case 'record':
          messages.push(await uploadPtt(id, message, opts, message?.transcoding, message?.isAI, message?.bs));
          break;
        case 'node':
          for (const node of message.data) {
            forward.push({
              user_id: 80000000,
              nickname: '匿名消息',
              ...node,
              message: await this.makeMsg(id, node.message, opts),
            });
          }
          continue;
        case 'button':
          break;
        case 'markdown':
          break;
        case 'flash_msg':
          const options = {
            ...opts,
            flash_name: message.flash_name,
            send: message.send,
            image: segment.image(message?.image || `https://q.qlogo.cn/g?b=qq&s=0&nk=${id}`),
          };
          flash_msg.push(await UploadflashTransfer(id, message.files, options));
          break;
        case 'long_msg':
          if (msg.length > 1) continue;
        default:
          if (Converter.prototype.hasOwnProperty(message.type)) {
            messages.push(message);
            continue;
          }
          break;
      }
    }
    if (forward.length) messages.push(await this.makeForwardMsg(id, forward, opts));
    return messages;
  }

  async uploadGroupImages(id, image, opts) {
    const img = new Image(id, segment.image(image), opts);
    img.upload = await uploadImages(id, img, opts);
    if (img.upload[0].status === 'fulfilled') {
      const data = await getImageSize(image);
      img.width = data.width;
      img.height = data.height;
      img.code = 0;
      img.url = `https://gchat.qpic.cn/gchatpic_new/0/0-0-${img.md5.toString('hex').toUpperCase()}/0`;
    }
    return img;
  }

  async thumbUp(id, times = 1, user_id, opts, remain = 0, sucs = 0) {
    const data = [{ Account: String(id), FavoriteCard: 'FavoriteCard', Uid: Bot[id].uin2uid.get(user_id).user_uid, Uin: String(user_id), Value: String(times) }];
    const rsp = await this.sendApi(data);
    const suc = rsp.data[0].Value;
    if (rsp.data[0].No) {
      Bot.makeLog('warn', `[Friend: ${user_id}]点赞失败：${rsp.data[0].No}`, id);
      return false;
    }
    return true;
  }

  async makeForwardMsg(id, MsgList, opts) {
    if (!Array.isArray(MsgList)) MsgList = [MsgList];
    const MultiMsg = [];
    const nodes = [];
    let cnt = 0,
      preview = [];
    for (let elem of MsgList) {
      let message = Array.isArray(elem.message) ? elem.message : [elem.message];
      if (message.length === 1 && typeof message?.[0] !== 'string' && ['json', 'xml'].includes(message?.[0]?.type)) {
        const Elem = message[0];
        const multimsg_elem = parseMultimsg(Elem);
        if (!multimsg_elem) continue;
        const resid = multimsg_elem.resid,
          fileName = multimsg_elem.filename;
        if (resid && fileName) {
          try {
            const buff = await this._newDownloadMultiMsg(id, String(resid), opts.dm ? 1 : 2, opts.id);
            const messageArray = [].concat(buff?.[2] || []);
            for (const val of messageArray) {
              if (!val || typeof val !== 'object') continue;
              const fileNameStr = val[1]?.toString();
              const nodes = [].concat(val?.[2]?.[1]?.[3]?.[1]?.[2] || []);
              const hasKey53 = nodes.some((node) => node && Object.keys(node).includes('53'));
              if (hasKey53) break;
              MultiMsg.push(
                fileNameStr === 'MultiMsg'
                  ? {
                      1: fileName,
                      2: val[2],
                    }
                  : val
              );
            }
          } catch (error) {}
        }
      }

      const messages = await this.makeMsg(id, message, opts);
      if (messages.length === 0) return true;
      const { rich, brief } = await this._preprocess(id, messages, opts);
      nodes.push({
        1: {
          1: Number(elem?.user_id || elem?.uin || opts.id || 80000000),
          5: opts.dm ? elem?.user_id || elem.uin || opts.id : null,
          6: opts.dm ? '' : null,
          7: opts.dm
            ? {
                6: elem.nickname || elem.name || '匿名消息',
              }
            : null,
          8: opts.dm
            ? null
            : {
                1: Number(opts?.group_id || elem?.user_id || elem.uin || opts.id || 80000000),
                4: elem.nickname || elem.name || '匿名消息',
                5: 2,
              },
        },
        2: {
          1: opts.dm ? 9 : 82,
          2: opts.dm ? 175 : null,
          3: opts.dm ? 175 : null,
          4: elem.rand ?? RandomUInt(),
          5: elem.seq ?? RandomUInt(),
          6: elem.time || Math.floor(Date.now() / 1000),
          7: 1,
          8: 0,
          9: 0,
          15: {
            1: 0,
            2: 0,
            3: 0,
            5: '',
            6: '',
          },
        },
        3: {
          1: rich,
        },
      });
      if (cnt < 3) {
        preview.push({
          text: `${elem.nickname || elem.name || 'QQ用户'}: ${brief.slice(0, 50)}`,
        });
        cnt++;
      }
    }

    MultiMsg.push({
      1: 'MultiMsg',
      2: {
        1: nodes,
      },
    });
    const compressed = await gzip(
      pb.encode({
        2: MultiMsg,
      })
    );
    const body = {
      2: {
        1: opts.dm ? 1 : 3,
        2: {
          2: String(opts.id),
        },
        3: opts.id,
        4: compressed,
      },
      15: {
        1: 4,
        2: 1,
        3: 7,
      },
    };
    const payload = await this.sendUni(id, 'trpc.group.long_msg_interface.MsgService.SsoSendLongMsg', pb.encode(body), false);
    const rsp = payload?.[2];
    let resid = rsp[3].toString();
    const uniseq = uuid().toLowerCase();
    const xml = `<?xml version="1.0" encoding="UTF-8"?><msg brief="[聊天记录]" m_fileName="${uniseq}" action="viewMultiMsg" tSum="${nodes.length}" flag="3" m_resid="${resid}" serviceID="35" m_fileSize="0"><item layout="1"><title color="#000000" size="80">${opts?.source || '聊天记录'}</title><title color="#777777" size="26">${opts?.news?.map((p) => p.text).join('\n') || preview.map((p) => p.text).join('\n')}</title><hr></hr><summary color="#808080" size="26">${opts?.summary || `查看${nodes.length}条转发消息`}</summary></item><source name="${opts?.prompt || '[聊天记录]'}"></source></msg>`;
    const json = {
      app: 'com.tencent.multimsg',
      config: {
        autosize: 1,
        forward: 1,
        round: 1,
        type: 'normal',
        width: 300,
      },
      desc: '[聊天记录]',
      extra: {
        filename: uniseq,
        tsum: nodes.length,
      },
      meta: {
        detail: {
          news: opts?.news || preview,
          resid: resid,
          source: opts?.source || '群聊的聊天记录',
          summary: opts?.summary || `查看${nodes.length}条转发消息`,
          uniseq: uniseq,
        },
      },
      prompt: opts?.prompt || '[聊天记录]',
      ver: '0.0.0.5',
      view: 'contact',
    };
    return {
      type: config.bot.xml ? 'xml' : 'json',
      data: config.bot.xml ? xml : json,
      id: 35,
    };
  }

  async _newDownloadMultiMsg(id, resid, bu, target) {
    const body = pb.encode({
      1: {
        1: {
          2: target,
        },
        2: resid,
        3: bu === 2 ? 3 : 1,
      },
      15: {
        1: 2,
        2: 2,
        3: 9,
        4: 0,
      },
    });
    const payload = await this.sendUni(id, 'trpc.group.long_msg_interface.MsgService.SsoRecvLongMsg', body, false);
    const rsp = payload?.[1];
    return pb.decode(await gunzip(rsp[4].toBuffer()));
  }

  async _preprocess(id, messages, opts) {
    const _Converter = new Converter(id, messages, opts);
    if (_Converter.imgs.length) for (const img of _Converter.imgs) await uploadImages(id, img, opts);
    const rich = _Converter.rich;
    const brief = _Converter.brief;
    return {
      rich,
      brief,
    };
  }

  _getRouting(opts) {
    if (opts.isGroup) {
      return {
        2: {
          1: Number(opts.group_id),
        },
      };
    } else {
      if (opts.SameGroup) {
        return {
          3: {
            3: Number(opts.SameGroup),
            4: opts.user_uid,
          },
        };
      }
      return {
        1: {
          1: Number(opts.user_id),
        },
      };
    }
  }

  async sendMsgtoPhone(id, msg) {
    const rand = RandomUInt();
    const rets = { message_id: [], data: [], error: [] };
    let message_id,
      seq = this.seq++,
      time;
    const packet = {
      1: {
        15: {
          2: 7,
          3: {
            1: {
              1: 1001,
              2: 0,
              10: 2,
            },
            3: {
              1: 1,
              2: 1,
              10: 1,
            },
          },
          8: Bot[id].uid,
        },
      },
      2: {
        1: 1,
        2: 0,
        3: 0,
      },
      3: {
        2: {
          1: 4,
          2: {
            1: 1,
            2: 1,
            3: 1001,
            4: 0,
            9: 1,
            10: 2,
          },
          6: {
            1: Math.floor(Date.now() / 1000),
            2: 1,
            3: 0,
            4: 1,
            5: {
              1: {
                1: 1,
                2: String(msg),
              },
            },
          },
        },
      },
      4: seq,
      5: rand,
    };
    const rsp = await this.sendUni(id, 'MessageSvc.PbSendMsg', pb.encode(packet), false);
    if (rsp[1] !== 0) {
      Bot.makeLog('error', `failed to send: [Private: ${id}] ${rsp[2] || '私聊消息发送失败，可能被风控'}(code:${rsp[1]})`, id);
      rets.error.push({ rand, code: rsp[1], message: rsp[2] || '私聊消息发送失败，可能被风控' });
      return rets;
    }
    time = rsp[3];
    message_id = genDmMessageId(id, seq, rand, time, 1, rsp[14]);
    rets.message_id.push(message_id);
    const messageRet = { message_id, seq, rand, time, subSeq: rsp[14] };
    rets.data.push(messageRet);
    Bot.makeLog('info', `succeed to send: [Private(${id})] ` + msg, id);
    return rets;
  }

  async sendMsg(id, msg, opts = {}) {
    const messages = await this.makeMsg(id, msg, opts);
    if (messages.length === 0) return true;
    const { rich, brief } = await this._preprocess(id, messages, opts);
    const rand = RandomUInt();
    let message_id,
      seq = this.seq++,
      time;
    const packet = {
      1: this._getRouting(opts),
      2: {
        1: 1,
        2: 0,
        3: 0,
      },
      3: {
        1: rich,
      },
      4: opts.dm ? seq : rand,
      5: rand,
      ...(opts.dm ? { 6: { 1: Math.floor(Date.now() / 1000) } } : {}),
    };
    const rsp = await this.sendUni(id, 'MessageSvc.PbSendMsg', pb.encode(packet), false);
    const rets = { message_id: [], data: [], error: [] };
    if (opts.dm) {
      if (rsp[1] !== 0 || rsp[14] === 0) {
        Bot.makeLog('error', `failed to send: [Private: ${opts.id}] ${rsp[2] || '私聊消息发送失败，可能被风控'}(code:${rsp[1]})`, id);
        rets.error.push({ rand, code: rsp[1], message: rsp[2] || '私聊消息发送失败，可能被风控' });
        return rets;
      }
      time = rsp[3];
      message_id = genDmMessageId(opts.user_id, seq, rand, time, 1, rsp[14]);
      rets.message_id.push(message_id);
      const messageRet = { message_id, seq, rand, time, subSeq: rsp[14] };
      rets.data.push(messageRet);
      Bot.makeLog('info', `succeed to send: [Private(${opts.user_id})] ` + brief, id);
      return rets;
    } else {
      if (rsp[1] !== 0) {
        Bot.makeLog('error', `failed to send: [Group: ${opts.id}] ${rsp[2] || '群聊消息发送失败，可能被风控'}(code:${rsp[1]})`, id);
        rets.error.push({ rand });
        return rets;
      }
      if (rsp.checkTag(11, 12) && rsp[11] > 0) ((seq = rsp[11]), (time = rsp[3]));
      message_id = genGroupMessageId(opts.group_id, id, rsp[11], rand, rsp[3], 1, id);
      rets.message_id.push(message_id);
      const messageRet = { message_id, seq, rand, time };
      rets.data.push(messageRet);
      Bot.makeLog('info', `succeed to send: [Group(${opts.group_id})] ` + brief, id);
      return rets;
    }
  }

  async makePrivateMessage(id, payload) {
    const raw_data = pb.decode(payload);
    if (!raw_data[1] || !raw_data[1]?.[3]) return false;
    let data = new PrivateMessage(id, raw_data[1], id, true);
    data.self_id = id;
    data.bot = Bot[id];
    data.sender = {
      ...data.sender,
      ...(Bot[id].fl?.get(data.user_id) || {}),
    };
    data.isGroup = false;
    if (data?.source) data.getReply = async () => (await this.getMsg(id, data.source.time, 1, { dm: true, ...data, id: data.user_id, isGroup: false }))[0];
    if (data.sender?.group_id) {
      data.friend = this.pickFriend(id, data.sender.user_id, { user_id: data.sender.user_id, user_uid: data.sender.user_uid, SameGroup: data.sender?.group_id });
      data.reply = (msg) => this.sendMsg(id, msg, { user_id: data.sender.user_id, user_uid: data.sender.user_uid, SameGroup: data.sender?.group_id });
    }
    Bot.em(`${data.post_type}.${data.message_type}.${data.sub_type}`, data);
    data.bot.stat.recv_msg_cnt++;
    Bot.makeLog('info', `recv from: [Private: ${data.sender?.remark || data.sender?.nickname} (${data.from_id}|${data.from_uid})] ` + data.parsed.content, id);
  }

  async makeGroupMessage(id, payload) {
    const raw_data = pb.decode(payload);
    if (!raw_data[1] || !raw_data[1]?.[3]) return false;
    let data = new GroupMessage(id, raw_data[1], true);
    ((data.self_id = id), (data.bot = Bot[id]), (data.isGroup = true));
    data.sender = {
      ...(Bot[id].gml?.get(data.group_id)?.get(data.user_id) || {}),
      ...data.sender,
    };
    if (typeof data.sender.card === 'string' && data.sender.card === '[object Object]') data.sender.card = data.sender.nickname;
    if (data?.source) data.getReply = async () => (await this.getMsg(id, data.source.seq, 1, { dm: false, ...data, id: data.group_id, isGroup: true }))[0];
    Bot.em(`${data.post_type}.${data.message_type}.${data.sub_type}`, data);
    data.bot.stat.recv_msg_cnt++;
    Bot.makeLog('info', `recv from: [Group: ${data.group_name}(${data.group_id}), Member: ${data.sender.card || data.sender.nickname}(${data.sender.user_id})] ` + data.parsed.content, id);
  }

  async getMemberinfo(id, group_id, force = false) {
    const fileDir = path.join('./data/Secluded', id.toString());
    const filePath = path.join(fileDir, `Memberinfo_${group_id}.json`);
    if (fs.existsSync(filePath)) {
      const fileContent = await fs.promises.readFile(filePath, 'utf-8');
      const cachedData = JSON.parse(fileContent);
      const cacheTime = new Date(cachedData.time);
      const currentTime = new Date();
      const timeDiff = currentTime - cacheTime;
      if (timeDiff < 3600000 && !force) {
        return this.dealEvent(id, 'OidbSvcTrpcTcp.0xfe7_3', cachedData.data);
      }
    }
    const body = {
      1: group_id,
      2: 0,
      3: 0,
      4: {
        10: 1,
        11: 1,
        12: 1,
        13: 0,
        16: 0,
        17: 1,
        18: 0,
        20: 0,
        21: 0,
        100: 1,
        101: 1,
        102: 1,
        103: 0,
        104: 0,
        105: 0,
        106: 0,
        107: 1,
        200: 0,
        201: 0,
      },
    };
    const data = await this.sendOidbSvcTrpcTcp(id, 'OidbSvcTrpcTcp.0xfe7_3', body, false, true);
    const saveData = {
      time: new Date().toISOString(),
      data,
    };
    await fs.promises.mkdir(fileDir, { recursive: true });
    await fs.promises.writeFile(
      filePath,
      JSON.stringify(
        saveData,
        (key, value) => {
          if (typeof value === 'bigint') {
            return value.toString() + 'n';
          }
          return value;
        },
        2
      ),
      'utf-8'
    );
    return pb.decode(data);
  }

  async dealGroup(id, cmd, payload) {
    if (!Bot.uin.includes(id)) await this.connect(id);
    let gml_count = 0;
    const data = pb.decode(payload)?.toJSON()[4];
    const list = Array.isArray(data[2]) ? data[2] : [data[2]];
    const group_id = Number(data[1]);
    const map = new Map();
    const map2 = new Map();
    for (const o of list) {
      let user_id = o?.[1]?.[4],
        user_uid = o?.[1]?.[2].toString(),
        card = (o[11]?.[2] || o[10])?.toString(),
        title = (o[17] || '')?.toString(),
        nickname = o[10]?.toString(),
        shutup_time = o[102] || 0;

      if (shutup_time > 0) {
        const now = Math.floor(Date.now() / 1000) - shutup_time;
        if (now >= 0) shutup_time = 0;
        shutup_time = -now;
      }
      const name = nickname,
        level = o?.[12]?.[2] || 0,
        last_join_time = o[100],
        last_sent_time = o[101];
      if (typeof card === 'string' && card === '[object Object]') card = nickname;
      const role = o[107] === 1 ? 'owner' : o[107] === 2 ? 'admin' : 'member';
      const Member_data = {
        user_id,
        sex: 'unknown',
        nickname,
        card,
        role,
        name,
        title,
        last_join_time,
        last_sent_time,
        shutup_time,
        mute_left: shutup_time,
        group_id,
        level,
        ...Bot[id].gl.get(group_id),
        user_uid,
      };
      map.set(user_id, Member_data);
      map2.set(user_uid, Member_data);
      gml_count++;
      if (user_id === id && Bot[id].gl.has(group_id)) Bot[id].gl.get(group_id).shutup_time_me = Member_data.mute_left;
      Bot[id].gml.set(group_id, map);
      Bot[id].gid_uid2uin.set(group_id, map2);
      Bot[id].uin2uid.set(user_id, { ...Member_data, ...(Bot[id].uid2uin?.get(user_uid) || {}) });
      Bot[id].uid2uin.set(user_uid, { ...Member_data, ...(Bot[id].uid2uin?.get(user_uid) || {}) });
    }
    return gml_count;
  }

  async dealFriend(id, cmd, payload) {
    if (!Bot.uin.includes(id)) await this.connect(id);
    let fl_count = 0;
    const data = pb.decode(payload)?.toJSON()[4];
    const list = Array.isArray(data[101]) ? data[101] : [data[101]];
    const class_Map = new Map();
    for (let i of Array.isArray(data[102]) ? data[102] : [data[102]]) {
      const name = String(i[2]),
        val = Number(i[1] || 0);
      class_Map.set(val, name);
    }
    for (let o of list) {
      let user_id = o[3],
        user_uid = o[1],
        nickname,
        signature,
        remark,
        qid,
        age = 0,
        sex = 'unknown';
      const infoArray = o[10001];
      if (!Array.isArray(infoArray)) continue;
      const targetObj = infoArray.find((item) => item[1] === 1);
      if (!targetObj || !targetObj[2]) continue;
      const contentArray = [...(Array.isArray(targetObj[2]?.[2]) ? targetObj[2][2] : []), ...(Array.isArray(targetObj[2]?.[1]) ? targetObj[2][1] : [])];
      for (let content of contentArray) {
        const name = Number(content[1]),
          val = String(content[2]?.toString());
        switch (name) {
          case 20002:
            nickname = val || '';
            break;
          case 102:
            signature = val || '';
            break;
          case 103:
            remark = val || '';
            break;
          case 27394:
            qid = val || '';
            break;
          case 20037:
            age = Number(val) || 0;
            break;
          case 20009:
            sex = Number(val) === 1 ? 'male' : Number(val) === 2 ? 'female' : 'unknown';
            break;
        }
      }
      if (typeof remark === 'string' && remark === '[object Object]') remark = nickname;
      let friend = {
        user_id,
        user_uid,
        nickname,
        class_name: class_Map.get(o[2] || 0),
        class_id: o[2] || 0,
        signature,
        remark,
        qid,
        age,
        sex,
        update_time: Math.floor(Date.now() / 1000),
      };
      if (Bot[id].fl.has(friend.user_id)) {
        friend = {
          ...Bot[id].fl.get(friend.user_id),
          ...friend,
        };
      }
      Bot[id].fl.set(friend.user_id, friend);
      fl_count++;
      if (user_id === id) Bot[id].info = friend;
      Bot[id].uid2uin.set(user_uid, { ...friend, ...(Bot[id].uid2uin?.get(user_uid) || {}) });
      Bot[id].uin2uid.set(user_id, { ...friend, ...(Bot[id].uid2uin?.get(user_uid) || {}) });
    }
    return fl_count;
  }

  async Getuserinfo(id, uid) {
    const ids = [101, 102, 105, 20002, 20011, 20026, 20037, 27394, 27406];
    const body = {
      1: 4065,
      2: 2,
      4: {
        1: uid,
        3: {
          1: ids,
        },
      },
      12: 0,
    };
    const data = await this.sendUni(id, 'OidbSvcTrpcTcp.0xfe1_2', pb.encode(body));
    let avatarTimestamp, signature, level, nickname, mail, regTimestamp, age, QID;
    if (data[3] === 0) {
      const payload = data[4];
      const user_id = Number(payload[1][3]);
      for (const i of payload[1][2][1]) {
        if (i[1] === 105) level = i[2];
        if (i[1] === 20026) regTimestamp = i[2] * 1000;
        if (i[1] === 20037) {
          const isobj = isObject(i[2]);
          age = !isobj ? i[2] : '隐藏';
        }
      }
      for (const i of payload[1][2][2]) {
        if (i[1] === 20002) nickname = i[2];
        if (i[1] === 20011) {
          const isobj = isObject(i[2]);
          mail = !isobj ? i[2] : '隐藏';
        }
        if (i[1] === 102) {
          const isobj = isObject(i[2]);
          signature = !isobj ? i[2] : '没有设置';
        }
        if (i[1] === 27394) {
          const isobj = isObject(i[2]);
          QID = !isobj ? i[2] : '没有设置';
        }
        if (i[1] === 101) avatarTimestamp = i[2][3] * 1000;
      }
      return {
        user_id,
        user_uid: uid,
        avatarTimestamp,
        signature,
        level,
        nickname,
        mail,
        regTimestamp,
        age,
        qid: QID,
      };
    }
    return {};
  }

  async makeIncrease(id, data) {
    const member = await this.Getuserinfo(id, data.user_uid);
    const operator_member = Bot[id].gid_uid2uin.get(data.group_id)?.get(data.operator_uid) || {};
    data.user_id = member.user_id || 0;
    data = {
      group_id: data.group_id,
      self_id: id,
      ...Bot[id].gl.get(data.group_id),
      ...member,
      ...(data.isinvite ? { invitor: operator_member?.user_id, invitor_name: operator_member?.nickname } : { ...data, operator_id: operator_member?.user_id }),
      type: data.type,
    };
    Bot.makeLog('info', `[Group: ${data.group_name}(${data.group_id}] 新增群员：${data.nickname}(${data.user_id}) ${data.isinvite ? '邀请人: ' + data.invitor_name + '(' + data.invitor + ')' : ''}`, id);
    Bot.em(data.type, data);
  }

  async makedecrease(id, data) {
    const member = await this.Getuserinfo(id, data.user_uid);
    data = {
      ...Bot[id].gl.get(data.group_id),
      ...data,
      ...member,
    };
    Bot.makeLog('info', `[Group: ${data.group_name}(${data.group_id}] ${data.nickname}(${data.user_id}) 离开了群 ${data.isoperate ? '操作人: ' + data.operator_name + '(' + data.operator_id + ')' : ''}`, id);
    Bot.em(data.type, data);
    await Bot.sleep(30000);
    Bot[id].gml?.get(data.group_id)?.delete(data.user_id);
    if (data.user_id === id) Bot[id].gl.delete(data.group_id);
  }

  async internal_like(id, data) {
    Bot.em(data.type, data);
    Bot.makeLog('info', `[User: ${data.user_id} (${data.operator_nick})] ` + data.summary, id);
  }

  notice_group_reaction(id, data) {
    data = {
      ...Bot[id].gl.get(data.group_id),
      ...data,
    };
    if (data.user_id) Bot.em(data.type, data);
    if (data.user_id) Bot.makeLog('info', `[Group: ${data?.group_name || ''}(${data.group_id}) Member: ${data?.sender?.card}(${data.user_id})]${data.type2 === 1 ? '回应' : '取消回应'}了消息seq: ${data.seq}, face_id: ${data.face_id}, count: ${data.count}`, id);
  }

  async qzoneLike(id, data) {
    const cookies = await Bot[id].getCookies('qzone.qq.com', false, true);
    const cookie = `uin=${cookies.uin}; skey=${cookies.skey}; p_uin=${cookies.uin}; p_skey=${cookies.p_skey}`;
    const gtk = this.getGTK(cookies.p_skey);
    const requestUrl = `https://h5.qzone.qq.com/proxy/domain/w.qzone.qq.com/cgi-bin/likes/internal_dolike_app?g_tk=${gtk}`;
    const headers = {
      'sec-ch-ua-platform': '"Android"',
      'x-requested-with': 'XMLHttpRequest',
      'user-agent': 'Mozilla/5.0 (Linux; Android 11; V2180A Build/RP1A.200720.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.7049.38 Mobile Safari/537.36',
      accept: 'application/json',
      'sec-ch-ua': '"Android WebView";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
      'content-type': 'application/x-www-form-urlencoded',
      'sec-ch-ua-mobile': '?1',
      origin: 'https://h5.qzone.qq.com',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'empty',
      referer: 'https://h5.qzone.qq.com/mqzone/index',
      'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      priority: 'u=1, i',
      cookie: cookie,
    };
    const postData = new URLSearchParams({
      opuin: id,
      unikey: data.url,
      curkey: data.url,
      appid: '311',
      opr_type: 'like',
      format: 'purejson',
    });

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: headers,
      body: postData,
    });

    const result = await response.json();
    if (result.ret === 0) {
      return true;
    }
    return false;
  }

  async internal_qzone_v2(id, data) {
    const qzone_data = await this.qzoneGet(id, data.user_id, 5);
    if (qzone_data !== 0 && data.type === 'internal.qzone.v2') {
      await this.GetPSkey(id, 'qzone.qq.com', true);
      return false;
    }
    let msglist = qzone_data.data.msglist;
    if (!msglist && data.type === 'internal.qzone') {
      return this.internal_qzone(id, data);
    }
    if (!Array.isArray(msglist)) msglist = [msglist];
    for (let i = 0; i < msglist.length; i++) {
      const msg = msglist[i];
      const processedData = {
        url: `http://user.qzone.qq.com/${data.user_id}/mood/${msg.tid}`,
        fid: msg.tid,
        unikey: 311 + '_' + msg.t1_termtype + '_' + msg.tid,
        msg: msg.content,
        time: msg.created_time,
        nickname: msg.name,
        commentlist: msg?.commentlist || [],
        pic: msg?.pic || [],
        tips: msg.source_name,
        source_url: msg.source_url,
        t1_source: msg.t1_source,
        t1_subtype: msg.t1_subtype,
        t1_termtype: msg.t1_termtype,
        ...data,
        type: 'internal.qzone',
      };
      if (Math.floor(Date.now() / 1000) - processedData.time > 350) continue;
      this.internal_qzone(id, processedData);
    }
  }

  async qzoneGet(id, uin, num = 5) {
    const cookies = await Bot[id].getCookies('qzone.qq.com', false, true);
    const cookie = `uin=${cookies.uin}; skey=${cookies.skey}; p_uin=${cookies.uin}; p_skey=${cookies.p_skey}`;
    const gtk = this.getGTK(cookies.p_skey) || Bot[id].bkn;
    const requestUrl = `https://h5.qzone.qq.com/proxy/domain/taotao.qq.com/cgi-bin/emotion_cgi_msglist_v6?g_tk=${gtk}`;
    const qzreferrer = `https://user.qzone.qq.com/${uin}`;
    const headers = {
      'sec-ch-ua-platform': '"Android"',
      'x-requested-with': 'XMLHttpRequest',
      'user-agent': 'Mozilla/5.0 (Linux; Android 11; V2180A Build/RP1A.200720.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.7049.38 Mobile Safari/537.36',
      accept: 'application/json',
      'sec-ch-ua': '"Android WebView";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
      'content-type': 'application/x-www-form-urlencoded',
      'sec-ch-ua-mobile': '?1',
      origin: 'https://h5.qzone.qq.com',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'empty',
      referer: qzreferrer,
      'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      priority: 'u=1, i',
      cookie: cookie,
    };
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: headers,
      body: new URLSearchParams({
        uin,
        num,
        pos: 0,
      }),
    });
    const result = await response.text();
    const match = result.match(/^_Callback\((.*)\);?$/);
    if (match && match[1]) {
      return { code: 0, data: JSON.parse(match[1]) };
    }
    return { code: -1 };
  }

  async qzoneReply(id, data, msg) {
    const cookies = await Bot[id].getCookies('qzone.qq.com', false, true);
    const cookie = `uin=${cookies.uin}; skey=${cookies.skey}; p_uin=${cookies.uin}; p_skey=${cookies.p_skey}`;
    const gtk = this.getGTK(cookies.p_skey) || Bot[id].bkn;
    const requestUrl = `https://h5.qzone.qq.com/proxy/domain/taotao.qzone.qq.com/cgi-bin/emotion_cgi_re_feeds?g_tk=${gtk}`;
    const qzreferrer = `https://user.qzone.qq.com/${data.user_id}/mood/${data.fid}`;
    const headers = {
      'sec-ch-ua-platform': '"Android"',
      'x-requested-with': 'XMLHttpRequest',
      'user-agent': 'Mozilla/5.0 (Linux; Android 11; V2180A Build/RP1A.200720.012) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.7049.38 Mobile Safari/537.36',
      accept: 'application/json',
      'sec-ch-ua': '"Android WebView";v="135", "Not-A.Brand";v="8", "Chromium";v="135"',
      'content-type': 'application/x-www-form-urlencoded',
      'sec-ch-ua-mobile': '?1',
      origin: 'https://h5.qzone.qq.com',
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'empty',
      referer: qzreferrer,
      'accept-language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      priority: 'u=1, i',
      cookie: cookie,
    };
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: headers,
      body: new URLSearchParams({
        topicId: data.user_id + `_${data.fid}__1`,
        feedsType: '100',
        inCharset: 'utf-8',
        outCharset: 'utf-8',
        plat: 'qzone',
        source: 'ic',
        hostUin: data.user_id,
        platformid: '52',
        uin: id,
        format: 'fs',
        ref: 'feeds',
        content: msg,
        paramstr: '1',
        qzreferrer: `https://user.qzone.qq.com/${id}`,
      }),
    });

    const result = await response.text();
    const jsonStr = result.match(/frameElement\.callback\(({.*})\);/)?.[1] || {};
    const datas = JSON.parse(jsonStr);
    if (datas.code === 0) {
      return true;
    }
    return false;
  }

  internal_qzone(id, data) {
    data.like = this.qzoneLike.bind(this, id, data);
    data.reply = (msg) => this.qzoneReply(id, data, msg);
    const qzone_data = Bot[id].qzone_event.get(data.user_id);
    if (qzone_data && qzone_data.some((item) => item.fid === data.fid)) return false;
    if (!qzone_data) {
      Bot[id].qzone_event.set(data.user_id, [data]);
    } else {
      qzone_data.push(data);
    }
    Bot.em(data.type, data);
    Bot.makeLog('info', `[Friend: ${data.user_id}] 更新了一条说说，Fid: ${data.fid}，Url: ${data.url}`, id);
  }

  notice_group_sign(id, data) {
    data = {
      ...Bot[id].gl.get(data.group_id),
      ...data,
    };
    if (data.user_id) Bot.em(data.type, data);
    if (data.user_id) Bot.makeLog('info', `[Group: ${data.group_name}(${data.group_id}) Member: ${data?.sender?.card}(${data.user_id})]${data.sign_text}`, id);
  }

  notice_group_entrance(id, data) {
    data = {
      ...Bot[id].gl.get(data.group_id),
      ...data,
    };
    if (data.user_id) Bot.em(data.type, data);
    if (data.user_id) Bot.makeLog('info', `[Group: ${data.group_name}(${data.group_id}) Member: ${data?.sender?.card}(${data.user_id})] 进入了群聊，装扮Url: ${data.url}`, id);
  }

  notice_group_recall(id, data) {
    data = {
      ...Bot[id].gl.get(data.group_id),
      ...data,
    };
    Bot.em(data.type, data);
    Bot.makeLog('info', `[Group: ${data.group_name}(${data.group_id})] ${data.operator_name}(${data.operator_id}) ${data.operator_id === data.user_id ? '撤回了一条消息' : `撤回了 ${data.nickname}(` + data.user_id + ')的消息'}(seq: ${data.seq}) ${data.tip}`, id);
  }

  notice_group_ban(id, data) {
    data = {
      ...Bot[id].gl.get(data.group_id),
      ...data,
    };
    const isallmute = data.user_id === 0 && data.duration !== 0;
    if (isallmute) Bot[id].gl.get(data.group_id).all_muted = true;
    if (data.user_id === id) Bot[id].gl.get(data.group_id).shutup_time_me = data.duration;
    Bot.em(data.type, data);
    Bot.makeLog('info', `[Group: ${data.group_name}(${data.group_id})] ${isallmute ? `${data.operator_name}(${data.operator_id}) 开启了全体禁言` : data.user_id === 0 && data.duration === 0 ? `${data.operator_name}(${data.operator_id}) 关闭了全体禁言` : `${data.operator_name}(${data.operator_id}) 禁言了 ${data.nickname}(${data.user_id}) ${data.duration} 秒`}`, id);
  }

  notice_group_poke(id, data) {
    data = {
      ...Bot[id].gl.get(data.group_id),
      ...data,
      user_id: data.target_id,
      self_id: id,
    };
    data.target_name = Bot[id].gml.get(data.group_id)?.get(data.target_id)?.nickname || '';
    data.operator_name = Bot[id].gml.get(data.group_id)?.get(data.operator_id)?.nickname || '';
    Bot.em(data.type, data);
    Bot.makeLog('info', `[Group: ${data.group_name}(${data.group_id})] ${data.operator_name}(${data.operator_id}) ${data.alt_str1} ${data.target_name}(${data.target_id})`, id);
  }

  system_offline(id, data, send = Bot.sendMasterMsg.bind(Bot)) {
    if (Bot[id].job) Bot[id].job.cancel();
    Bot.em(data.type, data);
    Bot.makeLog('warn', `[${data.title}]${data.tip}`, id);
    send(`[${id}] ${data.title}: ${data.tip}`);
  }

  async dealEvent(id, cmd, payload, seq) {
    if (!Bot.uin.includes(id)) await this.connect(id);
    switch (cmd) {
      case 'trpc.msg.olpush.OlPushService.MsgPush':
        const data = ntMsgListenerdeal(payload, id);
        if (data) data.self_id = id;
        switch (data?.type) {
          case 'message.group':
            this.makeGroupMessage(id, payload);
            break;
          case 'message.friend':
            this.makePrivateMessage(id, payload);
            break;
          case 'notice.group.increase':
            this.makeIncrease(id, data);
            break;
          case 'notice.group.decrease':
            this.makedecrease(id, data);
            break;
          case 'internal.like':
            this.internal_like(id, data);
            break;
          case 'notice.group.reaction':
            if (typeof data.user_uid === 'object') return false;
            this.notice_group_reaction(id, data);
            break;
          case 'internal.qzone':
            this.internal_qzone_v2(id, data);
            break;
          case 'internal.qzone.v2':
            this.internal_qzone_v2(id, data);
            break;
          case 'notice.group.sign':
            this.notice_group_sign(id, data);
            break;
          case 'notice.group.poke':
            this.notice_group_poke(id, data);
            break;
          case 'notice.group.entrance':
            this.notice_group_entrance(id, data);
            break;
          case 'notice.group.recall':
            this.notice_group_recall(id, data);
            break;
          case 'notice.group.ban':
            this.notice_group_ban(id, data);
            break;
          default:
            break;
        }
        break;
      case 'trpc.qq_new_tech.status_svc.StatusService.KickNT':
        const KickNT = pb.decode(payload)?.toJSON();
        const kick_data = {
          title: KickNT[4],
          tip: KickNT[3],
          self_id: id,
          sub_id: KickNT[6],
          type: 'system.offline',
        };
        this.system_offline(id, kick_data);
        break;
      case 'OidbSvcTrpcTcp.0xfd4_1':
        this.dealFriend(id, cmd, payload);
        break;
      case 'OidbSvcTrpcTcp.0x9067_202':
        this.refreshRkey(id, cmd, payload);
        break;
      case 'OidbSvcTrpcTcp.0xfe7_3':
        this.dealGroup(id, cmd, payload);
        break;
      case 'OidbSvcTrpcTcp.0xfe5_2':
        break;
      case 'OidbSvcTrpcTcp.0x102a_1':
        break;
      case 'OidbSvcTrpcTcp.0x102a':
        break;
      case 'trpc.qq_new_tech.status_svc.StatusService.SsoHeartBeat':
        Bot.makeLog('debug', '[PacketFactory::HeartBeat] 心跳包返回..', id);
        break;
      case 'HttpConn.0x6ff_501':
        break;
      case 'ImgStore.GroupPicUp':
        break;
      case 'LongConn.OffPicUp':
        break;
      case 'MessageSvc.PbSendMsg':
        break;
      case 'trpc.group.long_msg_interface.MsgService.SsoSendLongMsg':
        break;
      case 'trpc.group.long_msg_interface.MsgService.SsoRecvLongMsg':
        break;
      case 'trpc.msg.register_proxy.RegisterProxy.SsoGetGroupMsg':
        break;
      case 'PttStore.GroupPttUp':
        break;
      case 'OidbSvcTrpcTcp.0x7E5_104':
        break;
      case 'OidbSvcTrpcTcp.0x11EA_100':
        break;
      case 'OidbSvcTrpcTcp.0x126E_100':
        break;
      case 'OidbSvcTrpcTcp.0x126d_100':
        break;
      case 'OfflineFilleHandleSvr.pb_ftn_CMD_REQ_APPLY_UPLOAD_V3-1700':
        break;
      case 'OidbSvcTrpcTcp.0x6d9_4':
        break;
      case 'OidbSvcTrpcTcp.0x6d6_0':
        break;
      case 'OidbSvcTrpcTcp.0x6d6_5':
        break;
      case 'trpc.msg.msg_svc.MsgService.SsoGroupRecallMsg':
        break;
      case 'OidbSvcTrpcTcp.0x929d_0':
        break;
      case 'OidbSvcTrpcTcp.0x9082_1':
        break;
      default:
        /*
        if (payload.length)
          logger.info(
            `[不支持的CMD处理: ${cmd}, ${JSON.stringify(
              pb.decode(payload)?.toJSON(),
              (key, value) => {
                if (typeof value === 'bigint') {
                  return value.toString() + 'n';
                }
                return value;
              },
              1
            )}`
          );
          */
        Bot.makeLog('debug', `[不支持的CMD处理: ` + cmd + '], payload: ' + payload, id);
    }
  }

  handleEvent(data) {
    //Bot.makeLog('info', ['接收事件', data], 'Secluded');
  }

  handleOicqMsg(data) {
    data = Array.isArray(data) ? data : [data];
    for (const i of data) {
      if (i.Cmd && i.Dat && i.Debug === 'Debug') {
        this.dealEvent(Number(i.Account), i.Cmd, i.Dat, Number(i.seq));
      } else {
        this.handleEvent(i);
      }
    }
  }

  async reconnect() {
    this.reconnectAttempts++;
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      Bot.makeLog('error', [`[${this.name}] 达到最大重连次数`, `${this.maxReconnectAttempts}, 停止重连`], 'Secluded');
      return;
    }
    Bot.makeLog('info', [`[${this.name}]`, `尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`], 'Secluded');
    setTimeout(async () => {
      await this.load().catch((error) => {
        Bot.makeLog('error', [`[${this.name}] 重连失败`, error], 'Secluded');
      });
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  close() {
    if (this.sec_ws) {
      this.sec_ws.close(1000, '正常关闭');
      this.sec_ws = null;
    }
  }
})();

export class SecludedAdapter extends plugin {
  constructor() {
    super({
      name: 'Secludedapter',
      dsc: 'Secluded 适配器设置',
      event: 'message',
      rule: [
        {
          reg: /^#sec设置[0-9]+/i,
          fnc: 'Token',
          permission: config.permission,
        },
      ],
    });
  }

  List() {
    this.reply(`共${config.token.length}个账号：\n${config.token.join('\n')}`, true);
  }

  async Token() {
    const token = this.e.msg.replace(/^#sec设置/i, '').trim();
    if (config.token.includes(token)) {
      config.token = config.token.filter((item) => item !== token);
      this.reply(`账号已删除，重启后生效，共${config.token.length}个账号`, true);
    } else {
      let login_data = await adapter.Login();
      if (login_data.code !== 0) return this.reply('登录失败，请稍后重试...', true);
      let mid = login_data.data.mid;
      let qrcode_data = await adapter.Check_Login(mid);
      if (qrcode_data?.data?.['err-code'] || qrcode_data?.data?.['err-text']) {
        return this.reply('登录失败：' + qrcode_data.data['err-text'] + `(${qrcode_data.data['err-code']})`, true);
      }
      if (!qrcode_data?.data?.qrcode) {
        await Bot.sleep(2000);
        login_data = await adapter.Login();
        mid = login_data.data.mid;
        await Bot.sleep(2000);
        qrcode_data = await adapter.Check_Login(mid);
      }
      const img = qrcode_data.data.qrcode;
      await this.reply(['请使用摄像头扫码完成登录', segment.image('base64://' + img)]);
      let suc = false;
      for (let n = 1; n < 30; n++) {
        await Bot.sleep(5000);
        const qrcode_data = await adapter.Check_Login(mid);
        if (qrcode_data.code === 0 && qrcode_data.data?.online) {
          suc = true;
          break;
        } else if (qrcode_data?.data?.['err-code'] || qrcode_data?.data?.['err-text']) {
          return this.reply('登录失败：' + qrcode_data.data['err-text'] + `(${qrcode_data.data['err-code']})`, true);
        }
        continue;
      }
      if (suc) {
        config.token.push(token);
        await adapter.Set_Debug(token);
        this.reply('登录成功！', true);
      } else {
        this.reply('登录失败，请稍后重试...', true);
      }
    }
    await configSave();
  }
}

export default { adapter, config };
const endTime = new Date();
logger.info(logger.green(`- Secluded 适配器插件 加载完成 耗时：${endTime - startTime}ms`));
