import { vaultAbi } from "@/lib/abi";
import { GameStatus, VAULT_ADDRESS } from "@/lib/config";
import { agentAccount, agentWallet, publicClient } from "@/lib/server/agent";
import { errorResponse, loadGame, parseAnswers, RequestError } from "@/lib/server/game";
import { finalGuess, jobByCode, packAnswers } from "@/lib/solver";

type Body = { gameId?: string; answers?: unknown };

/** The Seer names its guess and publishes seed + transcript on-chain, paying its own gas from its rake wallet. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const answers = parseAnswers(body.answers, { complete: true });
    const { gameId, game, seed, prior } = await loadGame(body.gameId);

    if (game.status === GameStatus.Guessed) {
      // Idempotent: a retried request returns the guess already on-chain.
      const job = jobByCode(game.guessCode);
      return Response.json({ guessCode: game.guessCode, title: job?.title ?? "Unknown", txHash: null, alreadyGuessed: true });
    }
    if (game.status !== GameStatus.Open) throw new RequestError("game is already settled", 409);

    const guess = finalGuess(seed, answers, prior);
    const packed = packAnswers(answers);
    const computeFee = BigInt(process.env.AGENT_COMPUTE_FEE_WEI ?? "0");

    const account = agentAccount();
    const gasEstimate = await publicClient.estimateContractGas({
      account,
      address: VAULT_ADDRESS,
      abi: vaultAbi,
      functionName: "submitGuess",
      args: [gameId, guess.code, seed, packed, computeFee],
    });
    const gasPrice = await publicClient.getGasPrice();
    const operatingCost = gasEstimate * gasPrice + computeFee;

    const txHash = await agentWallet().writeContract({
      address: VAULT_ADDRESS,
      abi: vaultAbi,
      functionName: "submitGuess",
      args: [gameId, guess.code, seed, packed, operatingCost],
      gas: (gasEstimate * 12n) / 10n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") throw new RequestError("the Seer's guess transaction reverted", 502);

    return Response.json({
      guessCode: guess.code,
      title: guess.title,
      confidence: guess.confidence,
      operatingCost: operatingCost.toString(),
      txHash,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
