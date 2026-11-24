// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title WhiskyProvenance
/// @notice 고가 위스키 한 병의 출고·보관·거래 이력을 온체인에 남긴다.
///         - 병에는 NFC 봉인 태그가 붙는다. 칩에는 "ID + 서명키"만 있고, 이력은 전부 여기에 쌓인다.
///         - 태그는 secp256k1 키쌍으로 모델링한다(태그 주소 = 칩 공개키). 태그 서명은 복제할 수 없다.
///         - 캡을 열면 태그가 "개봉됨" 메시지에 서명하고, 누구나 그 서명을 제출해 개봉을 기록할 수 있다.
contract WhiskyProvenance {
    // ─────────────────────────────── types ───────────────────────────────
    enum Role {
        None,
        Distillery,
        Warehouse
    }

    enum RecordKind {
        Registered, // 0 증류소 출고 (NFC 태그 부착 + 등록)
        Consigned, // 1 소유자가 보관창고에 위탁 요청
        CheckIn, // 2 창고 입고
        Environment, // 3 보관 환경 기록 (온도·습도)
        CheckOut, // 4 창고 출고 (소유자에게 반환)
        Listed, // 5 판매 등록
        Unlisted, // 6 판매 취소
        Sold, // 7 판매 확정 → 소유권 이전
        Transferred, // 8 양도(무상 이전)
        Opened // 9 봉인 해제 (태그 서명으로 증명)
    }

    struct Bottle {
        uint256 id;
        string name; // 예: "Highland Reserve 30 Year Old"
        string distillery; // 증류소 표기명
        uint16 vintage; // 증류 연도
        uint16 ageYears; // 숙성 연수
        string caskType; // 캐스크 종류
        string serial; // 병 일련번호 (라벨 표기)
        address tag; // NFC 태그 공개키 주소
        address owner; // 현재 소유자
        address custodian; // 현재 보관 창고 (없으면 0)
        address pendingCustodian; // 입고 대기 중인 창고
        bool opened; // 봉인 상태
        bool forSale;
        uint256 price; // wei
        uint64 registeredAt;
        uint64 openedAt;
    }

    struct Record {
        RecordKind kind;
        address actor; // 행위자 (tx 보낸 쪽)
        address counterparty; // 상대방 (구매자, 창고, 수령인 등)
        uint64 timestamp;
        int32 temperatureX10; // 섭씨 × 10 (Environment 전용)
        uint16 humidity; // % (Environment 전용)
        uint256 amount; // 가격 (Listed/Sold 전용)
        string note; // 위치·메모
    }

    struct Participant {
        Role role;
        string name;
    }

    // ─────────────────────────────── storage ─────────────────────────────
    address public admin;
    uint256 public bottleCount;

    mapping(address => Participant) public participants;
    mapping(uint256 => Bottle) private _bottles;
    mapping(uint256 => Record[]) private _history;
    mapping(address => uint256) public bottleOfTag; // 태그 → 병 ID (0 = 미등록)
    mapping(address => uint256[]) private _registeredBy; // 증류소별 등록 병

    // ─────────────────────────────── events ──────────────────────────────
    event ParticipantSet(address indexed account, Role role, string name);
    event BottleRegistered(uint256 indexed id, address indexed distillery, address indexed tag);
    event RecordAdded(uint256 indexed id, RecordKind indexed kind, address indexed actor, uint256 index);
    event OwnershipTransferred(uint256 indexed id, address indexed from, address indexed to, uint256 price);

    // ─────────────────────────────── errors ──────────────────────────────
    error NotAdmin();
    error NotDistillery();
    error NotWarehouse();
    error NotOwner();
    error NotCustodian();
    error UnknownBottle();
    error TagAlreadyUsed();
    error InvalidTag();
    error AlreadyOpened();
    error BadSignature();
    error NotForSale();
    error WrongPrice();
    error InStorage();
    error NotConsignedToYou();
    error InvalidAddress();
    error TransferFailed();

    // ─────────────────────────────── modifiers ───────────────────────────
    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier exists(uint256 id) {
        if (id == 0 || id > bottleCount) revert UnknownBottle();
        _;
    }

    modifier onlyOwnerOf(uint256 id) {
        if (_bottles[id].owner != msg.sender) revert NotOwner();
        _;
    }

    constructor() {
        admin = msg.sender;
    }

    // ─────────────────────────────── admin ───────────────────────────────
    function setParticipant(address account, Role role, string calldata name) external onlyAdmin {
        if (account == address(0)) revert InvalidAddress();
        participants[account] = Participant(role, name);
        emit ParticipantSet(account, role, name);
    }

    // ─────────────────────────────── 1. 증류소 출고 ───────────────────────
    struct BottleInput {
        string name;
        string distillery;
        uint16 vintage;
        uint16 ageYears;
        string caskType;
        string serial;
        address tag;
    }

    /// @notice NFC 봉인 태그를 붙인 병을 등록한다. 등록한 증류소가 첫 소유자가 된다.
    function registerBottle(BottleInput calldata input) external returns (uint256 id) {
        if (participants[msg.sender].role != Role.Distillery) revert NotDistillery();
        if (input.tag == address(0)) revert InvalidTag();
        if (bottleOfTag[input.tag] != 0) revert TagAlreadyUsed();

        id = ++bottleCount;
        Bottle storage b = _bottles[id];
        b.id = id;
        b.name = input.name;
        b.distillery = input.distillery;
        b.vintage = input.vintage;
        b.ageYears = input.ageYears;
        b.caskType = input.caskType;
        b.serial = input.serial;
        b.tag = input.tag;
        b.owner = msg.sender;
        b.registeredAt = uint64(block.timestamp);

        bottleOfTag[input.tag] = id;
        _registeredBy[msg.sender].push(id);

        emit BottleRegistered(id, msg.sender, input.tag);
        _record(id, RecordKind.Registered, address(0), 0, 0, 0, input.serial);
    }

    // ─────────────────────────────── 2. 보관 ─────────────────────────────
    /// @notice 소유자가 병을 특정 창고에 맡긴다. 창고가 checkIn 해야 보관이 시작된다.
    function consign(uint256 id, address warehouse) external exists(id) onlyOwnerOf(id) {
        if (participants[warehouse].role != Role.Warehouse) revert NotWarehouse();
        Bottle storage b = _bottles[id];
        if (b.custodian != address(0)) revert InStorage();
        b.pendingCustodian = warehouse;
        _record(id, RecordKind.Consigned, warehouse, 0, 0, 0, "");
    }

    function checkIn(uint256 id, string calldata location) external exists(id) {
        Bottle storage b = _bottles[id];
        if (b.pendingCustodian != msg.sender) revert NotConsignedToYou();
        b.custodian = msg.sender;
        b.pendingCustodian = address(0);
        _record(id, RecordKind.CheckIn, b.owner, 0, 0, 0, location);
    }

    function logEnvironment(uint256 id, int32 temperatureX10, uint16 humidity, string calldata note)
        external
        exists(id)
    {
        if (_bottles[id].custodian != msg.sender) revert NotCustodian();
        _record(id, RecordKind.Environment, address(0), temperatureX10, humidity, 0, note);
    }

    /// @notice 창고 출고. 창고 또는 소유자가 호출할 수 있다(소유자 반환 요청).
    function checkOut(uint256 id, string calldata note) external exists(id) {
        Bottle storage b = _bottles[id];
        if (b.custodian == address(0)) revert NotCustodian();
        if (msg.sender != b.custodian && msg.sender != b.owner) revert NotCustodian();
        address wh = b.custodian;
        b.custodian = address(0);
        _record(id, RecordKind.CheckOut, wh, 0, 0, 0, note);
    }

    // ─────────────────────────────── 3. 거래 ─────────────────────────────
    function list(uint256 id, uint256 price) external exists(id) onlyOwnerOf(id) {
        if (price == 0) revert WrongPrice();
        Bottle storage b = _bottles[id];
        b.forSale = true;
        b.price = price;
        _record(id, RecordKind.Listed, address(0), 0, 0, price, "");
    }

    function unlist(uint256 id) external exists(id) onlyOwnerOf(id) {
        Bottle storage b = _bottles[id];
        if (!b.forSale) revert NotForSale();
        b.forSale = false;
        b.price = 0;
        _record(id, RecordKind.Unlisted, address(0), 0, 0, 0, "");
    }

    /// @notice 판매가 확정되면(정확한 금액 지불) 대금 지급과 소유권 이전이 한 트랜잭션에서 자동으로 기록된다.
    ///         창고에 보관 중인 병은 그대로 창고에 둔 채 소유권만 넘어간다.
    function buy(uint256 id) external payable exists(id) {
        Bottle storage b = _bottles[id];
        if (!b.forSale) revert NotForSale();
        if (msg.value != b.price) revert WrongPrice();
        if (msg.sender == b.owner) revert InvalidAddress();

        address seller = b.owner;
        uint256 price = b.price;
        b.owner = msg.sender;
        b.forSale = false;
        b.price = 0;
        b.pendingCustodian = address(0);

        _recordAs(id, RecordKind.Sold, seller, msg.sender, price, "");
        emit OwnershipTransferred(id, seller, msg.sender, price);

        (bool ok,) = seller.call{value: price}("");
        if (!ok) revert TransferFailed();
    }

    function transfer(uint256 id, address to) external exists(id) onlyOwnerOf(id) {
        if (to == address(0) || to == msg.sender) revert InvalidAddress();
        Bottle storage b = _bottles[id];
        b.owner = to;
        b.forSale = false;
        b.price = 0;
        b.pendingCustodian = address(0);
        _record(id, RecordKind.Transferred, to, 0, 0, 0, "");
        emit OwnershipTransferred(id, msg.sender, to, 0);
    }

    // ─────────────────────────────── 4. 봉인 ─────────────────────────────
    /// @notice 태그가 서명할 "개봉됨" 메시지 해시 (EIP-191 personal_sign 전 원문).
    function openedDigest(uint256 id) public view returns (bytes32) {
        return keccak256(abi.encodePacked("WHISKY_SEAL_OPENED", block.chainid, address(this), id));
    }

    /// @notice 캡이 열려 태그가 서명한 "개봉됨" 메시지를 제출한다. 누구나 제출 가능(태그 서명이 곧 증거).
    function reportOpened(uint256 id, bytes calldata tagSignature) external exists(id) {
        Bottle storage b = _bottles[id];
        if (b.opened) revert AlreadyOpened();
        if (_recover(_ethSigned(openedDigest(id)), tagSignature) != b.tag) revert BadSignature();
        b.opened = true;
        b.openedAt = uint64(block.timestamp);
        b.forSale = false;
        b.price = 0;
        _record(id, RecordKind.Opened, address(0), 0, 0, 0, "");
    }

    // ─────────────────────────────── views ───────────────────────────────
    function getBottle(uint256 id) external view exists(id) returns (Bottle memory) {
        return _bottles[id];
    }

    function getHistory(uint256 id) external view exists(id) returns (Record[] memory) {
        return _history[id];
    }

    function historyLength(uint256 id) external view exists(id) returns (uint256) {
        return _history[id].length;
    }

    function bottlesRegisteredBy(address distillery) external view returns (uint256[] memory) {
        return _registeredBy[distillery];
    }

    /// @notice 오프체인 탭 검증용: 태그 서명을 복원해 등록된 태그인지 확인한다.
    function verifyTagSignature(uint256 id, bytes32 digest, bytes calldata sig) external view exists(id) returns (bool) {
        return _recover(_ethSigned(digest), sig) == _bottles[id].tag;
    }

    // ─────────────────────────────── internals ───────────────────────────
    function _record(
        uint256 id,
        RecordKind kind,
        address counterparty,
        int32 tempX10,
        uint16 humidity,
        uint256 amount,
        string memory note
    ) internal {
        _history[id].push(
            Record(kind, msg.sender, counterparty, uint64(block.timestamp), tempX10, humidity, amount, note)
        );
        emit RecordAdded(id, kind, msg.sender, _history[id].length - 1);
    }

    function _recordAs(
        uint256 id,
        RecordKind kind,
        address actor,
        address counterparty,
        uint256 amount,
        string memory note
    ) internal {
        _history[id].push(Record(kind, actor, counterparty, uint64(block.timestamp), 0, 0, amount, note));
        emit RecordAdded(id, kind, actor, _history[id].length - 1);
    }

    function _ethSigned(bytes32 h) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", h));
    }

    function _recover(bytes32 h, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        // malleability guard (EIP-2)
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return address(0);
        return ecrecover(h, v, r, s);
    }
}
