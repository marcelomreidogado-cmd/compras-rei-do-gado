# Compras Gerenciais Rei do Gado — guia do projeto

Painel gerencial de compras do açougue Rei do Gado: visão geral, produtos, famílias, preços, bebidas, molhos e sugestão de compra, a partir de planilhas importadas.

## Arquitetura
- `index.html` é o app inteiro (~90 KB, sem build). Versão em `VERSION` (formato `"2.7.0-2026-11-15"`; também na meta `rdg-version` e no texto "Versão" das telas) — atualizar ao mudar comportamento.
- Telas (`data-page`): `overview`, `products`, `families`, `prices`, `beverages`, `sauces`, `purchase`.
- SheetJS 0.18.5 (cdnjs) para ler as planilhas; Firebase compat 10.12.5 (auth + **Realtime Database**).
- Firebase projeto `motoboy-ddefa` (o mesmo do Caixa Rei do Gado e do RH). Estado central em `compras_gerencial_v2/state` (`CENTRAL_PATH`), sincronizado entre todos os computadores. Login com Firebase Auth (e-mail/senha).

## Publicação
- Arquivo estático; publicado pelo GitHub Pages a partir da `main` (confirmar nas configurações do repositório se mudar).

## Fluxo de trabalho
- Editar → `node --check` no script extraído → testar com um `CENTRAL_PATH` de teste, nunca no estado real → commit em português.
- Mudança de estrutura do estado: migrar de forma compatível, sem apagar o que já foi importado; backup antes.
- Usuário (Marcelo) trabalha em português do Brasil, no Mac, e prefere soluções simples, sem terminal.
