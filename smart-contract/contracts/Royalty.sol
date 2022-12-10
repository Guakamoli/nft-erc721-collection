// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/interfaces/IERC2981.sol";
import "@openzeppelin/contracts/utils/introspection/ERC165.sol";

/**
 * @dev Implementation of the NFT Royalty Standard, a standardized way to retrieve royalty payment information.
 *
 * Royalty information can be specified globally for all token ids via {setRoyalty}.
 *
 * Royalty is specified as a fraction of sale price and fee is specified in basis points.
 */
abstract contract Royalty is Ownable, IERC2981, ERC165 {
  struct RoyaltyInfo {
    address receiver;
    uint96 royaltyBasisPoint;
  }

  RoyaltyInfo private _royaltyInfo;

  event RoyaltyChanged(
    address indexed previousReceiver,
    uint96 previousRoyaltyBasisPoint,
    address indexed newReceiver,
    uint96 newRoyaltyBasisPoint
  );

  /**
   * @dev See {IERC165-supportsInterface}.
   */
  function supportsInterface(bytes4 interfaceId) public view virtual override(IERC165, ERC165) returns (bool) {
    return interfaceId == type(IERC2981).interfaceId || super.supportsInterface(interfaceId);
  }

  /**
   * @inheritdoc IERC2981
   */
  function royaltyInfo(uint256, uint256 salePrice) external view virtual override returns (address, uint256) {
    RoyaltyInfo storage royalty = _royaltyInfo;
    uint256 royaltyAmount = (salePrice * royalty.royaltyBasisPoint) / 10000;
    return (royalty.receiver, royaltyAmount);
  }

  /**
   * @dev Sets the royalty information that all ids in this contract will default to.
   * Can only be called by the owner.
   *
   * Requirements:
   *
   * - `receiver` cannot be the zero address.
   * - `royaltyBasisPoint` cannot be greater than 10000.
   */
  function setRoyalty(address receiver, uint96 royaltyBasisPoint) public virtual onlyOwner {
    require(royaltyBasisPoint <= 10000, "Royalty: royalty fee will exceed salePrice");
    require(receiver != address(0), "Royalty: invalid receiver");

    RoyaltyInfo memory oldRoyaltyInfo = _royaltyInfo;
    _royaltyInfo = RoyaltyInfo(receiver, royaltyBasisPoint);

    emit RoyaltyChanged(
      oldRoyaltyInfo.receiver,
      oldRoyaltyInfo.royaltyBasisPoint,
      receiver,
      royaltyBasisPoint
    );
  }

  /**
   * @dev Removes royalty information.
   * Can only be called by the owner.
   */
  function renounceRoyalty() public virtual onlyOwner {
    RoyaltyInfo memory oldRoyaltyInfo = _royaltyInfo;
    delete _royaltyInfo;

    emit RoyaltyChanged(
      oldRoyaltyInfo.receiver,
      oldRoyaltyInfo.royaltyBasisPoint,
      address(0), 0
    );
  }
}
