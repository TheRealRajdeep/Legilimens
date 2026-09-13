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

    bytes32 constant NULLIFIER = keccak256("human-1");
    bytes32 constant SALT = keccak256("salt");
    bytes32 constant SEED = keccak256("seed");
    bytes10 constant ANSWERS = bytes10(0x03020100030201000302);

    uint16 constant SOFTWARE_DEV = 2512;
    uint16 constant WEB_DEV = 2513; // same 251 family
    uint16 constant NURSE = 2221;

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

    function _guess(uint256 gameId, uint16 guessCode) internal {
        vm.prank(agent);
        vault.submitGuess(gameId, guessCode, SEED, ANSWERS, 0.001 ether);
    }

    // --- outcomes ---

    function test_AgentWin() public {
        uint256 id = _start(SOFTWARE_DEV);
        _guess(id, SOFTWARE_DEV);

        uint256 playerBefore = player.balance;
        vm.prank(player);
        vault.reveal(id, SOFTWARE_DEV, SALT);

        uint256 rake = STAKE * 500 / 10_000;
        assertEq(agent.balance, rake, "agent rake");
        assertEq(vault.agentRevenue(), rake);
        assertEq(vault.pot(), SEED_POT + STAKE - rake, "pot grows");
        assertEq(player.balance, playerBefore, "player gets nothing");
        assertEq(address(vault).balance, vault.pot(), "solvent");
        assertEq(vault.agentOperatingCost(), 0.001 ether);
    }

    function test_Push() public {
        uint256 id = _start(WEB_DEV);
        _guess(id, SOFTWARE_DEV);

        uint256 playerBefore = player.balance;
        vm.prank(player);
        vault.reveal(id, WEB_DEV, SALT);

        uint256 refunded = STAKE * 9000 / 10_000;
        assertEq(player.balance, playerBefore + refunded);
        assertEq(vault.pot(), SEED_POT + STAKE - refunded);
        assertEq(address(vault).balance, vault.pot(), "solvent");
    }

    function test_PlayerWin() public {
        uint256 id = _start(NURSE);
        _guess(id, SOFTWARE_DEV);

        uint256 playerBefore = player.balance;
        vm.prank(player);
        vault.reveal(id, NURSE, SALT);

        uint256 prize = SEED_POT / 2;
        assertEq(player.balance, playerBefore + STAKE + prize);
        assertEq(vault.pot(), SEED_POT - prize);
        assertEq(address(vault).balance, vault.pot(), "solvent");
    }

    function test_Forfeit() public {
        uint256 id = _start(NURSE);
        _guess(id, SOFTWARE_DEV);

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
        vault.submitGuess(id, NURSE, SEED, ANSWERS, 0);
    }

    // --- reverts ---

    function test_RevertBadSalt() public {
        uint256 id = _start(NURSE);
        _guess(id, SOFTWARE_DEV);
        vm.prank(player);
        vm.expectRevert(LegilimensVault.BadCommit.selector);
        vault.reveal(id, NURSE, keccak256("wrong"));
    }

    function test_RevertChangedJobAtReveal() public {
        uint256 id = _start(NURSE);
        _guess(id, SOFTWARE_DEV);
        vm.prank(player);
        vm.expectRevert(LegilimensVault.BadCommit.selector);
        vault.reveal(id, 9112, SALT);
    }

    function test_RevertBadSeed() public {
        uint256 id = _start(NURSE);
        vm.prank(agent);
        vm.expectRevert(LegilimensVault.BadSeed.selector);
        vault.submitGuess(id, NURSE, keccak256("other"), ANSWERS, 0);
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

    function test_QuotaPerHumanPerDay() public {
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
        vault.submitGuess(id, NURSE, SEED, ANSWERS, 0);
    }

    function test_RevertRevealBeforeGuess() public {
        uint256 id = _start(NURSE);
        vm.prank(player);
        vm.expectRevert(LegilimensVault.WrongStatus.selector);
        vault.reveal(id, NURSE, SALT);
    }

    function test_RevertDoubleGuess() public {
        uint256 id = _start(NURSE);
        _guess(id, SOFTWARE_DEV);
        vm.prank(agent);
        vm.expectRevert(LegilimensVault.WrongStatus.selector);
        vault.submitGuess(id, NURSE, SEED, ANSWERS, 0);
    }

    function test_RevertRevealByStranger() public {
        uint256 id = _start(NURSE);
        _guess(id, SOFTWARE_DEV);
        vm.prank(stranger);
        vm.expectRevert(LegilimensVault.NotPlayer.selector);
        vault.reveal(id, NURSE, SALT);
    }

    function test_RevertLateReveal() public {
        uint256 id = _start(NURSE);
        _guess(id, SOFTWARE_DEV);
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
        vault.submitGuess(id, NURSE, SEED, ANSWERS, 0);
    }

    /// Pot can never pay out more than it holds, across a mixed sequence of outcomes.
    function test_SolvencyAcrossManyGames() public {
        uint16[3] memory jobs = [SOFTWARE_DEV, WEB_DEV, NURSE];
        for (uint256 i = 0; i < 30; i++) {
            vm.warp(block.timestamp + 1 days);
            uint16 job = jobs[i % 3];
            uint256 id = _start(job);
            _guess(id, SOFTWARE_DEV);
            vm.prank(player);
            vault.reveal(id, job, SALT);
            assertEq(address(vault).balance, vault.pot(), "vault balance == pot");
        }
    }
}
