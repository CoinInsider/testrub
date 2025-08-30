'use client';

import { useState, useEffect } from 'react';
import { client } from '../app/client';
import { useActiveAccount } from 'thirdweb/react';
import { getContract, prepareContractCall, sendTransaction, readContract } from 'thirdweb';
import { base } from 'thirdweb/chains';
import { toUnits, toTokens } from 'thirdweb/utils';
import { CONTRACT_ADDRESS, CONTRACT_ABI, ERC20_ABI } from '../../utils/contracts';
import { formatAmount } from '../../utils/format';

export default function BurnDRUB({ onTransactionSuccess }: { onTransactionSuccess: () => void }) {
  const [burnAmount, setBurnAmount] = useState('');
  const [drubBalance, setDrubBalance] = useState<bigint>(BigInt(0));
  const account = useActiveAccount();

  const contract = getContract({
    client,
    address: CONTRACT_ADDRESS,
    chain: base,
    abi: CONTRACT_ABI,
  });

  useEffect(() => {
    if (!account) return;
    const fetchDrubBalance = async () => {
      try {
        const balance = await readContract({
          contract: getContract({ client, address: CONTRACT_ADDRESS, chain: base, abi: ERC20_ABI }),
          method: 'balanceOf',
          params: [account.address],
        });
        setDrubBalance(balance);
      } catch (error) {
        console.error('Error fetching DRUB balance', error);
      }
    };
    fetchDrubBalance();
  }, [account, onTransactionSuccess]);

  const setMaxBurnAmount = () => {
    setBurnAmount(toTokens(drubBalance, 18));
  };

  const handleBurn = async () => {
    if (!account) return;
    try {
      const amountValue = toUnits(burnAmount, 18);
      const transaction = prepareContractCall({
        contract,
        method: 'burnDRUB',
        params: [amountValue],
      });
      await sendTransaction({ transaction, account });
      onTransactionSuccess();
    } catch (error) {
      console.error('Burn failed:', error);
    }
  };

  return (
    <div className="flex flex-col gap-2 bg-gray-800 p-4 rounded-lg shadow-md">
      <h3 className="text-lg font-semibold text-aave-red flex justify-between">
        <span>Burn DRUB</span>
        <span className="text-sm text-aave-text-dark font-normal">Balance: {formatAmount(toTokens(drubBalance, 18))}</span>
      </h3>
      <div className="relative">
        <input
          type="number"
          value={burnAmount}
          onChange={(e) => setBurnAmount(e.target.value)}
          placeholder="DRUB Amount"
          className="p-2 pr-12 rounded-lg bg-gray-700 border border-gray-600 text-aave-text-light placeholder-gray-400 focus:outline-none focus:border-aave-light-blue w-full"
        />
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 bg-gray-600 text-white px-2 py-1 rounded-md text-sm hover:bg-gray-500"
          onClick={setMaxBurnAmount}
        >
          MAX
        </button>
      </div>
      <button
        className="w-full bg-aave-red text-white px-4 py-2 rounded-lg hover:opacity-80 transition-opacity"
        onClick={handleBurn}
        disabled={!account || !burnAmount || parseFloat(burnAmount) <= 0}
      >
        Burn DRUB
      </button>
    </div>
  );
}
