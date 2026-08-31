import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Castle,
  Coins,
  Copy,
  Crosshair,
  MessageSquare,
  Scale,
  Shield,
  Star,
  Swords,
  UserRound,
  Volume2,
  VolumeX,
  Wheat,
  X,
  Gem,
  ChevronRight,
  Undo2,
} from "lucide-react";
import {
  BUILD_ORDER,
  BUILDINGS,
  COLLECT_READY,
  TROOP_ORDER,
  TROOPS,
  armyCapacity,
  troopAsset,
  upgradeCost,
  type ResourceKind,
} from "@/lib/game/constants";
import { LORDS } from "@/lib/game/bots";
import { battle, raidTarget, useGame } from "@/lib/game/store";
import { createRuntime } from "@/lib/game/render";
import { formatRes, formatTime, countType } from "@/lib/game/world";
import { setMuted as audioMute, unlockAudio, startMusic, setMusicMode, resumeAudio, sfxClick } from "@/lib/game/audio";
import { loadAssets } from "@/lib/game/assets";

export function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hydrate = useGame((s) => s.hydrate);
  const hydrated = useGame((s) => s.hydrated);
  const screen = useGame((s) => s.screen);

  useEffect(() => {
    hydrate();
    void loadAssets();
  }, [hydrate]);

  const inGame = screen !== "splash";
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !inGame) return;
    const rt = createRuntime(canvas);
    return () => rt.destroy();
  }, [inGame]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") resumeAudio();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (screen === "splash") return;
    setMusicMode(screen === "battle" || screen === "prep" ? "battle" : "village");
  }, [screen]);

  if (!hydrated || screen === "splash") {
    return <Splash />;
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-ink text-parchment">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0 h-full w-full touch-none"
        aria-label="Mapa do condado"
      />
      <HUD />
      {(screen === "prep" || screen === "battle") && <BattleHUD />}
      {screen === "results" && <Results />}
      {screen === "raid" && <RaidSelect />}
      <Sheets />
      <Toast />
    </div>
  );
}

function Splash() {
  const startGame = useGame((s) => s.startGame);
  const [nick, setNick] = useState("");
  return (
    <div className="relative flex h-full w-full items-end justify-center">
      <img src="/game/splash.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/20" />
      <div className="relative z-10 mb-[max(2rem,env(safe-area-inset-bottom))] w-full max-w-md px-5 pb-6">
        <p className="font-display text-[0.7rem] uppercase tracking-[0.35em] text-parchment-dim">
          Senhores da guerra
        </p>
        <h1 className="mt-2 font-display text-5xl font-semibold tracking-wide text-parchment">Condado</h1>
        <p className="mt-3 max-w-sm text-[0.95rem] leading-relaxed text-parchment-dim">
          Erga o castelo, extraia ouro, asse pão e marche sobre os vizinhos. Niens selam o trato.
        </p>
        <label className="mt-6 block text-xs uppercase tracking-[0.18em] text-parchment-dim">
          Seu nome de senhor
        </label>
        <input
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          maxLength={18}
          placeholder="ex. Teresa da Serra"
          className="mt-2 h-12 w-full rounded-md border border-line-strong bg-ink-2/80 px-3 text-base text-parchment outline-none placeholder:text-parchment-dim/60 focus:border-niens"
        />
        <button
          type="button"
          className="mt-4 flex h-12 w-full items-center justify-center rounded-md bg-parchment font-display text-sm font-semibold tracking-wide text-ink transition-transform active:scale-[0.98]"
          onClick={() => {
            unlockAudio();
            startMusic("village");
            startGame(nick || "Senhor");
          }}
        >
          Entrar no condado
        </button>
      </div>
    </div>
  );
}

