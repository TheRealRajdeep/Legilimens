// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {LegilimensVault} from "../src/LegilimensVault.sol";

contract LegilimensVaultTest is Test {
    LegilimensVault vault;

    uint256 agentKey = 0xA11CE;
    address agent;
    address player = makeAddr("player");
    address stranger = makeAddr("stranger");

    uint256 constant STAKE = 1 ether;
    uint256 constant SEED_POT = 5 ether;

    bytes32 constant NULLIFIER = keccak256("player-1");
    bytes32 constant SALT = keccak256("salt");
    bytes32 constant SEED = keccak256("seed");

    uint16 constant SOFTWARE_DEV = 2512;
    uint16 constant WEB_DEV = 2513; // same 251 family
    uint16 constant NURSE = 2221;

    // Transcript fixtures produced by consistency() in web/lib/solver.ts (see the fit tests for the exact scores).
    bytes10 constant TRAITS = bytes10(0x00010203040506070809);
    bytes10 constant HONEST_NURSE = bytes10(0x00000303030303000000); // score -373, full prize
    bytes10 constant HONEST_SOFTWARE_DEV = bytes10(0x03000003000000000300);
    bytes10 constant HONEST_WEB_DEV = bytes10(0x03000003000000000303);
    bytes10 constant PARTIAL_NURSE = bytes10(0x03030003030303000000); // score -4822, 2945 bps
    bytes10 constant LIAR_AS_SOFTWARE_DEV = HONEST_SOFTWARE_DEV; // sealed nurse: score -13045, forfeit

    function setUp() public {
        vm.warp(1_800_000_000);
        agent = vm.addr(agentKey);
        vault = new LegilimensVault(agent, STAKE);
        vm.deal(address(this), 100 ether);
        vm.deal(player, 100 ether);
        vault.seedPot{value: SEED_POT}();
    }

    // --- helpers ---

    function _jobCommit(uint16 code, bytes32 salt) internal pure returns (bytes32) {
        return keccak256(abi.encode(code, salt));
    }

    function _seedCommit(bytes32 seed) internal pure returns (bytes32) {
        return keccak256(abi.encode(seed));
    }

    function _sign(uint256 key, address who, bytes32 jobCommit, bytes32 seedCommit, bytes32 nullifier, uint256 expiry)
        internal
        view
        returns (bytes memory)
    {
        bytes32 digest = vault.startDigest(who, jobCommit, seedCommit, nullifier, expiry);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, digest);
        return abi.encodePacked(r, s, v);
    }

    function _start(uint16 jobCode) internal returns (uint256 gameId) {
        bytes32 jc = _jobCommit(jobCode, SALT);
        bytes32 sc = _seedCommit(SEED);
        uint256 expiry = block.timestamp + 10 minutes;
        bytes memory sig = _sign(agentKey, player, jc, sc, NULLIFIER, expiry);
        vm.prank(player);
        gameId = vault.startGame{value: STAKE}(jc, sc, NULLIFIER, expiry, sig);
    }

    function _guess(uint256 gameId, uint16 guessCode, bytes10 answers) internal {
        vm.prank(agent);
        vault.submitGuess(gameId, guessCode, SEED, TRAITS, answers, 0.001 ether);
    }

    function _play(uint16 sealedCode, uint16 guessCode, bytes10 answers) internal returns (uint256 id) {
        id = _start(sealedCode);
        _guess(id, guessCode, answers);
        vm.prank(player);
        vault.reveal(id, sealedCode, SALT);
    }

    // --- outcomes ---

    function test_AgentWin() public {
        uint256 playerBefore = player.balance;
        _play(SOFTWARE_DEV, SOFTWARE_DEV, HONEST_SOFTWARE_DEV);

        uint256 rake = STAKE * 500 / 10_000;
        assertEq(agent.balance, rake, "agent rake");
        assertEq(vault.agentRevenue(), rake);
        assertEq(vault.pot(), SEED_POT + STAKE - rake, "pot grows");
        assertEq(player.balance, playerBefore - STAKE, "player loses stake");
        assertEq(address(vault).balance, vault.pot(), "solvent");
        assertEq(vault.agentOperatingCost(), 0.001 ether);
    }

    function test_Push() public {
        uint256 playerBefore = player.balance;
        _play(WEB_DEV, SOFTWARE_DEV, HONEST_WEB_DEV);

        uint256 refunded = STAKE * 9000 / 10_000;
        assertEq(player.balance, playerBefore - STAKE + refunded);
        assertEq(vault.pot(), SEED_POT + STAKE - refunded);
        assertEq(address(vault).balance, vault.pot(), "solvent");
    }

    function test_PlayerWinHonestGetsFullPrize() public {
        uint256 playerBefore = player.balance;
        _play(NURSE, SOFTWARE_DEV, HONEST_NURSE);

        uint256 prize = SEED_POT / 2;
        assertEq(player.balance, playerBefore + prize, "stake back + half the pot");
        assertEq(vault.pot(), SEED_POT - prize);
        assertEq(address(vault).balance, vault.pot(), "solvent");
    }

    function test_PlayerWinPartialFitGetsScaledPrize() public {
        uint256 playerBefore = player.balance;
        _play(NURSE, SOFTWARE_DEV, PARTIAL_NURSE);

        uint256 prize = SEED_POT * 5000 * 2945 / 100_000_000;
        assertEq(player.balance, playerBefore + prize, "prize scaled by fit");
        assertEq(vault.pot(), SEED_POT - prize);
        assertEq(address(vault).balance, vault.pot(), "solvent");
    }

    // --- lying is caught ---

    function test_LiarForfeitsInsteadOfWinning() public {
        uint256 playerBefore = player.balance;
        uint256 id = _start(NURSE);
        _guess(id, SOFTWARE_DEV, LIAR_AS_SOFTWARE_DEV);

        vm.expectEmit(true, false, false, true, address(vault));
        emit LegilimensVault.Settled(
            id, LegilimensVault.Outcome.Inconsistent, NURSE, SOFTWARE_DEV, 0, SEED_POT + STAKE, 0, -13045, 0
        );
        vm.prank(player);
        vault.reveal(id, NURSE, SALT);

        assertEq(player.balance, playerBefore - STAKE, "liar loses stake");
        assertEq(vault.pot(), SEED_POT + STAKE, "stake goes to pot, nothing paid out");
        assertEq(address(vault).balance, vault.pot(), "solvent");
    }

    function test_LiarAimingForPushAlsoForfeits() public {
        uint256 playerBefore = player.balance;
        _play(WEB_DEV, SOFTWARE_DEV, HONEST_NURSE); // sealed web dev, answered as a nurse
        assertEq(player.balance, playerBefore - STAKE);
        assertEq(vault.pot(), SEED_POT + STAKE);
    }

    function test_UnknownJobCodeForfeits() public {
        uint256 playerBefore = player.balance;
        _play(9999, SOFTWARE_DEV, HONEST_NURSE); // a trade the Seer could never name
        assertEq(player.balance, playerBefore - STAKE, "sealing an unlisted code can't guarantee a win");
        assertEq(vault.pot(), SEED_POT + STAKE);
    }

    /// Scores must match web/lib/solver.ts consistency() exactly — the solver and contract share one model.
    function test_FitMatchesSolverScores() public view {
        (int256 s1, uint256 b1, bool f1) = vault.fit(NURSE, TRAITS, HONEST_NURSE);
        assertEq(s1, -373);
        assertEq(b1, 10_000);
        assertFalse(f1);

        (int256 s2, uint256 b2, bool f2) = vault.fit(NURSE, TRAITS, PARTIAL_NURSE);
        assertEq(s2, -4822);
        assertEq(b2, 2945);
        assertFalse(f2);

        (int256 s3, uint256 b3, bool f3) = vault.fit(NURSE, TRAITS, LIAR_AS_SOFTWARE_DEV);
        assertEq(s3, -13045);
        assertEq(b3, 0);
        assertTrue(f3);

        (int256 s4,, bool f4) = vault.fit(5411, TRAITS, bytes10(0x00030300030303000000)); // honest firefighter: best fit
        assertEq(s4, 0);
        assertFalse(f4);

        (,, bool f5) = vault.fit(9999, TRAITS, HONEST_NURSE);
        assertTrue(f5);
    }

    function test_Forfeit() public {
        uint256 id = _start(NURSE);
        _guess(id, SOFTWARE_DEV, HONEST_NURSE);

        vm.expectRevert(LegilimensVault.TooEarly.selector);
        vault.forfeit(id);

        vm.warp(block.timestamp + 31 minutes);
        vm.prank(stranger);
        vault.forfeit(id);
        assertEq(vault.pot(), SEED_POT + STAKE);

        vm.prank(player);
        vm.expectRevert(LegilimensVault.WrongStatus.selector);
        vault.reveal(id, NURSE, SALT);
    }

    function test_Refund() public {
        uint256 id = _start(NURSE);

        vm.expectRevert(LegilimensVault.TooEarly.selector);
        vault.refund(id);

        vm.warp(block.timestamp + 31 minutes);
        uint256 playerBefore = player.balance;
        vault.refund(id);
        assertEq(player.balance, playerBefore + STAKE);
        assertEq(vault.pot(), SEED_POT);

        vm.prank(agent);
        vm.expectRevert(LegilimensVault.WrongStatus.selector);
        vault.submitGuess(id, NURSE, SEED, TRAITS, HONEST_NURSE, 0);
    }

    // --- reverts ---

    function test_RevertBadTranscript() public {
        uint256 id = _start(NURSE);
        vm.startPrank(agent);
        vm.expectRevert(LegilimensVault.BadTranscript.selector);
        vault.submitGuess(id, NURSE, SEED, bytes10(0x18010203040506070809), HONEST_NURSE, 0); // trait 24 out of range
        vm.expectRevert(LegilimensVault.BadTranscript.selector);
        vault.submitGuess(id, NURSE, SEED, TRAITS, bytes10(0x04000303030303000000), 0); // answer 4 out of range
        vm.stopPrank();
    }

    function test_RevertBadSalt() public {
        uint256 id = _start(NURSE);
        _guess(id, SOFTWARE_DEV, HONEST_NURSE);
        vm.prank(player);
        vm.expectRevert(LegilimensVault.BadCommit.selector);
        vault.reveal(id, NURSE, keccak256("wrong"));
    }

    function test_RevertChangedJobAtReveal() public {
        uint256 id = _start(NURSE);
        _guess(id, SOFTWARE_DEV, HONEST_NURSE);
        vm.prank(player);
        vm.expectRevert(LegilimensVault.BadCommit.selector);
        vault.reveal(id, 9112, SALT);
    }

    function test_RevertBadSeed() public {
        uint256 id = _start(NURSE);
        vm.prank(agent);
        vm.expectRevert(LegilimensVault.BadSeed.selector);
        vault.submitGuess(id, NURSE, keccak256("other"), TRAITS, HONEST_NURSE, 0);
    }

    function test_RevertBadSignature() public {
        bytes32 jc = _jobCommit(NURSE, SALT);
        bytes32 sc = _seedCommit(SEED);
        uint256 expiry = block.timestamp + 10 minutes;
        bytes memory sig = _sign(0xBAD, player, jc, sc, NULLIFIER, expiry);
        vm.prank(player);
        vm.expectRevert(LegilimensVault.BadSignature.selector);
        vault.startGame{value: STAKE}(jc, sc, NULLIFIER, expiry, sig);
    }

    function test_RevertSignatureForOtherPlayer() public {
        bytes32 jc = _jobCommit(NURSE, SALT);
        bytes32 sc = _seedCommit(SEED);
        uint256 expiry = block.timestamp + 10 minutes;
        bytes memory sig = _sign(agentKey, player, jc, sc, NULLIFIER, expiry);
        vm.deal(stranger, 10 ether);
        vm.prank(stranger);
        vm.expectRevert(LegilimensVault.BadSignature.selector);
        vault.startGame{value: STAKE}(jc, sc, NULLIFIER, expiry, sig);
    }

    function test_RevertExpiredSignature() public {
        bytes32 jc = _jobCommit(NURSE, SALT);
        bytes32 sc = _seedCommit(SEED);
        uint256 expiry = block.timestamp + 10 minutes;
        bytes memory sig = _sign(agentKey, player, jc, sc, NULLIFIER, expiry);
        vm.warp(expiry + 1);
        vm.prank(player);
        vm.expectRevert(LegilimensVault.SignatureExpired.selector);
        vault.startGame{value: STAKE}(jc, sc, NULLIFIER, expiry, sig);
    }

    function test_RevertWrongStake() public {
        bytes32 jc = _jobCommit(NURSE, SALT);
        bytes32 sc = _seedCommit(SEED);
        uint256 expiry = block.timestamp + 10 minutes;
        bytes memory sig = _sign(agentKey, player, jc, sc, NULLIFIER, expiry);
        vm.prank(player);
        vm.expectRevert(LegilimensVault.WrongStake.selector);
        vault.startGame{value: STAKE / 2}(jc, sc, NULLIFIER, expiry, sig);
    }

    function test_QuotaPerPlayerPerDay() public {
        _start(NURSE);
        _start(NURSE);
        _start(NURSE);
        assertEq(vault.playsToday(NULLIFIER), 3);

        bytes32 jc = _jobCommit(NURSE, SALT);
        bytes32 sc = _seedCommit(SEED);
        uint256 expiry = block.timestamp + 10 minutes;
        bytes memory sig = _sign(agentKey, player, jc, sc, NULLIFIER, expiry);
        vm.prank(player);
        vm.expectRevert(LegilimensVault.QuotaExhausted.selector);
        vault.startGame{value: STAKE}(jc, sc, NULLIFIER, expiry, sig);

        vm.warp(block.timestamp + 1 days);
        _start(NURSE); // new day, quota resets
    }

    function test_RevertNonAgentGuess() public {
        uint256 id = _start(NURSE);
        vm.prank(stranger);
        vm.expectRevert(LegilimensVault.NotAgent.selector);
        vault.submitGuess(id, NURSE, SEED, TRAITS, HONEST_NURSE, 0);
    }

    function test_RevertRevealBeforeGuess() public {
        uint256 id = _start(NURSE);
        vm.prank(player);
        vm.expectRevert(LegilimensVault.WrongStatus.selector);
        vault.reveal(id, NURSE, SALT);
    }

    function test_RevertDoubleGuess() public {
        uint256 id = _start(NURSE);
        _guess(id, SOFTWARE_DEV, HONEST_NURSE);
        vm.prank(agent);
        vm.expectRevert(LegilimensVault.WrongStatus.selector);
        vault.submitGuess(id, NURSE, SEED, TRAITS, HONEST_NURSE, 0);
    }

    function test_RevertRevealByStranger() public {
        uint256 id = _start(NURSE);
        _guess(id, SOFTWARE_DEV, HONEST_NURSE);
        vm.prank(stranger);
        vm.expectRevert(LegilimensVault.NotPlayer.selector);
        vault.reveal(id, NURSE, SALT);
    }

    function test_RevertLateReveal() public {
        uint256 id = _start(NURSE);
        _guess(id, SOFTWARE_DEV, HONEST_NURSE);
        vm.warp(block.timestamp + 31 minutes);
        vm.prank(player);
        vm.expectRevert(LegilimensVault.TooLate.selector);
        vault.reveal(id, NURSE, SALT);
    }

    function test_RevertLateGuess() public {
        uint256 id = _start(NURSE);
        vm.warp(block.timestamp + 31 minutes);
        vm.prank(agent);
        vm.expectRevert(LegilimensVault.TooLate.selector);
        vault.submitGuess(id, NURSE, SEED, TRAITS, HONEST_NURSE, 0);
    }

    /// Pot can never pay out more than it holds, across a mixed sequence of honest, partial and lying games.
    function test_SolvencyAcrossManyGames() public {
        uint16[3] memory jobs = [SOFTWARE_DEV, WEB_DEV, NURSE];
        bytes10[4] memory transcripts = [HONEST_NURSE, PARTIAL_NURSE, LIAR_AS_SOFTWARE_DEV, HONEST_WEB_DEV];
        uint256 t0 = block.timestamp;
        for (uint256 i = 0; i < 40; i++) {
            vm.warp(t0 + (i + 1) * 1 days); // absolute: via-IR caches block.timestamp across relative warps
            _play(jobs[i % 3], SOFTWARE_DEV, transcripts[i % 4]);
            assertEq(address(vault).balance, vault.pot(), "vault balance == pot");
        }
    }

    function test_RevealGasIsReasonable() public {
        uint256 id = _start(NURSE);
        _guess(id, SOFTWARE_DEV, HONEST_NURSE);
        vm.prank(player);
        uint256 before = gasleft();
        vault.reveal(id, NURSE, SALT);
        assertLt(before - gasleft(), 600_000, "consistency check stays affordable (~0.02 USDC at 42 gwei)");
    }
}
