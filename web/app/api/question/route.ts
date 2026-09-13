import { GameStatus } from "@/lib/config";
import { errorResponse, loadGame, parseAnswers, RequestError } from "@/lib/server/game";
import { QUESTION_BUDGET, nextQuestion } from "@/lib/solver";

type Body = { gameId?: string; answers?: unknown };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Body;
    const answers = parseAnswers(body.answers ?? [], { complete: false });
    const { game, seed, prior } = await loadGame(body.gameId);
    if (game.status !== GameStatus.Open) throw new RequestError("the Seer has already made its guess", 409);

    const question = nextQuestion(seed, answers, prior)!;
    return Response.json({ ...question, total: QUESTION_BUDGET });
  } catch (err) {
    return errorResponse(err);
  }
}
