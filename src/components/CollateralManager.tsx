'use client';

import { useState, useEffect, useCallback } from 'react';
import { client } from '../app/client';
import { useActiveAccount } from 'thirdweb/react';
import { getContract, prepareContractCall, sendTransaction, readContract, waitForReceipt } from 'thirdweb';
import { base } from 'thirdweb/chains';
import { toUnits, toTokens } from 'thirdweb/utils';
import { getWalletBalance } from 'thirdweb/wallets';
import { CONTRACT_ADDRESS, CONTRACT_ABI, ERC20_ABI } from '../../utils/contracts';
import { formatAmount } from '../../utils/format';

const ASSETS = ['cbBTC', 'ETH', 'HASH'];

function AssetRow({ 
    assetName,
    tokenAddress,
    isDeposit,
    onTransactionSuccess
}: { 
    assetName: string;
    tokenAddress: string;
    isDeposit: boolean;
    onTransactionSuccess: () => void;
}) {
    const [amount, setAmount] = useState('');
    const [balance, setBalance] = useState<bigint>(BigInt(0));
    const [decimals, setDecimals] = useState(18);
    const [needsApproval, setNeedsApproval] = useState(false);
    const [approvalCounter, setApprovalCounter] = useState(0);
    const [isApproving, setIsApproving] = useState(false);
    const account = useActiveAccount();
    const contract = getContract({ client, address: CONTRACT_ADDRESS, chain: base, abi: CONTRACT_ABI });

    const fetchBalancesAndDecimals = useCallback(async () => {
        if (!account) return;
        try {
            let fetchedBalance: bigint, fetchedDecimals = 18;
            if (isDeposit) {
                if (assetName === 'ETH') {
                    const walletBalance = await getWalletBalance({ client, address: account.address, chain: base });
                    fetchedBalance = walletBalance.value;
                    fetchedDecimals = walletBalance.decimals;
                } else {
                    const erc20Contract = getContract({ client, address: tokenAddress, chain: base, abi: ERC20_ABI });
                    fetchedBalance = await readContract({ contract: erc20Contract, method: 'balanceOf', params: [account.address] });
                    fetchedDecimals = Number(await readContract({ contract: erc20Contract, method: 'decimals', params: [] }));
                }
            } else {
                const positionResult = await readContract({ contract, method: 'getUserPosition', params: [account.address] });
                const [tokens, balances] = positionResult;
                const tokenIndex = tokens.findIndex(t => t.toLowerCase() === tokenAddress.toLowerCase());
                fetchedBalance = tokenIndex !== -1 ? balances[tokenIndex] : BigInt(0);
                if (assetName === 'ETH') {
                    fetchedDecimals = 18;
                } else {
                    const erc20Contract = getContract({ client, address: tokenAddress, chain: base, abi: ERC20_ABI });
                    fetchedDecimals = Number(await readContract({ contract: erc20Contract, method: 'decimals', params: [] }));
                }
            }
            setBalance(fetchedBalance);
            setDecimals(fetchedDecimals);
                } catch (e) { 
            console.error(`Error fetching ${assetName} data`);
            console.error("Full error object:", e);
            try {
                console.error("Stringified error:", JSON.stringify(e));
            } catch (jsonError) {
                console.error("Could not stringify the error object.");
            }
            setBalance(BigInt(0)); 
            setDecimals(18); 
        }
    }, [account, assetName, tokenAddress, isDeposit, contract, client]);

    useEffect(() => { fetchBalancesAndDecimals(); }, [fetchBalancesAndDecimals, onTransactionSuccess]);

    const checkApproval = useCallback(async () => {
        if (!account || assetName === 'ETH' || !isDeposit || !amount || parseFloat(amount) <= 0) {
            setNeedsApproval(false);
            return;
        }
        try {
            const amountToDeposit = toUnits(amount, decimals);
            const erc20Contract = getContract({ client, address: tokenAddress, chain: base, abi: ERC20_ABI });
            const currentAllowance = await readContract({ contract: erc20Contract, method: 'allowance', params: [account.address, CONTRACT_ADDRESS] });
            setNeedsApproval(currentAllowance < amountToDeposit);
        } catch (e) { console.error('Approval check failed', e); setNeedsApproval(false); }
    }, [account, assetName, amount, tokenAddress, isDeposit, client, decimals]);

    useEffect(() => { checkApproval(); }, [checkApproval, approvalCounter]);

    const handleAction = async () => {
        if (!account || !amount || isApproving) return;
        
        const amountValue = toUnits(amount, decimals);
        try {
            if (isDeposit) {
                if (needsApproval) {
                    setIsApproving(true);
                    const erc20Contract = getContract({ client, address: tokenAddress, chain: base, abi: ERC20_ABI });
                    const tx = prepareContractCall({ contract: erc20Contract, method: 'approve', params: [CONTRACT_ADDRESS, amountValue] });
                    const transactionResult = await sendTransaction({ transaction: tx, account });
                    
                    await waitForReceipt(transactionResult);
                    
                    setApprovalCounter(c => c + 1);
                } else {
                    const tx = prepareContractCall({ contract, method: 'depositCollateral', params: [tokenAddress, amountValue], value: assetName === 'ETH' ? amountValue : BigInt(0) });
                    await sendTransaction({ transaction: tx, account });
                    onTransactionSuccess();
                }
            } else {
                const tx = prepareContractCall({ contract, method: 'withdrawCollateral', params: [tokenAddress, amountValue] });
                await sendTransaction({ transaction: tx, account });
                onTransactionSuccess();
            }
        } catch (e) { 
            console.error('Collateral action failed', e); 
        } finally {
            setIsApproving(false);
        }
    };
    
    const setMaxAmount = () => {
        setAmount(toTokens(balance, decimals));
    }

    const placeholderText = isDeposit ? `${assetName}: ${formatAmount(toTokens(balance, decimals))}` : `${assetName} Deposited: ${formatAmount(toTokens(balance, decimals))}`;
    const buttonClass = isDeposit ? (needsApproval ? 'bg-velvet-yellow' : 'bg-aave-light-blue') : 'bg-aave-red';
    const buttonText = isDeposit ? (needsApproval ? 'Approve' : 'Deposit') : 'Withdraw';
    const isButtonDisabled = !amount || parseFloat(amount) <= 0 || isApproving;

    return (
        <div className="space-y-2 pt-2">
            <div className="flex items-center space-x-2">
                <div className="relative flex-grow">
                    <input 
                        type="text" 
                        placeholder={placeholderText}
                        value={amount} 
                        onChange={(e) => setAmount(e.target.value)} 
                        className="p-2 pr-12 rounded-lg bg-gray-700 border border-gray-600 text-aave-text-light placeholder-gray-400 focus:outline-none focus:border-aave-light-blue w-full" />
                    <button 
                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-gray-600 text-white px-2 py-1 rounded-md text-sm hover:bg-gray-500"
                        onClick={setMaxAmount}
                    >
                        MAX
                    </button>
                </div>
                <button className={`flex-shrink-0 text-white px-4 py-2 rounded-lg hover:opacity-80 transition-opacity ${buttonClass}`} onClick={handleAction} disabled={isButtonDisabled}>
                    {isApproving ? 'Approving...' : buttonText}
                </button>
            </div>
        </div>
    );
}

export default function CollateralManager({ tokens, onTransactionSuccess }: { tokens: Record<string, string>, onTransactionSuccess: () => void }) {
    return (
        <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4">
            {/* Deposit Section */}
            <div className="flex-1 bg-gray-800 p-4 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold text-aave-light-blue mb-2">Deposit Collateral</h3>
                {ASSETS.map(asset => (
                    <AssetRow 
                        key={`deposit-${asset}`}
                        assetName={asset} 
                        tokenAddress={tokens[asset]} 
                        isDeposit={true} 
                        onTransactionSuccess={onTransactionSuccess} 
                    />
                ))}
            </div>

            {/* Withdraw Section */}
            <div className="flex-1 bg-gray-800 p-4 rounded-lg shadow-md">
                <h3 className="text-lg font-semibold text-aave-red mb-2">Withdraw Collateral</h3>
                {ASSETS.map(asset => (
                    <AssetRow 
                        key={`withdraw-${asset}`}
                        assetName={asset} 
                        tokenAddress={tokens[asset]} 
                        isDeposit={false} 
                        onTransactionSuccess={onTransactionSuccess} 
                    />
                ))}
            </div>
        </div>
    );
}