import { useEffect, useRef, useState, type ReactNode } from "react";
import { EmailAuthProvider, linkWithCredential } from "firebase/auth";
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
  ALLIANCE_FOUND_NIENS,
  ALLIANCE_WAR_CHEST,
  allianceAtWarToday,
  allianceSlots,
  BREAD_PACK,
  BREAD_PACK_BUY_GOLD,
  BREAD_PACK_SELL_GOLD,
  BREAD_UPKEEP_PER_TROOP_HOUR,
  BUILD_ORDER,
  BUILDINGS,
  CHAT_TTL_MS,
  COLLECT_READY,
  COUNTY_MAX,
  DAILY_ATTACK_CAP,
  DEFENDER_COST,
  GOLD_NAME,
  GOLD_NAME_PL,
  MARCH_MS,
  MAX_TRAIN_QTY,
  NIEN_COST_GOLD,
  NIEN_SELL_GOLD,
  PASS_LEVELS,
  PASS_STARS_PER_LEVEL,
  SPEED_TRAIN_GOLD,
  TROOP_ORDER,
  TROOPS,
  WAR_ATTACK_CAP,
  armyCapacity,
  brtDayKey,
  buildingDamage,
  buildingHp,
  campUpgradeGold,
  countyUpgradeCost,
  dailyNienSendCap,
  defenderCap,
  generalCardsFor,
  goldWord,
  isHero,
  passCostWithDiscount,
  freePassReward,
  passReward,
  passWindow,
  rankingWindow,
  resourceLabel,
  scaledTroop,
  trainCostFor,
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
  type Tradable,
  type TroopType,
} from "@/lib/game/constants";
import { ALLIANCES, lordsOfAlliance } from "@/lib/game/bots";
import { battle, raidTarget, useGame } from "@/lib/game/store";
import { flushCloud, persist, wipeSave } from "@/lib/game/save";
import { createRuntime } from "@/lib/game/render";
import { formatRes, formatTime, countType } from "@/lib/game/world";
import { armySize, jobCount } from "@/lib/game/sim";
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
import { auth } from "@/lib/firebase";
import { setBearerToken, signOut } from "@/lib/auth/client";
import {
  claimWeekly,
  playAction,
  syncAccountEmail,
  weeklyBoard,
  type RankRow,
} from "@/lib/game/cloud";
import type { AllianceRival } from "@/lib/game/types";

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
      useGame.setState({ hydrated: true, screen: "splash", needsCounty: false, bootError: null });
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
      else void flushCloud();
    };
    const onHide = () => {
      void flushCloud();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
    };
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
  const startGame = useGame((s) => s.startGame);
  const hydrateFromCloud = useGame((s) => s.hydrateFromCloud);
  const toast = useGame((s) => s.toast);
  const bootError = useGame((s) => s.bootError);
  const needsCounty = useGame((s) => s.needsCounty);
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
            Cria conta com e-mail e senha. O nome do condado é único. O progresso fica na tua conta
            — podes entrar de outro aparelho.
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
          <button
            type="button"
            className="mt-3 flex h-11 w-full items-center justify-center text-sm text-parchment-dim"
            onClick={() => {
              unlockAudio();
              startMusic("village");
              startGame("Senhor");
            }}
          >
            Jogar no reino de treino (sem conta)
          </button>
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
          {bootError && !needsCounty
            ? "A tua conta já existe. Estamos a abrir o condado."
            : "Escolhe um nome que ninguém mais use. Ele identifica o teu condado no reino."}
        </p>
        {bootError && !needsCounty ? (
          <>
            <p className="mt-6 text-sm text-iron">{bootError}</p>
            <button
              type="button"
              disabled={busy}
              className="mt-4 flex h-12 w-full items-center justify-center rounded-md bg-parchment font-display text-sm font-semibold tracking-wide text-ink disabled:opacity-50"
              onClick={() => {
                unlockAudio();
                setBusy(true);
                void hydrateFromCloud().finally(() => setBusy(false));
              }}
            >
              {busy ? "A abrir…" : "Abrir o condado"}
            </button>
          </>
        ) : (
          <>
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
          </>
        )}
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
  const boostUntil = useGame((s) => s.boostUntil);
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
        <div className="pointer-events-auto mx-auto flex max-w-3xl flex-wrap items-center gap-2 px-3">
          <Pill icon={<Coins className="size-3.5" />} label={formatRes(gold)} tone="gold" title={GOLD_NAME_PL} />
          <Pill icon={<Wheat className="size-3.5" />} label={formatRes(bread)} tone="bread" />
          <Pill icon={<Gem className="size-3.5" />} label={formatRes(niens)} tone="niens" />
          {boostUntil > Date.now() && (
            <span className="hidden rounded-md border border-niens/40 px-2 py-1 text-[0.65rem] text-niens sm:inline">
              +40%
            </span>
          )}
          {screen === "village" && (
            <button
              type="button"
              onClick={collectAll}
              className="flex h-11 shrink-0 items-center rounded-md border border-line bg-panel/80 px-3 text-xs text-parchment-dim"
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
  title,
}: {
  icon: ReactNode;
  label: string;
  tone: "gold" | "bread" | "niens";
  title?: string;
}) {
  const color = tone === "niens" ? "text-niens" : tone === "gold" ? "text-gold" : "text-bread";
  return (
    <div
      title={title}
      className="flex h-9 min-w-0 items-center gap-1.5 rounded-md border border-line bg-panel/85 px-2.5"
    >
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
  const used = armySize({ army, training });
  const hasCamp = countType(buildings, "training") > 0;
  const campRoom = Math.max(0, cap - used);
  return (
    <div className="space-y-3">
      <p className="text-sm text-parchment-dim">
        Capacidade {used}/{cap}. Defensores {army.defender}/{defenderCap(campLevel)}. Cada tropa,
        incluindo generais, consome {BREAD_UPKEEP_PER_TROOP_HOUR} pães por hora.
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
      {TROOP_ORDER.map((type) => (
        <RecruitRow
          key={type}
          type={type}
          army={army[type]}
          queued={training.filter((t) => t.type === type).reduce((n, t) => n + jobCount(t), 0)}
          campRoom={campRoom}
          campLevel={campLevel}
          troopLevel={troopLevels[type]}
          bread={bread}
          gold={gold}
          hasTraining={hasCamp}
          onTrain={train}
        />
      ))}
      {training.length > 0 && (
        <div className="space-y-2">
          <p className="font-display text-sm">Fila</p>
          {training.map((j) => (
            <div
              key={j.id}
              className="flex items-center justify-between rounded-md border border-line px-3 py-2 text-sm"
            >
              <span>
                {TROOPS[j.type].name} ×{jobCount(j)} · {formatTime(j.remaining)}
              </span>
              <button type="button" className="text-gold" onClick={() => speedTrain(j.id)}>
                {formatRes(SPEED_TRAIN_GOLD)} {GOLD_NAME_PL}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RecruitRow({
  type,
  army,
  queued,
  campRoom,
  campLevel,
  troopLevel,
  bread,
  gold,
  hasTraining,
  onTrain,
}: {
  type: TroopType;
  army: number;
  queued: number;
  campRoom: number;
  campLevel: number;
  troopLevel: number;
  bread: number;
  gold: number;
  hasTraining: boolean;
  onTrain: (type: TroopType, qty?: number) => boolean;
}) {
  const d = TROOPS[type];
  const hero = isHero(type);
  const cost = trainCostFor(type, troopLevel);
  const unitCost = cost.amount;
  const unitKind = cost.kind === "gold" ? GOLD_NAME_PL : "pão";
  const defenderRoom =
    type === "defender" ? Math.max(0, defenderCap(campLevel) - army - queued) : campRoom;
  const maxQty = hero
    ? army + queued >= 1
      ? 0
      : 1
    : type === "defender"
      ? Math.min(defenderRoom, campRoom, MAX_TRAIN_QTY)
      : Math.min(campRoom, MAX_TRAIN_QTY);
  const [qty, setQty] = useState(1);
  const n = Math.max(1, Math.min(hero ? 1 : Math.max(1, maxQty || 1), Math.floor(qty) || 1));
  const total = unitCost * n;
  const canPay = type === "defender" ? gold >= total : bread >= total;
  const can = maxQty >= 1 && canPay && n <= maxQty;
  const st = scaledTroop(type, troopLevel, campLevel);
  const missingCamp = type === "defender" && !hasTraining;
  return (
    <div className="rounded-md border border-line bg-ink-2/50 p-3">
      <div className="flex items-center gap-3">
        <img src={`/game/${troopAsset(type)}.png`} alt="" className="size-12 object-contain" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm">
            {d.name} <span className="tabular text-parchment-dim">×{army}</span>
            {queued > 0 ? <span className="tabular text-niens"> · +{queued} na fila</span> : null}
          </p>
          <p className="text-xs text-parchment-dim">
            {st.hp} HP · {st.dps} dano/s · {d.desc}
          </p>
        </div>
      </div>
      <div className="mt-3 flex items-end gap-2">
        {!hero && (
          <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[0.65rem] uppercase tracking-[0.16em] text-parchment-dim">
              Quantidade
            </span>
            <input
              type="number"
              min={1}
              max={Math.max(1, maxQty)}
              inputMode="numeric"
              value={n}
              onChange={(e) => setQty(Math.max(1, Math.floor(Number(e.target.value) || 1)))}
              className="h-11 w-full rounded-md border border-line bg-ink px-3 text-sm tabular outline-none"
            />
          </label>
        )}
        <button
          type="button"
          onClick={() => onTrain(type, hero ? 1 : n)}
          disabled={!can || missingCamp}
          className="h-11 min-w-[9.5rem] rounded-md bg-parchment px-3 font-display text-xs font-semibold text-ink disabled:opacity-40"
        >
          {missingCamp
            ? "Campo de treino"
            : `Recrutar · ${formatRes(total)} ${unitKind}`}
        </button>
      </div>
      <p className="mt-1 text-[0.7rem] text-parchment-dim">
        {hero
          ? `1 ${d.name.toLowerCase()} por condado · Nv.${troopLevel} · ${formatRes(unitCost)} ${unitKind}`
          : maxQty < 1
            ? "Sem vaga no acampamento."
            : `Nv.${troopLevel} · ${formatRes(unitCost)} ${unitKind} cada`}
      </p>
    </div>
  );
}

function ChatSheet() {
  const chat = useGame((s) => s.chat);
  const sendChat = useGame((s) => s.sendChat);
  const [text, setText] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const end = useRef<HTMLDivElement>(null);
  const live = chat.filter((m) => now - m.at <= CHAT_TTL_MS);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [live.length]);
  return (
    <div className="flex h-[52dvh] flex-col md:h-[calc(100dvh-8rem)]">
      <p className="mb-2 text-[0.7rem] uppercase tracking-[0.18em] text-parchment-dim">
        Chat global · mensagens somem após 5 minutos
      </p>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        {live.length === 0 && (
          <p className="text-sm text-parchment-dim">Nenhuma mensagem nos últimos 5 minutos.</p>
        )}
        {live.map((m) => {
          const left = Math.max(0, CHAT_TTL_MS - (now - m.at));
          return (
            <div
              key={m.id}
              className={`rounded-md px-3 py-2 ${m.self ? "bg-moss/20 ml-6" : "bg-ink-2 mr-4"}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-display text-[0.7rem] text-niens">{m.fromNick}</p>
                <p className="text-[0.65rem] tabular text-parchment-dim">
                  {new Date(m.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  {left < 60_000 ? ` · some em ${Math.max(1, Math.ceil(left / 1000))}s` : ""}
                </p>
              </div>
              <p className="text-sm leading-snug">{m.text}</p>
              {m.recruitAllianceId && (
                <button
                  type="button"
                  onClick={() => useGame.getState().joinAlliance(m.recruitAllianceId!)}
                  className="mt-2 h-10 w-full rounded-md border border-niens/40 text-xs"
                >
                  Pedir entrada
                </button>
              )}
            </div>
          );
        })}
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
          placeholder="Chat global — todos os senhores vêem"
          maxLength={160}
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
  { k: "gold", label: GOLD_NAME },
  { k: "bread", label: "Pão" },
  { k: "troopCards", label: "Cartas tropa" },
  { k: "generalCards", label: "Cartas general" },
];

const TRADE_KINDS: Array<{ k: Tradable; label: string }> = [
  { k: "gold", label: GOLD_NAME },
  { k: "bread", label: "Pão" },
  { k: "niens", label: "Niens" },
];

function MarketSheet() {
  const offers = useGame((s) => s.offers);
  const buyOffer = useGame((s) => s.buyOffer);
  const buyNien = useGame((s) => s.buyNien);
  const sellNien = useGame((s) => s.sellNien);
  const buyBreadPack = useGame((s) => s.buyBreadPack);
  const sellBreadPack = useGame((s) => s.sellBreadPack);
  const postOffer = useGame((s) => s.postOffer);
  const withdrawOffer = useGame((s) => s.withdrawOffer);
  const refreshMarket = useGame((s) => s.refreshMarket);
  const transfer = useGame((s) => s.transfer);
  const peekId = useGame((s) => s.peekId);
  const lookup = useGame((s) => s.lookup);
  const player = useGame((s) => s.player);
  const gold = useGame((s) => s.gold);
  const bread = useGame((s) => s.bread);
  const niens = useGame((s) => s.niens);
  const countyLevel = useGame((s) => s.countyLevel);
  const niensSentDay = useGame((s) => s.niensSentDay);
  const niensSentToday = useGame((s) => s.niensSentToday);
  const ledger = useGame((s) => s.ledger);
  const refreshLedger = useGame((s) => s.refreshLedger);
  const [to, setTo] = useState("");
  const [amt, setAmt] = useState("1");
  const [kind, setKind] = useState<ResourceKind>("niens");
  const [giveKind, setGiveKind] = useState<Tradable>("gold");
  const [wantKind, setWantKind] = useState<Tradable>("niens");
  const [giveAmt, setGiveAmt] = useState("150000");
  const [wantAmt, setWantAmt] = useState("1");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void refreshLedger();
    void refreshMarket();
  }, [refreshLedger, refreshMarket]);
  const cap = dailyNienSendCap(countyLevel);
  const day = brtDayKey();
  const sent = niensSentDay === day ? niensSentToday : 0;
  return (
    <div className="space-y-4">
      <p className="text-sm text-parchment-dim">
        Tesouro: {formatRes(gold)} {GOLD_NAME_PL} · {formatRes(bread)} pães · {formatRes(niens)}{" "}
        Niens. As ofertas do mercado são únicas e visíveis a todos os senhores. Seu ID{" "}
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
            {formatRes(NIEN_COST_GOLD)} {GOLD_NAME_PL}
            {gold < NIEN_COST_GOLD ? ` · faltam ${GOLD_NAME_PL.toLowerCase()}` : ""}
          </span>
        </button>
        <button
          type="button"
          onClick={sellNien}
          className="rounded-md border border-line bg-ink-2 px-3 py-3 text-left text-sm"
        >
          <span className="block font-display text-gold">Vender 1 Nien</span>
          <span className="text-xs text-parchment-dim">
            {formatRes(NIEN_SELL_GOLD)} {GOLD_NAME_PL}
            {niens < 1 ? " · sem gemas" : ""}
          </span>
        </button>
        <button
          type="button"
          onClick={buyBreadPack}
          className="rounded-md border border-line bg-ink-2 px-3 py-3 text-left text-sm"
        >
          <span className="block font-display">Comprar {formatRes(BREAD_PACK)} pães</span>
          <span className="text-xs text-parchment-dim">
            {formatRes(BREAD_PACK_BUY_GOLD)} {GOLD_NAME_PL}
          </span>
        </button>
        <button
          type="button"
          onClick={sellBreadPack}
          className="rounded-md border border-line bg-ink-2 px-3 py-3 text-left text-sm"
        >
          <span className="block font-display">Vender {formatRes(BREAD_PACK)} pães</span>
          <span className="text-xs text-parchment-dim">
            {formatRes(BREAD_PACK_SELL_GOLD)} {GOLD_NAME_PL}
          </span>
        </button>
      </div>
      <div>
        <p className="mb-2 font-display text-sm">Ofertas universais</p>
        <div className="max-h-[36dvh] space-y-2 overflow-y-auto rounded-md border border-line bg-ink-2 p-2 md:max-h-[48dvh]">
          {offers.map((o) => {
            const mine = o.sellerId === player.id;
            return (
              <div
                key={o.id}
                className="flex items-center justify-between rounded-md border border-line bg-ink px-3 py-2"
              >
                <div>
                  <p className="text-sm">{o.sellerNick}</p>
                  <p className="text-xs text-parchment-dim">
                    Dá {formatRes(o.giveAmount)} {resourceLabel(o.giveKind, o.giveAmount)} · pede{" "}
                    {formatRes(o.wantAmount)} {resourceLabel(o.wantKind, o.wantAmount)}
                  </p>
                </div>
                <button
                  type="button"
                  className="h-11 shrink-0 px-3 text-sm text-niens"
                  onClick={() => void (mine ? withdrawOffer(o.id) : buyOffer(o.id))}
                >
                  {mine ? "Retirar" : "Aceitar"}
                </button>
              </div>
            );
          })}
          {offers.length === 0 && (
            <p className="px-1 py-3 text-sm text-parchment-dim">Nenhuma oferta no reino agora.</p>
          )}
        </div>
      </div>
      <form
        className="space-y-2 rounded-md border border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          setBusy(true);
          void postOffer(giveKind, Number(giveAmt), wantKind, Number(wantAmt)).finally(() =>
            setBusy(false),
          );
        }}
      >
        <p className="font-display text-sm">Publicar oferta única</p>
        <p className="text-xs text-parchment-dim">
          Só existe uma proposta com as mesmas quantias no reino inteiro.
        </p>
        <div className="grid grid-cols-3 gap-1">
          {TRADE_KINDS.map(({ k, label }) => (
            <button
              key={`g-${k}`}
              type="button"
              onClick={() => setGiveKind(k)}
              className={`h-10 rounded-md border text-[0.65rem] ${giveKind === k ? "border-niens bg-panel-2" : "border-line bg-ink-2"}`}
            >
              Dar {label}
            </button>
          ))}
        </div>
        <input
          value={giveAmt}
          onChange={(e) => setGiveAmt(e.target.value)}
          type="number"
          min={1}
          className="h-11 w-full rounded-md border border-line bg-ink px-3 text-sm"
        />
        <div className="grid grid-cols-3 gap-1">
          {TRADE_KINDS.map(({ k, label }) => (
            <button
              key={`w-${k}`}
              type="button"
              onClick={() => setWantKind(k)}
              className={`h-10 rounded-md border text-[0.65rem] ${wantKind === k ? "border-niens bg-panel-2" : "border-line bg-ink-2"}`}
            >
              Pedir {label}
            </button>
          ))}
        </div>
        <input
          value={wantAmt}
          onChange={(e) => setWantAmt(e.target.value)}
          type="number"
          min={1}
          className="h-11 w-full rounded-md border border-line bg-ink px-3 text-sm"
        />
        <button
          type="submit"
          disabled={busy || giveKind === wantKind}
          className="h-11 w-full rounded-md bg-parchment font-display text-sm text-ink disabled:opacity-40"
        >
          {busy ? "A publicar…" : "Publicar no mercado"}
        </button>
      </form>
      <form
        className="space-y-2 rounded-md border border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void transfer(to, Number(amt), kind);
        }}
      >
        <p className="font-display text-sm">Enviar a outro senhor</p>
        <p className="text-xs text-parchment-dim">
          Limite de Niens hoje: {sent}/{cap} (Nv.{countyLevel} · Nv.1–5: 5, Nv.6–10: 10, Nv.11–15:
          20).
        </p>
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
          <p className="mb-2 font-display text-sm">Registo de envios e recebidos</p>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {ledger.slice(0, 16).map((t) => (
              <p key={t.id} className="text-xs text-parchment-dim">
                {t.incoming ? "Recebeste" : "Enviaste"} {t.amount} {resourceLabel(t.kind, t.amount)}{" "}
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
            Nível {b.type === "castle" ? countyLevel : b.level}/{b.type === "castle" ? COUNTY_MAX : countyLevel} · {hp} HP
            {dmg > 0 ? ` · ${dmg} dano` : ""}
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
            ? `Recolher ${stored} ${b.type === "mine" ? goldWord(stored) : "pão"}`
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
          Melhorar fileira ({row.length}) · {formatRes(rowCost)} {GOLD_NAME_PL}
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
              ? `Avançar condado · saque +5% · ${countyCost.niens} Niens`
              : `Avançar condado · saque +5% · ${formatRes(countyCost.gold)} ${GOLD_NAME_PL}`}
        </button>
      )}
      {b.type !== "castle" && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => upgrade(b.id)}
            className="h-11 rounded-md border border-line bg-ink-2 font-display text-sm"
          >
            Melhorar · {cost} {GOLD_NAME_PL}
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
          Melhorar todas as {d.name} ({sameType.length}) · {formatRes(typeCost)} {GOLD_NAME_PL}
          {gold < typeCost ? " · falta" : ""}
        </button>
      )}
    </div>
  );
}

function AdminLedger() {
  const admin = useGame((s) => s.admin);
  const [playerId, setPlayerId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<{
    nick?: string;
    playerId?: string;
    gold?: number;
    bread?: number;
    niens?: number;
    troopCards?: number;
    generalCards?: number;
    countyLevel?: number;
    weekStars?: number;
    ledger?: Array<{
      type?: string;
      currency?: string;
      amount?: number;
      balanceAfter?: number;
      timestamp?: string;
    }>;
  } | null>(null);
  if (!admin) return null;
  return (
    <div className="rounded-md border border-line bg-ink-2/70 p-3">
      <p className="text-xs uppercase tracking-[0.18em] text-parchment-dim">Livro do reino</p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const r = await playAction("adminLookup", { playerId });
            setLookup((r.lookup as typeof lookup) ?? null);
            if (!r.lookup) setError("Jogador não encontrado.");
          } catch (err) {
            setLookup(null);
            setError(err instanceof Error ? err.message : "Não encontrado.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          value={playerId}
          onChange={(event) => setPlayerId(event.target.value)}
          placeholder="ID do jogador"
          className="h-10 flex-1 rounded-md border border-line bg-ink px-3 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={busy || playerId.trim().length < 3}
          className="h-10 rounded-md bg-parchment px-3 font-display text-sm text-ink disabled:opacity-50"
        >
          Ver
        </button>
      </form>
      {error && <p className="mt-2 text-xs text-iron">{error}</p>}
      {lookup && (
        <div className="mt-2 space-y-1 text-xs text-parchment-dim">
          <p>
            {lookup.nick} · {lookup.playerId} · Nv.{lookup.countyLevel}
          </p>
          <p>
            {GOLD_NAME} {formatRes(Number(lookup.gold))} · Pão {formatRes(Number(lookup.bread))} · Niens{" "}
            {formatRes(Number(lookup.niens))}
          </p>
          <p>
            Cartas {lookup.troopCards}/{lookup.generalCards} · Estrelas da semana {lookup.weekStars}
          </p>
          <div className="max-h-40 space-y-1 overflow-y-auto">
            {(lookup.ledger ?? []).slice(0, 40).map((row, i) => (
              <p key={`${row.timestamp ?? i}-${i}`}>
                {row.type} · {row.currency} {row.amount} → {row.balanceAfter}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileSheet() {
  const player = useGame((s) => s.player);
  const currentUser = useCurrentUserState().user;
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
  const raids = useGame((s) => s.raids);
  const [name, setName] = useState(nickDraft || player.nick);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountPassword, setAccountPassword] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const [accountMessage, setAccountMessage] = useState<string | null>(null);
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
      <div className="rounded-md border border-line bg-ink-2/70 p-3">
        <p className="text-xs uppercase tracking-[0.18em] text-parchment-dim">
          {currentUser?.isAnonymous ? "Proteger este condado" : "Conta associada"}
        </p>
        {currentUser?.isAnonymous ? (
          <form
            className="mt-2 space-y-2"
            onSubmit={async (event) => {
              event.preventDefault();
              const firebaseUser = auth.currentUser;
              if (!firebaseUser) return;
              setAccountBusy(true);
              setAccountMessage(null);
              try {
                const credential = EmailAuthProvider.credential(
                  accountEmail.trim(),
                  accountPassword,
                );
                const linked = await linkWithCredential(firebaseUser, credential);
                setBearerToken(await linked.user.getIdToken(true));
                await syncAccountEmail();
                setAccountPassword("");
                setAccountMessage("E-mail associado. Use-o para entrar neste condado.");
              } catch (error) {
                const code =
                  typeof error === "object" && error && "code" in error ? String(error.code) : "";
                const messages: Record<string, string> = {
                  "auth/email-already-in-use": "Este e-mail já está associado a outra conta.",
                  "auth/invalid-email": "Digite um e-mail válido.",
                  "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
                  "auth/requires-recent-login": "Entre novamente e tente associar o e-mail.",
                };
                setAccountMessage(
                  messages[code] ?? "Não foi possível associar o e-mail.",
                );
              } finally {
                setAccountBusy(false);
              }
            }}
          >
            <input
              type="email"
              required
              value={accountEmail}
              onChange={(event) => setAccountEmail(event.target.value)}
              placeholder="E-mail para recuperar o condado"
              className="h-10 w-full rounded-md border border-line bg-ink px-3 text-sm outline-none"
            />
            <input
              type="password"
              required
              minLength={6}
              value={accountPassword}
              onChange={(event) => setAccountPassword(event.target.value)}
              placeholder="Senha (mínimo de 6 caracteres)"
              className="h-10 w-full rounded-md border border-line bg-ink px-3 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={accountBusy}
              className="h-10 w-full rounded-md bg-parchment px-3 font-display text-sm text-ink disabled:opacity-50"
            >
              {accountBusy ? "Associando…" : "Associar e-mail e senha"}
            </button>
            <p className="text-xs leading-relaxed text-parchment-dim">
              A senha fica só na tua conta. Nunca a partilhes.
            </p>
          </form>
        ) : (
          <div className="mt-2 space-y-2">
            <p className="text-sm text-parchment-dim">
              {currentUser?.primaryEmail ?? "Conta Google associada"}
            </p>
            <button
              type="button"
              className="h-10 w-full rounded-md border border-line text-sm"
              onClick={() => {
                wipeSave();
                useGame.getState().resetGame();
                void signOut("/");
              }}
            >
              Sair da conta
            </button>
          </div>
        )}
        {accountMessage && <p className="mt-2 text-xs text-niens">{accountMessage}</p>}
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
          Convide um amigo. Quando ele chegar ao Condado 3, ambos ganham 300.000 {GOLD_NAME_PL}.
        </p>
      </div>
      <ul className="space-y-1 text-sm">
        <li>
          Condado nível {countyLevel}/{COUNTY_MAX}
        </li>
        <li>
          {GOLD_NAME} {formatRes(gold)} · Pão {formatRes(bread)} · Niens {formatRes(niens)}
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
      <AdminLedger />
      {raids.length > 0 && (
        <div>
          <p className="mb-2 font-display text-sm">Registo de combates</p>
          <div className="max-h-44 space-y-1 overflow-y-auto">
            {raids.slice(0, 16).map((r) => (
              <p key={r.id} className="text-xs text-parchment-dim">
                {r.incoming ? `${r.attacker} atacou-te` : `Atacaste ${r.defender || r.attacker}`} ·{" "}
                {Math.round((r.destruction ?? 0) * 100)}% destruído · {r.troopsLost ?? 0} tropas ·{" "}
                {formatRes(r.gold)} {GOLD_NAME_PL}
              </p>
            ))}
          </div>
        </div>
      )}
      <a
        href={WHATSAPP_GROUP}
        target="_blank"
        rel="noreferrer"
        className="flex h-11 items-center justify-center gap-2 rounded-md border border-line bg-ink-2 text-sm"
      >
        <MessageCircle className="size-4" />
        Grupo no WhatsApp
      </a>
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
          : `Melhorar campo · ${formatRes(campCost)} ${GOLD_NAME_PL}`}
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
                  : `${cards} cartas · ${formatRes(g)} ${GOLD_NAME_PL} · ${br} pão`}
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
        {GOLD_NAME} em estoque {formatRes(gold)} · Pão {formatRes(bread)}
      </p>
    </div>
  );
}

function PassSheet() {
  const pass = useGame((s) => s.pass);
  const buyPass = useGame((s) => s.buyPass);
  const claimPass = useGame((s) => s.claimPass);
  const claimPassFree = useGame((s) => s.claimPassFree);
  const claimPassExtra = useGame((s) => s.claimPassExtra);
  const claimPassAll = useGame((s) => s.claimPassAll);
  const skipPass = useGame((s) => s.skipPass);
  const niens = useGame((s) => s.niens);
  const passDiscount = useGame((s) => s.passDiscount);
  const boostUntil = useGame((s) => s.boostUntil);
  const win = passWindow();
  const cost = passCostWithDiscount(pass.season, !!passDiscount);
  const reached = Math.min(PASS_LEVELS, Math.floor(pass.stars / PASS_STARS_PER_LEVEL));
  const levels = Array.from({ length: PASS_LEVELS }, (_, i) => i + 1);
  const extras = pass.extrasClaimed ?? [];
  const canExtras = pass.purchased && (reached >= PASS_LEVELS || pass.claimed.includes(PASS_LEVELS));
  const pendingFree = levels.filter((lv) => lv <= reached && !(pass.claimedFree ?? []).includes(lv)).length;
  const pendingPaid = pass.purchased
    ? levels.filter((lv) => lv <= reached && !pass.claimed.includes(lv)).length
    : 0;
  const pendingAll = pendingFree + pendingPaid;
  return (
    <div className="space-y-3">
      <p className="text-sm text-parchment-dim">
        Temporada {pass.season}. 50 níveis, 6 estrelas cada. A trilha grátis dá cerca de metade.
        O passe sobe 1 Nien por mês.
      </p>
      {boostUntil > Date.now() && (
        <p className="text-xs text-niens">
          Boost +40% nas minas e fazendas até {new Date(boostUntil).toLocaleDateString("pt-BR")}.
        </p>
      )}
      {!win.active && <p className="text-sm text-iron">Passe em espera até 1º do mês.</p>}
      {!pass.purchased ? (
        <button
          type="button"
          onClick={buyPass}
          className="h-11 w-full rounded-md bg-parchment font-display text-sm text-ink"
        >
          Selar passe · {cost} Niens {passDiscount ? "(45% de desconto)" : ""} {niens < cost ? "(faltam gemas)" : ""}
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
            Pular 1 nível · 1 Nien {niens < 1 ? "(faltam gemas)" : "e recebe o prêmio pago"}
          </button>
          {pendingAll > 0 && (
            <button
              type="button"
              onClick={claimPassAll}
              className="h-11 w-full rounded-md bg-parchment font-display text-sm text-ink"
            >
              Recolher todas as recompensas ({pendingAll})
            </button>
          )}
        </>
      )}
      {!pass.purchased && pendingFree > 0 && (
        <button
          type="button"
          onClick={claimPassAll}
          className="h-11 w-full rounded-md bg-parchment font-display text-sm text-ink"
        >
          Recolher recompensas grátis ({pendingFree})
        </button>
      )}
      {canExtras && (
        <div className="space-y-2 rounded-md border border-niens/30 bg-ink-2 p-3">
          <p className="text-xs uppercase tracking-[0.18em] text-parchment-dim">Cupons do nível 50</p>
          <button
            type="button"
            disabled={extras.includes("boost")}
            onClick={() => claimPassExtra("boost")}
            className="h-11 w-full rounded-md border border-line text-sm disabled:opacity-40"
          >
            {extras.includes("boost")
              ? "Boost 30 dias já resgatado"
              : "Resgatar boost +40% minas e fazendas · 30 dias"}
          </button>
          <button
            type="button"
            disabled={extras.includes("discount")}
            onClick={() => claimPassExtra("discount")}
            className="h-11 w-full rounded-md border border-line text-sm disabled:opacity-40"
          >
            {extras.includes("discount")
              ? "Pergaminho de desconto já resgatado"
              : "Resgatar pergaminho · 45% no próximo passe"}
          </button>
        </div>
      )}
      <div className="max-h-[48dvh] space-y-1 overflow-y-auto">
        {levels.map((lv) => {
          const paid = passReward(lv);
          const free = freePassReward(lv);
          const claimed = pass.claimed.includes(lv);
          const claimedFree = (pass.claimedFree ?? []).includes(lv);
          const readyPaid = pass.purchased && lv <= reached && !claimed;
          const readyFree = lv <= reached && !claimedFree;
          return (
            <div key={lv} className="rounded-md border border-line px-3 py-2 text-sm">
              <p className="font-display text-xs text-parchment-dim">Nv.{lv}</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-xs">Grátis · {free.label}</span>
                {claimedFree ? (
                  <span className="text-xs text-parchment-dim">feito</span>
                ) : (
                  <button
                    type="button"
                    disabled={!readyFree}
                    onClick={() => claimPassFree(lv)}
                    className="text-xs text-niens disabled:opacity-30"
                  >
                    Receber
                  </button>
                )}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-xs">Pago · {paid.label}</span>
                {claimed ? (
                  <span className="text-xs text-parchment-dim">feito</span>
                ) : (
                  <button
                    type="button"
                    disabled={!readyPaid}
                    onClick={() => claimPass(lv)}
                    className="text-xs text-niens disabled:opacity-30"
                  >
                    Receber
                  </button>
                )}
              </div>
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
  const recruitAlliance = useGame((s) => s.recruitAlliance);
  const leaveAlliance = useGame((s) => s.leaveAlliance);
  const startAllianceDuel = useGame((s) => s.startAllianceDuel);
  const declareWar = useGame((s) => s.declareWar);
  const allianceChat = useGame((s) => s.allianceChat);
  const war = useGame((s) => s.war);
  const niens = useGame((s) => s.niens);
  const player = useGame((s) => s.player);
  const countyLevel = useGame((s) => s.countyLevel);
  const raidTargets = useGame((s) => s.raidTargets);
  const acceptJoin = useGame((s) => s.acceptJoin);
  const rejectJoin = useGame((s) => s.rejectJoin);
  const [name, setName] = useState("");
  const [openJoin, setOpenJoin] = useState(true);
  const [text, setText] = useState("");
  const [tab, setTab] = useState<"hall" | "war" | "chat">("hall");
  const [foes, setFoes] = useState<typeof raidTargets>([]);
  const [rivals, setRivals] = useState<AllianceRival[]>([]);
  const chatEnd = useRef<HTMLDivElement>(null);
  const win = warWindow();
  const atWar = !!(war && allianceAtWarToday(war));
  useEffect(() => {
    if (!alliance) return;
    let stop = false;
    const pull = () => {
      void playAction("listAllianceHall")
        .catch(() => playAction("listAllianceFoes"))
        .then((r) => {
          if (stop) return;
          if (r.foes) setFoes(r.foes);
          if (r.rivals) setRivals(r.rivals);
          if (r.save) {
            const cur = useGame.getState();
            useGame.setState({
              alliance: r.save.alliance ?? cur.alliance,
              war: r.save.war ?? cur.war,
              allianceChat: r.save.allianceChat ?? cur.allianceChat,
            });
          }
        })
        .catch(() => {
          /* offline */
        });
    };
    pull();
    const id = window.setInterval(pull, 3500);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [alliance?.id, war?.foeId]);
  useEffect(() => {
    if (tab !== "chat") return;
    chatEnd.current?.scrollIntoView({ block: "end" });
  }, [tab, allianceChat.length]);
  if (!alliance) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-parchment-dim">
          Fundar custa {ALLIANCE_FOUND_NIENS} Niens. Escolhe se quem chega entra livre ou precisa de
          pedido — o pedido fica no chat da aliança até o líder aceitar ou recusar. Guerra dura 1
          dia: o líder escolhe o rival na aba Guerra. Duelos no campo, 3 pontos na vitória, 1 na
          derrota. A aliança com mais pontos leva {formatRes(ALLIANCE_WAR_CHEST)} {GOLD_NAME_PL}{" "}
          repartidos pelos que lutaram. Quem já está em guerra não pode ser chamado.
        </p>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da aliança"
          className="h-11 w-full rounded-md border border-line bg-ink px-3 text-sm"
        />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setOpenJoin(true)}
            className={`h-11 rounded-md border text-sm ${openJoin ? "border-niens bg-ink-2" : "border-line"}`}
          >
            Entrada livre
          </button>
          <button
            type="button"
            onClick={() => setOpenJoin(false)}
            className={`h-11 rounded-md border text-sm ${!openJoin ? "border-niens bg-ink-2" : "border-line"}`}
          >
            Pedir para entrar
          </button>
        </div>
        <button
          type="button"
          onClick={() => foundAlliance(name, openJoin)}
          className="h-11 w-full rounded-md bg-parchment font-display text-sm text-ink"
        >
          Fundar · {ALLIANCE_FOUND_NIENS} Niens {niens < ALLIANCE_FOUND_NIENS ? "(faltam gemas)" : ""}
        </button>
      </div>
    );
  }
  const slots = alliance.slots || allianceSlots(alliance.level || 1);
  const leader = alliance.leaderId === player.id;
  const pending = (alliance.joinRequests ?? []).length;
  const live = Boolean(auth.currentUser);
  const shownRivals: AllianceRival[] = live
    ? rivals
    : ALLIANCES.filter((a) => a.id !== alliance.id).map((a) => ({
        id: a.id,
        name: a.name,
        level: 1,
        members: a.members.length,
        slots: 30,
        atWar: false,
        foeName: "",
      }));
  const shownFoes = live ? foes : war?.foeId ? lordsOfAlliance(war.foeId) : [];
  const tabBtn = (id: typeof tab, label: string, badge?: number) => (
    <button
      key={id}
      type="button"
      onClick={() => setTab(id)}
      className={`h-11 rounded-md border text-sm ${tab === id ? "border-niens bg-ink-2 text-parchment" : "border-line text-parchment-dim"}`}
    >
      {label}
      {badge ? <span className="ml-1 text-niens">{badge}</span> : null}
    </button>
  );
  return (
    <div className="flex h-[56dvh] flex-col md:h-[calc(100dvh-8rem)]">
      <p className="font-display">{alliance.name}</p>
      <p className="mb-2 text-xs text-parchment-dim">
        Nv.{alliance.level || 1} · {alliance.xp ?? 0} XP · {alliance.members.length}/{slots} vagas ·{" "}
        {alliance.openJoin ? "entrada livre" : "entrada com pedido"}
      </p>
      <div className="mb-3 grid grid-cols-3 gap-2">
        {tabBtn("hall", "Aliança")}
        {tabBtn("war", "Guerra")}
        {tabBtn("chat", "Chat", pending)}
      </div>
      {tab === "hall" && (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-line bg-ink-2 p-2">
            {alliance.members.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-2 py-1 text-sm">
                <span>{m.nick}</span>
                {m.id === alliance.leaderId ? (
                  <span className="text-[0.65rem] uppercase tracking-[0.16em] text-niens">Líder</span>
                ) : (
                  <span className="text-[0.65rem] text-parchment-dim">Membro</span>
                )}
              </div>
            ))}
          </div>
          {leader && (
            <button
              type="button"
              onClick={recruitAlliance}
              className="h-11 w-full rounded-md border border-niens/40 bg-ink-2 text-sm"
            >
              Recrutar no chat global
            </button>
          )}
          <button type="button" onClick={leaveAlliance} className="h-11 w-full rounded-md border border-line text-sm">
            Sair da aliança
          </button>
          <p className="text-xs text-parchment-dim">
            Teu condado Nv.{countyLevel}. XP de guerra: 1000 por vitória. Nv.2 pede 4000 XP, depois dobra até 7.
          </p>
        </div>
      )}
      {tab === "war" && (
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {atWar ? (
            <>
              <div className="rounded-md border border-line bg-ink-2 p-3 text-sm">
                <p>
                  Guerra vs {war?.foeName} {win.open ? "aberta" : "encerrada"}
                </p>
                <p className="text-parchment-dim">
                  Nós {war?.ourStars ?? 0} · Eles {war?.theirStars ?? 0} · Cofre{" "}
                  {formatRes(war?.chest || ALLIANCE_WAR_CHEST)}
                </p>
                <p className="mt-1 text-xs text-parchment-dim">
                  Duelo no campo. Máx. 2 por rival. Recuar dá 1 ponto ao inimigo. A aliança não pode
                  entrar noutra guerra enquanto esta durar.
                </p>
              </div>
              {shownFoes.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-[0.18em] text-parchment-dim">Campo de guerra</p>
                  {shownFoes.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => startAllianceDuel(f)}
                      className="flex h-11 w-full items-center justify-between rounded-md border border-line bg-ink-2 px-3 text-sm"
                    >
                      <span>{f.nick}</span>
                      <span className="text-xs text-parchment-dim">Duelar</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-parchment-dim">A carregar os senhores do rival…</p>
              )}
            </>
          ) : (
            <>
              <p className="text-sm text-parchment-dim">
                {leader
                  ? "Escolhe a aliança inimiga para começar a guerra de hoje. Quem já luta com outra não pode ser chamada."
                  : "Só o líder declara a guerra. Pede-lhe para escolher o rival nesta aba."}
              </p>
              {shownRivals.length === 0 && (
                <p className="text-sm text-parchment-dim">Não há outras alianças ainda.</p>
              )}
              {shownRivals.map((r) => {
                const busy = r.atWar;
                const canCall = leader && !busy;
                return (
                  <button
                    key={r.id}
                    type="button"
                    disabled={!canCall}
                    onClick={() => canCall && declareWar(r.id)}
                    className={`flex min-h-11 w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${
                      busy ? "border-line bg-ink-2 text-parchment-dim" : "border-line bg-ink-2"
                    } disabled:opacity-70`}
                  >
                    <span>
                      <span className="block">{r.name}</span>
                      <span className="text-xs text-parchment-dim">
                        Nv.{r.level} · {r.members}/{r.slots} senhores
                        {busy ? ` · em guerra vs ${r.foeName || "outra"}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-parchment-dim">
                      {busy ? "Ocupada" : leader ? "Declarar" : "Líder"}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
      {tab === "chat" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {allianceChat.length === 0 && pending === 0 && (
              <p className="text-sm text-parchment-dim">Ainda não há mensagens. Escreve a primeira.</p>
            )}
            {allianceChat.map((m) => (
              <div key={m.id} className={`rounded-md px-3 py-2 ${m.self ? "bg-moss/20 ml-6" : "bg-ink-2 mr-4"}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-display text-[0.7rem] text-niens">{m.fromNick}</p>
                  <p className="text-[0.65rem] tabular text-parchment-dim">
                    {new Date(m.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <p className="text-sm leading-snug">{m.text}</p>
                {leader && m.joinRequestId && (alliance.joinRequests ?? []).some((r) => r.id === m.joinRequestId) && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => acceptJoin(m.joinRequestId!)}
                      className="h-10 rounded-md bg-parchment font-display text-xs text-ink"
                    >
                      Aceitar
                    </button>
                    <button
                      type="button"
                      onClick={() => rejectJoin(m.joinRequestId!)}
                      className="h-10 rounded-md border border-line text-xs"
                    >
                      Recusar
                    </button>
                  </div>
                )}
              </div>
            ))}
            {(alliance.joinRequests ?? [])
              .filter((r) => !allianceChat.some((m) => m.joinRequestId === r.id))
              .map((r) => (
                <div key={r.id} className="rounded-md bg-ink-2 px-3 py-2">
                  <p className="font-display text-[0.7rem] text-niens">{r.nick}</p>
                  <p className="text-sm">{r.nick} pede para entrar.</p>
                  {leader && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => acceptJoin(r.id)}
                        className="h-10 rounded-md bg-parchment font-display text-xs text-ink"
                      >
                        Aceitar
                      </button>
                      <button
                        type="button"
                        onClick={() => rejectJoin(r.id)}
                        className="h-10 rounded-md border border-line text-xs"
                      >
                        Recusar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            <div ref={chatEnd} />
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              sendAllianceChat(text);
              setText("");
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="h-11 flex-1 rounded-md border border-line bg-ink px-3 text-sm outline-none"
              placeholder="Chat da aliança — só os membros vêem"
              maxLength={160}
            />
            <button type="submit" className="h-11 rounded-md bg-parchment px-4 font-display text-sm text-ink">
              Enviar
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function RaidSelect() {
  const beginAttack = useGame((s) => s.beginAttack);
  const returnVillage = useGame((s) => s.returnVillage);
  const war = useGame((s) => s.war);
  const shieldUntil = useGame((s) => s.shieldUntil);
  const attacksByTarget = useGame((s) => s.attacksByTarget);
  const raidTargets = useGame((s) => s.raidTargets);
  const refreshTargets = useGame((s) => s.refreshTargets);
  const countyLevel = useGame((s) => s.countyLevel);
  const foes = war?.foeId ? lordsOfAlliance(war.foeId) : [];
  const day = brtDayKey();
  const win = warWindow();
  const warLive = !!(war && win.open && !war.sittingOut);
  useEffect(() => {
    void refreshTargets();
  }, [refreshTargets]);
  const list = raidTargets;
  return (
    <div className="absolute inset-0 z-30 flex items-end bg-ink/55 md:items-center md:justify-center">
      <div className="panel w-full max-h-[82dvh] overflow-y-auto rounded-t-xl p-4 md:max-w-lg md:rounded-xl">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg">Condados vizinhos</h2>
            <p className="text-xs text-parchment-dim">
              Nv.{countyLevel} · só ±1 nível · {DAILY_ATTACK_CAP} ataques/dia
              {Date.now() < shieldUntil ? " · escudo ativo" : ""}
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
            Guerra: {war?.foeName}. Máx. {WAR_ATTACK_CAP} ataques por base, só nesta guerra.
          </p>
        )}
        <div className="space-y-2">
          {list.map((l) => {
            const usedWar = war?.attacks[l.id] ?? 0;
            const rec = attacksByTarget[l.id];
            const usedDay = rec && rec.day === day ? rec.count : 0;
            const warFoe = warLive && !!war?.foeId && l.allianceId === war.foeId;
            const cap = warFoe ? WAR_ATTACK_CAP : DAILY_ATTACK_CAP;
            const used = warFoe ? Math.max(usedWar, usedDay) : usedDay;
            const shielded = (l.shieldUntil ?? 0) > Date.now();
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => beginAttack(l)}
                className="flex w-full items-center gap-3 rounded-md border border-line bg-ink-2/60 p-3 text-left"
              >
                <Shield className={`size-5 ${warFoe ? "text-iron" : "text-parchment-dim"}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-display">
                    {l.nick}
                    {l.real ? "" : " · treino"}
                  </p>
                  <p className="text-xs text-parchment-dim">
                    {l.title} · {l.id}
                    {shielded ? " · escudo" : ` · saque até ${l.lootGold} ${GOLD_NAME_PL}`}
                    {warFoe ? ` · guerra ${used}/${cap}` : ` · ${used}/${cap} hoje`}
                  </p>
                </div>
                <ChevronRight className="size-4 text-parchment-dim" />
              </button>
            );
          })}
          {list.length === 0 && (
            <p className="text-sm text-parchment-dim">
              Nenhum condado no teu nível (±1). Pede ao amigo para evoluir ou espera mais senhores.
            </p>
          )}
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
            Escolhe o tipo e toca o mapa: entram todas as tropas desse tipo nas bordas livres.
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
            Toca um grupo e arrasta para enviar. Toca a borda para pôr todas as tropas do tipo escolhido.
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
          {confirm ? (
            <div className="mx-auto mb-2 mt-2 w-[min(92%,22rem)] rounded-md border border-line bg-panel p-3 shadow-panel">
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
              className="mx-auto mt-2 flex h-11 w-[min(90%,18rem)] items-center justify-center gap-2 rounded-md border border-line bg-panel/90 font-display text-sm"
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
            {spectator ? `${GOLD_NAME_PL} perdidas` : `${GOLD_NAME_PL} saqueadas`}: {r.gold} (máx.
            8.400)
          </li>
          {!spectator && <li>Tropas perdidas: {r.casualties}. Vivos: {alive} voltaram.</li>}
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
      .catch(() => setMsg("Não foi possível abrir o ranking."));
  }, []);

  async function onClaim() {
    try {
      const r = await claimWeekly();
      setClaimed(true);
      setMsg(r.toast ?? `Prêmio do ${r.rank}º lugar recolhido.`);
      if (r.save) {
        useGame.setState({
          gold: r.save.gold,
          troopCards: r.save.troopCards,
          generalCards: r.save.generalCards,
        });
        persist({ ...useGame.getState() });
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
        Segunda 8h às domingo 23h de Brasília. Quem mais ganhar estrelas entra no top 20. 20º–8º{" "}
        {GOLD_NAME_PL} (50 mil a 300 mil). 7º–4º: 3 cartas tropa. Top 3: 4 cartas tropa + 2 general.
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
