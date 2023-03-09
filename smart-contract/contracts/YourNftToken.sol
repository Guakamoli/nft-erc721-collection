// SPDX-License-Identifier: MIT

pragma solidity >=0.8.9 <0.9.0;

import 'erc721a/contracts/extensions/ERC721ABurnable.sol';
import 'erc721a/contracts/extensions/ERC721AQueryable.sol';
import '@openzeppelin/contracts/access/AccessControlEnumerable.sol';
import '@openzeppelin/contracts/security/Pausable.sol';
import '@openzeppelin/contracts/security/ReentrancyGuard.sol';
import "@openzeppelin/contracts/token/common/ERC2981.sol";
import '@openzeppelin/contracts/utils/cryptography/ECDSA.sol';
import '@openzeppelin/contracts/utils/cryptography/MerkleProof.sol';
import './StringPacking.sol';

contract YourNftToken is Context, AccessControlEnumerable, Pausable, ERC2981, ERC721AQueryable, ERC721ABurnable, ReentrancyGuard {
  using ECDSA for bytes32;

  bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
  bytes32 public constant REVEAL_ROLE = keccak256("REVEAL_ROLE");
  bytes32 public constant DRAWER_ROLE = keccak256("DRAWER_ROLE");

  // Mapping for token and ipfs cids
  mapping(uint256 => string) private tokenCIDs;
  mapping(string => bool) private cidExists;

  // Whitelist support
  bytes32 public merkleRoot;

  string public uriPrefix = '';
  string public uriSuffix = '.json';
  string public hiddenMetadataUri;
  
  uint256 public cost;
  uint256 public maxSupply;
  uint256 public maxMintAmountPerTx;

  bool public whitelistMintEnabled = false;
  bool public revealed = false;

  address public treasury;

  // Events
  event TreasuryChanged(address indexed previousTreasury, address indexed newTreasury);
  event TokenCIDReset(uint256 indexed tokenId, string previousCID);
  event RoyaltyChanged(uint256 indexed tokenId, address newReceiver, uint96 newRoyaltyBps);

  constructor(
    string memory _tokenName,
    string memory _tokenSymbol,
    uint256 _cost,
    uint256 _maxSupply,
    uint256 _maxMintAmountPerTx,
    string memory _hiddenMetadataUri
  ) ERC721A(_tokenName, _tokenSymbol) {
    _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());

    _grantRole(MINTER_ROLE, _msgSender());
    _grantRole(DRAWER_ROLE, _msgSender());
    _grantRole(REVEAL_ROLE, _msgSender());

    _pause();

    cost = _cost;
    maxSupply = _maxSupply;
    maxMintAmountPerTx = _maxMintAmountPerTx;
    hiddenMetadataUri = _hiddenMetadataUri;
  }

  function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControlEnumerable, ERC2981, ERC721A) returns (bool) {
    return ERC721A.supportsInterface(interfaceId) || ERC2981.supportsInterface(interfaceId);
  }

  function _msgSenderERC721A() internal view virtual override returns (address) {
    return _msgSender();
  }

  modifier mintCompliance(uint256 _mintAmount) {
    require(_mintAmount > 0 && _mintAmount <= maxMintAmountPerTx, 'Invalid mint amount!');
    require(totalSupply() + _mintAmount <= maxSupply, 'Max supply exceeded!');
    _;
  }

  modifier mintPriceCompliance(uint256 _mintAmount) {
    require(msg.value >= cost * _mintAmount, 'Insufficient funds!');
    _;
  }

  modifier royaltyBpsCompliance(uint256 _royaltyBps) {
    require(_royaltyBps <= 10000, 'Royalty bps should be less than 10000!');
    _;
  }

  /**
   * @dev See {IERC2981-royaltyInfo}. Set denominator to 10000 to represent 100%.
   */
  function _feeDenominator() internal pure virtual override returns (uint96) {
    return 10000;
  }

  function whitelistMint(string[] calldata _cids, uint96 _royaltyBps, bytes memory _signature, bytes32[] calldata _merkleProof) public payable mintCompliance(_cids.length) mintPriceCompliance(_cids.length) royaltyBpsCompliance(_royaltyBps) {
    // Verify whitelist requirements
    require(whitelistMintEnabled, 'The whitelist sale is not enabled!');
    bytes32 leaf = keccak256(abi.encodePacked(_msgSender()));
    require(MerkleProof.verify(_merkleProof, merkleRoot, leaf), 'Invalid proof!');

    // Verify mint signature and role
    bytes32 hash = keccak256(abi.encodePacked(this.whitelistMint.selector, StringPacking.encodePacked(_cids), _royaltyBps, address(this), _msgSender()));
    address signer = ECDSA.recover(hash.toEthSignedMessageHash(), _signature);
    _checkRole(MINTER_ROLE, signer);

    _safeMint(_msgSender(), _cids, _royaltyBps);
  }

  function mint(string[] calldata _cids, uint96 _royaltyBps, bytes memory _signature) public payable whenNotPaused() mintCompliance(_cids.length) mintPriceCompliance(_cids.length) royaltyBpsCompliance(_royaltyBps) {
    // Verify mint signature and role
    bytes32 hash = keccak256(abi.encodePacked(this.mint.selector, StringPacking.encodePacked(_cids), _royaltyBps, address(this), _msgSender()));
    address signer = ECDSA.recover(hash.toEthSignedMessageHash(), _signature);
    _checkRole(MINTER_ROLE, signer);

    _safeMint(_msgSender(), _cids, _royaltyBps);
  }

  function mintForAddress(string[] calldata _cids, uint96 _royaltyBps, address _receiver) public mintCompliance(_cids.length) onlyRole(MINTER_ROLE) {
    _safeMint(_receiver, _cids, _royaltyBps);
  }

  function _safeMint(address to, string[] calldata _cids, uint96 _royaltyBps) internal virtual {
    for (uint256 i = 0; i < _cids.length; i++) {
      require(bytes(_cids[i]).length != 0, 'CID can not be empty!');
      require(!cidExists[_cids[i]], 'CID already exists!');
    }

    uint256 tokenId = _nextTokenId();
    _safeMint(to, _cids.length);

    for (uint256 i = 0; i < _cids.length; i++) {
      tokenCIDs[tokenId + i] = _cids[i];
      cidExists[_cids[i]] = true;
      if (_royaltyBps != 0) _setTokenRoyalty(tokenId + i, to, _royaltyBps);
    }
  }

  function _startTokenId() internal view virtual override returns (uint256) {
    return 1;
  }

  function tokenURI(uint256 _tokenId) public view virtual override returns (string memory) {
    require(_exists(_tokenId), 'ERC721Metadata: URI query for nonexistent token');

    if (revealed == false) {
      return hiddenMetadataUri;
    }

    string memory currentBaseURI = _baseURI();
    string memory cid = tokenCIDs[_tokenId];
    return (bytes(currentBaseURI).length != 0 && bytes(cid).length != 0)
      ? string(abi.encodePacked(currentBaseURI, cid, uriSuffix))
      : '';
  }

  function setRevealed(bool _state) public onlyRole(REVEAL_ROLE) {
    revealed = _state;
  }

  function setCost(uint256 _cost) public onlyRole(MINTER_ROLE) {
    cost = _cost;
  }

  function setMaxSupply(uint256 _maxSupply) public onlyRole(DEFAULT_ADMIN_ROLE) {
    maxSupply = _maxSupply;
  }

  function setMaxMintAmountPerTx(uint256 _maxMintAmountPerTx) public onlyRole(MINTER_ROLE) {
    maxMintAmountPerTx = _maxMintAmountPerTx;
  }

  function setHiddenMetadataUri(string memory _hiddenMetadataUri) public onlyRole(REVEAL_ROLE) {
    hiddenMetadataUri = _hiddenMetadataUri;
  }

  function setUriPrefix(string memory _uriPrefix) public onlyRole(REVEAL_ROLE) {
    uriPrefix = _uriPrefix;
  }

  function setUriSuffix(string memory _uriSuffix) public onlyRole(REVEAL_ROLE) {
    uriSuffix = _uriSuffix;
  }

  function setPaused(bool _state) public onlyRole(REVEAL_ROLE) {
    if (_state == true) _pause();
    else _unpause();
  }

  function setMerkleRoot(bytes32 _merkleRoot) public onlyRole(MINTER_ROLE) {
    merkleRoot = _merkleRoot;
  }

  function setWhitelistMintEnabled(bool _state) public onlyRole(MINTER_ROLE) {
    whitelistMintEnabled = _state;
  }

  function setTreasury(address _treasury) public onlyRole(DEFAULT_ADMIN_ROLE) {
    require(_treasury != treasury, "Treasury address should not be same one");

    address oldTreasury = treasury;
    treasury = _treasury;
    emit TreasuryChanged(oldTreasury, treasury);
  }

  /**
   * @dev This will transfer the balance to the treasury address.
   * Can only be called by DRAWER_ROLE.
   */
  function withdraw(uint256 amount) public onlyRole(DRAWER_ROLE) nonReentrant {
    require(treasury != address(0), "Forbid withdraw to zero address");
    require(amount != 0, "Withdraw amount must not be zero");
    require(amount <= address(this).balance, "Withdraw amount will exceed balance");

    (bool os, ) = payable(treasury).call{value: amount}("");
    require(os);
  }

  function _baseURI() internal view virtual override returns (string memory) {
    return uriPrefix;
  }

  /**
   * @dev This will reset token associated cid and cidExists.
   */
  function resetTokenCID(uint256 tokenId) public onlyRole(MINTER_ROLE) {
    require(_exists(tokenId), 'Reset nonexistent token');
    _resetTokenCID(tokenId);
  }

  function _resetTokenCID(uint256 tokenId) internal {
    string memory cid = tokenCIDs[tokenId];

    if (bytes(cid).length != 0) {
      delete tokenCIDs[tokenId];
      delete cidExists[cid];
      emit TokenCIDReset(tokenId, cid);
    }
  }

  modifier onlyOwnerOrApproved(uint256 _tokenId) {
    address owner = ownerOf(_tokenId);

    if (_msgSender() != owner)
      if (getApproved(_tokenId) != _msgSender())
        if (!isApprovedForAll(owner, _msgSender())) {
            revert ApprovalCallerNotOwnerNorApproved();
        }
    _;
  }

  function setRoyalty(uint256 _tokenId, address _receiver, uint96 _royaltyBps) public onlyOwnerOrApproved(_tokenId) {
    (address receiver, ) = royaltyInfo(_tokenId, 0);
    address owner = ownerOf(_tokenId);
    require(receiver == address(0) || receiver == owner, 'ERC2981: token owner is not royalty receiver');

    if (_receiver != address(0)) _setTokenRoyalty(_tokenId, _receiver, _royaltyBps);
    else _resetTokenRoyalty(_tokenId);
  }

  function _setTokenRoyalty(uint256 _tokenId, address _receiver, uint96 _royaltyBps) internal virtual override {
    super._setTokenRoyalty(_tokenId, _receiver, _royaltyBps);
    emit RoyaltyChanged(_tokenId, _receiver, _royaltyBps);
  }

  function renounceRoyalty(uint256 _tokenId) public {
    (address receiver, ) = royaltyInfo(_tokenId, 0);
    require(_msgSender() == receiver, 'ERC2981: caller is not royalty receiver');

    _resetTokenRoyalty(_tokenId);
  }

  function _resetTokenRoyalty(uint256 _tokenId) internal virtual override {
    super._resetTokenRoyalty(_tokenId);
    emit RoyaltyChanged(_tokenId, address(0), 0);
  }

  /**
   * @dev See {ERC721A-_burn}. This override additionally clears the cid & royalty information for the token.
   */
  function _burn(uint256 tokenId, bool approvalCheck) internal virtual override {
    super._burn(tokenId, approvalCheck);

    _resetTokenRoyalty(tokenId);
    _resetTokenCID(tokenId);
  }
}
