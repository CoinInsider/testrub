'use client';

import { useEffect, useState } from 'react';
import { client } from '../app/client';
import { useActiveAccount } from 'thirdweb/react';
import { getContract, readContract } from 'thirdweb';
import { base } from 'thirdweb/chains';
import { CONTRACT_ADDRESS, CONTRACT_ABI, ERC20_ABI } from '../../utils/contracts';
import { toTokens } from 'thirdweb/utils';
import { formatAmount } from '../../utils/format';

type Position = {
  tokens: readonly string[];
  balances: readonly bigint[];
  debt: bigint;
  maxBorrow: bigint;
  totalValueDRUB: bigint;
  healthFactor: number; // Added healthFactor
};

export default function UserPosition({ tokensMap, position }: { tokensMap: Record<string, string>, position: Position | null }) {

  if (!position) return <div className="text-aave-text-dark">No data</div>;

  // Calculate borrow usage percentage for progress bar
  const currentBorrowPercentage = position.maxBorrow > 0 ? (Number(position.debt) / Number(position.maxBorrow)) * 100 : 0;

  let progressBarColor = 'bg-aave-green';
  if (currentBorrowPercentage > 80) { 
    progressBarColor = 'bg-aave-red';
  } else if (currentBorrowPercentage > 64) { 
    progressBarColor = 'bg-yellow-500';
  }

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4 text-aave-light-blue">User Position</h3>
      <div className="space-y-2 text-lg">
        <div className="flex justify-between">
          <span className="font-medium">Debt:</span>
          <span>{formatAmount(toTokens(position.debt, 18))}</span>
        </div>
        <div className="flex justify-between">
          <span className="font-medium">Max Borrow:</span>
          <span>{formatAmount(toTokens(position.maxBorrow, 18))} DRUB (80% of collateral)</span>
        </div>
        
        <div className="flex justify-between">
          <span className="font-medium">Health Factor:</span>
          <span className={
            position.healthFactor > 1.2 ? 'text-aave-green' :
            position.healthFactor > 1.0 ? 'text-yellow-500' : 'text-aave-red'
          }>
            {formatAmount(position.healthFactor, 2)}
          </span>
        </div>
      </div>
      {position.healthFactor <= 1.2 && (
        <div className={`mt-4 p-3 rounded-lg text-center font-semibold ${
          position.healthFactor > 1.0 ? 'bg-yellow-800 text-yellow-200' : 'bg-aave-red text-white'
        }`}>
          {position.healthFactor > 1.0 ? 'Warning: Your position is close to liquidation!' : 'DANGER: Your position is subject to liquidation!'}
        </div>
      )}

      {/* Progress Bar */}
      <div className="mt-4">
        <div className="text-sm font-medium mb-1">Borrow Usage:</div>
        <div className="w-full bg-gray-700 rounded-full h-2.5">
          <div 
            className={`${progressBarColor} h-2.5 rounded-full`} 
            style={{ width: `${currentBorrowPercentage}%` }}
          ></div>
        </div>
        <div className="flex justify-between text-xs mt-1">
            <span className="text-aave-green">0%</span>
            <span className="text-yellow-500">64% (Recommended)</span>
            <span className="text-aave-red">80% (Max)</span>
        </div>
      </div>

      {/* Explanation Text */}
      <div className="mt-4 p-3 rounded-lg bg-gray-800 text-aave-text-light text-sm">
        <p>
          Do not exceed the recommended limit of 64% – this will protect you from liquidation during market fluctuations. 
          The maximum limit of 80% carries high risks.
        </p>
      </div>
    </div>
  );
}