// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

/**
 * @dev String packing operations.
 */
library StringPacking {
  function encodePacked(string[] calldata words) internal pure returns (bytes memory) {
    bytes memory buffer;

    for (uint256 i = 0; i < words.length; i++) {
      buffer = abi.encodePacked(buffer, words[i]);
    }
    return buffer;
  }
}
