import { Address, BigInt } from "@graphprotocol/graph-ts";
import { GameStarted, GuessSubmitted, PotSeeded, Settled } from "../generated/GuessworkerVault/GuessworkerVault";
import { Game, JobStat, Player, Vault } from "../generated/schema";

// Mirrors GuessworkerVault.Outcome
const OUTCOMES = ["None", "AgentWin", "Push", "PlayerWin", "Forfeit", "Refund"];

function loadVault(address: Address): Vault {
  let vault = Vault.load(address);
  if (vault == null) {
    vault = new Vault(address);
    vault.pot = BigInt.zero();
    vault.agentRevenue = BigInt.zero();
    vault.agentOperatingCost = BigInt.zero();
    vault.gamesStarted = 0;
    vault.gamesSettled = 0;
    vault.agentWins = 0;
    vault.pushes = 0;
    vault.playerWins = 0;
    vault.totalPaidOut = BigInt.zero();
  }
  return vault;
}

function loadPlayer(address: Address): Player {
  let player = Player.load(address);
  if (player == null) {
    player = new Player(address);
    player.gamesPlayed = 0;
    player.wins = 0;
    player.pushes = 0;
    player.losses = 0;
    player.totalStaked = BigInt.zero();
    player.totalPaidOut = BigInt.zero();
  }
  return player;
}

function loadJobStat(code: i32): JobStat {
  const id = code.toString();
  let stat = JobStat.load(id);
  if (stat == null) {
    stat = new JobStat(id);
    stat.jobCode = code;
    stat.revealed = 0;
    stat.agentWins = 0;
    stat.pushes = 0;
    stat.playerWins = 0;
  }
  return stat;
}

export function handlePotSeeded(event: PotSeeded): void {
  const vault = loadVault(event.address);
  vault.pot = event.params.potAfter;
  vault.save();
}

export function handleGameStarted(event: GameStarted): void {
  const game = new Game(event.params.gameId.toString());
  game.gameId = event.params.gameId;
  game.player = event.params.player;
  game.nullifierHash = event.params.nullifierHash;
  game.stake = event.params.stake;
  game.status = "Open";
  game.outcome = "None";
  game.startBlock = event.params.startBlock;
  game.startedAt = event.block.timestamp;
  game.startTx = event.transaction.hash;
  game.save();

  const player = loadPlayer(event.params.player);
  player.gamesPlayed += 1;
  player.totalStaked = player.totalStaked.plus(event.params.stake);
  player.save();

  const vault = loadVault(event.address);
  vault.gamesStarted += 1;
  vault.save();
}

export function handleGuessSubmitted(event: GuessSubmitted): void {
  const game = Game.load(event.params.gameId.toString());
  if (game == null) return;
  game.status = "Guessed";
  game.guessCode = event.params.guessCode;
  game.seed = event.params.seed;
  game.answers = event.params.answers;
  game.operatingCost = event.params.operatingCost;
  game.guessedAt = event.block.timestamp;
  game.guessTx = event.transaction.hash;
  game.save();

  const vault = loadVault(event.address);
  vault.agentOperatingCost = vault.agentOperatingCost.plus(event.params.operatingCost);
  vault.save();
}

export function handleSettled(event: Settled): void {
  const game = Game.load(event.params.gameId.toString());
  if (game == null) return;

  const outcomeIndex = event.params.outcome as i32;
  const outcome = outcomeIndex < OUTCOMES.length ? OUTCOMES[outcomeIndex] : "None";
  game.status = "Settled";
  game.outcome = outcome;
  game.jobCode = event.params.jobCode;
  game.payout = event.params.payout;
  game.potAfter = event.params.potAfter;
  game.settledBlock = event.block.number;
  game.settledAt = event.block.timestamp;
  game.settleTx = event.transaction.hash;
  game.save();

  const vault = loadVault(event.address);
  vault.pot = event.params.potAfter;
  vault.agentRevenue = event.params.agentRevenueAfter;
  vault.gamesSettled += 1;
  vault.totalPaidOut = vault.totalPaidOut.plus(event.params.payout);

  const player = loadPlayer(Address.fromBytes(game.player));
  player.totalPaidOut = player.totalPaidOut.plus(event.params.payout);

  if (outcome == "AgentWin" || outcome == "Push" || outcome == "PlayerWin") {
    const stat = loadJobStat(event.params.jobCode as i32);
    stat.revealed += 1;
    if (outcome == "AgentWin") {
      stat.agentWins += 1;
      vault.agentWins += 1;
      player.losses += 1;
    } else if (outcome == "Push") {
      stat.pushes += 1;
      vault.pushes += 1;
      player.pushes += 1;
    } else {
      stat.playerWins += 1;
      vault.playerWins += 1;
      player.wins += 1;
    }
    stat.save();
  }

  vault.save();
  player.save();
}
