import pb from '../protobuf/index.js';
import { PrivateMessage, GroupMessage, genDmMessageId, parseDmMessageId, genGroupMessageId, parseGroupMessageId } from '../../model/message.js';

export function ntMsgListenerdeal(payload, id) {
  const proto = pb.decode(payload);
  const type = proto[1][2][1];
  const sub_type = proto[1][2][2];
  switch (type) {
    case 33: {
      // 进群事件
      return makeIncrease.call(this, proto, id);
    }
    case 34: {
      // 退群事件
      return makedecrease.call(this, proto, id);
    }
    // case 38:
    // case 44:
    // case 85:
    case 82: {
      return { type: 'message.group', payload };
    }
    //  case 529:
    case 141: {
      // 临时消息
      return { type: 'message.friend', payload };
    }
    case 166: {
      return { type: 'message.friend', payload };
    }
    case 528: {
      const uin = proto[1][1][1];
      return ntPush528.call(this, uin, sub_type, proto[1][3], proto, id);
    }
    case 732: {
      if (!proto[1][3]) break;
      return ntPush732.call(this, proto, sub_type, id);
    }
    default:
      logger.info(
        `不支持的消息类型：${type},${sub_type},${
          payload?.length
            ? `${payload.toString('hex')},${JSON.stringify(
                pb.decodePb(payload),
                (key, value) => {
                  if (typeof value === 'bigint') {
                    return value.toString() + 'n';
                  }
                  return value;
                },
                1
              )}`
            : payload
        }`
      );
  }
  return {};
}

function makeIncrease(proto, id) {
  let event = {};
  const group_id = parseInt(proto[1][1][1]),
    user_uid = proto[1][3][2][3].toString();
  const operator_uid = proto[1][3][2][5].toString();
  const self_id = id,
    isinvite = proto[1][3][2][4] === 131;
  event = {
    group_id,
    user_uid,
    self_id,
    operator_uid,
    type: 'notice.group.increase',
    bot: Bot[id],
    isinvite,
    post_type: 'increase',
    notice_type: 'group',
  };
  return event;
}

function makedecrease(proto, id) {
  let event = {};
  const group_id = parseInt(proto[1][1][1]),
    user_uid = proto[1][3][2][3].toString();
  const member = Bot[id].gid_uid2uin.get(group_id)?.get(user_uid) || {};
  const user_id = member.user_id || 0,
    operator_uid = proto[1][3][2][5]?.[1]?.[1].toString() || user_uid;
  const operator_member = Bot[id].gid_uid2uin.get(group_id)?.get(operator_uid) || {};
  const operator_id = operator_member.user_id || 0,
    self_id = id,
    operator_name = operator_member.nickname,
    isoperate = proto[1][3][2][4] === 131;
  event = {
    group_id,
    user_id,
    user_uid,
    operator_id,
    self_id,
    operator_name,
    operator_uid,
    member,
    type: 'notice.group.decrease',
    bot: Bot[id],
    isoperate,
    post_type: 'decrease',
    notice_type: 'group',
  };
  return event;
}

