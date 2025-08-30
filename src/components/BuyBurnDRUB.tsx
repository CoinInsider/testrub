'use client';

import { useState, useEffect, useCallback } from 'react';
import { client } from '../app/client';
import { useActiveAccount } from 'thirdweb/react';
import { getContract, prepareContractCall, sendTransaction, readContract } from 'thirdweb';
import { base } from 'thirdweb/chains';
import { toUnits, toTokens } from 'thirdweb/utils';
import { CONTRACT_ADDRESS, CONTRACT_ABI, ERC20_ABI } from '../../utils/contracts';
import { formatAmount } from '../../utils/format';

const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

export default function BuyBurnDRUB({ onTransactionSuccess }: { onTransactionSuccess: () => void }) {
  const [buyAmount, setBuyAmount] = useState('');
  const [burnAmount, setBurnAmount] = useState('');
  const [needsApproval, setNeedsApproval] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState<bigint>(BigInt(0));
  const [drubBalance, setDrubBalance] = useState<bigint>(BigInt(0));
  const [showBurnModal, setShowBurnModal] = useState(false);
  const account = useActiveAccount();

  const contract = getContract({ client, address: CONTRACT_ADDRESS, chain: base, abi: CONTRACT_ABI });
  const usdcContract = getContract({ client, address: USDC_ADDRESS, chain: base, abi: ERC20_ABI });

  useEffect(() => {
    if (!account) return;
    const fetchBalances = async () => {
      try {
        const usdcBal = await readContract({ contract: usdcContract, method: 'balanceOf', params: [account.address] });
        setUsdcBalance(usdcBal);
        const drubBal = await readContract({ contract: getContract({ client, address: CONTRACT_ADDRESS, chain: base, abi: ERC20_ABI }), method: 'balanceOf', params: [account.address] });
        setDrubBalance(drubBal);
      } catch (e) { console.error('Error fetching balances', e); }
    };
    fetchBalances();
  }, [account, onTransactionSuccess, usdcContract]);

  const checkApprovalStatus = useCallback(async () => {
    if (!account || !buyAmount || parseFloat(buyAmount) <= 0) {
      setNeedsApproval(false);
      return;
    }
    try {
      const amountToBuy = toUnits(buyAmount, 6);
      const currentAllowance = await readContract({ contract: usdcContract, method: 'allowance', params: [account.address, CONTRACT_ADDRESS] });
      setNeedsApproval(currentAllowance < amountToBuy);
    } catch (e) { console.error('Error checking approval', e); setNeedsApproval(false); }
  }, [account, buyAmount, usdcContract]);

  useEffect(() => { checkApprovalStatus(); }, [buyAmount, account?.address, checkApprovalStatus]);

  const setMaxBuyAmount = () => setBuyAmount(toTokens(usdcBalance, 6));
  const setMaxBurnAmount = () => setBurnAmount(toTokens(drubBalance, 18));

  const handleBuyOrApprove = async () => {
    if (!account || !buyAmount) return;
    try {
      const amountValue = toUnits(buyAmount, 6);
      if (needsApproval) {
        const tx = prepareContractCall({ contract: usdcContract, method: 'approve', params: [CONTRACT_ADDRESS, amountValue] });
        await sendTransaction({ transaction: tx, account });
        checkApprovalStatus(); // Добавляем эту строку
      } else {
        const tx = prepareContractCall({ contract, method: 'buyDRUB', params: [amountValue] });
        await sendTransaction({ transaction: tx, account });
        setBuyAmount(''); // Очистка после покупки (если это нужно)
      }
      onTransactionSuccess(); // Возвращаем эту строку
    } catch (e) { console.error('Buy/Approve failed', e); }
  };

  const handleBurn = async () => {
    if (!account || !burnAmount) return;
    try {
      const amountValue = toUnits(burnAmount, 18);
      const tx = prepareContractCall({ contract, method: 'burnDRUB', params: [amountValue] });
      await sendTransaction({ transaction: tx, account });
      onTransactionSuccess();
    } catch (e) { console.error('Burn failed', e); }
  };

  return (
    <>
      <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
        {/* Buy DRUB Section */}
        <div className="flex-1 bg-gray-800 p-4 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold text-aave-green mb-3">Buy DRUB with USDC</h3>
          <div className="flex items-center space-x-2">
              <div className="relative flex-grow">
                <input 
                  type="number" 
                  value={buyAmount} 
                  onChange={(e) => setBuyAmount(e.target.value)} 
                  placeholder={`Balance: ${formatAmount(toTokens(usdcBalance, 6))}`}
                  className="p-2 pr-12 rounded-lg bg-gray-700 border border-gray-600 text-aave-text-light placeholder-gray-400 focus:outline-none focus:border-aave-light-blue w-full" />
                <button 
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-gray-600 text-white px-2 py-1 rounded-md text-sm hover:bg-gray-500"
                  onClick={setMaxBuyAmount}
                >
                  MAX
                </button>
              </div>
              <button className={`flex-shrink-0 text-white px-4 py-2 rounded-lg hover:opacity-80 transition-opacity ${needsApproval ? 'bg-velvet-yellow' : 'bg-aave-green'}`} onClick={handleBuyOrApprove} disabled={!account || !buyAmount || parseFloat(buyAmount) <= 0}>
                {needsApproval ? 'Approve USDC' : 'Buy DRUB'}
              </button>
          </div>
        </div>

        {/* Burn DRUB Section */}
        <div className="flex-1 bg-gray-800 p-4 rounded-lg shadow-md">
          <h3 className="text-lg font-semibold text-aave-red mb-3">Burn DRUB</h3>
          <div className="flex items-center space-x-2">
              <div className="relative flex-grow">
                <input 
                  type="number" 
                  value={burnAmount} 
                  onChange={(e) => setBurnAmount(e.target.value)} 
                  placeholder={`Balance: ${formatAmount(toTokens(drubBalance, 18))}`}
                  className="p-2 pr-12 rounded-lg bg-gray-700 border border-gray-600 text-aave-text-light placeholder-gray-400 focus:outline-none focus:border-aave-light-blue w-full" />
                <button 
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-gray-600 text-white px-2 py-1 rounded-md text-sm hover:bg-gray-500"
                  onClick={setMaxBurnAmount}
                >
                  MAX
                </button>
              </div>
              <button className="flex-shrink-0 bg-aave-red text-white px-4 py-2 rounded-lg hover:opacity-80 transition-opacity" onClick={() => setShowBurnModal(true)} disabled={!account || !burnAmount || parseFloat(burnAmount) <= 0}>
                Burn DRUB
              </button>
          </div>
        </div>
      </div>

      {showBurnModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg shadow-lg max-w-sm w-full relative">
            <h3 className="text-xl font-bold mb-4 text-aave-red">Burn Confirmation</h3>
            <p className="text-aave-text-light mb-6">
              Warning: This action is irreversible. The tokens will be permanently destroyed. 
              Are you sure you want to burn {burnAmount} DRUB?
            </p>
            <div className="flex justify-end space-x-4">
                <button 
                    className="px-4 py-2 rounded-lg bg-gray-600 hover:bg-gray-500 transition-opacity"
                    onClick={() => setShowBurnModal(false)}
                >
                    Cancel
                </button>
                <button 
                    className="px-4 py-2 rounded-lg bg-aave-red hover:opacity-80 transition-opacity"
                    onClick={() => {
                        handleBurn();
                        setShowBurnModal(false);
                    }}
                >
                    Confirm Burn
                </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}