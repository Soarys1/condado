# Condado

Jogo de estratégia medieval no browser — constrói o teu condado, treina tropas e ataca aldeias rivais.

Tema rústico em vista isométrica 3/4, otimizado para **celular e desktop**.

## Contas e banco (Firebase)

Cadastro, login e o progresso do jogo usam **Firebase Auth + Cloud Firestore**. Não há SQLite, Postgres nem Better Auth no caminho do jogo.

- **Criar conta / Entrar**: e-mail + senha, ou Google.
- **Nome do condado**: único (coleção `condado_nick_index`).
- **Progresso**: ouro, pão, Niens, cartas, mapa e ranking em `condado_profiles`.
- **Transferências**: `condado_transfers` (o destinatário recebe no próximo carregamento).
- **Ranking semanal**: estrelas da semana, prêmio domingo 23h Brasília.

A configuração web pública do projeto `condado-dcdf5` já vai no código. **Não precisa de variáveis `VITE_FIREBASE_*` no Vercel.** Nunca coloque o JSON da conta de serviço (`firebase-adminsdk`) no GitHub, no frontend, nem numa variável `VITE_*`.

### Firebase Console (uma vez)

1. Authentication → Sign-in method: **E-mail/senha** e **Google** ligados.
2. Authentication → Settings → Authorized domains: inclua `localhost`, `vercel.app` e o teu domínio de produção.
3. Firestore já existe (`southamerica-east1`). Não é preciso “iniciar coleção” — o jogo cria os documentos sozinho.
4. Firestore → Rules: o ficheiro `firestore.rules` deste repositório (já publicado).

### Vercel

Liga o GitHub `Soarys1/condado` e faz **Redeploy**. Não é obrigatório colar o JSON de Admin. Depois do deploy, testa **Criar conta** com um e-mail novo.

Se o Google falhar com `unauthorized-domain`, adiciona `vercel.app` em Authorized domains e espera um minuto.

## Como jogar

1. Constrói minas (ouro) e fazendas (pão). Recolhe quando a bolha aparecer.
2. O **nível do Condado** limita o nível de todas as estruturas. Só avanças com full construção.
3. Treina infantaria, arqueiros, cavalaria, defensores da guilda, general e generala.
4. Evolui tropas no **Campo de Treino** com ouro, pão e cartas.
5. Ataca bases inimigas. Tropas só derrubam muros se precisarem abrir caminho. Toque uma construção durante o ataque para focar.
6. Recua a qualquer momento — os soldados vivos voltam. O saque é **só ouro**, teto 8.400.
7. **Niens** são gemas raras. Não se saqueiam. Compram-se por 450.000 ouro e vendem-se por 150.000.
8. Envia Niens, ouro, pão e cartas pelo ID (cola o ID, vê o nick, escolhe o envio).
9. Muros retos (I) ou deitados (—). Gira com a seta. Toque 3 vezes para mover. Fileira inteira selecionável. Limite 200 + 55 por nível.
10. **Passe de Batalha**: dia 1 de cada mês, 30 dias (fevereiro 27). 50 níveis.
11. **Alianças**: 5 milhões para fundar. Guerra sábado 8h–23h de Brasília.
12. Se te atacam online, só assistes. Depois, 1 hora de escudo.

## Rodar localmente

```bash
npm install
npm run dev
```

```bash
npm run build
npm run typecheck
```

## Stack

TanStack Start + React + Canvas 2D + Zustand. Auth: Firebase Auth. Banco: Cloud Firestore.
