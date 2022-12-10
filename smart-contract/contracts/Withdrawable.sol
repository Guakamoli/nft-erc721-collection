// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an withdrawer) that can be granted exclusive access to
 * specific functions.
 *
 * By default, the withdrawer will be the one that deploys the contract. This
 * can later be changed with {setWithdrawer}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwnerOrWithdrawer`, which can be applied to your functions to restrict
 * their use to the owner or withdrawer.
 */
abstract contract Withdrawable is Ownable, ReentrancyGuard {
  struct WithdrawInfo {
    address receiver;
    address withdrawer;
  }

  WithdrawInfo private _withdrawInfo;

  /**
   * @dev Initializes the contract setting the deployer as the initial
   * withdraw receiver account.
   */
  constructor() {
    _setWithdrawable(_msgSender(), address(0));
  }

  /**
   * @dev Returns withdraw receiver and withdrawer.
   */
  function withdrawInfo() public view virtual returns (address, address) {
    WithdrawInfo storage w = _withdrawInfo;
    return (w.receiver, w.withdrawer);
  }

  /**
   * @dev Throws if called by any account other than the owner and withdrawer.
   */
  modifier onlyOwnerOrWithdrawer() {
    (address r, address withdrawer) = withdrawInfo();
    require(owner() == _msgSender() || withdrawer == _msgSender(),
      "Withdrawable: caller is not the owner nor withdrawer"
    );
    _;
  }

  /**
   * @dev Set receiver and withdrawer to new accounts (`receiver` and `withdrawer`).
   * Can only be called by the owner.
   */
  function setWithdrawable(address receiver, address withdrawer) public virtual onlyOwner {
    require(receiver != address(0),
      "Withdrawable: new receiver account is the zero address"
    );
    _setWithdrawable(receiver, withdrawer);
  }

  /**
   * @dev Set receiver and withdrawer to new accounts (`receiver` and `withdrawer`).
   * Internal function without access restriction.
   */
  function _setWithdrawable(address receiver, address withdrawer) internal virtual {
    _withdrawInfo = WithdrawInfo(receiver, withdrawer);
  }

  /**
   * @dev This will transfer the remaining contract balance to the withdraw receiver.
   * Can only be called by the owner or withdrawer.
   */
  function withdraw() public virtual onlyOwnerOrWithdrawer nonReentrant {
    (address receiver, ) = withdrawInfo();
    (bool os, ) = payable(receiver).call{value: address(this).balance}("");
    require(os);
  }
}
