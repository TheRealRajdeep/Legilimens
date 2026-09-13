// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SeerMatrix} from "./SeerMatrix.sol";

/// @title LegilimensVault
/// @notice Staking game against an occupation-guessing agent. The player commits to a job before play,
///         the agent commits to a seed, and the contract alone decides the outcome at reveal.
///         At reveal the contract also checks that the published answers fit the sealed job, so a player
///         who seals one job and answers as another forfeits instead of draining the pot.
/// @dev Stakes are native USDC on Arc (18 decimals).
contract LegilimensVault {
    enum Status {
        None,
        Open,
        Guessed,
        Settled
    }

    enum Outcome {
        None,
        AgentWin,
        Push,
        PlayerWin,
        Forfeit,
        Refund,
        Inconsistent
    }

    struct Game {
        address player;
        uint96 stake;
        bytes32 jobCommit;
        bytes32 seedCommit;
        bytes32 nullifierHash;
        uint64 startedAt;
        uint64 startBlock;
        uint64 guessedAt;
        uint16 guessCode;
        bytes10 traits;
        bytes10 answers;
        Status status;
    }

    uint256 public constant RAKE_BPS = 500; // agent win: 5% to agent
    uint256 public constant PUSH_REFUND_BPS = 9000; // push: 90% back to player
    uint256 public constant JACKPOT_BPS = 5000; // player win: up to 50% of pot, scaled by answer fit
    uint256 public constant MAX_PLAYS_PER_DAY = 3;
    uint256 public constant GUESS_TIMEOUT = 30 minutes;
    uint256 public constant REVEAL_TIMEOUT = 30 minutes;
    bytes32 public constant MATRIX_HASH = SeerMatrix.MATRIX_HASH;

    address public immutable agent;
    uint256 public immutable stake;

    uint256 public pot;
    uint256 public agentRevenue;
    uint256 public agentOperatingCost;
    uint256 public nextGameId = 1;

    mapping(uint256 => Game) public games;
    mapping(bytes32 => mapping(uint256 => uint256)) public playsOnDay;

    event PotSeeded(address indexed from, uint256 amount, uint256 potAfter);
    event GameStarted(
        uint256 indexed gameId, address indexed player, bytes32 indexed nullifierHash, uint256 stake, uint256 startBlock
    );
    event GuessSubmitted(
        uint256 indexed gameId, uint16 guessCode, bytes32 seed, bytes10 traits, bytes10 answers, uint256 operatingCost
    );
    event Settled(
        uint256 indexed gameId,
        Outcome outcome,
        uint16 jobCode,
        uint16 guessCode,
        uint256 payout,
        uint256 potAfter,
        uint256 agentRevenueAfter,
        int256 fitScore,
        uint256 fitBps
    );

    error WrongStake();
    error SignatureExpired();
    error BadSignature();
    error QuotaExhausted();
    error NotAgent();
    error NotPlayer();
    error WrongStatus();
    error BadSeed();
    error BadCommit();
    error BadTranscript();
    error TooEarly();
    error TooLate();
    error TransferFailed();

    constructor(address agent_, uint256 stake_) {
        agent = agent_;
        stake = stake_;
    }

    receive() external payable {
        seedPot();
    }

    function seedPot() public payable {
        pot += msg.value;
        emit PotSeeded(msg.sender, msg.value, pot);
    }

    /// @notice Escrow the stake and bind the job commitment, the agent's seed commitment and the World ID nullifier.
    /// @param sig Agent signature over (chainid, vault, player, jobCommit, seedCommit, nullifierHash, expiry).
    function startGame(bytes32 jobCommit, bytes32 seedCommit, bytes32 nullifierHash, uint256 expiry, bytes calldata sig)
        external
        payable
        returns (uint256 gameId)
    {
        if (msg.value != stake) revert WrongStake();
        if (block.timestamp > expiry) revert SignatureExpired();

        bytes32 digest = startDigest(msg.sender, jobCommit, seedCommit, nullifierHash, expiry);
        if (_recover(digest, sig) != agent) revert BadSignature();

        uint256 day = block.timestamp / 1 days;
        if (playsOnDay[nullifierHash][day] >= MAX_PLAYS_PER_DAY) revert QuotaExhausted();
        playsOnDay[nullifierHash][day] += 1;

        gameId = nextGameId++;
        games[gameId] = Game({
            player: msg.sender,
            stake: uint96(msg.value),
            jobCommit: jobCommit,
            seedCommit: seedCommit,
            nullifierHash: nullifierHash,
            startedAt: uint64(block.timestamp),
            startBlock: uint64(block.number),
            guessedAt: 0,
            guessCode: 0,
            traits: bytes10(0),
            answers: bytes10(0),
            status: Status.Open
        });

        emit GameStarted(gameId, msg.sender, nullifierHash, msg.value, block.number);
    }

    /// @notice Agent posts its final guess, reveals its seed and publishes the transcript: which trait each question
    ///         asked, and each answer. Anyone can replay the solver from seed + answers to confirm the trait list.
    function submitGuess(
        uint256 gameId,
        uint16 guessCode,
        bytes32 seed,
        bytes10 traits,
        bytes10 answers,
        uint256 operatingCost
    ) external {
        if (msg.sender != agent) revert NotAgent();
        Game storage g = games[gameId];
        if (g.status != Status.Open) revert WrongStatus();
        if (block.timestamp > g.startedAt + GUESS_TIMEOUT) revert TooLate();
        if (keccak256(abi.encode(seed)) != g.seedCommit) revert BadSeed();
        for (uint256 k = 0; k < SeerMatrix.QUESTIONS; k++) {
            if (uint8(traits[k]) >= SeerMatrix.TRAITS || uint8(answers[k]) > 3) revert BadTranscript();
        }

        g.guessCode = guessCode;
        g.traits = traits;
        g.answers = answers;
        g.guessedAt = uint64(block.timestamp);
        g.status = Status.Guessed;
        agentOperatingCost += operatingCost;

        emit GuessSubmitted(gameId, guessCode, seed, traits, answers, operatingCost);
    }

    /// @notice Player opens the seal. The contract compares codes, checks the answers fit the sealed job,
    ///         and settles atomically.
    function reveal(uint256 gameId, uint16 jobCode, bytes32 salt) external {
        Game storage g = games[gameId];
        if (msg.sender != g.player) revert NotPlayer();
        if (g.status != Status.Guessed) revert WrongStatus();
        if (block.timestamp > g.guessedAt + REVEAL_TIMEOUT) revert TooLate();
        if (keccak256(abi.encode(jobCode, salt)) != g.jobCommit) revert BadCommit();

        g.status = Status.Settled;
        uint256 s = g.stake;

        if (g.guessCode == jobCode) {
            uint256 rake = (s * RAKE_BPS) / 10_000;
            pot += s - rake;
            agentRevenue += rake;
            _pay(agent, rake);
            emit Settled(gameId, Outcome.AgentWin, jobCode, g.guessCode, 0, pot, agentRevenue, 0, 10_000);
            return;
        }

        // Only a player who would get money back needs policing: check the transcript fits the sealed job.
        (int256 score, uint256 bps, bool voided) = fit(jobCode, g.traits, g.answers);
        if (voided) {
            pot += s;
            emit Settled(gameId, Outcome.Inconsistent, jobCode, g.guessCode, 0, pot, agentRevenue, score, 0);
        } else if (g.guessCode / 10 == jobCode / 10) {
            uint256 refundAmount = (s * PUSH_REFUND_BPS) / 10_000;
            pot += s - refundAmount;
            _pay(g.player, refundAmount);
            emit Settled(gameId, Outcome.Push, jobCode, g.guessCode, refundAmount, pot, agentRevenue, score, bps);
        } else {
            uint256 prize = (pot * JACKPOT_BPS * bps) / 100_000_000;
            pot -= prize;
            _pay(g.player, s + prize);
            emit Settled(gameId, Outcome.PlayerWin, jobCode, g.guessCode, s + prize, pot, agentRevenue, score, bps);
        }
    }

    /// @notice How well a transcript fits a job: log-likelihood of the answers under that job minus the best-fitting
    ///         job's, in milli-nats (0 = best fit). Mirrors consistency() in web/lib/solver.ts.
    /// @return score  fit score, <= 0
    /// @return bps    share of the prize kept, 10000 = full
    /// @return forfeit true when the answers contradict the job, or the job is not in the Seer's ledger
    function fit(uint16 jobCode, bytes10 traits, bytes10 answers)
        public
        pure
        returns (int256 score, uint256 bps, bool forfeit)
    {
        (bool known, uint256 row) = SeerMatrix.rowOf(jobCode);
        if (!known) return (type(int256).min, 0, true);

        bytes memory digits = SeerMatrix.DIGITS;
        bytes memory table = SeerMatrix.LOGLIK;
        int256 best = type(int256).min;
        int256 sealedScore;
        for (uint256 j = 0; j < SeerMatrix.JOBS; j++) {
            int256 sum = _logLikelihood(digits, table, j, traits, answers);
            if (sum > best) best = sum;
            if (j == row) sealedScore = sum;
        }

        score = sealedScore - best;
        if (score < SeerMatrix.FIT_FORFEIT) return (score, 0, true);
        if (score >= SeerMatrix.FIT_FULL) return (score, 10_000, false);
        bps = uint256((score - SeerMatrix.FIT_FORFEIT) * 10_000 / (SeerMatrix.FIT_FULL - SeerMatrix.FIT_FORFEIT));
        return (score, bps, false);
    }

    function _logLikelihood(bytes memory digits, bytes memory table, uint256 row, bytes10 traits, bytes10 answers)
        private
        pure
        returns (int256 sum)
    {
        uint256 base = row * SeerMatrix.TRAITS;
        for (uint256 k = 0; k < SeerMatrix.QUESTIONS; k++) {
            sum += SeerMatrix.logLik(table, uint8(answers[k]), uint8(digits[base + uint8(traits[k])]));
        }
    }

    /// @notice Player never revealed after the guess: the stake goes to the pot.
    function forfeit(uint256 gameId) external {
        Game storage g = games[gameId];
        if (g.status != Status.Guessed) revert WrongStatus();
        if (block.timestamp <= g.guessedAt + REVEAL_TIMEOUT) revert TooEarly();

        g.status = Status.Settled;
        pot += g.stake;
        emit Settled(gameId, Outcome.Forfeit, 0, g.guessCode, 0, pot, agentRevenue, 0, 0);
    }

    /// @notice Agent never guessed: the player gets the stake back.
    function refund(uint256 gameId) external {
        Game storage g = games[gameId];
        if (g.status != Status.Open) revert WrongStatus();
        if (block.timestamp <= g.startedAt + GUESS_TIMEOUT) revert TooEarly();

        g.status = Status.Settled;
        _pay(g.player, g.stake);
        emit Settled(gameId, Outcome.Refund, 0, 0, g.stake, pot, agentRevenue, 0, 0);
    }

    function startDigest(address player, bytes32 jobCommit, bytes32 seedCommit, bytes32 nullifierHash, uint256 expiry)
        public
        view
        returns (bytes32)
    {
        bytes32 inner =
            keccak256(abi.encode(block.chainid, address(this), player, jobCommit, seedCommit, nullifierHash, expiry));
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", inner));
    }

    function playsToday(bytes32 nullifierHash) external view returns (uint256) {
        return playsOnDay[nullifierHash][block.timestamp / 1 days];
    }

    function _pay(address to, uint256 amount) private {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _recover(bytes32 digest, bytes calldata sig) private pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (v < 27) v += 27;
        // Reject malleable signatures (upper-half s).
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        return ecrecover(digest, v, r, s);
    }
}
