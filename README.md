# Solend-liquidator-bot

open-source version of a liquidation bot running against Solend

## Overview

The Solend liquidator bot identifies and liquidates overexposed obligations. Solend awards liquidators a 5% bonus on each liquidation. See [Solend params](https://docs.solend.fi/protocol/parameters) for the most up-to-date parameters on each asset. This repo is intended as a starting point for the Solend community to build their liquidator bots.

## Usage

A file system wallet funded with SOL, USDC, ETH, SRM BTC is required to liquidate obligations. Users will need to manually rebalance wallet whenever a token is depleted.

1. Install [docker-compose](https://docs.docker.com/compose/install/)

2. Update [file system wallet](https://docs.solana.com/wallet-guide/file-system-wallet) path in docker-compose.yaml.

```
version: "3.1"

services:
  # The application image
  solend-liquidator:
    restart: unless-stopped
    build:
      context: .
      dockerfile: Dockerfile
    environment:
      - NETWORK=mainnet # solana network e.g mainnet, devnet
      - THROTTLE=600 # Throttle not avoid rate limiting
    secrets:
      - keypair # secret to encrypte wallet details in container

secrets:
  keypair:
    file: <PATH TO KEYPAIR WALLET THAT WILL BE LIQUIDATING UNDERWATER OBLIGATIONS>
```

3. Build and run service

```
docker-compose up --build
```

To run containers in background:

```
docker-compose up --build -d
```

## Support

PRs to improve this repo are welcomed! If you need help setting up your liquidator bot, feel free to post your questions in the #dev-support channel within [Solend's discord server](https://discord.gg/exscEFpB7s).
