// Teste visual automático: abre todas as abas com DADOS FICTÍCIOS (tests/dados-ficticios.js),
// sem acesso ao Firebase real, em celular (390 px) e computador (1440 px).
// Falha se algo passar da largura da tela, se uma linha de tabela ficar alta demais ou se der erro de script.
// Uso: node test-visual.cjs   (Playwright/Chromium já vêm no ambiente do Claude)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const fake = fs.readFileSync(path.join(__dirname, 'test-operations-data.js'), 'utf8');
const ABAS = [...fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').matchAll(/class="navbtn[^"]*" data-page="([a-z]+)"/g)].map(m => m[1]);
const LARGURAS = [390, 1440];
const LINHA_MAX = 110; // px por linha de produto (o padrão é ~2 linhas de texto)
const FOTOS = process.env.FOTOS; // opcional: pasta para salvar fotos de cada aba
(async () => {
  const falhas = [];
  const b = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined});
  for (const w of LARGURAS) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    p.on('pageerror', e => falhas.push(`${w}px: erro de script: ${e.message.slice(0, 120)}`));
    await p.route(/gstatic\.com\/firebasejs/, r => r.fulfill({ contentType: 'text/javascript', body: r.request().url().includes('app-compat') ? fake : '' }));
    await p.route(/cdnjs|jsdelivr|unpkg/, r => r.fulfill({ contentType: 'text/javascript', body: 'window.XLSX=window.XLSX||{}' }));
    await p.route(/^https?:\/\/(?!.*(gstatic|cdnjs|jsdelivr|unpkg))/, r => r.abort());
    await p.goto('file://' + path.join(__dirname, 'index.html'));
    await p.waitForTimeout(1500);
    for (const aba of ABAS) {
      await p.evaluate(a => { document.querySelector(`.navbtn[data-page="${a}"]`).click(); window.scrollTo(0, 0); }, aba);
      await p.waitForTimeout(400);
      const r = await p.evaluate(() => {
        const W = document.documentElement.clientWidth, sw = document.documentElement.scrollWidth;
        const page = document.querySelector('.page.on');
        const linhas = [...page.querySelectorAll('.tablewrap tbody tr')].filter(tr => tr.children.length > 1).slice(0, 30).map(tr => tr.getBoundingClientRect().height); // ignora linha única de aviso ("Nenhum...")
        return { estouro: sw - W, linhaMax: Math.round(Math.max(0, ...linhas)) };
      });
      if (r.estouro > 1) falhas.push(`${w}px · ${aba}: a página passa ${r.estouro}px da largura da tela`);
      if (r.linhaMax > LINHA_MAX) falhas.push(`${w}px · ${aba}: linha de tabela com ${r.linhaMax}px (máximo ${LINHA_MAX})`);
      if (FOTOS) { fs.mkdirSync(FOTOS, { recursive: true }); await p.screenshot({ path: path.join(FOTOS, `${aba}-${w}.png`) }); }
    }
    await p.close();
  }
  await b.close();
  if (falhas.length) { console.error('Visual com problemas:\n- ' + falhas.join('\n- ')); process.exit(1); }
  console.log(`Visual OK: ${ABAS.length} abas em ${LARGURAS.join(' e ')} px, nada passa da tela, linhas até ${LINHA_MAX}px.`);
})().catch(e => { console.error(e); process.exit(1); });