function ntPush732(proto, sub_type, id) {
  let event = {};
  try {
    switch (sub_type) {
      case 12:
        event = {
          type: 'notice.group.ban',
          bot: Bot[id],
          group_id: parseInt(proto[1][1][1]),
          self_id: id,
          group_name: Bot[id].gl.get(parseInt(proto[1][1][1]))?.group_name,
          user_id: Bot[id].uid2uin.get(proto[1][3][2][5][3][1]?.toString())?.user_id || 0,
          user_uid: proto[1][3][2][5][3][1]?.toString() || 0,
          duration: proto[1][3][2][5]?.[3]?.[2] || 0,
          operator_id: Bot[id].uid2uin.get(proto[1][3][2][4]?.toString())?.user_id,
          operator_uid: proto[1][3][2][4].toString(),
          operator_name: Bot[id].uid2uin.get(proto[1][3][2][4]?.toString()).nickname,
          sub_type: 'ban',
          notice_type: 'group',
          post_type: 'notice',
        };
        event.nickname = Bot[id].uid2uin.get(proto[1][3][2][5][3][1]?.toString())?.nickname || 'QQ用户';
        break;
      case 16:
        let group_id = parseInt(proto[1][1][1]),
          time = proto[1][2][6];
        const payload = pb.decode(proto[1][3][2].toHex().substring(14)).toJSON();
        const uid = payload[44][1][1][3][4]?.toString();
        event = {
          type: 'notice.group.reaction',
          type2: payload[44][1][1][3][5],
          bot: Bot[id],
          isReaction: payload[44][1][1][3][5] === 1,
          group_id,
          time,
          user_uid: uid,
          seq: payload[44][1][1][2][1],
          count: payload[44][1][1][3]?.[3] || 0,
          face_id: payload[44][1][1][3][1],
          face_type: payload[44][1][1][3][2],
          post_type: 'notice',
          notice_type: 'group',
          sub_type: 'reaction',
        };
        event.sender = Bot[id].gid_uid2uin?.get(group_id)?.get(uid);
        event.user_id = event.sender?.user_id || Bot[id].uid2uin.get(uid)?.user_id;
        break;
      case 17:
        const recall_data = pb.decode(pb.decode(proto[1][3].toHex())[2].toHex().substring(14)).toJSON();
        const user_uid = recall_data[11][3][6].toString();
        event = {
          type: 'notice.group.recall',
          bot: Bot[id],
          group_id: parseInt(recall_data[4]),
          self_id: parseInt(proto[1]?.[1]?.[5] || id),
          self_uid: proto[1][1][6].toString(),
          user_uid: user_uid, // 该消息的发送者
          seq: recall_data[11][3][1],
          time: Math.floor(Date.now() / 1000),
          msg_time: recall_data[11][3][2],
          operator_uid: recall_data[11][1], // 撤回这个消息的人
          operate_time: recall_data[54],
          rand: recall_data[11][3][3],
          tip: recall_data[11]?.[9]?.[2] || '',
          post_type: 'notice',
          notice_type: 'group',
          sub_type: 'recall',
        };
        event.user_id = Bot[id].uid2uin?.get(user_uid)?.user_id || Bot[id].gid_uid2uin?.get(event.group_id)?.get(user_uid)?.user_id;
        event.nickname = Bot[id].uid2uin?.get(user_uid)?.nickname || Bot[id].gid_uid2uin?.get(event.group_id)?.get(user_uid)?.nickname;
        event.operator_name = Bot[id].uid2uin?.get(event.operator_uid)?.nickname || Bot[id].gid_uid2uin?.get(event.group_id)?.get(event.operator_uid)?.nickname;
        event.operator_id = Bot[id].uid2uin?.get(event.operator_uid)?.user_id || Bot[id].gid_uid2uin?.get(event.group_id)?.get(event.operator_uid)?.user_id;
        event.message_id = genGroupMessageId(event.group_id, event.user_id, event.seq, event.rand, event.time);
        break;
      case 20:
        const sign = { gid: proto[1][1][1] };
        const payloads = pb.decode(proto[1]?.[3]?.[2]?.toHex()?.substring(14));
        if (!payloads[26][7]) break;
        Object.assign(sign, parseSign.call(this, payloads));
        event = sign;
        break;
      default:
        logger.info(
          `[push732]不支持的事件：${sub_type},${JSON.stringify(
            proto?.toJSON(),
            (key, value) => {
              if (typeof value === 'bigint') {
                return value.toString() + 'n';
              }
              return value;
            },
            1
          )}`
        );
        break;
    }
  } catch (error) {
    logger.error(
      `[push732]事件处理异常：${sub_type},${JSON.stringify(
        proto?.toJSON(),
        (key, value) => {
          if (typeof value === 'bigint') {
            return value.toString() + 'n';
          }
          return value;
        },
        1
      )},` + error
    );
  }
  return event;
}

