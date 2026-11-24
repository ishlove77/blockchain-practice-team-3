// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {WhiskyProvenance} from "../src/WhiskyProvenance.sol";

contract WhiskyProvenanceTest is Test {
    WhiskyProvenance wp;

    address distillery = makeAddr("distillery");
    address warehouse = makeAddr("warehouse");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 tagKey = 0xA11CE;
    address tag;

    function setUp() public {
        wp = new WhiskyProvenance();
        wp.setParticipant(distillery, WhiskyProvenance.Role.Distillery, "Highland Distillery");
        wp.setParticipant(warehouse, WhiskyProvenance.Role.Warehouse, "Edinburgh Bonded Warehouse");
        tag = vm.addr(tagKey);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function _register() internal returns (uint256) {
        vm.prank(distillery);
        return wp.registerBottle(
            WhiskyProvenance.BottleInput("Highland Reserve 30", "Highland Distillery", 1995, 30, "Sherry", "HR30-001", tag)
        );
    }

    function _sign(uint256 key, bytes32 digest) internal pure returns (bytes memory) {
        bytes32 h = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, h);
        return abi.encodePacked(r, s, v);
    }

    function test_RegisterSetsOwnerAndTag() public {
        uint256 id = _register();
        WhiskyProvenance.Bottle memory b = wp.getBottle(id);
        assertEq(b.owner, distillery);
        assertEq(b.tag, tag);
        assertEq(wp.bottleOfTag(tag), id);
        assertEq(wp.historyLength(id), 1);
    }

    function test_OnlyDistilleryCanRegister() public {
        vm.prank(alice);
        vm.expectRevert(WhiskyProvenance.NotDistillery.selector);
        wp.registerBottle(WhiskyProvenance.BottleInput("x", "x", 1, 1, "x", "x", tag));
    }

    function test_TagCannotBeReused() public {
        _register();
        vm.prank(distillery);
        vm.expectRevert(WhiskyProvenance.TagAlreadyUsed.selector);
        wp.registerBottle(WhiskyProvenance.BottleInput("y", "y", 1, 1, "y", "y", tag));
    }

    function test_StorageFlow() public {
        uint256 id = _register();
        vm.prank(distillery);
        wp.consign(id, warehouse);

        vm.prank(alice);
        vm.expectRevert(WhiskyProvenance.NotConsignedToYou.selector);
        wp.checkIn(id, "Rack A");

        vm.startPrank(warehouse);
        wp.checkIn(id, "Rack A-3");
        wp.logEnvironment(id, 145, 65, "routine");
        wp.checkOut(id, "returned");
        vm.stopPrank();

        WhiskyProvenance.Record[] memory h = wp.getHistory(id);
        assertEq(h.length, 5);
        assertEq(uint8(h[3].kind), uint8(WhiskyProvenance.RecordKind.Environment));
        assertEq(h[3].temperatureX10, 145);
        assertEq(h[3].humidity, 65);
        assertEq(wp.getBottle(id).custodian, address(0));
    }

    function test_OnlyCustodianLogsEnvironment() public {
        uint256 id = _register();
        vm.prank(warehouse);
        vm.expectRevert(WhiskyProvenance.NotCustodian.selector);
        wp.logEnvironment(id, 150, 60, "");
    }

    function test_SaleTransfersOwnershipAndPays() public {
        uint256 id = _register();
        vm.prank(distillery);
        wp.list(id, 3 ether);

        vm.prank(alice);
        vm.expectRevert(WhiskyProvenance.WrongPrice.selector);
        wp.buy{value: 1 ether}(id);

        vm.prank(alice);
        wp.buy{value: 3 ether}(id);

        WhiskyProvenance.Bottle memory b = wp.getBottle(id);
        assertEq(b.owner, alice);
        assertFalse(b.forSale);
        assertEq(distillery.balance, 3 ether);

        WhiskyProvenance.Record[] memory h = wp.getHistory(id);
        WhiskyProvenance.Record memory last = h[h.length - 1];
        assertEq(uint8(last.kind), uint8(WhiskyProvenance.RecordKind.Sold));
        assertEq(last.actor, distillery);
        assertEq(last.counterparty, alice);
        assertEq(last.amount, 3 ether);
    }

    function test_SaleWhileInStorageKeepsCustodian() public {
        uint256 id = _register();
        vm.prank(distillery);
        wp.consign(id, warehouse);
        vm.prank(warehouse);
        wp.checkIn(id, "Vault 1");
        vm.prank(distillery);
        wp.list(id, 1 ether);
        vm.prank(alice);
        wp.buy{value: 1 ether}(id);
        assertEq(wp.getBottle(id).custodian, warehouse);
        assertEq(wp.getBottle(id).owner, alice);
    }

    function test_NonOwnerCannotListOrTransfer() public {
        uint256 id = _register();
        vm.startPrank(alice);
        vm.expectRevert(WhiskyProvenance.NotOwner.selector);
        wp.list(id, 1 ether);
        vm.expectRevert(WhiskyProvenance.NotOwner.selector);
        wp.transfer(id, bob);
        vm.stopPrank();
    }

    function test_ReportOpenedWithTagSignature() public {
        uint256 id = _register();
        vm.prank(distillery);
        wp.list(id, 1 ether);

        bytes memory sig = _sign(tagKey, wp.openedDigest(id));
        vm.prank(bob); // 누구나 제출 가능
        wp.reportOpened(id, sig);

        WhiskyProvenance.Bottle memory b = wp.getBottle(id);
        assertTrue(b.opened);
        assertFalse(b.forSale); // 개봉되면 판매 목록에서 내려감

        vm.expectRevert(WhiskyProvenance.AlreadyOpened.selector);
        wp.reportOpened(id, sig);
    }

    function test_ForgedOpenSignatureRejected() public {
        uint256 id = _register();
        bytes memory sig = _sign(0xBAD, wp.openedDigest(id));
        vm.expectRevert(WhiskyProvenance.BadSignature.selector);
        wp.reportOpened(id, sig);
    }

    function test_VerifyTagSignature() public {
        uint256 id = _register();
        bytes32 challenge = keccak256("tap-nonce-1");
        assertTrue(wp.verifyTagSignature(id, challenge, _sign(tagKey, challenge)));
        assertFalse(wp.verifyTagSignature(id, challenge, _sign(0xC10E, challenge)));
    }

    function test_OnlyAdminSetsParticipants() public {
        vm.prank(alice);
        vm.expectRevert(WhiskyProvenance.NotAdmin.selector);
        wp.setParticipant(alice, WhiskyProvenance.Role.Distillery, "fake");
    }
}
