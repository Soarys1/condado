import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Castle,
  Coins,
  Copy,
  Crosshair,
  Flag,
  MessageCircle,
  MessageSquare,
  RotateCw,
  Scale,
  Shield,
  Star,
  Swords,
  Ticket,
  Trophy,
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
  ALLIANCE_FOUND_GOLD,
  BUILD_ORDER,
  BUILDINGS,
  COLLECT_READY,
  COUNTY_MAX,
  DEFENDER_COST,
  MARCH_MS,
  NIEN_COST_GOLD,
  NIEN_SELL_GOLD,
  PASS_LEVELS,
  PASS_STARS_PER_LEVEL,
  SPEED_TRAIN_GOLD,
  TROOP_ORDER,
  TROOPS,
  armyCapacity,
  buildingDamage,
  buildingHp,
  campUpgradeGold,
  countyUpgradeCost,
  defenderCap,
  generalCardsFor,
  isHero,
  passCostNiens,
  passReward,
  passWindow,
  rankingWindow,
  scaledTroop,
  troopAsset,
  troopCardsFor,
  troopUpgradeBread,
  troopUpgradeGold,
  upgradeCost,
  wallCap,
  warWindow,
  weeklyPrize,
  WHATSAPP_GROUP,
  type ResourceKind,
  type TroopType,
} from "@/lib/game/constants";
import { ALLIANCES, LORDS, lordsOfAlliance } from "@/lib/game/bots";
import { battle, raidTarget, useGame } from "@/lib/game/store";
import { persist } from "@/lib/game/save";
import { createRuntime } from "@/lib/game/render";
import { formatRes, formatTime, countType } from "@/lib/game/world";
import {
  setMuted as audioMute,
  unlockAudio,
  startMusic,
  setMusicMode,
  resumeAudio,
  sfxClick,
} from "@/lib/game/audio";
import { loadAssets } from "@/lib/game/assets";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { UserButton } from "@/lib/auth/gates";
import { claimWeekly, pullCloud, weeklyBoard, type RankRow } from "@/lib/game/cloud";

export function GameApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hydrateFromCloud = useGame((s) => s.hydrateFromCloud);
  const hydrated = useGame((s) => s.hydrated);
  const screen = useGame((s) => s.screen);
  const war = useGame((s) => s.war);
  const { user, isPending } = useCurrentUserState();

  useEffect(() => {
    void loadAssets();
  }, []);

  useEffect(() => {
    if (isPending) return;
    if (!user) {
      useGame.setState({ hydrated: true, screen: "splash" });
      return;
    }
    void hydrateFromCloud();
  }, [user, isPending, hydrateFromCloud]);

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
    const win = warWindow();
    const warOn = !!(war && win.open && !war.sittingOut);
    if ((screen === "battle" || screen === "prep" || screen === "march") && warOn)
      setMusicMode("war");
    else if (screen === "battle" || screen === "prep" || screen === "spectate")
      setMusicMode("battle");
    else setMusicMode("village");
  }, [screen, war]);

  if (isPending || !hydrated) {
    return (
      <div className="relative flex h-dvh w-full items-end bg-ink">
        <img
          src="/game/splash.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-ink/50" />
        <p className="relative z-10 mb-16 w-full text-center font-display text-parchment">
          A abrir o condado…
        </p>
      </div>
    );
  }

  if (!hydrated || screen === "splash") {
    return <Splash signedIn={!!user} />;
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
      {screen === "spectate" && <SpectateHUD />}
      {screen === "march" && <MarchOverlay />}
      {screen === "results" && <Results />}
      {screen === "raid" && <RaidSelect />}
      <Sheets />
      <Toast />
    </div>
  );
}

