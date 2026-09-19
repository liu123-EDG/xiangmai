/* 核实参考来源的链接是否活着。
   政府网站改版频繁，死链比不写来源更糟 —— 交作品前必须验。 */
const LINKS = [
  ['UNESCO 名录 · 新疆维吾尔木卡姆艺术',
    'https://ich.unesco.org/en/RL/uyghur-muqam-of-xinjiang-00109'],
  ['文化和旅游部 · 2005 年颁证仪式报道',
    'https://www.mct.gov.cn/whzx/tpxw/200511/t20051128_828249.htm'],
  ['中国非物质文化遗产网 · 木卡姆的二十年',
    'https://www.ihchina.cn/news_1_details/31487.html'],
  ['中国非物质文化遗产网 · 传承人检索',
    'https://www.ihchina.cn/'],
  ['西藏新闻网 · 桑珠：说唱一生《格萨尔王传》',
    'https://www.xzxw.com/fy/2015-05/14/content_1551027.html'],
  ['中新网 · 西藏八十六岁老人说唱《格萨尔王传》两千多小时',
    'http://www.chinanews.com.cn/gn/news/2009/06-17/1738148.shtml'],
  ['央视 · 西藏有 52 名国家级非物质文化遗产代表性传承人',
    'http://tibet.cctv.com/20090616/102134.shtml'],
  ['国际在线 · 在"十二木卡姆故乡"莎车 聆听"世纪之音"',
    'https://city.cri.cn/2024-08-30/7aa6eed2-ef4a-dc63-91ad-707ee05cd8fc.html'],
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, bad = 0;

console.log('\n════════ 参考来源链接核实 ════════\n');
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
    if (res.ok) ok++; else bad++;
  } catch (e) {
    bad++;
    status = (e.name === 'TimeoutError' ? '超时' : (e.message || '').slice(0, 30));
  }
  console.log('  ' + status.padEnd(9) + String(ms).padStart(6) + 'ms  ' + name);
  console.log('      ' + url);
  await sleep(400);
}

console.log('\n  可用 ' + ok + ' / ' + LINKS.length + '，失败 ' + bad);
if (bad) console.log('  → 失败的不要写进页面，或者换一个等价来源\n');
else console.log('  全部可用，可以写进参考来源页\n');
