/* ==========================================================================
   弦脉 · 各民族音乐非遗
   --------------------------------------------------------------------------
   旋律图上的八个入口。每一条对应一个分页面：../heritage/<id>/index.html

   字段说明：
     id     路由名，决定分页面目录
     name   中文名
     ug     拉丁 / 罗马转写（便于检索）
     group  民族
     kind   形态类型
     pitch  在旋律图上的音高位置（1 = 最低的下加一线，每 +1 上升半格）
     hue    音符配色色相
     note   一句话说明 —— **留空待补，不编**

   你搜到资料后，把内容填进 note，或加任意新字段（region / level / 曲目 /
   传承人 …），页面会自动带上。
   ========================================================================== */

export const HERITAGE = [
  { id: 'zhuang-tianqin',    name: '天琴艺术',   ug: 'Tianqin',       group: '壮族',   kind: '器乐 · 弹唱',  pitch: 3,  hue: 36,  note: '' },
  { id: 'mongol-morinhuur',  name: '马头琴',     ug: 'Morin Khuur',   group: '蒙古族', kind: '器乐',        pitch: 5,  hue: 152, note: '' },
  { id: 'dong-dage',         name: '侗族大歌',   ug: 'Kam Grand Choir', group: '侗族', kind: '多声部合唱',  pitch: 8,  hue: 200, note: '' },
  { id: 'manchu-xinchengxi', name: '新城戏',     ug: 'Xincheng Opera', group: '满族',  kind: '戏曲',        pitch: 6,  hue: 320, note: '' },
  { id: 'miao-guge',         name: '苗族古歌',   ug: 'Hxak Lul',      group: '苗族',   kind: '史诗 · 叙事歌', pitch: 11, hue: 12,  note: '' },
  { id: 'yi-shan-ge',        name: '山歌小调',   ug: 'Yi Folk Songs', group: '彝族',   kind: '民歌',        pitch: 9,  hue: 42,  note: '' },
  { id: 'dai-zhangha',       name: '章哈',       ug: 'Zhangha',       group: '傣族',   kind: '说唱',        pitch: 4,  hue: 168, note: '' },
  { id: 'tibetan-gesar',     name: '格萨尔',     ug: 'Gesar',         group: '藏族',   kind: '史诗说唱',    pitch: 13, hue: 218, note: '' },
];

/** 分页面路径 */
export function heritageHref(id) {
  return '../heritage/' + id + '/index.html';
}
