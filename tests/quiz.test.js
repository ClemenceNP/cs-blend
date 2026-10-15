// Headless tests for the Build Your Blend quiz (index.html).
// Nothing leaves the machine: no real cart, no registry row. Every request outside the local server is
// intercepted (cart captured + fake reply, everything else aborted) and navigator.sendBeacon is stubbed.
//
//   A. every answer combination × 4 languages gives a blend totalling 100 %
//   B. click-through flows post the right fields to Shopify /cart/add
//   C. the payload sent to the Google Sheet registry has the exact shape the Apps Script accepts
//   D. no request to any external host (fonts, analytics…)
//
// Run: node tests/quiz.test.js
const { loadPlaywright, serve, REPO_ROOT } = require('./_helpers');
const { chromium } = loadPlaywright();

const LANGS = ['it', 'en', 'fr', 'de'];
let failures = 0;
const fail = (msg) => { failures++; if (failures <= 40) console.log('FAIL', msg); };

// Rules enforced by the registry Apps Script (kept outside this public repo). If the quiz payload
// changes, the script must be updated too, or new blends will no longer be recorded.
const REGISTRY = {
  fields: ['name', 'id', 'composition', 'weight', 'grind', 'gift', 'br', 'co', 'ind', 'inr', 'dec'],
  weights: ['250g', '500g', '1kg'],
  grinds: ['grani', 'moka', 'filtro', 'espresso'],
  gifts: ['', 'Sì'],
  id: /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/,
  nameMax: 40,
  origins: [['br', 'Brasile Arabica'], ['co', 'Colombia Arabica'], ['ind', 'India Arabica'], ['inr', 'India Robusta'], ['dec', 'Brasile Decaf']],
};
function registryProblem(body) {
  let d; try { d = JSON.parse(body); } catch (e) { return 'JSON invalide'; }
  const keys = Object.keys(d);
  if (keys.length !== REGISTRY.fields.length || keys.some(k => !REGISTRY.fields.includes(k))) return 'champs ' + keys;
  if (typeof d.name !== 'string' || d.name !== d.name.trim() || !d.name.length || d.name.length > REGISTRY.nameMax) return 'nom';
  if (!REGISTRY.id.test(d.id)) return 'id';
  if (!REGISTRY.weights.includes(d.weight) || !REGISTRY.grinds.includes(d.grind) || !REGISTRY.gifts.includes(d.gift)) return 'poids/mouture/cadeau';
  const vals = REGISTRY.origins.map(([k]) => d[k]);
  if (!vals.every(v => Number.isInteger(v) && v >= 0 && v <= 100) || vals.reduce((a, b) => a + b, 0) !== 100) return 'pourcentages';
  const comp = REGISTRY.origins.filter(([k]) => d[k] > 0)
    .sort((a, b) => (d[b[0]] - d[a[0]]) || (REGISTRY.origins.indexOf(a) - REGISTRY.origins.indexOf(b)))
    .map(([k, n]) => `${n} ${d[k]}%`).join(' · ');
  if (d.composition !== comp) return 'composition';
  return null;
}

