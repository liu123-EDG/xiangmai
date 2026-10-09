/* 数据体检：八条是否齐、字段是否够、来源是否标了。
   用真的 import —— 不拿正则在源码上数（刚在注释上数错过一次）。 */
import { HERITAGE, heritageById, collectedHeritage } from '../js/lib/heritage-data.js';

let bad = 0;
const fail = (m) => { bad++; console.log('  ✗ ' + m); };
const ok = (m) => console.log('  ok  ' + m);

console.log('\n[八族档案体检]\n');

if (HERITAGE.length === 8) ok('共 8 条');
else fail('条数 = ' + HERITAGE.length + '，应为 8');

const ids = HERITAGE.map((h) => h.id);
if (new Set(ids).size === 8) ok('id 无重复');
else fail('id 有重复：' + ids.join(','));

const groups = HERITAGE.map((h) => h.group);
console.log('  八族：' + groups.join('、'));

/* 每页要显示的东西：这几个字段空了页面就会有窟窿。
   字段从 source（字符串）升级成 sources（数组）——
   第二批资料一条带两个官方链接，字符串装不下。 */
const NEED = ['id', 'name', 'group', 'kind', 'hue', 'note'];
console.log('');
HERITAGE.forEach((h) => {
  const miss = NEED.filter((k) => h[k] === undefined || h[k] === '');
  const bodyOk = Array.isArray(h.body) && h.body.length > 0;
  const nSrc = (h.sources || []).length;
  const nLink = (h.sources || []).filter(([, u]) => u).length;
  console.log('  ' + (h.group + ' ' + h.name).padEnd(18) +
    (h.collected ? '已收录' : '未收录') +
    '  正文 ' + String(h.body ? h.body.length : 0).padStart(2) + ' 段' +
    '  来源 ' + nSrc + '（带链接 ' + nLink + '）' +
    (h.caveat ? '  有口径提醒' : '') +
    (miss.length ? '  ★ 缺字段：' + miss.join(',') : '') +
    (bodyOk ? '' : '  ★ 没有正文'));
  if (miss.length) bad++;
  if (!bodyOk) bad++;
  if (typeof h.hue !== 'number') fail(h.group + ' 的 hue 不是数字：' + h.hue);
});

/* 已收录的必须有来源 —— 这一条是学术纪律 */
console.log('');
const noSource = HERITAGE.filter((h) => h.collected && !(h.sources && h.sources.length));
if (noSource.length === 0) ok('已收录的都标了来源');
else fail('这些已收录却没标来源：' + noSource.map((h) => h.group).join('、'));

/* 未收录的要说清为什么 —— 不该是"我忘了" */
const noReason = HERITAGE.filter((h) => !h.collected && !(h.sources && h.sources.length));
if (noReason.length === 0) ok('未收录的也写明了原因');
else fail('未收录但没写原因：' + noReason.map((h) => h.group).join('、'));

/* 来源里的链接要能被 link-check 之外单独核 —— 这里只数，不联网 */
const withLinks = HERITAGE.filter((h) => (h.sources || []).some(([, u]) => u));
ok('带官方链接的来源覆盖 ' + withLinks.length + ' 族');

const c = collectedHeritage();
console.log('\n  已收录 ' + c.length + ' 族：' + c.map((h) => h.group).join('、'));
console.log('  未收录 ' + (8 - c.length) + ' 族：' +
  HERITAGE.filter((h) => !h.collected).map((h) => h.group).join('、'));

/* 查 id → 条目 */
if (heritageById('dai-zhangha') && heritageById('dai-zhangha').name === '章哈') ok('按 id 取条目正常');
else fail('heritageById 不对');
if (heritageById('不存在') === null) ok('取不存在的 id 返回 null');
else fail('取不存在的 id 应该返回 null');

console.log('\n' + (bad ? '✗ ' + bad + ' 项有问题\n' : '✓ 数据体检通过\n'));
process.exit(bad ? 1 : 0);