function Splash({ signedIn }: { signedIn: boolean }) {
  const startCloud = useGame((s) => s.startCloud);
  const toast = useGame((s) => s.toast);
  const [nick, setNick] = useState("");
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);

  if (!signedIn) {
    return (
      <div className="relative flex h-full w-full items-end justify-center">
        <img
          src="/game/splash.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/20" />
        <div className="relative z-10 mb-[max(2rem,env(safe-area-inset-bottom))] w-full max-w-md px-5 pb-6">
          <p className="font-display text-[0.7rem] uppercase tracking-[0.35em] text-parchment-dim">
            Senhores da guerra
          </p>
          <h1 className="mt-2 font-display text-5xl font-semibold tracking-wide text-parchment">
            Condado
          </h1>
          <p className="mt-3 max-w-sm text-[0.95rem] leading-relaxed text-parchment-dim">
            Conta com e-mail. Nome de condado único. Ouro, Niens e cartas ficam no servidor — nada
            some do telemóvel.
          </p>
          <a
            href="/login"
            className="mt-6 flex h-12 w-full items-center justify-center rounded-md bg-parchment font-display text-sm font-semibold text-ink"
            onClick={() => unlockAudio()}
          >
            Entrar ou criar conta
          </a>
          <a
            href={WHATSAPP_GROUP}
            target="_blank"
            rel="noreferrer"
            className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-md border border-line bg-ink-2/80 text-sm"
          >
            <MessageCircle className="size-4" />
            Grupo no WhatsApp
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-full w-full items-end justify-center">
      <img src="/game/splash.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/55 to-ink/20" />
      <div className="relative z-10 mb-[max(2rem,env(safe-area-inset-bottom))] w-full max-w-md px-5 pb-6">
        <p className="font-display text-[0.7rem] uppercase tracking-[0.35em] text-parchment-dim">
          Senhores da guerra
        </p>
        <h1 className="mt-2 font-display text-5xl font-semibold tracking-wide text-parchment">
          Condado
        </h1>
        <p className="mt-3 max-w-sm text-[0.95rem] leading-relaxed text-parchment-dim">
          Escolhe um nome que ninguém mais use. Ele identifica o teu condado no reino.
        </p>
        <label className="mt-6 block text-xs uppercase tracking-[0.18em] text-parchment-dim">
          Nome do condado
        </label>
        <input
          value={nick}
          onChange={(e) => setNick(e.target.value)}
          maxLength={18}
          placeholder="ex. Teresa da Serra"
          className="mt-2 h-12 w-full rounded-md border border-line-strong bg-ink-2/80 px-3 text-base text-parchment outline-none placeholder:text-parchment-dim/60 focus:border-niens"
        />
        <label className="mt-3 block text-xs uppercase tracking-[0.18em] text-parchment-dim">
          Código de convite (opcional)
        </label>
        <input
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          maxLength={16}
          placeholder="CDN-XXXXXX"
          className="mt-2 h-12 w-full rounded-md border border-line-strong bg-ink-2/80 px-3 text-base text-parchment outline-none placeholder:text-parchment-dim/60 focus:border-niens"
        />
        <button
          type="button"
          disabled={busy}
          className="mt-4 flex h-12 w-full items-center justify-center rounded-md bg-parchment font-display text-sm font-semibold tracking-wide text-ink transition-transform active:scale-[0.98] disabled:opacity-50"
          onClick={() => {
            unlockAudio();
            startMusic("village");
            setBusy(true);
            void startCloud(nick || "Senhor", ref || undefined).finally(() => setBusy(false));
          }}
        >
          Fundar condado
        </button>
        {toast && <p className="mt-3 text-sm text-iron">{toast}</p>}
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
  const placingDir = useGame((s) => s.placingDir);
  const cancelPlace = useGame((s) => s.cancelPlace);
  const flipPlacingDir = useGame((s) => s.flipPlacingDir);
  const screen = useGame((s) => s.screen);
  const collectAll = useGame((s) => s.collectAll);
  const countyLevel = useGame((s) => s.countyLevel);
  const shieldUntil = useGame((s) => s.shieldUntil);
  const movingId = useGame((s) => s.movingId);
  const cancelMove = useGame((s) => s.cancelMove);
  const [, bump] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => bump((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (screen === "results" || screen === "march") return null;

  const shieldLeft = Math.max(0, shieldUntil - Date.now());

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
            aria-label="Passe"
            className="ml-auto flex size-9 items-center justify-center rounded-md border border-line bg-panel/80"
            onClick={() => setSheet(sheet === "pass" ? null : "pass")}
          >
            <Ticket className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Ranking"
            className="flex size-9 items-center justify-center rounded-md border border-line bg-panel/80"
            onClick={() => setSheet(sheet === "rank" ? null : "rank")}
          >
            <Trophy className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Aliança"
            className="flex size-9 items-center justify-center rounded-md border border-line bg-panel/80"
            onClick={() => setSheet(sheet === "alliance" ? null : "alliance")}
          >
            <Flag className="size-4" />
          </button>
          <button
            type="button"
            aria-label="Perfil"
            className="flex size-9 items-center justify-center rounded-md border border-line bg-panel/80"
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
          {player.nick} · Nv.{countyLevel} · {player.id}
          {shieldLeft > 0 ? ` · escudo ${formatTime(shieldLeft)}` : ""}
        </button>
      </div>

      {(placing || movingId) && (
        <div className="absolute left-1/2 top-20 z-20 flex -translate-x-1/2 items-center gap-2 rounded-md border border-line bg-panel px-3 py-2 text-sm shadow-panel">
          <span>
            {movingId
              ? "Toque o chão para replantar"
              : placing === "wall"
                ? `Muro ${placingDir === "v" ? "em pé (I)" : "deitado (—)"}`
                : `Toque o mapa para erguer ${placing ? BUILDINGS[placing].name : ""}`}
          </span>
          {placing === "wall" && (
            <button
              type="button"
              className="rounded-sm border border-line p-1"
              onClick={flipPlacingDir}
              aria-label="Girar muro"
            >
              <RotateCw className="size-4" />
            </button>
          )}
          <button
            type="button"
            className="rounded-sm p-1"
            onClick={() => (movingId ? cancelMove() : cancelPlace())}
            aria-label="Cancelar"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {screen === "village" && (
        <nav className="absolute inset-x-0 bottom-0 z-20 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto flex max-w-lg justify-between gap-1 px-3">
            <NavBtn
              icon={<Castle className="size-5" />}
              label="Erguer"
              on={() => setSheet(sheet === "build" ? null : "build")}
              active={sheet === "build"}
            />
            <NavBtn
              icon={<Swords className="size-5" />}
              label="Tropas"
              on={() => setSheet(sheet === "army" ? null : "army")}
              active={sheet === "army"}
            />
            <NavBtn
              icon={<Crosshair className="size-5" />}
              label="Atacar"
              on={() => useGame.getState().openRaid()}
              active={false}
            />
            <NavBtn
              icon={<MessageSquare className="size-5" />}
              label="Chat"
              on={() => setSheet(sheet === "chat" ? null : "chat")}
              active={sheet === "chat"}
            />
            <NavBtn
              icon={<Scale className="size-5" />}
              label="Mercado"
              on={() => setSheet(sheet === "market" ? null : "market")}
              active={sheet === "market"}
            />
            <NavBtn
              icon={<UserRound className="size-5" />}
              label="Perfil"
              on={() => setSheet(sheet === "profile" ? null : "profile")}
              active={sheet === "profile"}
            />
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
        active
          ? "border-niens/50 bg-panel-2 text-parchment"
          : "border-line bg-panel/90 text-parchment-dim"
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
  const title: Record<Exclude<typeof sheet, null>, string> = {
    build: "Erguer",
    army: "Exército",
    chat: "Chat dos senhores",
    market: "Mercado",
    info: "Estrutura",
    attack: "Ataque",
    profile: "Perfil",
    pass: "Passe de Batalha",
    alliance: "Aliança",
    train: "Campo de Treino",
    rank: "Ranking semanal",
  };
  return (
    <div className="absolute inset-0 z-30 flex items-end justify-center bg-ink/40 md:items-stretch md:justify-end">
      <button
        type="button"
        className="absolute inset-0"
        aria-label="Fechar"
        onClick={() => setSheet(null)}
      />
      <div className="panel relative z-10 max-h-[78dvh] w-full overflow-y-auto rounded-t-xl p-4 md:h-full md:max-h-none md:w-[380px] md:rounded-none md:rounded-l-xl md:pt-[max(1.2rem,env(safe-area-inset-top))]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-lg tracking-wide">{title[sheet]}</h2>
          <button
            type="button"
            onClick={() => setSheet(null)}
            className="size-10 rounded-md border border-line"
            aria-label="Fechar"
          >
            <X className="mx-auto size-4" />
          </button>
        </div>
        {sheet === "build" && <BuildSheet />}
        {sheet === "army" && <ArmySheet />}
        {sheet === "chat" && <ChatSheet />}
        {sheet === "market" && <MarketSheet />}
        {sheet === "info" && <InfoSheet />}
        {sheet === "profile" && <ProfileSheet />}
        {sheet === "pass" && <PassSheet />}
        {sheet === "alliance" && <AllianceSheet />}
        {sheet === "train" && <TrainSheet />}
        {sheet === "rank" && <RankSheet />}
      </div>
    </div>
  );
}

function BuildSheet() {
  const gold = useGame((s) => s.gold);
  const beginPlace = useGame((s) => s.beginPlace);
  const buildings = useGame((s) => s.buildings);
  const countyLevel = useGame((s) => s.countyLevel);
  const walls = countType(buildings, "wall");
  const cap = wallCap(countyLevel);
  return (
    <div className="grid gap-2">
      <p className="text-xs text-parchment-dim">
        Muros {walls}/{cap}. Condado Nv.{countyLevel} limita o nível das estruturas.
      </p>
      {BUILD_ORDER.map((type) => {
        const d = BUILDINGS[type];
        const ok = gold >= d.costGold && (type !== "wall" || walls < cap);
        return (
          <button
            key={type}
            type="button"
            disabled={!ok}
            onClick={() => beginPlace(type)}
            className="flex items-center gap-3 rounded-md border border-line bg-ink-2/50 p-3 text-left disabled:opacity-40"
          >
            <img
              src={`/game/${type === "wall" ? "wall_h" : type}.png`}
              alt=""
              className="size-12 object-contain"
            />
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
  const gold = useGame((s) => s.gold);
  const train = useGame((s) => s.train);
  const speedTrain = useGame((s) => s.speedTrain);
  const setSheet = useGame((s) => s.setSheet);
  const campLevel = useGame((s) => s.campLevel);
  const troopLevels = useGame((s) => s.troopLevels);
  const cap = armyCapacity(countType(buildings, "camp"));
  const used =
    army.infantry +
    army.archers +
    army.cavalry +
    army.general +
    army.generaless +
    army.defender +
    training.length;
  const hasCamp = countType(buildings, "training") > 0;
  return (
    <div className="space-y-3">
      <p className="text-sm text-parchment-dim">
        Capacidade {used}/{cap}. Defensores {army.defender}/{defenderCap(campLevel)}.
      </p>
      {hasCamp && (
        <button
          type="button"
          onClick={() => setSheet("train")}
          className="h-11 w-full rounded-md border border-niens/40 bg-ink-2 font-display text-sm"
        >
          Abrir Campo de Treino
        </button>
      )}
      {TROOP_ORDER.map((type) => {
        const d = TROOPS[type];
        const st = scaledTroop(type, troopLevels[type], campLevel);
        const costLabel =
          type === "defender" ? `${formatRes(DEFENDER_COST)} ouro` : `${d.costBread} pão`;
        const can = type === "defender" ? gold >= DEFENDER_COST : bread >= d.costBread;
        return (
          <div
            key={type}
            className="flex items-center gap-3 rounded-md border border-line bg-ink-2/50 p-3"
          >
            <img src={`/game/${troopAsset(type)}.png`} alt="" className="size-12 object-contain" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm">
                {d.name} <span className="tabular text-parchment-dim">×{army[type]}</span>
              </p>
              <p className="text-xs text-parchment-dim">
                {st.hp} HP · {st.dps} dano/s · {d.desc}
              </p>
            </div>
            <button
              type="button"
              onClick={() => train(type)}
              disabled={!can}
              className="rounded-md bg-parchment px-3 py-2 font-display text-xs font-semibold text-ink disabled:opacity-40"
            >
              {costLabel}
            </button>
          </div>
        );
      })}
      {training.length > 0 && (
        <div className="space-y-2">
          <p className="font-display text-sm">Fila</p>
          {training.map((j) => (
            <div
              key={j.id}
              className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm"
            >
              <span>
                {TROOPS[j.type].name} · {formatTime(j.remaining)}
              </span>
              <button type="button" className="text-gold" onClick={() => speedTrain(j.id)}>
                {formatRes(SPEED_TRAIN_GOLD)} ouro
              </button>
            </div>
          ))}
        </div>
      )}
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
          <div
            key={m.id}
            className={`rounded-md px-3 py-2 ${m.self ? "bg-moss/20 ml-6" : "bg-ink-2 mr-4"}`}
          >
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
        <button
          type="submit"
          className="h-11 rounded-md bg-parchment px-4 font-display text-sm text-ink"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}

const TRANSFER_KINDS: Array<{ k: ResourceKind; label: string }> = [
  { k: "niens", label: "Niens" },
  { k: "gold", label: "Ouro" },
  { k: "bread", label: "Pão" },
  { k: "troopCards", label: "Cartas tropa" },
  { k: "generalCards", label: "Cartas general" },
];

function MarketSheet() {
  const offers = useGame((s) => s.offers);
  const buyOffer = useGame((s) => s.buyOffer);
  const buyNien = useGame((s) => s.buyNien);
  const sellNien = useGame((s) => s.sellNien);
  const transfer = useGame((s) => s.transfer);
  const peekId = useGame((s) => s.peekId);
  const lookup = useGame((s) => s.lookup);
  const player = useGame((s) => s.player);
  const gold = useGame((s) => s.gold);
  const niens = useGame((s) => s.niens);
  const ledger = useGame((s) => s.ledger);
  const refreshLedger = useGame((s) => s.refreshLedger);
  const [to, setTo] = useState("");
  const [amt, setAmt] = useState("1");
  const [kind, setKind] = useState<ResourceKind>("niens");
  useEffect(() => {
    void refreshLedger();
  }, [refreshLedger]);
  return (
    <div className="space-y-4">
      <p className="text-sm text-parchment-dim">
        Niens custam {formatRes(NIEN_COST_GOLD)} e vendem por {formatRes(NIEN_SELL_GOLD)}. O spread
        força o comércio entre senhores. Seu ID{" "}
        <span className="font-display text-niens">{player.id}</span>.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={buyNien}
          className="rounded-md border border-line bg-ink-2 px-3 py-3 text-left text-sm"
        >
          <span className="block font-display text-niens">Comprar 1 Nien</span>
          <span className="text-xs text-parchment-dim">
            {formatRes(NIEN_COST_GOLD)} ouro{gold < NIEN_COST_GOLD ? " · falta ouro" : ""}
          </span>
        </button>
        <button
          type="button"
          onClick={sellNien}
          className="rounded-md border border-line bg-ink-2 px-3 py-3 text-left text-sm"
        >
          <span className="block font-display text-gold">Vender 1 Nien</span>
          <span className="text-xs text-parchment-dim">
            {formatRes(NIEN_SELL_GOLD)} ouro{niens < 1 ? " · sem gemas" : ""}
          </span>
        </button>
      </div>
      <div>
        <p className="mb-2 font-display text-sm">Ofertas dos senhores</p>
        <div className="space-y-2">
          {offers.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between rounded-md border border-line px-3 py-2"
            >
              <div>
                <p className="text-sm">{o.sellerNick}</p>
                <p className="text-xs text-parchment-dim">
                  {formatRes(o.give.amount)} ouro por {o.wantNiens} Nien
                </p>
              </div>
              <button type="button" className="text-sm text-niens" onClick={() => buyOffer(o.id)}>
                Comprar
              </button>
            </div>
          ))}
          {offers.length === 0 && (
            <p className="text-sm text-parchment-dim">O tabuleiro está vazio.</p>
          )}
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
          onChange={(e) => {
            setTo(e.target.value);
            peekId(e.target.value);
          }}
          placeholder="Cola o ID, ex. CDN-ISOLDE"
          className="h-11 w-full rounded-md border border-line bg-ink px-3 text-sm outline-none"
        />
        {lookup && <p className="text-xs text-niens">Senhor: {lookup.nick}</p>}
        <div className="grid grid-cols-3 gap-1">
          {TRANSFER_KINDS.map(({ k, label }) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`h-10 rounded-md border text-[0.65rem] ${kind === k ? "border-niens bg-panel-2" : "border-line bg-ink-2"}`}
            >
              {label}
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
          <button
            type="submit"
            className="h-11 flex-1 rounded-md bg-parchment font-display text-sm text-ink"
          >
            Enviar
          </button>
        </div>
      </form>
      {ledger.length > 0 && (
        <div>
          <p className="mb-2 font-display text-sm">Registo de envios</p>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {ledger.slice(0, 16).map((t) => (
              <p key={t.id} className="text-xs text-parchment-dim">
                {t.incoming ? "Recebeste" : "Enviaste"} {t.amount}{" "}
                {t.kind === "gold"
                  ? "ouro"
                  : t.kind === "bread"
                    ? "pão"
                    : t.kind === "niens"
                      ? "Niens"
                      : t.kind === "troopCards"
                        ? "cartas tropa"
                        : "cartas general"}{" "}
                {t.incoming ? `de ${t.fromNick}` : `a ${t.toNick}`}
              </p>
            ))}
          </div>
        </div>
      )}
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
  const countyLevel = useGame((s) => s.countyLevel);
  const rotateWall = useGame((s) => s.rotateWall);
  const selectedRow = useGame((s) => s.selectedRow);
  const upgradeCounty = useGame((s) => s.upgradeCounty);
  const setSheet = useGame((s) => s.setSheet);
  const upgradeType = useGame((s) => s.upgradeType);
  const upgradeWallRow = useGame((s) => s.upgradeWallRow);
  const selectWallRow = useGame((s) => s.selectWallRow);
  const gold = useGame((s) => s.gold);
  const b = buildings.find((x) => x.id === selectedId);
  if (!b) return <p className="text-sm text-parchment-dim">Selecione uma estrutura no mapa.</p>;
  const d = BUILDINGS[b.type];
  const cost = upgradeCost(b.type, b.level);
  const stored = storedOf(b);
  const countyCost = countyUpgradeCost(countyLevel);
  const dmg = buildingDamage(b.type, b.level);
  const hp = buildingHp(b.type, b.level);
  const sameType = buildings.filter((x) => x.type === b.type && x.level < countyLevel);
  const typeCost = sameType.reduce((n, x) => n + upgradeCost(x.type, x.level), 0);
  const row =
    b.type === "wall"
      ? buildings.filter((x) => selectedRow.includes(x.id) && x.level < countyLevel)
      : [];
  const rowCost = row.reduce((n, x) => n + upgradeCost("wall", x.level), 0);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <img
          src={`/game/${b.type === "wall" ? (b.dir === "v" ? "wall_v" : "wall_h") : b.type}.png`}
          alt=""
          className="size-16 object-contain"
        />
        <div>
          <p className="font-display text-lg">{d.name}</p>
          <p className="text-sm text-parchment-dim">
            Nível {b.level}/{countyLevel} · {hp} HP{dmg > 0 ? ` · ${dmg} dano` : ""}
          </p>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-parchment-dim">{d.desc}</p>
      <p className="text-xs text-parchment-dim">
        Toque 3 vezes seguidas para mover. A estrutura fica no chão.
      </p>
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
      {b.type === "wall" && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => rotateWall(b.id)}
            className="h-11 rounded-md border border-line bg-ink-2 text-sm"
          >
            Girar {b.dir === "v" ? "I → —" : "— → I"}
          </button>
          <button
            type="button"
            onClick={() => selectWallRow(b.id)}
            className="h-11 rounded-md border border-line bg-ink-2 text-sm"
          >
            Fileira · {selectedRow.length || 1}
          </button>
        </div>
      )}
      {b.type === "wall" && row.length > 0 && (
        <button
          type="button"
          onClick={() => upgradeWallRow(b.id)}
          className="h-11 w-full rounded-md border border-niens/40 bg-ink-2 text-sm"
        >
          Melhorar fileira ({row.length}) · {formatRes(rowCost)} ouro
          {gold < rowCost ? " · falta" : ""}
        </button>
      )}
      {b.type === "training" && (
        <button
          type="button"
          onClick={() => setSheet("train")}
          className="h-11 w-full rounded-md bg-parchment font-display text-sm text-ink"
        >
          Evoluir tropas
        </button>
      )}
      {b.type === "castle" && (
        <button
          type="button"
          onClick={upgradeCounty}
          className="h-11 w-full rounded-md border border-niens/40 bg-ink-2 font-display text-sm"
        >
          {countyLevel >= COUNTY_MAX
            ? "Condado no máximo"
            : countyCost.niens
              ? `Avançar condado · ${countyCost.niens} Niens`
              : `Avançar condado · ${formatRes(countyCost.gold)} ouro`}
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
          <button
            type="button"
            onClick={() => demolish(b.id)}
            className="h-11 rounded-md border border-iron/40 text-sm text-iron"
          >
            Demolir
          </button>
        </div>
      )}
      {b.type !== "castle" && sameType.length > 1 && (
        <button
          type="button"
          onClick={() => upgradeType(b.type)}
          className="h-11 w-full rounded-md border border-niens/40 bg-ink-2 text-sm"
        >
          Melhorar todas as {d.name} ({sameType.length}) · {formatRes(typeCost)} ouro
          {gold < typeCost ? " · falta" : ""}
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
  const countyLevel = useGame((s) => s.countyLevel);
  const troopCards = useGame((s) => s.troopCards);
  const generalCards = useGame((s) => s.generalCards);
  const copyInvite = useGame((s) => s.copyInvite);
  const referredBy = useGame((s) => s.referredBy);
  const shieldUntil = useGame((s) => s.shieldUntil);
  const [name, setName] = useState(nickDraft || player.nick);
  const troops =
    army.infantry + army.archers + army.cavalry + army.general + army.generaless + army.defender;
  const shieldLeft = Math.max(0, shieldUntil - Date.now());
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
            onClick={copyInvite}
          >
            <Copy className="size-3.5" />
          </button>
        </div>
        <p className="mt-1 text-xs text-parchment-dim">
          Convide um amigo. Quando ele chegar ao Condado 3, ambos ganham 300.000 ouro.
        </p>
      </div>
      <ul className="space-y-1 text-sm">
        <li>
          Condado nível {countyLevel}/{COUNTY_MAX}
        </li>
        <li>
          Ouro {formatRes(gold)} · Pão {formatRes(bread)} · Niens {formatRes(niens)}
        </li>
        <li>
          Cartas tropa {troopCards} · Cartas general {generalCards}
        </li>
        <li>
          Estrelas {stars} · Incursões {raidsWon}
        </li>
        <li>
          Tropas {troops} · Estruturas {buildings.length}
        </li>
        {shieldLeft > 0 && <li>Escudo {formatTime(shieldLeft)}</li>}
        {referredBy && <li className="text-parchment-dim">Convidado por {referredBy}</li>}
        <li className="text-parchment-dim">
          Fundado em {new Date(player.createdAt).toLocaleDateString("pt")}
        </li>
      </ul>
      <a
        href={WHATSAPP_GROUP}
        target="_blank"
        rel="noreferrer"
        className="flex h-11 items-center justify-center gap-2 rounded-md border border-line bg-ink-2 text-sm"
      >
        <MessageCircle className="size-4" />
        Grupo no WhatsApp
      </a>
      <UserButton />
    </div>
  );
}

function TrainSheet() {
  const troopLevels = useGame((s) => s.troopLevels);
  const upgradeTroop = useGame((s) => s.upgradeTroop);
  const upgradeCamp = useGame((s) => s.upgradeCamp);
  const campLevel = useGame((s) => s.campLevel);
  const countyLevel = useGame((s) => s.countyLevel);
  const troopCards = useGame((s) => s.troopCards);
  const generalCards = useGame((s) => s.generalCards);
  const gold = useGame((s) => s.gold);
  const bread = useGame((s) => s.bread);
  const campCost = campUpgradeGold(campLevel);
  return (
    <div className="space-y-3">
      <p className="text-sm text-parchment-dim">
        Cartas tropa {troopCards} · Cartas general {generalCards}. Campo Nv.{campLevel}.
      </p>
      <button
        type="button"
        onClick={upgradeCamp}
        className="h-11 w-full rounded-md border border-line bg-ink-2 text-sm"
      >
        {campLevel >= countyLevel
          ? "Campo no limite do condado"
          : `Melhorar campo · ${formatRes(campCost)} ouro`}
      </button>
      {TROOP_ORDER.filter((t) => t !== "defender").map((type: TroopType) => {
        const lv = troopLevels[type];
        const hero = isHero(type);
        const cards = hero ? generalCardsFor(lv + 1) : troopCardsFor(lv + 1);
        const g = hero ? 0 : troopUpgradeGold(lv + 1);
        const br = hero ? 0 : troopUpgradeBread(lv + 1);
        return (
          <div
            key={type}
            className="flex items-center gap-3 rounded-md border border-line bg-ink-2/50 p-3"
          >
            <img src={`/game/${troopAsset(type)}.png`} alt="" className="size-12 object-contain" />
            <div className="min-w-0 flex-1">
              <p className="font-display text-sm">
                {TROOPS[type].name} Nv.{lv}
              </p>
              <p className="text-xs text-parchment-dim">
                {scaledTroop(type, lv, campLevel).hp} HP · {scaledTroop(type, lv, campLevel).dps}{" "}
                dano/s
                {" · "}
                {hero
                  ? `${cards} cartas de general`
                  : `${cards} cartas · ${formatRes(g)} ouro · ${br} pão`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => upgradeTroop(type)}
              className="rounded-md bg-parchment px-3 py-2 font-display text-xs text-ink"
            >
              Evoluir
            </button>
          </div>
        );
      })}
      <p className="text-xs text-parchment-dim">
        Ouro em estoque {formatRes(gold)} · Pão {formatRes(bread)}
      </p>
    </div>
  );
}

function PassSheet() {
  const pass = useGame((s) => s.pass);
  const buyPass = useGame((s) => s.buyPass);
  const claimPass = useGame((s) => s.claimPass);
  const skipPass = useGame((s) => s.skipPass);
  const niens = useGame((s) => s.niens);
  const win = passWindow();
  const cost = passCostNiens(pass.season);
  const reached = Math.min(PASS_LEVELS, Math.floor(pass.stars / PASS_STARS_PER_LEVEL));
  const levels = Array.from({ length: PASS_LEVELS }, (_, i) => i + 1);
  return (
    <div className="space-y-3">
      <p className="text-sm text-parchment-dim">
        Temporada {pass.season}. O primeiro passe é setembro. Dia 1, 30 dias (fevereiro 27). 50
        níveis, 6 estrelas cada.
      </p>
      {!win.active && <p className="text-sm text-iron">Passe em espera até 1º do mês.</p>}
      {!pass.purchased ? (
        <button
          type="button"
          onClick={buyPass}
          className="h-11 w-full rounded-md bg-parchment font-display text-sm text-ink"
        >
          Selar passe · {cost} Niens {niens < cost ? "(faltam gemas)" : ""}
        </button>
      ) : (
        <>
          <p className="text-sm text-niens">
            Estrelas {pass.stars} · Nível {reached}/{PASS_LEVELS}
          </p>
          <button
            type="button"
            onClick={skipPass}
            disabled={!win.active}
            className="h-11 w-full rounded-md border border-niens/40 bg-ink-2 text-sm disabled:opacity-40"
          >
            Pular 1 nível · 1 Nien {niens < 1 ? "(faltam gemas)" : "e recebe o prêmio"}
          </button>
        </>
      )}
      <div className="max-h-[48dvh] space-y-1 overflow-y-auto">
        {levels.map((lv) => {
          const r = passReward(lv);
          const claimed = pass.claimed.includes(lv);
          const ready = pass.purchased && lv <= reached && !claimed;
          return (
            <div
              key={lv}
              className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm"
            >
              <span>
                Nv.{lv} · {r.label}
              </span>
              {claimed ? (
                <span className="text-xs text-parchment-dim">feito</span>
              ) : (
                <button
                  type="button"
                  disabled={!ready}
                  onClick={() => claimPass(lv)}
                  className="text-xs text-niens disabled:opacity-30"
                >
                  Receber
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AllianceSheet() {
  const alliance = useGame((s) => s.alliance);
  const foundAlliance = useGame((s) => s.foundAlliance);
  const sendAllianceChat = useGame((s) => s.sendAllianceChat);
  const allianceChat = useGame((s) => s.allianceChat);
  const war = useGame((s) => s.war);
  const gold = useGame((s) => s.gold);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const win = warWindow();
  if (!alliance) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-parchment-dim">
          Fundar custa {formatRes(ALLIANCE_FOUND_GOLD)} ouro e libera o chat. Guerra: sábados 8h–23h
          de Brasília. Pares de alianças; ímpar fica de fora.
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da aliança"
          className="h-11 w-full rounded-md border border-line bg-ink px-3 text-sm"
        />
        <button
          type="button"
          onClick={() => foundAlliance(name)}
          className="h-11 w-full rounded-md bg-parchment font-display text-sm text-ink"
        >
          Fundar · {formatRes(ALLIANCE_FOUND_GOLD)}{" "}
          {gold < ALLIANCE_FOUND_GOLD ? "(falta ouro)" : ""}
        </button>
        <p className="text-xs text-parchment-dim">
          Alianças do reino: {ALLIANCES.map((a) => a.name).join(", ")}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="font-display">{alliance.name}</p>
      <p className="text-xs text-parchment-dim">
        {alliance.members.map((m) => m.nick).join(" · ")}
      </p>
      {war && (
        <div className="rounded-md border border-line bg-ink-2 p-3 text-sm">
          {war.sittingOut ? (
            <p>Sábado ímpar — sem guerra até surgir outra aliança.</p>
          ) : (
            <>
              <p>
                Guerra vs {war.foeName} {win.open ? "aberta" : "encerrada"}
              </p>
              <p className="text-parchment-dim">
                Nós {war.ourStars} · Eles {war.theirStars} · Cofre {formatRes(war.chest)}
              </p>
              <p className="text-xs text-parchment-dim">Máx. 2 ataques por base inimiga.</p>
            </>
          )}
        </div>
      )}
      {!war && <p className="text-xs text-parchment-dim">A guerra abre sábado, 8h de Brasília.</p>}
      <div className="max-h-48 space-y-2 overflow-y-auto">
        {allianceChat.map((m) => (
          <div key={m.id} className={`rounded-md px-3 py-2 ${m.self ? "bg-moss/20" : "bg-ink-2"}`}>
            <p className="font-display text-[0.7rem] text-niens">{m.fromNick}</p>
            <p className="text-sm">{m.text}</p>
          </div>
        ))}
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          sendAllianceChat(text);
          setText("");
        }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-11 flex-1 rounded-md border border-line bg-ink px-3 text-sm"
          placeholder="Chat da aliança"
        />
        <button
          type="submit"
          className="h-11 rounded-md bg-parchment px-3 font-display text-sm text-ink"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}

function RaidSelect() {
  const beginAttack = useGame((s) => s.beginAttack);
  const returnVillage = useGame((s) => s.returnVillage);
  const stars = useGame((s) => s.stars);
  const war = useGame((s) => s.war);
  const shieldUntil = useGame((s) => s.shieldUntil);
  const foes = war?.foeId ? lordsOfAlliance(war.foeId) : [];
  return (
    <div className="absolute inset-0 z-30 flex items-end bg-ink/55 md:items-center md:justify-center">
      <div className="panel w-full max-h-[82dvh] overflow-y-auto rounded-t-xl p-4 md:max-w-lg md:rounded-xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg">Condados vizinhos</h2>
            <p className="text-xs text-parchment-dim">
              Estrelas {stars}
              {Date.now() < shieldUntil ? " · escudo ativo (não te atacam)" : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={returnVillage}
            className="size-10 rounded-md border border-line"
            aria-label="Voltar"
          >
            <X className="mx-auto size-4" />
          </button>
        </div>
        {foes.length > 0 && (
          <p className="mb-2 text-xs text-niens">
            Guerra: {war?.foeName}. Máx. 2 ataques por base.
          </p>
        )}
        <div className="space-y-2">
          {LORDS.map((l) => {
            const used = war?.attacks[l.id] ?? 0;
            const warFoe = !!war?.foeId && l.allianceId === war.foeId;
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => beginAttack(l)}
                className="flex w-full items-center gap-3 rounded-md border border-line bg-ink-2/60 p-3 text-left"
              >
                <Shield className={`size-5 ${warFoe ? "text-iron" : "text-parchment-dim"}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-display">{l.nick}</p>
                  <p className="text-xs text-parchment-dim">
                    {l.title} · {l.id} · saque até {l.lootGold} ouro
                    {warFoe ? ` · guerra ${used}/2` : ""}
                  </p>
                </div>
                <ChevronRight className="size-4 text-parchment-dim" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MarchOverlay() {
  const finishMarch = useGame((s) => s.finishMarch);
  const marchLord = useGame((s) => s.marchLord);
  const army = useGame((s) => s.army);
  useEffect(() => {
    const t = window.setTimeout(() => finishMarch(), MARCH_MS);
    return () => window.clearTimeout(t);
  }, [finishMarch]);
  const n =
    army.infantry + army.archers + army.cavalry + army.defender + army.general + army.generaless;
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-end bg-ink/80">
      <img
        src="/game/splash.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-40"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/70 to-ink/30" />
      <div className="relative z-10 mb-24 w-full overflow-hidden">
        <div className="flex animate-[march_3.2s_linear_forwards] gap-3 px-8">
          {Array.from({ length: Math.min(12, Math.max(4, n)) }).map((_, i) => (
            <img
              key={i}
              src={`/game/${["infantry", "archer", "cavalry", "defender"][i % 4]}.png`}
              alt=""
              className="h-20 w-auto drop-shadow-[0_8px_12px_rgba(0,0,0,0.6)]"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      </div>
      <div className="relative z-10 mb-[max(2rem,env(safe-area-inset-bottom))] px-6 text-center">
        <p className="font-display text-xs uppercase tracking-[0.28em] text-parchment-dim">
          Marcha
        </p>
        <h2 className="mt-2 font-display text-2xl">
          Sobre {marchLord?.nick ?? "o condado inimigo"}
        </h2>
        <p className="mt-2 text-sm text-parchment-dim">{n} soldados avançam pelas colinas.</p>
        <button
          type="button"
          onClick={finishMarch}
          className="mt-4 h-11 rounded-md border border-line bg-panel px-5 font-display text-sm"
        >
          Saltar
        </button>
      </div>
      <style>{`@keyframes march { from { transform: translateX(-40%); } to { transform: translateX(55%); } }`}</style>
    </div>
  );
}

function SpectateHUD() {
  const [, bump] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => bump((n) => n + 1), 200);
    return () => window.clearInterval(id);
  }, []);
  if (!battle) return null;
  const pct = Math.round(battle.destruction * 100);
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="pointer-events-auto absolute left-1/2 top-[max(4.5rem,calc(env(safe-area-inset-top)+3.2rem))] flex -translate-x-1/2 items-center gap-3 rounded-md border border-line bg-panel/90 px-3 py-1.5">
        <span className="font-display tabular text-sm">{formatTime(battle.fightLeft)}</span>
        <span className="text-xs text-parchment-dim">{pct}% destruído</span>
      </div>
      <div className="pointer-events-auto absolute inset-x-0 bottom-0 pb-[max(0.8rem,env(safe-area-inset-bottom))]">
        <p className="mx-auto w-[min(92%,22rem)] rounded-md border border-line bg-panel/90 px-4 py-3 text-center text-sm shadow-panel">
          Estás a ser atacado por {raidTarget?.nick ?? "um senhor"}. Só podes assistir. Pão e Niens
          estão a salvo. Escudo de 1 hora após o combate.
        </p>
      </div>
    </div>
  );
}

function BattleHUD() {
  const [, bump] = useState(0);
  const deployType = useGame((s) => s.deployType);
  const setDeployType = useGame((s) => s.setDeployType);
  const army = useGame((s) => s.army);
  const troopLevels = useGame((s) => s.troopLevels);
  const campLevel = useGame((s) => s.campLevel);
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
        {raidTarget && (
          <span className="hidden text-xs text-parchment-dim sm:inline">{raidTarget.nick}</span>
        )}
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
                <span className="tabular text-[0.6rem] text-parchment-dim">
                  {scaledTroop(t, troopLevels[t], campLevel).dps} dano/s
                </span>
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
          <p className="mb-2 text-center text-xs text-parchment-dim">
            Toque uma construção: tropas próximas focam nela.
          </p>
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
  const spectator = battle?.spectator;
  if (!r) {
    return (
      <div className="absolute inset-0 z-40 flex items-center justify-center bg-ink/70">
        <button
          type="button"
          onClick={returnVillage}
          className="rounded-md bg-parchment px-4 py-3 text-ink"
        >
          Voltar
        </button>
      </div>
    );
  }
  const alive =
    r.survivors.infantry +
    r.survivors.archers +
    r.survivors.cavalry +
    r.survivors.general +
    r.survivors.generaless +
    r.survivors.defender;
  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-ink/70 md:items-center">
      <div className="panel w-full max-w-md rounded-t-xl p-5 md:rounded-xl">
        <p className="font-display text-xs uppercase tracking-[0.25em] text-parchment-dim">
          {spectator ? "O teu condado foi atacado" : "Fim de combate"}
        </p>
        <h2 className="mt-1 font-display text-2xl">
          {spectator
            ? r.stars === 3
              ? "Castelo caído"
              : "Defesa encerrada"
            : r.retreated
              ? "Recuo"
              : r.stars === 0
                ? "Derrota"
                : r.stars === 3
                  ? "Condado tomado"
                  : "Vitória parcial"}
        </h2>
        {!spectator && (
          <div className="mt-2 flex gap-1 text-niens">
            {[0, 1, 2].map((i) => (
              <Star
                key={i}
                className="size-6"
                fill={i < r.stars ? "currentColor" : "none"}
                strokeWidth={1.5}
              />
            ))}
          </div>
        )}
        <ul className="mt-4 space-y-1 text-sm">
          <li>Destruição: {Math.round(r.destruction * 100)}%</li>
          <li>
            {spectator ? "Ouro perdido" : "Ouro saqueado"}: {r.gold} (máx. 8.400)
          </li>
          {!spectator && <li>Vivos: {alive} voltaram ao acampamento.</li>}
          {spectator && <li>Escudo de 1 hora ativado. Pão e Niens intactos.</li>}
        </ul>
        <p className="mt-3 text-xs text-parchment-dim">
          Saque em faixas: 2.700 aos 33%, 2.700 aos 66%, 3.000 aos 100%. Niens e pão nunca saem.
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

function RankSheet() {
  const [board, setBoard] = useState<RankRow[]>([]);
  const [rank, setRank] = useState(0);
  const [claim, setClaim] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const refreshLedger = useGame((s) => s.refreshLedger);

  useEffect(() => {
    void weeklyBoard()
      .then((r) => {
        setBoard(r.board);
        setRank(r.yourRank);
        setClaim(r.week.claim);
        setClaimed(r.claimed);
      })
      .catch(() => setMsg("Ranking no servidor. Entra na tua conta."));
  }, []);

  async function onClaim() {
    try {
      const r = await claimWeekly();
      setClaimed(true);
      setMsg(`#${r.rank}: ${r.prize.label}`);
      try {
        const { save } = await pullCloud();
        if (save) {
          useGame.setState({
            gold: save.gold,
            troopCards: save.troopCards,
            generalCards: save.generalCards,
          });
          persist({ ...useGame.getState() });
        } else {
          useGame.setState((s) => ({
            gold: s.gold + r.prize.gold,
            troopCards: s.troopCards + r.prize.troopCards,
            generalCards: s.generalCards + r.prize.generalCards,
          }));
        }
      } catch {
        useGame.setState((s) => ({
          gold: s.gold + r.prize.gold,
          troopCards: s.troopCards + r.prize.troopCards,
          generalCards: s.generalCards + r.prize.generalCards,
        }));
      }
      void refreshLedger();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Não foi possível receber.");
    }
  }

  const win = rankingWindow();
  return (
    <div className="space-y-3">
      <p className="text-sm text-parchment-dim">
        Segunda 8h às domingo 23h de Brasília. Quem mais ganhar estrelas entra no top 20. 20º–8º
        ouro (50 mil a 300 mil). 7º–4º: 3 cartas tropa. Top 3: 4 cartas tropa + 2 general.
      </p>
      <p className="text-xs text-parchment-dim">
        {win.open
          ? "Semana aberta."
          : win.claim
            ? "Semana fechada — recolhe o prêmio."
            : "À espera da segunda 8h."}
        {rank > 0 ? ` Tu estás em #${rank}.` : ""}
      </p>
      {claim && !claimed && rank > 0 && rank <= 20 && (
        <button
          type="button"
          onClick={() => void onClaim()}
          className="h-11 w-full rounded-md bg-parchment font-display text-sm text-ink"
        >
          Receber prêmio · {weeklyPrize(rank)?.label}
        </button>
      )}
      {claimed && <p className="text-sm text-niens">Prêmio da semana já selado.</p>}
      {msg && <p className="text-sm text-niens">{msg}</p>}
      <div className="space-y-1">
        {board.map((r, i) => (
          <div
            key={r.playerId}
            className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${r.you ? "border-niens bg-ink-2" : "border-line"}`}
          >
            <span>
              #{i + 1} {r.nick}
              {r.you ? " (tu)" : ""}
            </span>
            <span className="tabular text-niens">{r.stars} ★</span>
          </div>
        ))}
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