(async () => {
  const site = await serve(REPO_ROOT);
  const BASE = site.url;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const external = [], carts = [];
  await ctx.addInitScript(() => {
    window.__beacons = [];
    navigator.sendBeacon = (url, data) => { window.__beacons.push(data); return true; };
  });
  await ctx.route('**/*', async (route) => {
    const req = route.request(), url = req.url();
    if (url.startsWith(BASE)) return route.continue();
    if (url === 'https://www.caffesuiso.ch/cart/add') {
      carts.push({ method: req.method(), body: req.postData() || '' });
      return route.fulfill({ status: 200, contentType: 'text/html', body: '<p>intercepted</p>' });
    }
    external.push(url);
    return route.abort();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));

  // ── A + C. Every answer combination × 4 languages, through buildResult() and logBlend() ──
  await page.goto(BASE);
  let totalCombos = 0, payloads = 0;
  for (const lang of LANGS) {
    const r = await page.evaluate(async (lang) => {
      setLang(lang);
      const sizes = LANGS[lang].questions.map(q => q.opts.length);
      const names = ['', 'Alba di novembre', "Tasse de mémé & l'été", '=HYPERLINK("x")', 'Omas Tasse ☕', 'x'.repeat(40)];
      const bad = []; let n = 0;
      const weights = ['250g', '500g', '1kg'];
      window.__beacons = [];
      const rec = (i, acc) => {
        if (i === sizes.length) {
          n++;
          answers = acc.slice();
          weight = weights[n % 3];
          document.getElementById('name-input').value = names[n % names.length];
          buildResult();
          const b = lastBlend, vals = [b.br, b.co, b.ind, b.inr, b.dec];
          const sum = vals.reduce((a, c) => a + c, 0);
          const shown = [...document.querySelectorAll('#blend-bars .bar-pct')].map(e => parseInt(e.textContent, 10));
          const shownSum = shown.reduce((a, c) => a + c, 0);
          const comp = compositionString(b);
          const compSum = (comp.match(/\d+(?=%)/g) || []).map(Number).reduce((a, c) => a + c, 0);
          const okInts = vals.every(v => Number.isInteger(v) && v >= 0 && v <= 100);
          const variant = VARIANTS[methodToGrind(lastMethod)] && VARIANTS[methodToGrind(lastMethod)][weight];
          if (sum !== 100 || shownSum !== 100 || compSum !== 100 || !okInts || !variant || !/^[A-Z2-9]{4}$/.test(lastBlendId))
            bad.push({ acc: acc.join(','), vals, shown, comp, variant });
          isGift = n % 2 === 0;
          logBlend();
          return;
        }
        for (let k = 0; k < sizes[i]; k++) { acc.push(k); rec(i + 1, acc); acc.pop(); }
      };
      rec(0, []);
      const bodies = await Promise.all(window.__beacons.map(x => typeof x === 'string' ? x : x.text()));
      return { n, bad: bad.slice(0, 10), badCount: bad.length, bodies };
    }, lang);
    totalCombos += r.n;
    console.log(`[A] ${lang}: ${r.n} combinaisons, ${r.badCount} ne totalisent pas 100 %`);
    if (r.badCount) fail(`${lang}: ${JSON.stringify(r.bad)}`);
    const rejected = r.bodies.map(b => [registryProblem(b), b]).filter(([p]) => p);
    payloads += r.bodies.length;
    if (r.bodies.length !== r.n) fail(`${lang}: ${r.bodies.length} envois au registre pour ${r.n} blends`);
    if (rejected.length) fail(`${lang}: ${rejected.length} envois refusés par le registre, ex. ${rejected[0][0]}: ${rejected[0][1]}`);
  }
  console.log(`[C] ${payloads} envois au registre, tous au format accepté par l'Apps Script`);

  // ── B. Real clicks, end to end, up to the cart form ──
  const expectedVariant = await page.evaluate(() => VARIANTS);
  const grindOf = { 0: 'espresso', 1: 'moka', 2: 'grani', 3: 'filtro', 4: 'filtro', 5: 'filtro' };
  const wIdx = { '250g': 0, '500g': 1, '1kg': 2 };
  let flows = 0;
  for (const lang of LANGS) {
    for (let method = 0; method < 6; method++) {
      for (const w of ['250g', '500g', '1kg']) {
        const gift = (method + wIdx[w]) % 2 === 1;
        const name = ['', 'Alba di novembre', "Tasse de mémé & l'été", '=HYPERLINK("x")', 'Omas Tasse ☕'][flows % 5];
        const before = carts.length;
        await page.goto(BASE);
        await page.click(`.lang-btn:nth-child(${LANGS.indexOf(lang) + 1})`);
        await page.click('#intro-btn');
        const picks = [method, flows % 4, flows % 3, (flows + 1) % 4, (flows + 2) % 3, flows % 3];
        for (let q = 0; q < 6; q++) {
          await page.waitForSelector('#q-area .q-label');
          await page.waitForFunction((q) => document.getElementById('step-lbl').textContent.startsWith((q + 1) + ' '), q);
          await page.click(`#q-area .opt-card:nth-child(${picks[q] + 1})`);
        }
        await page.waitForSelector('#naming.active');
        if (name) await page.fill('#name-input', name);
        await page.click(`.w-btn:nth-child(${wIdx[w] + 1})`);
        await page.click('#reveal-btn');
        await page.waitForSelector('#result.active');
        const shown = await page.$$eval('#blend-bars .bar-pct', els => els.map(e => parseInt(e.textContent, 10)));
        if (shown.reduce((a, c) => a + c, 0) !== 100) fail(`${lang} parcours ${flows}: barres ${shown}`);
        const shownName = await page.textContent('#r-name');
        const ref = (await page.textContent('#r-ref')).replace('#', '');
        const comp = await page.evaluate(() => compositionString(lastBlend));
        if (gift) await page.click('#gift-row');
        await Promise.all([page.waitForURL('https://www.caffesuiso.ch/cart/add'), page.click('#r-order')]);
        if (carts.length !== before + 1) { fail(`${lang} parcours ${flows}: aucun envoi panier`); flows++; continue; }
        const c = carts[carts.length - 1];
        const f = new URLSearchParams(c.body);
        const keys = [...f.keys()];
        const want = ['id', 'quantity', 'properties[Nome miscela]', 'properties[Composizione]'].concat(gift ? ['properties[Regalo]'] : []).concat(['return_to']);
        if (c.method !== 'POST') fail(`${lang} parcours ${flows}: méthode ${c.method}`);
        if (JSON.stringify(keys) !== JSON.stringify(want)) fail(`${lang} parcours ${flows}: champs ${keys} (attendu ${want})`);
        if (f.get('id') !== expectedVariant[grindOf[method]][w]) fail(`${lang} parcours ${flows}: id ${f.get('id')} pour ${grindOf[method]} ${w}`);
        if (f.get('quantity') !== '1') fail(`${lang} parcours ${flows}: quantity ${f.get('quantity')}`);
        if (f.get('properties[Nome miscela]') !== `${shownName} · #${ref}`) fail(`${lang} parcours ${flows}: Nome miscela "${f.get('properties[Nome miscela]')}"`);
        if (f.get('properties[Composizione]') !== comp) fail(`${lang} parcours ${flows}: Composizione`);
        if (gift && f.get('properties[Regalo]') !== 'Sì') fail(`${lang} parcours ${flows}: Regalo ${f.get('properties[Regalo]')}`);
        if (!gift && f.has('properties[Regalo]')) fail(`${lang} parcours ${flows}: Regalo présent sans cadeau`);
        if (f.get('return_to') !== '/cart') fail(`${lang} parcours ${flows}: return_to`);
        flows++;
      }
    }
  }
  console.log(`[B] ${flows} parcours complets au clic, ${carts.length} envois panier interceptés (aucun n'est parti vers Shopify)`);

  // ── D. No external host ──
  const ext = [...new Set(external.map(u => new URL(u).host))];
  console.log(`[D] hôtes externes contactés : ${ext.length ? ext.join(', ') : 'aucun'}`);
  if (ext.length) fail('requêtes externes : ' + ext.join(', '));
  if (errors.length) fail('erreurs JavaScript : ' + errors.join(' | '));

  console.log(`\nTOTAL : ${totalCombos} combinaisons + ${flows} parcours — ${failures ? failures + ' ÉCHEC(S)' : 'TOUT EST OK'}`);
  await browser.close();
  site.close();
  process.exit(failures ? 1 : 0);
})();