function parseSign(data) {
  let user_id,
    nickname,
    sign_text,
    rank_img,
    group_id = parseInt(data[4]),
    suffix_str,
    target_id,
    operator_id,
    alt_str1 = '戳了戳',
    action_img_url,
    jp_str1,
    type_str2,
    time = data[54],
    ispoke = false;
  for (let o of Array.isArray(data[26][7]) ? data[26][7] : [data[26][7]]) {
    const name = String(o[1]),
      val = String(o[2]);
    switch (name) {
      case 'user_sign':
        sign_text = sign_text || val;
        break;
      case 'mqq_uin':
        user_id = parseInt(val);
        break;
      case 'mqq_nick':
        nickname = val;
        break;
      case 'rank_img':
        rank_img = val;
        break;
      case 'suffix_str':
        suffix_str = val;
        break;
      case 'uin_str2':
        target_id = parseInt(val);
        break;
      case 'uin_str1':
        ispoke = true;
        operator_id = parseInt(val);
        break;
      case 'alt_str1':
        alt_str1 = val;
        break;
      case 'action_img_url':
        action_img_url = val;
        break;
      case 'jp_str1':
        jp_str1 = val;
        break;
      case 'type_str2':
        type_str2 = val;
        break;
    }
  }
  return {
    user_id,
    nickname,
    sign_text,
    group_id,
    time,
    rank_img,
    suffix_str,
    target_id,
    operator_id,
    alt_str1,
    action_img_url,
    jp_str1,
    type_str2,
    post_type: 'notice',
    notice_type: 'group',
    sub_type: ispoke ? 'poke' : 'sign',
    type: ispoke ? 'notice.group.poke' : 'notice.group.sign',
  };
}

function ntPush528(uin, sub_type, proto, proto2, id) {
  let event = {};
  try {
    switch (sub_type) {
      case 39:
        {
          const thumb_data = proto[2]?.[1]?.[203]?.toJSON();
          if (!thumb_data) break;
          let user_id = thumb_data[9] || thumb_data[14][3][3];
          let operator_nick = thumb_data[14][3][5];
          let times = parseInt(String(thumb_data[14][3][1]).match(/\d+/)?.[0] || 1);
          event = {
            type: 'internal.like',
            post_type: 'internal',
            notice_type: 'like',
            bot: Bot[id],
            user_id,
            self_id: id,
            operator_nick,
            times,
            summary: thumb_data[14][3][1],
          };
        }
        break;
      case 17:
        const data = proto?.toJSON();
        if (!data) break;
        let user_id = parseInt(data[2][4][1]);
        event = {
          type: 'internal.qzone',
          post_type: 'internal',
          notice_type: 'qzone',
          bot: Bot[id],
          user_id,
          self_id: id,
          url: data[2][4][7],
          unikey: data[2][4][9],
          fid: String(data[2][4][9]).replace(/^[^_]+_\d_/, ''),
          time: data[2][4][8],
          tips: data[2][4][3],
          msg: data[2][4]?.[6] || '',
        };
        break;
      case 18:
        const data2 = proto2?.toJSON();
        event = {
          type: 'internal.qzone.v2',
          post_type: 'internal',
          notice_type: 'qzone',
          sub_type: 'v2',
          bot: Bot[id],
          user_id: data2[1][1][1],
          self_id: data2[1]?.[1]?.[5] || id,
        };
        break;
      case 38:
        const gid = parseInt(proto2[1][3][2][2][2]);
        const itemid = proto2[1][3][2][2][4][3][20][1];
        event = {
          gid,
          type: 'notice.group.entrance',
          group_id: gid,
          post_type: 'notice',
          notice_type: 'group',
          sub_type: 'entrance',
          bot: Bot[id],
          user_id: proto2[1][1][1],
          user_uid: proto2[1][1][2],
          self_id: proto2[1]?.[1]?.[5] || id,
          itemid,
          url: `https://zb.vip.qq.com/v2/pages/newDetailPage?appid=26&itemid=${itemid}&_nav_titleclr=000000&_nav_txtclr=000000&gc=${gid}`,
        };
        break;
      case 290:

      //break;
      default:
        Bot.makeLog(
          'info',
          `[push528]不支持的事件：${sub_type},${JSON.stringify(
            proto2?.toJSON(),
            (key, value) => {
              if (typeof value === 'bigint') {
                return value.toString() + 'n';
              }
              return value;
            },
            1
          )}`,
          uin
        );
    }
  } catch (error) {
    logger.error(
      `[push528]事件处理异常：${sub_type},${JSON.stringify(
        proto2?.toJSON(),
        (key, value) => {
          if (typeof value === 'bigint') {
            return value.toString() + 'n';
          }
          return value;
        },
        1
      )},` + error
    );
  }
  return event;
}