function HUD() {
  const gold = useGame((s) => s.gold);
  const bread = useGame((s) => s.bread);
  const niens = useGame((s) => s.niens);
  const player = useGame((s) => s.player);
  const sheet = useGame((s) => s.sheet);
  const setSheet = useGame((s) => s.setSheet);
  const muted = useGame((s) => s.muted);
  const setMuted = useGame((s) => s.setMuted);
  const placing = useGame((s) => s.placing);
  const cancelPlace = useGame((s) => s.cancelPlace);
  const screen = useGame((s) => s.screen);
  const collectAll = useGame((s) => s.collectAll);

  if (screen === "results") return null;

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto mx-auto flex max-w-3xl items-center gap-2 px-3">
          <Pill icon={<Coins className="size-3.5" />} label={formatRes(gold)} tone="gold" />
          <Pill icon={<Wheat className="size-3.5" />} label={formatRes(bread)} tone="bread" />
          <Pill icon={<Gem className="size-3.5" />} label={formatRes(niens)} tone="niens" />
          {screen === "village" && (
            <button
              type="button"
              onClick={collectAll}
              className="hidden h-9 items-center rounded-md border border-line bg-panel/80 px-2.5 text-xs text-parchment-dim sm:flex"
            >
              Coletar
            </button>
          )}
          <button
            type="button"
            aria-label="Perfil"
            className="ml-auto flex size-9 items-center justify-center rounded-md border border-line bg-panel/80"
            onClick={() => setSheet(sheet === "profile" ? null : "profile")}
          >
            <UserRound className="size-4" />
          </button>
          <button
            type="button"
            aria-label={muted ? "Ativar som" : "Silenciar"}
            className="flex size-9 items-center justify-center rounded-md border border-line bg-panel/80"
            onClick={() => {
              unlockAudio();
              audioMute(!muted);
              setMuted(!muted);
            }}
          >
            {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
          </button>
        </div>
        <button
          type="button"
          className="pointer-events-auto mt-1 px-4 text-left font-display text-[0.65rem] tracking-[0.2em] text-parchment-dim"
          onClick={() => setSheet("profile")}
        >
          {player.nick} · {player.id}
        </button>
      </div>

      {placing && (
        <div className="absolute left-1/2 top-20 z-20 flex -translate-x-1/2 items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-sm shadow-panel">
          <span>Toque o mapa para erguer {BUILDINGS[placing].name}</span>
          <button type="button" className="rounded-sm p-1" onClick={cancelPlace} aria-label="Cancelar">
            <X className="size-4" />
          </button>
        </div>
      )}

      {screen === "village" && (
        <nav className="absolute inset-x-0 bottom-0 z-20 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-lg justify-between gap-1 px-3">
            <NavBtn icon={<Castle className="size-5" />} label="Erguer" on={() => setSheet(sheet === "build" ? null : "build")} active={sheet === "build"} />
            <NavBtn icon={<Swords className="size-5" />} label="Tropas" on={() => setSheet(sheet === "army" ? null : "army")} active={sheet === "army"} />
            <NavBtn icon={<Crosshair className="size-5" />} label="Atacar" on={() => useGame.getState().openRaid()} active={false} />
            <NavBtn icon={<MessageSquare className="size-5" />} label="Chat" on={() => setSheet(sheet === "chat" ? null : "chat")} active={sheet === "chat"} />
            <NavBtn icon={<Scale className="size-5" />} label="Mercado" on={() => setSheet(sheet === "market" ? null : "market")} active={sheet === "market"} />
            <NavBtn icon={<UserRound className="size-5" />} label="Perfil" on={() => setSheet(sheet === "profile" ? null : "profile")} active={sheet === "profile"} />
          </div>
        </nav>
      )}
    </>
  );
}

function Pill({
  icon,
  label,
  tone,
}: {
  icon: ReactNode;
  label: string;
  tone: "gold" | "bread" | "niens";
}) {
  const color = tone === "niens" ? "text-niens" : tone === "gold" ? "text-gold" : "text-bread";
  return (
    <div className="flex h-9 min-w-0 items-center gap-1.5 rounded-md border border-line bg-panel/85 px-2.5">
      <span className={color}>{icon}</span>
      <span className={`tabular text-sm font-semibold ${color}`}>{label}</span>
    </div>
  );
}

