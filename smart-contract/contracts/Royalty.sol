// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/common/ERC2981.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @dev Implementation of the NFT Royalty Standard, a standardized way to retrieve royalty payment information.
 *
 * Royalty information can be specified globally for all token ids via {setRoyalty}.
 *
 * Royalty is specified as a fraction of sale price. {_feeDenominator} is overridable but defaults to 10000, meaning the
 * fee is specified in basis points by default.
 */
abstract contract Royalty is Ownable, ERC2981 {
  /**
   * @dev Initializes the contract setting the deployer as the initial
   * royalty receiver.
   */
  constructor() {
    _setDefaultRoyalty(_msgSender(), 0);
  }

  /**
   * @dev Sets the royalty information that all ids in this contract will default to.
   * Can only be called by the owner.
   *
   * Requirements:
   *
   * - `receiver` cannot be the zero address.
   * - `feeNumerator` cannot be greater than the fee denominator.
   */
  function setRoyalty(address receiver, uint96 feeNumerator) public virtual onlyOwner {
    _setDefaultRoyalty(receiver, feeNumerator);
  }

  /**
   * @dev Removes royalty information.
   * Can only be called by the owner.
   */
  function renounceRoyalty() public virtual onlyOwner {
    _deleteDefaultRoyalty();
  }
}
