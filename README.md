# Condado

Jogo de estratégia medieval no browser — constrói o teu condado, treina tropas e ataca aldeias rivais.

Tema rústico em vista isométrica 3/4, otimizado para **celular e desktop**.

## Contas

- **Criar conta / Entrar**: e-mail + senha, ou Google.
- O progresso da conta vive no servidor. O aparelho só guarda um cache.
- **Nome do condado** é único.
- **Anti-multi**: um condado por e-mail e por aparelho.
- **Ranking semanal**: estrelas da semana, prêmio domingo 23h Brasília.

A configuração web pública do projeto já vai no código. **Não coloques o JSON da conta de serviço no GitHub, no frontend, nem numa variável `VITE_*`.**

A chave `AIza…` no cliente **não é um segredo** — é o identificador web público. O GitHub às vezes apita; o ouro está protegido pelas regras + servidor.

### Produção (uma vez)

1. **Regras (obrigatório)** — no Console, Firestore → **Segurança**, cola o ficheiro `firestore.rules` deste repositório e clica **Publicar**. Sem isto o cliente antigo ainda consegue escrever ouro.
2. **Índices** — Firestore → **Índices**, ou publica `firestore.indexes.json`.
3. **Vercel** — o livro do reino já reconhece `ifcorporationsu@gmail.com` sem variável. Para a economia da conta real, define só:
   - `FIREBASE_SERVICE_ACCOUNT` = o JSON inteiro da conta de serviço (Project settings → Service accounts → Generate new private key).
   - Tipo: **Sensitive / Secret**. Sem prefixo `VITE_`. Ambiente: Production + Preview. Disponível em **Runtime** (não só Build).
   - Cola o JSON numa linha, ou com as quebras `\n` da chave privada tal como o ficheiro original.
   - Se o JSON for recusado pelo tamanho, usa em vez disso `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` (a chave com `\n`).
4. Redeploy depois de gravar a variável.

Sem a conta de serviço, o reino de treino abre; a conta real não move ouro.

A economia (libras, Niens, mercado, ranking, saque) só muda no servidor. Pedidos repetidos com o mesmo `requestId` não creditam duas vezes.

## Como jogar

1. Constrói minas (libras) e fazendas (pão). Recolhe quando a bolha aparecer.
2. O **nível do Condado** limita o nível de todas as estruturas. Só avanças com full construção.
3. Treina infantaria, arqueiros, cavalaria, defensores da guilda, General Shin e General Leona.
4. Evolui tropas no **Campo de Treino** com libras, pão e cartas. Cada tropa consome 20 pães por dia.
5. Ataca bases inimigas. Tropas só derrubam muros se precisarem abrir caminho. Toque uma construção durante o ataque para focar.
6. Recua a qualquer momento — os soldados vivos voltam. O saque é **só libras**, teto 8.400. Uma conta sofre no máximo 12 ataques/dia (2 na guerra de alianças).
7. **Niens** são gemas raras. Não se saqueiam. Compram-se por 450.000 libras e vendem-se por 150.000. Envio diário: Nv.1–5 = 5, Nv.6–10 = 10, Nv.11–15 = 20.
8. Envia Niens, libras, pão e cartas pelo ID (cola o ID, vê o nick, escolhe o envio).
9. Muros retos (I) ou deitados (—). Gira com a seta. Toque 3 vezes para mover. Fileira inteira selecionável. Limite 200 + 55 por nível.
10. **Passe de Batalha**: dia 1 de cada mês, 30 dias (fevereiro 27). 50 níveis.
11. **Alianças**: 5 milhões para fundar. Guerra sábado 8h–23h de Brasília.
12. Se te atacam online, só assistes. Depois, 1 hora de escudo.
13. Contas novas começam com **0 Niens**. Conta já criada entra direto no condado.

## Rodar localmente

```bash
npm install
npm run dev
```

```bash
npm run build
npm run typecheck
npm test
```

## Stack

TanStack Start + React + Canvas 2D + Zustand. Auth e dados da conta no servidor.