function NavBtn({
  icon,
  label,
  on,
  active,
}: {
  icon: ReactNode;
  label: string;
  on: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        sfxClick();
        on();
      }}
      className={`flex min-h-12 min-w-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 text-[0.65rem] tracking-wide ${
        active ? "border-niens/50 bg-panel-2 text-parchment" : "border-line bg-panel/90 text-parchment-dim"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function Sheets() {
  const sheet = useGame((s) => s.sheet);
  const setSheet = useGame((s) => s.setSheet);
  if (!sheet) return null;
  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-ink/40 md:items-stretch md:justify-end">
      <button type="button" className="absolute inset-0" aria-label="Fechar" onClick={() => setSheet(null)} />
      <div className="panel relative z-10 max-h-[78dvh] w-full overflow-y-auto rounded-t-xl p-4 md:h-full md:max-h-none md:w-[380px] md:rounded-none md:rounded-l-xl md:pt-[max(1.2rem,env(safe-area-inset-top))]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg tracking-wide">
            {sheet === "build" && "Erguer"}
            {sheet === "army" && "Exército"}
            {sheet === "chat" && "Chat dos senhores"}
            {sheet === "market" && "Mercado"}
            {sheet === "info" && "Estrutura"}
            {sheet === "attack" && "Ataque"}
            {sheet === "profile" && "Perfil"}
          </h2>
          <button type="button" onClick={() => setSheet(null)} className="size-10 rounded-md border border-line" aria-label="Fechar">
            <X className="mx-auto size-4" />
          </button>
        </div>
        {sheet === "build" && <BuildSheet />}
        {sheet === "army" && <ArmySheet />}
        {sheet === "chat" && <ChatSheet />}
        {sheet === "market" && <MarketSheet />}
        {sheet === "info" && <InfoSheet />}
        {sheet === "profile" && <ProfileSheet />}
      </div>
    </div>
  );
}

function BuildSheet() {
  const gold = useGame((s) => s.gold);
  const beginPlace = useGame((s) => s.beginPlace);
  return (
    <div className="grid gap-2">
      {BUILD_ORDER.map((type) => {
        const d = BUILDINGS[type];
        const ok = gold >= d.costGold;
        return (
          <button
            key={type}
            type="button"
            disabled={!ok}
            onClick={() => beginPlace(type)}
            className="flex items-center gap-3 rounded-md border border-line bg-ink-2/50 p-3 text-left disabled:opacity-40"
          >
            <img src={`/game/${type}.png`} alt="" className="size-12 object-contain" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm">{d.name}</p>
              <p className="text-xs leading-snug text-parchment-dim">{d.desc}</p>
            </div>
            <span className="tabular text-sm text-gold">{d.costGold}</span>
          </button>
        );
      })}
    </div>
  );
}

function ArmySheet() {
  const army = useGame((s) => s.army);
  const training = useGame((s) => s.training);
  const buildings = useGame((s) => s.buildings);
  const bread = useGame((s) => s.bread);
  const train = useGame((s) => s.train);
  const speedTrain = useGame((s) => s.speedTrain);
  const cap = armyCapacity(countType(buildings, "camp"));
  const used = army.infantry + army.archers + army.cavalry + army.general + army.generaless + training.length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-parchment-dim">
        Capacidade {used}/{cap}. Pão recruta. Cada general marcha sozinho.
      </p>
      {TROOP_ORDER.map((type) => {
        const d = TROOPS[type];
        return (
          <div key={type} className="flex items-center gap-3 rounded-md border border-line bg-ink-2/50 p-3">
            <img src={`/game/${troopAsset(type)}.png`} alt="" className="size-12 object-contain" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm">
                {d.name} <span className="tabular text-parchment-dim">×{army[type]}</span>
              </p>
              <p className="text-xs text-parchment-dim">
                {d.hp} HP · {d.dps}/s · {d.desc}
              </p>
            </div>
            <button
              type="button"
              onClick={() => train(type)}
              className="rounded-md bg-parchment px-3 py-2 font-display text-xs font-semibold text-ink"
            >
              {d.costBread} pão
            </button>
          </div>
        );
      })}
      {training.length > 0 && (
        <div className="space-y-2">
          <p className="font-display text-sm">Fila</p>
          {training.map((j) => (
            <div key={j.id} className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm">
              <span>
                {TROOPS[j.type].name} · {formatTime(j.remaining)}
              </span>
              <button type="button" className="text-niens" onClick={() => speedTrain(j.id)}>
                1 Nien
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-parchment-dim">Pão em estoque: {formatRes(bread)}</p>
    </div>
  );
}

function ChatSheet() {
  const chat = useGame((s) => s.chat);
  const sendChat = useGame((s) => s.sendChat);
  const [text, setText] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [chat.length]);
  return (
    <div className="flex h-[52dvh] flex-col md:h-[calc(100dvh-8rem)]">
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {chat.map((m) => (
          <div key={m.id} className={`rounded-md px-3 py-2 ${m.self ? "bg-moss/20 ml-6" : "bg-ink-2 mr-4"}`}>
            <p className="font-display text-[0.7rem] text-niens">{m.fromNick}</p>
            <p className="text-sm leading-snug">{m.text}</p>
          </div>
        ))}
        <div ref={end} />
      </div>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          sendChat(text);
          setText("");
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-11 flex-1 rounded-md border border-line bg-ink px-3 text-sm outline-none"
          placeholder="Fale com os senhores"
        />
        <button type="submit" className="h-11 rounded-md bg-parchment px-4 font-display text-sm text-ink">
          Enviar
        </button>
      </form>
    </div>
  );
}

function MarketSheet() {
  const offers = useGame((s) => s.offers);
  const buyOffer = useGame((s) => s.buyOffer);
  const sellGold = useGame((s) => s.sellGold);
  const sellBread = useGame((s) => s.sellBread);
  const transfer = useGame((s) => s.transfer);
  const player = useGame((s) => s.player);
  const [to, setTo] = useState("");
  const [amt, setAmt] = useState("1");
  const [kind, setKind] = useState<ResourceKind>("niens");
  return (
    <div className="space-y-4">
      <p className="text-sm text-parchment-dim">
        Seu ID <span className="font-display text-niens">{player.id}</span> valida envios de Niens, ouro e pão.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={sellGold} className="rounded-md border border-line bg-ink-2 px-3 py-3 text-sm">
          1000 ouro → 1 Nien
        </button>
        <button type="button" onClick={sellBread} className="rounded-md border border-line bg-ink-2 px-3 py-3 text-sm">
          1000 pão → 1 Nien
        </button>
      </div>
      <div>
        <p className="mb-2 font-display text-sm">Ofertas</p>
        <div className="space-y-2">
          {offers.map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-md border border-line px-3 py-2">
              <div>
                <p className="text-sm">{o.sellerNick}</p>
                <p className="text-xs text-parchment-dim">
                  {o.give.amount} {o.give.kind === "gold" ? "ouro" : "pão"} por {o.wantNiens} Nien
                </p>
              </div>
              <button type="button" className="text-sm text-niens" onClick={() => buyOffer(o.id)}>
                Comprar
              </button>
            </div>
          ))}
          {offers.length === 0 && <p className="text-sm text-parchment-dim">O tabuleiro está vazio.</p>}
        </div>
      </div>
      <form
        className="space-y-2 rounded-md border border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          transfer(to, Number(amt), kind);
        }}
      >
        <p className="font-display text-sm">Enviar a outro senhor</p>
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="ID do senhor, ex. CDN-ISOLDE"
          className="h-11 w-full rounded-md border border-line bg-ink px-3 text-sm outline-none"
        />
        <div className="grid grid-cols-3 gap-1">
          {(["niens", "gold", "bread"] as ResourceKind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`h-10 rounded-md border text-xs ${
                kind === k ? "border-niens bg-panel-2" : "border-line bg-ink-2"
              }`}
            >
              {k === "niens" ? "Niens" : k === "gold" ? "Ouro" : "Pão"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={amt}
            onChange={(e) => setAmt(e.target.value)}
            type="number"
            min={1}
            className="h-11 w-24 rounded-md border border-line bg-ink px-3 text-sm"
          />
          <button type="submit" className="h-11 flex-1 rounded-md bg-parchment font-display text-sm text-ink">
            Enviar
          </button>
        </div>
      </form>
    </div>
  );
}

function InfoSheet() {
  const selectedId = useGame((s) => s.selectedId);
  const buildings = useGame((s) => s.buildings);
  const upgrade = useGame((s) => s.upgrade);
  const demolish = useGame((s) => s.demolish);
  const collect = useGame((s) => s.collect);
  const storedOf = useGame((s) => s.storedOf);
  const b = buildings.find((x) => x.id === selectedId);
  if (!b) return <p className="text-sm text-parchment-dim">Selecione uma estrutura no mapa.</p>;
  const d = BUILDINGS[b.type];
  const cost = upgradeCost(b.type, b.level);
  const stored = storedOf(b);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <img src={`/game/${b.type}.png`} alt="" className="size-16 object-contain" />
        <div>
          <p className="font-display text-lg">{d.name}</p>
          <p className="text-sm text-parchment-dim">
            Nível {b.level} · {d.hp + Math.round(d.hp * 0.22 * (b.level - 1))} HP
          </p>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-parchment-dim">{d.desc}</p>
      {(b.type === "mine" || b.type === "farm") && (
        <button
          type="button"
          disabled={stored < 1}
          onClick={() => collect(b.id)}
          className="h-11 w-full rounded-md bg-parchment font-display text-sm text-ink disabled:opacity-40"
        >
          {stored >= COLLECT_READY
            ? `Recolher ${stored} ${b.type === "mine" ? "ouro" : "pão"}`
            : stored > 0
              ? `A produzir · ${stored} guardados`
              : "A produzir…"}
        </button>
      )}
      {b.type !== "castle" && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => upgrade(b.id)}
            className="h-11 rounded-md border border-line bg-ink-2 font-display text-sm"
          >
            Melhorar · {cost} ouro
          </button>
          <button type="button" onClick={() => demolish(b.id)} className="h-11 rounded-md border border-iron/40 text-sm text-iron">
            Demolir
          </button>
        </div>
      )}
      {b.type === "castle" && (
        <button type="button" onClick={() => upgrade(b.id)} className="h-11 w-full rounded-md border border-line bg-ink-2 font-display text-sm">
          Melhorar castelo · {cost} ouro
        </button>
      )}
    </div>
  );
}

function ProfileSheet() {
  const player = useGame((s) => s.player);
  const gold = useGame((s) => s.gold);
  const bread = useGame((s) => s.bread);
  const niens = useGame((s) => s.niens);
  const stars = useGame((s) => s.stars);
  const raidsWon = useGame((s) => s.raidsWon);
  const army = useGame((s) => s.army);
  const buildings = useGame((s) => s.buildings);
  const rename = useGame((s) => s.rename);
  const nickDraft = useGame((s) => s.nickDraft);
  const [name, setName] = useState(nickDraft || player.nick);
  const [copied, setCopied] = useState(false);
  const troops = army.infantry + army.archers + army.cavalry + army.general + army.generaless;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-parchment-dim">Nome</p>
        <div className="mt-2 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={18}
            className="h-11 flex-1 rounded-md border border-line bg-ink px-3 text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => rename(name)}
            className="h-11 rounded-md bg-parchment px-3 font-display text-sm text-ink"
          >
            Guardar
          </button>
        </div>
      </div>
      <div>
        <p className="text-xs uppercase tracking-[0.18em] text-parchment-dim">ID único</p>
        <div className="mt-2 flex items-center gap-2 rounded-md border border-line bg-ink-2 px-3 py-2">
          <span className="font-display text-sm text-niens">{player.id}</span>
          <button
            type="button"
            className="ml-auto flex size-9 items-center justify-center rounded-md border border-line"
            aria-label="Copiar ID"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(player.id);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              } catch {
                /* ignore */
              }
            }}
          >
            <Copy className="size-3.5" />
          </button>
        </div>
        <p className="mt-1 text-xs text-parchment-dim">
          {copied ? "Copiado." : "O ID não muda. Serve para receber Niens, ouro e pão."}
        </p>
      </div>
      <ul className="space-y-1 text-sm">
        <li>Ouro {formatRes(gold)} · Pão {formatRes(bread)} · Niens {formatRes(niens)}</li>
        <li>Estrelas de guerra {stars} · Incursões {raidsWon}</li>
        <li>Tropas no campo {troops} · Estruturas {buildings.length}</li>
        <li className="text-parchment-dim">
          Condado fundado em {new Date(player.createdAt).toLocaleDateString("pt")}
        </li>
      </ul>
    </div>
  );
}

function RaidSelect() {
  const beginAttack = useGame((s) => s.beginAttack);
  const returnVillage = useGame((s) => s.returnVillage);
  const stars = useGame((s) => s.stars);
  return (
    <div className="absolute inset-0 z-30 flex items-end bg-ink/55 md:items-center md:justify-center">
      <div className="panel w-full max-h-[82dvh] overflow-y-auto rounded-t-xl p-4 md:max-w-lg md:rounded-xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg">Condados vizinhos</h2>
            <p className="text-xs text-parchment-dim">Estrelas de guerra: {stars}</p>
          </div>
          <button type="button" onClick={returnVillage} className="size-10 rounded-md border border-line" aria-label="Voltar">
            <X className="mx-auto size-4" />
          </button>
        </div>
        <div className="space-y-2">
          {LORDS.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => beginAttack(l)}
              className="flex w-full items-center gap-3 rounded-md border border-line bg-ink-2/60 p-3 text-left"
            >
              <Shield className="size-5 text-parchment-dim" />
              <div className="min-w-0 flex-1">
                <p className="font-display">{l.nick}</p>
                <p className="text-xs text-parchment-dim">
                  {l.title} · {l.id} · saque {l.lootGold} ouro
                </p>
              </div>
              <ChevronRight className="size-4 text-parchment-dim" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function BattleHUD() {
  const [, bump] = useState(0);
  const deployType = useGame((s) => s.deployType);
  const setDeployType = useGame((s) => s.setDeployType);
  const army = useGame((s) => s.army);
  const skipPrep = useGame((s) => s.skipPrep);
  const retreat = useGame((s) => s.retreat);
  const screen = useGame((s) => s.screen);
  const [confirm, setConfirm] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => bump((n) => n + 1), 200);
    return () => window.clearInterval(id);
  }, []);

  if (!battle) return null;
  const left = screen === "prep" ? battle.prepLeft : battle.fightLeft;
  const pct = Math.round(battle.destruction * 100);

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="pointer-events-auto absolute left-1/2 top-[max(4.5rem,calc(env(safe-area-inset-top)+3.2rem))] flex -translate-x-1/2 items-center gap-3 rounded-md border border-line bg-panel/90 px-3 py-1.5">
        <span className="font-display tabular text-sm">{formatTime(left)}</span>
        <span className="text-xs text-parchment-dim">{pct}% destruído</span>
        {raidTarget && <span className="hidden text-xs text-parchment-dim sm:inline">{raidTarget.nick}</span>}
      </div>

      {screen === "prep" && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
          <p className="mb-2 text-center text-xs text-parchment-dim">
            Posicione tropas nas bordas douradas. 2 minutos de preparo.
          </p>
          <div className="mx-auto flex max-w-xl gap-1 overflow-x-auto px-3">
            {TROOP_ORDER.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDeployType(t)}
                className={`flex min-h-12 min-w-16 flex-1 flex-col items-center rounded-md border px-1 py-1 text-[0.65rem] ${
                  deployType === t ? "border-niens bg-panel-2" : "border-line bg-panel/90"
                }`}
              >
                <span>{TROOPS[t].name}</span>
                <span className="tabular">{battle?.remainingOf(t) ?? army[t]}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={skipPrep}
            className="mx-auto mt-2 flex h-11 w-[min(90%,20rem)] items-center justify-center rounded-md bg-parchment font-display text-sm text-ink"
          >
            Iniciar ataque
          </button>
        </div>
      )}

      {screen === "battle" && (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 pb-[max(0.6rem,env(safe-area-inset-bottom))]">
          {confirm ? (
            <div className="mx-auto mb-2 w-[min(92%,22rem)] rounded-md border border-line bg-panel p-3 shadow-panel">
              <p className="text-sm">Recuar agora? Os soldados vivos voltam. Os mortos não.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setConfirm(false)}
                  className="h-11 rounded-md border border-line bg-ink-2 text-sm"
                >
                  Continuar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirm(false);
                    retreat();
                  }}
                  className="h-11 rounded-md bg-parchment font-display text-sm text-ink"
                >
                  Confirmar recuo
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="mx-auto flex h-11 w-[min(90%,18rem)] items-center justify-center gap-2 rounded-md border border-line bg-panel/90 font-display text-sm"
            >
              <Undo2 className="size-4" />
              Recuar
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Results() {
  const returnVillage = useGame((s) => s.returnVillage);
  const r = battle?.result;
  if (!r) {
    return (
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/70">
        <button type="button" onClick={returnVillage} className="rounded-md bg-parchment px-4 py-3 text-ink">
          Voltar
        </button>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-ink/70 md:items-center">
      <div className="panel w-full max-w-md rounded-t-xl p-5 md:rounded-xl">
        <p className="font-display text-xs uppercase tracking-[0.25em] text-parchment-dim">Fim de combate</p>
        <h2 className="mt-1 font-display text-2xl">
          {r.retreated ? "Recuo" : r.stars === 0 ? "Derrota" : r.stars === 3 ? "Condado tomado" : "Vitória parcial"}
        </h2>
        <div className="mt-2 flex gap-1 text-niens">
          {[0, 1, 2].map((i) => (
            <Star key={i} className="size-6" fill={i < r.stars ? "currentColor" : "none"} strokeWidth={1.5} />
          ))}
        </div>
        <ul className="mt-4 space-y-1 text-sm">
          <li>Destruição: {Math.round(r.destruction * 100)}%</li>
          <li>Niens saqueados: {r.niens}</li>
          <li>Ouro: {r.gold} · Pão: {r.bread}</li>
          <li>
            Vivos: {r.survivors.infantry + r.survivors.archers + r.survivors.cavalry + r.survivors.general + r.survivors.generaless} voltaram ao acampamento.
          </li>
        </ul>
        <p className="mt-3 text-xs text-parchment-dim">
          Bónus de ouro a cada 25% destruído. As estruturas inimigas se restauram sozinhas.
        </p>
        <button
          type="button"
          onClick={returnVillage}
          className="mt-5 flex h-12 w-full items-center justify-center rounded-md bg-parchment font-display text-sm text-ink"
        >
          Retornar ao condado
        </button>
      </div>
    </div>
  );
}

function Toast() {
  const toast = useGame((s) => s.toast);
  const setToast = useGame((s) => s.setToast);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(t);
  }, [toast, setToast]);
  if (!toast) return null;
  return (
    <div className="absolute bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-md border border-line bg-panel px-4 py-2 text-sm shadow-panel">
      {toast}
    </div>
  );
}
