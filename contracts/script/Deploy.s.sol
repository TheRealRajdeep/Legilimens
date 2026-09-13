// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {LegilimensVault} from "../src/LegilimensVault.sol";

/// forge script script/Deploy.s.sol --rpc-url arc_testnet --broadcast --private-key $DEPLOYER_PRIVATE_KEY
/// Env: AGENT_ADDRESS (required), STAKE_WEI (default 1 USDC), POT_SEED_WEI (default 5 USDC)
contract Deploy is Script {
    function run() external {
        address agent = vm.envAddress("AGENT_ADDRESS");
        uint256 stake = vm.envOr("STAKE_WEI", uint256(1 ether));
        uint256 potSeed = vm.envOr("POT_SEED_WEI", uint256(5 ether));

        vm.startBroadcast();
        LegilimensVault vault = new LegilimensVault(agent, stake);
        if (potSeed > 0) vault.seedPot{value: potSeed}();
        vm.stopBroadcast();

        console.log("LegilimensVault:", address(vault));
        console.log("startBlock:", block.number);
    }
}
