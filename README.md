# Condado

Jogo de estratégia medieval no browser — constrói o teu condado, treina tropas e ataca aldeias rivais.

Tema rústico em vista isométrica 3/4, otimizado para **celular e desktop**.

## Como jogar

1. Constrói minas (ouro) e fazendas (pão). Recolhe quando a bolha aparecer.
2. Treina infantaria, arqueiros, cavalaria, general e generala no quartel.
3. Ataca bases inimigas. Tropas só derrubam muros se precisarem abrir caminho.
4. Recua a qualquer momento — os soldados vivos voltam.
5. Envia Niens, ouro e pão para outros jogadores pelo ID (aba Mercado).
6. Muda o teu nome na aba **Perfil**. O ID é único e imutável.

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

| O quê | Onde | Efeito |
|---|---|---|
| Melodia da vila | `VILLAGE_FLUTE` | Notas em Hz. `0` = pausa |
| Melodia da batalha | `BATTLE_FLUTE` | Toca em raid / preparação |
| Velocidade | `bpm` em `schedule()` | Vila `74`, batalha `116` |
| Volume da música | `music.gain.value` | `0.0` a `1.0` |
| Drone grave | `ensureDrone()` | Fundo contínuo |

Efeitos (clique, flecha, espada, coleta) ficam no mesmo arquivo, **acima** das melodias. Não precisa mexer neles para trocar só a trilha.

Para usar um MP3 de verdade: coloca `public/game/village.mp3` e `public/game/battle.mp3` e troca o sequencer por `new Audio("/game/village.mp3")` no `setMusicMode`.

## Estrutura

```
src/lib/game/          regras, batalha, render, áudio, save
src/components/game/   UI (HUD, folhas, perfil, mercado)
public/game/           sprites e texturas
```

## Stack

TanStack Start + React + Canvas 2D + Zustand. Persistência em `localStorage`.
