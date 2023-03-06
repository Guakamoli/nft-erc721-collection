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
  uint256 public whitelistMintCost;
  uint256 public maxSupply;
  uint256 public maxMintAmountPerTx;

  bool public whitelistMintEnabled = false;
  bool public revealed = false;

  // Treasury for minting fees and royalties
  address public treasury;

  event TreasuryChanged(
    address indexed previousTreasury,
    address indexed newTreasury
  );

  constructor(
    string memory _tokenName,
    string memory _tokenSymbol,
    uint256 _cost,
    uint256 _whitelistMintCost,
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
    whitelistMintCost = _whitelistMintCost;
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

  modifier whitelistMintPriceCompliance(uint256 _mintAmount) {
    require(msg.value >= whitelistMintCost * _mintAmount, 'Insufficient funds!');
    _;
  }

  modifier mintFeeCompliance(uint256 _feeBps) {
    require(_feeBps <= 10000, 'Royalty fee will exceed salePrice!');
    _;
  }

  function whitelistMint(string[] calldata _cids, uint96 _feeBps, bytes memory _signature, bytes32[] calldata _merkleProof) public payable whenNotPaused() mintCompliance(_cids.length) whitelistMintPriceCompliance(_cids.length) mintFeeCompliance(_feeBps) {
    // Verify whitelist requirements
    require(whitelistMintEnabled, 'The whitelist sale is not enabled!');
    bytes32 leaf = keccak256(abi.encodePacked(_msgSender()));
    require(MerkleProof.verify(_merkleProof, merkleRoot, leaf), 'Invalid proof!');

    // Verify mint signature and role
    bytes32 hash = keccak256(abi.encodePacked(this.whitelistMint.selector, StringPacking.encodePacked(_cids), _feeBps, address(this), _msgSender()));
    address signer = ECDSA.recover(hash.toEthSignedMessageHash(), _signature);
    _checkRole(MINTER_ROLE, signer);

    _safeMint(_msgSender(), _cids, _feeBps);
  }

  function mint(string[] calldata _cids, uint96 _feeBps, bytes memory _signature) public payable whenNotPaused() mintCompliance(_cids.length) mintPriceCompliance(_cids.length) mintFeeCompliance(_feeBps) {
    // Verify mint signature and role
    bytes32 hash = keccak256(abi.encodePacked(this.mint.selector, StringPacking.encodePacked(_cids), _feeBps, address(this), _msgSender()));
    address signer = ECDSA.recover(hash.toEthSignedMessageHash(), _signature);
    _checkRole(MINTER_ROLE, signer);

    _safeMint(_msgSender(), _cids, _feeBps);
  }

  function mintForAddress(string[] calldata _cids, uint96 _feeBps, address _receiver) public mintCompliance(_cids.length) onlyRole(MINTER_ROLE) {
    _safeMint(_receiver, _cids, _feeBps);
  }

  function _safeMint(address to, string[] calldata _cids, uint96 _feeBps) internal virtual {
    for (uint256 i = 0; i < _cids.length; i++) {
      require(bytes(_cids[i]).length != 0, 'CID should not be empty!');
      require(!cidExists[_cids[i]], 'CID already exists!');
    }

    uint256 tokenId = _nextTokenId();
    _safeMint(to, _cids.length);

    for (uint256 i = 0; i < _cids.length; i++) {
      tokenCIDs[tokenId + i] = _cids[i];
      cidExists[_cids[i]] = true;
      if (_feeBps > 0) _setTokenRoyalty(tokenId + i, to, _feeBps);
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
    return (bytes(currentBaseURI).length > 0 && bytes(cid).length > 0)
      ? string(abi.encodePacked(currentBaseURI, cid, uriSuffix))
      : '';
  }

  function setRevealed(bool _state) public onlyRole(REVEAL_ROLE) {
    revealed = _state;
  }

  function setCost(uint256 _cost) public onlyRole(MINTER_ROLE) {
    cost = _cost;
  }

  function setWhitelistMintCost(uint256 _whitelistMintCost) public onlyRole(MINTER_ROLE) {
    whitelistMintCost = _whitelistMintCost;
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
    address oldTreasury = treasury;
    treasury = _treasury;
    emit TreasuryChanged(oldTreasury, treasury);
  }

  /**
   * @dev This will transfer the balance to the treasury address.
   * Can only be called by DRAWER_ROLE.
   */
  function withdraw() public onlyRole(DRAWER_ROLE) nonReentrant {
    require(treasury != address(0), "forbid withdraw to zero address");

    (bool os, ) = payable(treasury).call{value: address(this).balance}("");
    require(os);
  }

  function _baseURI() internal view virtual override returns (string memory) {
    return uriPrefix;
  }

  /**
   * @dev This will reset token associated cid and cidExists.
   */
  function resetToken(uint256 tokenId) public onlyRole(MINTER_ROLE) {
    require(_exists(tokenId), 'reset of nonexistent token');
    _resetToken(tokenId);
  }

  function _resetToken(uint256 tokenId) internal {
    string memory cid = tokenCIDs[tokenId];

    if (bytes(cid).length > 0) {
      delete tokenCIDs[tokenId];
      delete cidExists[cid];
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

  function setTokenRoyalty(uint256 _tokenId, address _receiver, uint96 _feeBps) public onlyOwnerOrApproved(_tokenId) {
    (address receiver, ) = royaltyInfo(_tokenId, 0);
    address owner = ownerOf(_tokenId);
    require(receiver == address(0) || receiver == owner, 'Royalty receiver must be zero or owner');

    if (_receiver != address(0)) _setTokenRoyalty(_tokenId, _receiver, _feeBps);
    else _resetTokenRoyalty(_tokenId);
  }

  /**
   * @dev See {ERC721A-_burn}. This override additionally clears the cid & royalty information for the token.
   */
  function _burn(uint256 tokenId, bool approvalCheck) internal virtual override {
    super._burn(tokenId, approvalCheck);

    _resetToken(tokenId);
    _resetTokenRoyalty(tokenId);
  }
}
