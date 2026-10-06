// 電卓アプリの自動テスト(Playwright)。tests/cases.json の各項目を順に実行し、
// tests/output/results.json に結果を書き出す。使い方は tests/README.md を参照。
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const raw = JSON.parse(fs.readFileSync(path.join(__dirname, 'cases.json'), 'utf8'));
const cases = raw.map(c => [c.category, c.item, c.steps, c.expected]);
const URL = process.env.TARGET_URL || 'file://' + path.resolve(__dirname, '..', 'index.html');
const OUT_DIR = path.join(__dirname, 'output');
const MAP = { '-': '−', '*': '×', '/': '÷', 'B': '⌫' };

const press = async (p, s) => { for (const ch of s) await p.click(`.keys button:text-is("${MAP[ch] || ch}")`); };
const val = p => p.textContent('#value');
const ex = p => p.textContent('#expr');
const hist = p => p.$$eval('#history li', l => l.map(x => x.textContent));
const eq = (a, e) => [a === e, `「${a}」(期待 「${e}」)`];
const calc = (seq, e) => async p => { await press(p, seq); return eq(await val(p), e); };
const keys = async (p, s) => { for (const ch of s) await p.keyboard.press(ch); };
const kcalc = (seq, e) => async p => { await keys(p, seq); return eq(await val(p), e); };
const NA = reason => ({ skip: reason });

