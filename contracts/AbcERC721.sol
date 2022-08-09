// TODO de-dupe with https://github.com/abacus-network/abacus-token/blob/main/contracts/AbcERC721.sol

// SPDX-License-Identifier: MIT OR Apache-2.0
pragma solidity ^0.8.13;

import {Router} from "@abacus-network/app/contracts/Router.sol";

import {ERC721EnumerableUpgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";

/**
 * @title Abacus Token that extends the ERC721 token standard to enable native interchain transfers.
 * @author Abacus Works
 */
contract AbcERC721 is Router, ERC721EnumerableUpgradeable {
   
    /**
     * @dev Emitted on `transferRemote` when a transfer message is dispatched.
     * @param destination The identifier of the destination chain.
     * @param recipient The address of the recipient on the destination chain.
     * @param tokenId The tokenId of tokens burnt on the origin chain.
     */
    event SentTransferRemote(
        uint32 indexed destination,
        address indexed recipient,
        uint256 tokenId
    );

    /**
     * @dev Emitted on `_handle` when a transfer message is processed.
     * @param origin The identifier of the origin chain.
     * @param recipient The address of the recipient on the destination chain.
     * @param tokenId The tokenId of tokens minted on the destination chain.
     */
    event ReceivedTransferRemote(
        uint32 indexed origin,
        address indexed recipient,
        uint256 tokenId
    );

    /**
     * @notice Initializes the Abacus router, ERC721 metadata, and mints initial supply to deployer.
     * @param _xAppConnectionManager The address of the XAppConnectionManager contract.
     * @param _mintAmount The amount of NFTs to mint to `msg.sender`.
     * @param _name The name of the token.
     * @param _symbol The symbol of the token.
     */
    function initialize(
        address _xAppConnectionManager,
        uint256 _mintAmount,
        string memory _name,
        string memory _symbol
    ) external initializer {
        __Router_initialize(_xAppConnectionManager);
        __ERC721_init(_name, _symbol);
        for (uint256 i = 0; i < _mintAmount; i++) {
            _mint(msg.sender, i);
        }
    }

    /**
     * @notice Transfers `_tokenId` of tokens from `msg.sender` to `_recipient` on the `_destination` chain.
     * @dev Burns `_tokenId` of tokens from `msg.sender` on the origin chain and dispatches
     *      message to the `destination` chain to mint `_tokenId` of tokens to `recipient`.
     * @dev Emits `SentTransferRemote` event on the origin chain.
     * @param _destination The identifier of the destination chain.
     * @param _recipient The address of the recipient on the destination chain.
     * @param _tokenId The tokenId of tokens to be sent to the remote recipient.
     */
    function transferRemote(
        uint32 _destination,
        address _recipient,
        uint256 _tokenId
    ) external payable {
        _burn(_tokenId);
        _dispatchWithGas(
            _destination,
            abi.encode(_recipient, _tokenId),
            msg.value
        );
        emit SentTransferRemote(_destination, _recipient, _tokenId);
    }

    /**
     * @dev Mints tokens to recipient when router receives transfer message.
     * @dev Emits `ReceivedTransferRemote` event on the destination chain.
     * @param _origin The identifier of the origin chain.
     * @param _message The encoded remote transfer message containing the recipient address and tokenId.
     */
    function _handle(
        uint32 _origin,
        bytes32,
        bytes memory _message
    ) internal override {
        (address recipient, uint256 tokenId) = abi.decode(
            _message,
            (address, uint256)
        );
        _mint(recipient, tokenId);
        emit ReceivedTransferRemote(_origin, recipient, tokenId);
    }
}
