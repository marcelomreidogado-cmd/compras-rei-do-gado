// Teste visual automático: abre todas as abas com DADOS FICTÍCIOS (tests/dados-ficticios.js),
// sem acesso ao Firebase real, em celular (390 px) e computador (1440 px).
// Falha se algo passar da largura da tela, se uma linha de tabela ficar alta demais ou se der erro de script.
// Uso: node test-visual.cjs   (Playwright/Chromium já vêm no ambiente do Claude)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const fake = fs.readFileSync(path.join(__dirname, 'test-operations-data.js'), 'utf8');
const ABAS = [...fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').matchAll(/class="navbtn[^"]*" data-page="([a-z]+)"/g)].map(m => m[1]);
const LARGURAS = [390, 820, 1024, 1440]; // celular, tablet em pé, tablet deitado, computador
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
        // a 1ª coluna visível de cada tabela precisa mostrar texto (o nome do produto não pode sumir)
        const semNome = [...page.querySelectorAll('.tablewrap table')].filter(t => t.offsetParent).map(t => { const ths = [...t.querySelectorAll('thead th')], col = ths.findIndex(th => /^produto/i.test(th.innerText.trim())); if (col < 0) return null; const tr = [...t.querySelectorAll('tbody tr')].find(x => x.children.length > col); const td = tr && tr.children[col]; return !td || (td.getBoundingClientRect().width > 40 && /[A-Za-zÀ-ú]{2}/.test(td.innerText)) ? null : (t.id || t.className); }).filter(Boolean);
        // tabelas por loja: Estoque e Vendas de cada loja precisam ter a mesma faixa de cor (cabeçalho e linhas alinhados)
        const desalinhado = [...page.querySelectorAll('.st-table')].filter(t => t.offsetParent).flatMap(t => [...t.querySelectorAll('tbody tr.st-row')].slice(0, 15).flatMap(tr => [...tr.querySelectorAll('td.st-cell')].filter(td => !/st-(rupture|negative)/.test(td.className)).map(td => { const venda = td.nextElementSibling; return venda && getComputedStyle(td).backgroundColor !== getComputedStyle(venda).backgroundColor ? ((tr.querySelector('.pn-name,.product')||{}).innerText||'').split('\n')[0] : null; }).filter(Boolean))).slice(0, 3);
        return { estouro: sw - W, linhaMax: Math.round(Math.max(0, ...linhas)), semNome, desalinhado };
      });
      if (r.estouro > 1) falhas.push(`${w}px · ${aba}: a página passa ${r.estouro}px da largura da tela`);
      for (const t of r.semNome) falhas.push(`${w}px · ${aba}: a primeira coluna visível da tabela (${t}) está vazia — nome do produto sumiu?`);
      for (const nome of r.desalinhado) falhas.push(`${w}px · ${aba}: Estoque e Vendas da mesma loja com cores de fundo diferentes (${nome})`);
      if (r.linhaMax > LINHA_MAX) falhas.push(`${w}px · ${aba}: linha de tabela com ${r.linhaMax}px (máximo ${LINHA_MAX})`);
      if (FOTOS) { fs.mkdirSync(FOTOS, { recursive: true }); await p.screenshot({ path: path.join(FOTOS, `${aba}-${w}.png`) }); }
    }
    await p.close();
  }
  await b.close();
  // cores das lojas não podem usar vermelho, laranja, amarelo ou verde: essas cores são de alerta (ruptura, cobertura baixa, ok)
  const cores = (fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8').match(/const STORE_COLORS=(\{[^}]*\})/) || [])[1];
  if (!cores) falhas.push('STORE_COLORS não encontrado no index.html');
  else for (const [loja, hex] of Object.entries(JSON.parse(cores))) {
    const [r, g, bb] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255), mx = Math.max(r, g, bb), mn = Math.min(r, g, bb), d = mx - mn;
    let h = d === 0 ? 0 : mx === r ? 60 * (((g - bb) / d) % 6) : mx === g ? 60 * ((bb - r) / d + 2) : 60 * ((r - g) / d + 4); if (h < 0) h += 360;
    if (h < 60 || h > 335 || (h >= 75 && h <= 165)) falhas.push(`cor da loja ${loja} (${hex}) parece cor de alerta (vermelho/laranja/amarelo/verde). Use azul, ciano, índigo ou magenta.`);
  }
  if (falhas.length) { console.error('Visual com problemas:\n- ' + falhas.join('\n- ')); process.exit(1); }
  console.log(`Visual OK: ${ABAS.length} abas em ${LARGURAS.join(' e ')} px, nada passa da tela, linhas até ${LINHA_MAX}px, Estoque/Vendas alinhados, cores de loja fora das cores de alerta.`);
})().catch(e => { console.error(e); process.exit(1); });
