// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title LegilimensVault
/// @notice Staking game against an occupation-guessing agent. The player commits to a job before play,
///         the agent commits to a seed, and the contract alone decides the outcome at reveal.
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
        Refund
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
        bytes10 answers;
        Status status;
    }

    uint256 public constant RAKE_BPS = 500; // agent win: 5% to agent
    uint256 public constant PUSH_REFUND_BPS = 9000; // push: 90% back to player
    uint256 public constant JACKPOT_BPS = 5000; // player win: 50% of pot
    uint256 public constant MAX_PLAYS_PER_DAY = 3;
    uint256 public constant GUESS_TIMEOUT = 30 minutes;
    uint256 public constant REVEAL_TIMEOUT = 30 minutes;

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
    event GuessSubmitted(uint256 indexed gameId, uint16 guessCode, bytes32 seed, bytes10 answers, uint256 operatingCost);
    event Settled(
        uint256 indexed gameId,
        Outcome outcome,
        uint16 jobCode,
        uint16 guessCode,
        uint256 payout,
        uint256 potAfter,
        uint256 agentRevenueAfter
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
            answers: bytes10(0),
            status: Status.Open
        });

        emit GameStarted(gameId, msg.sender, nullifierHash, msg.value, block.number);
    }

    /// @notice Agent posts its final guess, reveals its seed and publishes the answer transcript.
    function submitGuess(uint256 gameId, uint16 guessCode, bytes32 seed, bytes10 answers, uint256 operatingCost)
        external
    {
        if (msg.sender != agent) revert NotAgent();
        Game storage g = games[gameId];
        if (g.status != Status.Open) revert WrongStatus();
        if (block.timestamp > g.startedAt + GUESS_TIMEOUT) revert TooLate();
        if (keccak256(abi.encode(seed)) != g.seedCommit) revert BadSeed();

        g.guessCode = guessCode;
        g.answers = answers;
        g.guessedAt = uint64(block.timestamp);
        g.status = Status.Guessed;
        agentOperatingCost += operatingCost;

        emit GuessSubmitted(gameId, guessCode, seed, answers, operatingCost);
    }

    /// @notice Player opens the seal. The contract compares codes and settles atomically.
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
            emit Settled(gameId, Outcome.AgentWin, jobCode, g.guessCode, 0, pot, agentRevenue);
        } else if (g.guessCode / 10 == jobCode / 10) {
            uint256 refundAmount = (s * PUSH_REFUND_BPS) / 10_000;
            pot += s - refundAmount;
            _pay(g.player, refundAmount);
            emit Settled(gameId, Outcome.Push, jobCode, g.guessCode, refundAmount, pot, agentRevenue);
        } else {
            uint256 prize = (pot * JACKPOT_BPS) / 10_000;
            pot -= prize;
            _pay(g.player, s + prize);
            emit Settled(gameId, Outcome.PlayerWin, jobCode, g.guessCode, s + prize, pot, agentRevenue);
        }
    }

    /// @notice Player never revealed after the guess: the stake goes to the pot.
    function forfeit(uint256 gameId) external {
        Game storage g = games[gameId];
        if (g.status != Status.Guessed) revert WrongStatus();
        if (block.timestamp <= g.guessedAt + REVEAL_TIMEOUT) revert TooEarly();

        g.status = Status.Settled;
        pot += g.stake;
        emit Settled(gameId, Outcome.Forfeit, 0, g.guessCode, 0, pot, agentRevenue);
    }

    /// @notice Agent never guessed: the player gets the stake back.
    function refund(uint256 gameId) external {
        Game storage g = games[gameId];
        if (g.status != Status.Open) revert WrongStatus();
        if (block.timestamp <= g.startedAt + GUESS_TIMEOUT) revert TooEarly();

        g.status = Status.Settled;
        _pay(g.player, g.stake);
        emit Settled(gameId, Outcome.Refund, 0, 0, g.stake, pot, agentRevenue);
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
