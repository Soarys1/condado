# Condado

Jogo de estratégia medieval no browser — constrói o teu condado, treina tropas e ataca aldeias rivais.

Tema rústico em vista isométrica 3/4, otimizado para **celular e desktop**.

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
11. **Alianças**: 5 milhões para fundar. Guerra sábado 8h–23h de Brasília. Pares de alianças; ímpar espera.
12. Se te atacam online, só assistes. Depois, 1 hora de escudo.

## Rodar localmente

```bash
npm install
npm run dev
```

Abre [http://localhost:8080](http://localhost:8080).

```bash
npm run build
npm run typecheck
```

## Música e sons

A trilha **não é um MP3**. É gerada em tempo real (Web Audio API) em:

[`src/lib/game/audio.ts`](src/lib/game/audio.ts)

Três modos, sem drone grave contínuo:

| O quê | Onde | Efeito |
|---|---|---|
| Vila — flauta | `VILLAGE_FLUTE` | Melodia original |
| Vila — alaúde | `VILLAGE_LUTE` | Segunda voz do condado |
| Batalha | `BATTLE_FLUTE` + `BATTLE_HARMONY` | Raid / preparação |
| Guerra de aliança | `WAR_HORN` + `WAR_FIFTH` | Sábado 8h–23h BRT |
| Velocidade | `bpm` em `schedule()` | Vila 72, guerra 108, batalha 128 |

Efeitos (clique, flecha, coleta, recuo) ficam no mesmo arquivo, **acima** das melodias.

## Estrutura

```
src/lib/game/          regras, batalha, render, áudio, save
src/components/game/   UI (HUD, folhas, perfil, mercado, passe, aliança)
public/game/           sprites e texturas
```

## Stack

TanStack Start + React + Canvas 2D + Zustand. Persistência em `localStorage`.

## Persistência Firebase/Firestore

A persistência do jogo usa o Firebase Admin SDK no servidor. Os documentos ficam nas coleções `condado_profiles`, `condado_player_index`, `condado_nick_index`, `condado_transfers` e `condado_week_claims`; o cliente não acessa diretamente os dados do jogo. As operações de saldo, transferência e recompensa usam transações do Firestore para evitar perda de recursos durante autosaves concorrentes.

Configure as variáveis `VITE_FIREBASE_*` com a configuração do Firebase Web no frontend e `FIREBASE_SERVICE_ACCOUNT_JSON` somente no ambiente do servidor. Nunca envie o JSON de conta de serviço para o GitHub nem o coloque em `public/`, no bundle do navegador ou em uma variável `VITE_*`. Depois de configurar o projeto, aplique `firebase.json`, `firestore.rules` e `firestore.indexes.json` com a Firebase CLI. A regra inicial bloqueia o acesso direto do cliente; as funções do servidor usam o Admin SDK e continuam protegidas pelo middleware de autenticação.
