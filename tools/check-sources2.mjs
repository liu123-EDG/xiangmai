/* 核实新一批资料的来源链接。
   和 tools/check-sources.mjs 一个规矩：死链比不写来源更糟。 */
const LINKS = [
  ['国家民委 · 侗族大歌',
    'https://www.neac.gov.cn/seac/c103546/202305/1163432.shtml'],
  ['中国非物质文化遗产网 · 苗族古歌',
    'https://www.ihchina.cn/project_details/12179'],
  ['国家民委 · 第一批国家级非遗名录少数民族部分',
    'https://www.neac.gov.cn/seac/c100845/201401/1096446.shtml'],
  ['中国非物质文化遗产网 · 彝族民歌 彝族山歌',
    'https://www.ihchina.cn/project_details/12670/'],
  ['云南非物质文化遗产保护网 · 弥渡牛街彝族民俗文化拾贝',
    'https://www.ynich.cn/news/new/1551.html'],
  ['中国非物质文化遗产网 · 格萨尔保护实践总结',
    'https://www.ihchina.cn/tenyear_protect_detail/19787.html'],
  ['中国非物质文化遗产网 · 格萨尔的活态保护和传承',
    'https://www.ihchina.cn/project_details/10032/'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let live = 0, dead = 0;

console.log('\n════════ 新一批来源链接核实 ════════\n');
for (const [name, url] of LINKS) {
  let status = '失败', ms = 0;
  try {
    const t0 = Date.now();
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(20000),
    });
    ms = Date.now() - t0;
    status = res.status + (res.ok ? ' ✓' : ' ✗');
    if (res.ok) live++; else dead++;
  } catch (e) {
    dead++;
    status = (e.name === 'TimeoutError' ? '超时' : (e.message || '').slice(0, 24));
  }
  console.log('  ' + status.padEnd(9) + String(ms).padStart(6) + 'ms  ' + name);
  console.log('      ' + url);
  await sleep(400);
}
console.log('\n  可用 ' + live + ' / ' + LINKS.length + '，失败 ' + dead);
if (dead) console.log('  → 失败的不要写进页面\n');
else console.log('  全部可用\n');
