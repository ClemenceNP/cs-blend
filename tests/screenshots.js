// Screenshots of the quiz: 4 screens (intro, question, naming, result) × 4 languages, phone size.
//
//   node tests/screenshots.js                 → current files      → tests/screenshots/apres/
//   node tests/screenshots.js --compare main  → also the "main" version (what is online) → tests/screenshots/avant/
//                                               and prints, screen by screen, how many pixels changed.
//
// Same answers, same name and same blend reference every run, so two runs can be compared pixel by pixel.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');
const { loadPlaywright, serve, REPO_ROOT } = require('./_helpers');
const { chromium } = loadPlaywright();

const OUT = path.join(__dirname, 'screenshots');
const LANGS = ['it', 'en', 'fr', 'de'];

async function shoot(root, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const site = await serve(root);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => {
    let s = 42; Math.random = () => (s = (s * 16807) % 2147483647) / 2147483647;
    navigator.sendBeacon = () => true;
  });
  await ctx.route('**/*', r => r.request().url().startsWith(site.url) ? r.continue() : r.abort());
  const p = await ctx.newPage();
  const files = [];
  const snap = async (name) => { const f = path.join(outDir, name + '.png'); await p.mouse.move(0, 0); await p.waitForTimeout(300); await p.screenshot({ path: f, fullPage: true, animations: 'disabled', caret: 'hide' }); files.push(f); };
  for (const [li, lang] of LANGS.entries()) {
    await p.goto(site.url); await p.evaluate(() => document.fonts.ready);
    await p.click(`.lang-btn:nth-child(${li + 1})`);
    await snap(`${lang}-1-accueil`);
    await p.click('#intro-btn'); await p.waitForTimeout(400);
    await snap(`${lang}-2-question`);
    for (const k of [0, 2, 1, 0, 2, 1]) { await p.waitForTimeout(150); await p.click(`#q-area .opt-card:nth-child(${k + 1})`); await p.waitForTimeout(450); }
    await p.waitForSelector('#naming.active'); await p.fill('#name-input', 'Alba di novembre');
    await snap(`${lang}-3-nom`);
    await p.click('#reveal-btn'); await p.waitForTimeout(1300);
    await snap(`${lang}-4-resultat`);
  }
  await b.close(); site.close();
  return files;
}

// Pixel comparison done in the browser (no extra dependency)
async function diff(pairs) {
  const b = await chromium.launch();
  const p = await b.newPage();
  const out = [];
  for (const [a, c] of pairs) {
    const res = await p.evaluate(async ([a, c]) => {
      const load = src => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
      const [ia, ic] = await Promise.all([load(a), load(c)]);
      if (ia.width !== ic.width || ia.height !== ic.height) return { size: `${ia.width}×${ia.height} → ${ic.width}×${ic.height}` };
      const px = img => { const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height;
        const g = cv.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data; };
      const da = px(ia), dc = px(ic); let n = 0;
      for (let i = 0; i < da.length; i += 4) if (da[i] !== dc[i] || da[i + 1] !== dc[i + 1] || da[i + 2] !== dc[i + 2]) n++;
      return { changed: n, total: da.length / 4 };
    }, ['data:image/png;base64,' + fs.readFileSync(a).toString('base64'), 'data:image/png;base64,' + fs.readFileSync(c).toString('base64')]);
    out.push([path.basename(a), res]);
  }
  await b.close();
  return out;
}

(async () => {
  const i = process.argv.indexOf('--compare');
  const after = await shoot(REPO_ROOT, path.join(OUT, 'apres'));
  console.log(`${after.length} captures → ${path.join(OUT, 'apres')}`);
  if (i === -1) return;

  const ref = process.argv[i + 1] || 'main';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blend-avant-'));
  execSync(`git -C "${REPO_ROOT}" archive "${ref}" | tar -x -C "${tmp}"`);
  const before = await shoot(tmp, path.join(OUT, 'avant'));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${before.length} captures de « ${ref} » → ${path.join(OUT, 'avant')}\n`);
  for (const [name, r] of await diff(before.map((f, k) => [f, after[k]]))) {
    console.log(`${name.padEnd(22)} ${r.size ? 'taille changée ' + r.size : r.changed === 0 ? 'identique' : `${(100 * r.changed / r.total).toFixed(1)} % des pixels changés`}`);
  }
})();