const T = [
 // 画面表示
 async p => { const b = await p.$$eval('.keys button', l => l.map(x => x.textContent).sort().join(''));
   const exp = ['0','1','2','3','4','5','6','7','8','9','.','C','⌫','%','÷','×','−','+','='].sort().join('');
   const h = await hist(p); const ok = b === exp && await val(p) === '0' && await ex(p) === '' && h.length === 1 && h[0] === '履歴はありません';
   return [ok, `表示欄「${await val(p)}」、式欄「${await ex(p)}」、ボタン${(await p.$$('.keys button')).length}個、履歴欄「${h[0]}」`]; },
 async p => { await press(p, '1234567890'); const a = await val(p); const bad = [];
   for (const d of '0123456789') { await press(p, 'C' + d); if (await val(p) !== d) bad.push(d); }
   await press(p, 'C1234567890'); const a2 = await val(p);
   return [a === '1234567890' && a2 === '1234567890' && !bad.length, `(1) 「${a}」 (2) 0〜9 の個別入力で不一致: ${bad.length ? bad.join(',') : 'なし'}`]; },
 async p => { const f = await p.evaluate(async () => { const b = [...document.querySelectorAll('.keys button')].find(x => x.textContent === '5'); return getComputedStyle(b).filter; });
   const box = await (await p.$('.keys button:text-is("5")')).boundingBox();
   await p.mouse.move(box.x + 5, box.y + 5); await p.mouse.down();
   const f2 = await p.$eval('.keys button:text-is("5")', b => getComputedStyle(b).filter); await p.mouse.up();
   return [f === 'none' && f2 !== 'none', `通常時 filter=${f}、押下中 filter=${f2}`]; },
 async (p, ctx, br) => { const c = await br.newContext({ viewport: { width: 360, height: 640 } }); const q = await c.newPage(); await q.goto(URL);
   const m = await q.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth,
     btns: [...document.querySelectorAll('.keys button')].map(b => { const r = b.getBoundingClientRect(); return { l: r.left, r: r.right, w: r.width, h: r.height }; }) }));
   await q.screenshot({ path: path.join(os.tmpdir(), 'calc-mobile360.png') }); await c.close();
   const inside = m.btns.every(b => b.l >= 0 && b.r <= m.iw); const minSz = Math.min(...m.btns.map(b => Math.min(b.w, b.h)));
   return [m.sw <= m.iw && inside && minSz >= 44, `ページ幅 ${m.sw}px / 画面幅 ${m.iw}px(横スクロールなし=${m.sw <= m.iw})、全${m.btns.length}ボタンが画面内、最小ボタンサイズ ${Math.round(minSz)}px`]; },
 // 四則演算
 calc('1+2=', '3'), calc('7-3=', '4'), calc('6*7=', '42'), calc('8/4=', '2'), calc('1/3=', '0.333333333333'),
 calc('3-5=', '-2'), calc('0.1+0.2=', '0.3'), calc('1.5+2.5=', '4'), calc('123*456=', '56088'),
 calc('123456789*987654321=', '121932631113000000'),
 // 優先順位
 calc('1+2*3=', '7'), calc('10-6/2=', '7'), calc('2+3*4-5/5=', '13'), calc('1+2+3+4=', '10'),
 // 小数点
 calc('.5', '0.5'), calc('1.2.3', '1.23'), calc('1.5+.5=', '2'),
 async p => { await press(p, '1.5+2.5'); const a = await val(p); await press(p, '='); return [a === '1.5+2.5' && await val(p) === '4', `入力「${a}」、= で「${await val(p)}」`]; },
 // 演算子
 async p => { await press(p, '+*/'); return eq(await val(p), '0'); },
 calc('-5+2=', '-3'), calc('5+*3=', '15'), calc('5+=', '5'),
 async p => { await press(p, '='); const h = await hist(p); return [await val(p) === '0' && h[0] === '履歴はありません', `表示「${await val(p)}」、履歴「${h[0]}」`]; },
 // 連続計算
 calc('3+4=+2=', '9'), calc('3+4=5', '5'), calc('3+4=.', '0.'),
 // クリア
 async p => { await press(p, '12+3C'); return [await val(p) === '0' && await ex(p) === '', `表示「${await val(p)}」、式欄「${await ex(p)}」`]; },
 calc('1+2=C', '0'), calc('12+3C4*2=', '8'),
 async p => { await press(p, '1+2=C'); const h = await hist(p); return [h.length === 1 && h[0] === '1+2 =3', `履歴 ${JSON.stringify(h)}`]; },
 // 1文字削除
 calc('123B', '12'), calc('12+B', '12'), async p => { await press(p, '1.B'); const a = await val(p); await press(p, '.5'); return [a === '1' && await val(p) === '1.5', `削除後「${a}」→ 再入力後「${await val(p)}」`]; },
 calc('123BBB', '0'), calc('B', '0'), calc('12+34B=', '15'), calc('1+2=B', '0'),
 // パーセント
 calc('50%', '0.5'), calc('200+50%=', '200.5'), calc('%', '0'),
 // エラー
 calc('8/0=', '0で割れません'), calc('8/0=5+1=', '6'),
 async p => { await press(p, '8/0='); const h = await hist(p); return [h.length === 1 && h[0] === '履歴はありません', `履歴「${h.join(' / ')}」`]; },
 // 履歴
 async p => { await press(p, '1+2='); const h = await hist(p); return [h.length === 1 && h[0] === '1+2 =3', `履歴 ${JSON.stringify(h)}`]; },
 async p => { await press(p, '1+2=C8/4='); const h = await hist(p); return [h.length === 2 && h[0] === '8÷4 =2' && h[1] === '1+2 =3', `履歴 ${JSON.stringify(h)}`]; },
 async p => { await press(p, '1+2='); await p.click('#history li'); const a = await val(p); await press(p, '+4='); return [a === '3' && await val(p) === '7', `クリック後「${a}」、続けて +4= で「${await val(p)}」`]; },
 async p => { await press(p, '1+2='); await p.reload(); const h = await hist(p); return [h.length === 1 && h[0] === '1+2 =3', `再読み込み後の履歴 ${JSON.stringify(h)}`]; },
 async p => { await press(p, '1+2='); await p.click('#clearHistory'); const h = await hist(p); await p.reload(); const h2 = await hist(p);
   return [h[0] === '履歴はありません' && h2[0] === '履歴はありません', `消去後「${h[0]}」、再読み込み後「${h2[0]}」`]; },
 async p => { await press(p, '12+3'); await p.click('#clearHistory'); return eq(await val(p), '12+3'); },
 async p => { for (let i = 0; i < 51; i++) await press(p, '1+1='); const n = (await hist(p)).length; return [n === 50, `51回計算後の履歴件数 ${n}`]; },
 async p => { for (let i = 0; i < 12; i++) await press(p, '1+1='); const m = await p.evaluate(() => { const u = document.getElementById('history'); const c = document.querySelector('.calc').getBoundingClientRect();
     return { ch: u.clientHeight, sh: u.scrollHeight, w: Math.round(c.width), sw: document.documentElement.scrollWidth, iw: innerWidth }; });
   return [m.sh > m.ch && m.ch <= 140 && m.w === 320 && m.sw <= m.iw, `履歴欄の高さ ${m.ch}px(内容 ${m.sh}px でスクロール)、電卓の幅 ${m.w}px、横スクロールなし=${m.sw <= m.iw}`]; },
 async p => { await press(p, '3+4=+2='); const h = await hist(p); return [h.length === 2 && h[0] === '7+2 =9' && h[1] === '3+4 =7', `履歴 ${JSON.stringify(h)}`]; },
 async p => { const d = await p.isDisabled('#downloadHistory'); return [d, `履歴なしのとき、ダウンロードボタンの無効状態=${d}`]; },
 async p => { await press(p, '1+2='); const en = !(await p.isDisabled('#downloadHistory'));
   const [d] = await Promise.all([p.waitForEvent('download'), p.click('#downloadHistory')]); const n = d.suggestedFilename();
   const t = new Date(), pad = x => String(x).padStart(2, '0'); const day = `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}`;
   return [en && n === `calculator-history_${day}.csv`, `ボタン有効=${en}、ファイル名「${n}」`]; },
 async p => { await press(p, '1+2*3=C8/4='); const [d] = await Promise.all([p.waitForEvent('download'), p.click('#downloadHistory')]);
   const txt = fs.readFileSync(await d.path(), 'utf8').replace(/^\uFEFF/, ''); const L = txt.split('\r\n');
   const ts = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2},/;
   const ok = L[0] === '日時,式,結果' && ts.test(L[1]) && L[1].endsWith(',1+2×3,7') && ts.test(L[2]) && L[2].endsWith(',8÷4,2') && L[3] === '' && L.length === 4;
   return [ok, `CSV: ${JSON.stringify(L.map(x => x.replace(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/, '<日時>')))}`]; },
 async p => { await press(p, '8/4='); const [d] = await Promise.all([p.waitForEvent('download'), p.click('#downloadHistory')]);
   const buf = fs.readFileSync(await d.path()); const bom = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
   return [bom, `先頭3バイトが UTF-8 の BOM(EF BB BF)=${bom}(Excel での目視確認は手動)`]; },
 async p => { await press(p, '1+2='); const before = await p.isDisabled('#downloadHistory'); await p.click('#clearHistory'); const after = await p.isDisabled('#downloadHistory');
   return [!before && after, `消去前の無効状態=${before}、消去後の無効状態=${after}`]; },
 // キーボード
 kcalc('123', '123'), async p => { await keys(p, '6*7'); await p.keyboard.press('Enter'); return eq(await val(p), '42'); },
 async p => { await keys(p, '8/4'); await p.keyboard.press('Enter'); const r = await val(p);
   const prevented = await p.evaluate(() => { const e = new KeyboardEvent('keydown', { key: '/', cancelable: true }); document.dispatchEvent(e); return e.defaultPrevented; });
   return [r === '2' && prevented, `結果「${r}」、「/」キーの既定動作の抑止=${prevented}`]; },
 async p => { await keys(p, '9-3+1'); await p.keyboard.press('Enter'); return eq(await val(p), '7'); },
 kcalc('1+2=', '3'),
 async p => { await keys(p, '123'); await p.keyboard.press('Backspace'); return eq(await val(p), '12'); },
 async p => { await keys(p, '123'); await p.keyboard.press('Escape'); const a = await val(p); await keys(p, '123'); await p.keyboard.press('Delete'); const b = await val(p);
   return [a === '0' && b === '0', `Esc 後「${a}」、Delete 後「${b}」`]; },
 kcalc('50%', '0.5'),
 // 動作環境
 async p => { const v = await p.evaluate(() => navigator.userAgent); await press(p, '1+2*3='); const a = await val(p); await press(p, 'C8/0='); const b = await val(p); await press(p, 'C6B5'); const c = await val(p);
   return [a === '7' && b === '0で割れません' && c === '5', `Chromium で基本操作(四則・エラー・削除)を確認。UA: ${v.match(/Chrome\/[\d.]+/)}`]; },
 () => NA('Edge は使用できないため未実施。Edge で手動確認してください'),
 () => NA('iPhone の Safari(実機または Safari)は使用できないため未実施。手動確認してください'),
 () => NA('Android の Chrome(実機)は使用できないため未実施。手動確認してください'),
 () => NA('公開URLに接続できない(テスト環境から github.io へ接続不可)ため未実施。手動確認してください'),
];

