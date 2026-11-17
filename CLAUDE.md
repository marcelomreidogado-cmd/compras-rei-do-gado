# Compras Gerenciais Rei do Gado — guia do projeto

Painel gerencial de compras do açougue Rei do Gado: visão geral, produtos, famílias, preços, bebidas, molhos e sugestão de compra, a partir de planilhas importadas.

## Arquitetura
- `index.html` é o app inteiro (~90 KB, sem build). Versão em `VERSION` (formato `"2.16.0-2026-11-17"`; também na meta `rdg-version` e no texto "Versão" das telas) — atualizar ao mudar comportamento.
- Telas (`data-page`): `overview`, `products`, `families`, `prices`, `beverages`, `sauces`, `operations`, `purchase`.
- SheetJS 0.18.5 (cdnjs) para ler as planilhas; Firebase compat 10.12.5 (auth + **Realtime Database**).
- Firebase projeto `motoboy-ddefa` (o mesmo do Caixa Rei do Gado e do RH). Estado central em `compras_gerencial_v2/state` (`CENTRAL_PATH`), sincronizado entre todos os computadores. Login com Firebase Auth (e-mail/senha).

## Publicação
- Arquivo estático; publicado pelo GitHub Pages a partir da `main` (confirmar nas configurações do repositório se mudar).

## Fluxo de trabalho
- Editar → `node --check` no script extraído → testar com um `CENTRAL_PATH` de teste, nunca no estado real → commit em português.
- Mudança de estrutura do estado: migrar de forma compatível, sem apagar o que já foi importado; backup antes.
- Usuário (Marcelo) trabalha em português do Brasil, no Mac, e prefere soluções simples, sem terminal.

## Módulos e visual (17/11/2026)
- Além do `index.html`: `pcp.js` (painel PCP/operações), `prices.js` (Produtos e preços), `product-notes.js` (marcação "comprado nesta semana" e observações). Cada um carregado com `?v=` — ao mudar o arquivo, subir o `v` no `<script>` do `index.html`. Testes: `node test-pcp.cjs`, `node test-prices.cjs`, `node test-product-notes.cjs`.
- Visual: classes no fim do `<style>` (`.pn-*` marcação compacta em uma linha; `.pk-row/.pk-chip` filtros de preço). Evitar estilos inline grandes dentro das tabelas — cada produto deve caber em ~2 linhas.

## Padrão visual (obrigatório em toda mudança)
Polimento visual feito em 15/11/2026. Para não regredir (o Compras piorou em 16–17/11 por isso):
- **Não colocar estilo solto (`style="..."`) em linhas de tabela, listas ou cartões.** Criar ou reutilizar classes no bloco de CSS do projeto (indicado abaixo). Estilo inline só para valores dinâmicos (cor de loja, largura de barra).
- **Tabelas compactas:** cada linha de produto/cliente/lançamento cabe em ~2 linhas de texto. Controles extras (marcações, botões) ficam pequenos e na mesma linha; detalhes vão para um modal ou para a dica (`title`).
- **Nada passa da largura da tela**, exceto tabelas largas dentro de um contêiner que desliza (com a coluna de nome fixa à esquerda no celular).
- **Celular primeiro:** conferir em 390 px e em 1440 px. No celular: navegação numa faixa/barra única, filtros e chips em faixa que desliza, indicadores em 2 colunas, textos sem cortar no meio da palavra.
- **Números** com algarismos alinhados (`font-variant-numeric: tabular-nums`), sem fonte monoespaçada; valores com sinal não quebram linha.
- Reaproveitar as cores, raios, botões e chips que o sistema já usa — não criar um estilo novo para cada tela.

### Conferência antes de publicar
0. **Rodar `node test-visual.cjs` e só publicar se der "Visual OK".** Abre as 8 abas (lidas do menu) com `tests/dados-ficticios.js` em 390 e 1440 px; falha se a página estoura a largura, se uma linha de tabela passa de 110 px ou se dá erro de script. Ao criar aba nova, ela entra sozinha no teste. `FOTOS=<pasta> node test-visual.cjs` salva uma foto de cada tela para o antes e depois.
1. Abrir o sistema com **dados fictícios** e **sem acesso ao banco real** (veja "Como testar o visual" abaixo).
2. Fotografar as telas alteradas em 390 px e 1440 px (Playwright já instalado no ambiente; Chromium em `/opt/pw-browsers`).
3. Medir que `document.documentElement.scrollWidth` não passa da largura da janela em todas as abas.
4. Mostrar ao Marcelo as fotos de **antes e depois** na resposta e dizer o que não foi testado.

### Onde fica o visual / como testar o visual
- CSS no fim do `<style>` do `index.html` (blocos "v2.7: polimento visual", ".pn-*" marcação de compra e ".pk-row/.pk-chip" filtros de preço). Os módulos `pcp.js`, `prices.js` e `product-notes.js` devem gerar HTML com essas classes, não com estilo inline.
- Teste: Playwright com `addInitScript` definindo `window.firebase` falso (auth + `database().ref(CENTRAL_PATH)` com `once/on/set`) devolvendo ~60 produtos fictícios nas 3 lojas; bloquear `gstatic.com/firebasejs` e `cdnjs`. Navegar clicando nos `.navbtn[data-page]` (todas as 8 abas). Rodar também `node test-*.cjs`.
