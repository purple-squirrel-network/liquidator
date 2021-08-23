import {
  ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  Account,
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import { Market } from '@solendprotocol/common';
import { getTokenInfo } from 'libs/utils';
import { findWhere, map } from 'underscore';
import { refreshReserveInstruction } from 'models/instructions/refreshReserve';
import { liquidateObligationInstruction } from 'models/instructions/liquidateObligation';
import { refreshObligationInstruction } from 'models/instructions/refreshObligation';
import { config } from 'config';

export const liquidateObligation = async (
  connection: Connection,
  payer: Account,
  liquidityAmount: string,
  repayTokenSymbol: string,
  withdrawTokenSymbol: string,
  lendingMarket: Market,
  obligation: any,
) => {
  const ixs: TransactionInstruction[] = [];

  lendingMarket.reserves.forEach((reserve) => {
    const oracleInfo = findWhere(config.oracles.assets, {
      asset: reserve.asset,
    });

    // refreshed reserves are required for RefreshObligation
    const refreshReserveIx = refreshReserveInstruction(
      new PublicKey(reserve.address),
      new PublicKey(oracleInfo!.priceAddress),
      new PublicKey(oracleInfo!.switchboardFeedAddress),
    );

    ixs.push(refreshReserveIx);
  });

  const depositReserves = map(obligation.info.deposits, (deposit) => deposit.depositReserve);
  const borrowReserves = map(obligation.info.borrows, (borrow) => borrow.borrowReserve);

  const refreshObligationIx = refreshObligationInstruction(
    obligation.pubkey,
    depositReserves,
    borrowReserves,
  );
  ixs.push(refreshObligationIx);

  const repayTokenInfo = getTokenInfo(repayTokenSymbol);

  const repayReserve = findWhere(lendingMarket.reserves, { asset: repayTokenSymbol });
  const withdrawReserve = findWhere(lendingMarket.reserves, { asset: withdrawTokenSymbol });

  const repayTokenOracle = findWhere(config.oracles.assets, { asset: repayTokenSymbol });
  const withdrawTokenOracle = findWhere(config.oracles.assets, { asset: withdrawTokenSymbol });

  // get account that will be repaying the reserve liquidity
  const repayAccount = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    new PublicKey(repayTokenInfo.mintAddress),
    payer.publicKey,
  );

  // get account that will be getting the obligation's token account in return
  const rewardedWithdrawalCollateralAccount = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    new PublicKey(withdrawReserve.collateralMintAddress),
    payer.publicKey,
  );
  const rewardedWithdrawalCollateralAccountInfo = await connection.getAccountInfo(
    rewardedWithdrawalCollateralAccount,
  );
  if (!rewardedWithdrawalCollateralAccountInfo) {
    const createUserCollateralAccountIx = Token.createAssociatedTokenAccountInstruction(
      ASSOCIATED_TOKEN_PROGRAM_ID,
      TOKEN_PROGRAM_ID,
      withdrawReserve.collateralMintAddress,
      rewardedWithdrawalCollateralAccount,
      payer.publicKey,
      payer.publicKey,
    );
    ixs.push(createUserCollateralAccountIx);
  }

  ixs.push(
    refreshReserveInstruction(
      new PublicKey(repayReserve.address),
      new PublicKey(repayTokenOracle.priceAddress),
      new PublicKey(repayTokenOracle.switchboardFeedAddress),
    ),
    refreshReserveInstruction(
      new PublicKey(withdrawReserve.address),
      new PublicKey(withdrawTokenOracle.priceAddress),
      new PublicKey(withdrawTokenOracle.switchboardFeedAddress),
    ),
  );

  ixs.push(
    liquidateObligationInstruction(
      liquidityAmount,
      repayAccount,
      rewardedWithdrawalCollateralAccount,
      new PublicKey(repayReserve.address),
      new PublicKey(repayReserve.liquidityAddress),
      new PublicKey(withdrawReserve.address),
      new PublicKey(withdrawReserve.collateralSupplyAddress),
      obligation.pubkey,
      new PublicKey(lendingMarket.address),
      new PublicKey(lendingMarket.authorityAddress),
      payer.publicKey,
    ),
  );

  const tx = new Transaction().add(...ixs);
  const { blockhash } = await connection.getRecentBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;
  tx.sign(payer);

  const txHash = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(txHash, 'finalized');
  console.log(`liquidated obligation ${obligation.pubkey.toString()} in ${txHash}.
     repayToken: ${repayTokenSymbol}. withdrawToken: ${withdrawTokenSymbol}`);
};