(async () => {
  if (T.length !== cases.length) throw new Error(`count ${T.length} != ${cases.length}`);
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const out = [];
  for (let i = 0; i < T.length; i++) {
    const ctx = await b.newContext({ viewport: { width: 800, height: 900 }, acceptDownloads: true });
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL);
    let r;
    try {
      const x = await T[i](p, ctx, b);
      if (x && x.skip) r = { result: '未実施', actual: '-', note: x.skip };
      else r = { result: x[0] && !errs.length ? 'OK' : 'NG', actual: x[1] + (errs.length ? ` / JSエラー: ${errs.join(';')}` : ''), note: '' };
    } catch (e) { r = { result: 'NG', actual: '実行エラー: ' + e.message.split('\n')[0], note: '' }; }
    if (cases[i][1] === 'Chrome' && r.result === 'OK') r.note = 'Chromium(Chrome と同じエンジン)で実施。製品版 Chrome での確認は未実施';
    out.push({ no: 'T' + String(i + 1).padStart(3, '0'), item: cases[i][1], ...r });
    console.log(out[i].no, out[i].result, cases[i][1], '|', out[i].actual);
    await ctx.close();
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'results.json'),
    JSON.stringify({ meta: { browser: 'Chromium ' + b.version(), url: URL }, results: out }, null, 1));
  await b.close();
  const ng = out.filter(x => x.result === 'NG').length;
  console.log(`\nOK ${out.filter(x => x.result === 'OK').length} / NG ${ng} / 未実施 ${out.filter(x => x.result === '未実施').length}`);
  process.exitCode = ng ? 1 : 0;
})();
