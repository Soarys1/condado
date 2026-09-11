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

### Produção (uma vez)

1. Authentication → e-mail/senha e Google ligados. Domínios autorizados: o teu domínio de produção.
2. Publica as regras e índices deste repositório (`firestore.rules`, `firestore.indexes.json`).
3. No Vercel, define:
   - `FIREBASE_SERVICE_ACCOUNT` — JSON da conta de serviço (texto inteiro), **ou** `FIREBASE_SERVICE_ACCOUNT_BASE64`, **ou** `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`
   - `ADMIN_EMAILS` — e-mails que vêem o livro do reino (separados por vírgula)
4. Liga o GitHub `Soarys1/condado` e faz **Redeploy**. Sem a conta de serviço, o jogo de treino abre mas a conta real não move ouro.

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
