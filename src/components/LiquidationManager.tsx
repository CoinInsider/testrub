'use client';

import { useState, useCallback } from 'react';
import { client } from '../app/client';
import { useActiveAccount } from 'thirdweb/react';
import { getContract, prepareContractCall, sendTransaction, readContract, getContractEvents, prepareEvent } from 'thirdweb';
import { getRpcClient, eth_blockNumber } from "thirdweb/rpc";
import { base } from 'thirdweb/chains';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../utils/contracts';

type LiquidationStatus = 'checking' | 'liquidatable' | 'safe' | 'error';

// Add position prop back, even if not directly used by this component's logic
export default function LiquidationManager({ position, onTransactionSuccess }: { position: any, onTransactionSuccess: () => void }) {
  const [participants, setParticipants] = useState<string[]>([]);
  const [liquidationStatus, setLiquidationStatus] = useState<Record<string, LiquidationStatus>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const account = useActiveAccount();

  const scanForLiquidations = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setParticipants([]);
    setLiquidationStatus({});
    console.log("Scanning for liquidations...");

    try {
      const contract = getContract({
        client,
        address: CONTRACT_ADDRESS,
        chain: base,
        abi: CONTRACT_ABI,
      });

      const depositedEvent = prepareEvent({
        signature: 'event Deposited(address indexed user, address indexed token, uint256 amount)',
      });
      const borrowedEvent = prepareEvent({
        signature: 'event Borrowed(address indexed user, uint256 amount)',
      });

      const rpcRequest = getRpcClient({ client, chain: base });
      const latestBlock = await eth_blockNumber(rpcRequest);
      const chunkSize = 100000n; // Use a large but reasonable chunk size
      const allEvents = [];
      console.log(`Scanning from block 0 to ${latestBlock} in chunks of ${chunkSize}`);

      for (let fromBlock = 0n; fromBlock <= latestBlock; fromBlock += chunkSize) {
        const toBlock = fromBlock + chunkSize - 1n < latestBlock ? fromBlock + chunkSize - 1n : latestBlock;
        console.log(`Fetching events from block ${fromBlock} to ${toBlock}`);
        const chunkEvents = await getContractEvents({
            contract,
            events: [depositedEvent, borrowedEvent],
            fromBlock,
            toBlock,
        });
        console.log(`Found ${chunkEvents.length} events in this chunk.`);
        allEvents.push(...chunkEvents);
      }

      const userSet = new Set<string>();
      allEvents.forEach(event => {
        if (event.args.user) {
            userSet.add(event.args.user);
        }
      });

      const allUsers = Array.from(userSet);
      console.log(`Found ${allUsers.length} unique users.`);
      setParticipants(allUsers);

      const initialStatus: Record<string, LiquidationStatus> = {};
      allUsers.forEach(user => { initialStatus[user] = 'checking'; });
      setLiquidationStatus(initialStatus);

      for (const user of allUsers) {
        try {
            const isUserLiquidatable = await readContract({
              contract,
              method: 'isLiquidatable',
              params: [user],
            });
            setLiquidationStatus(prev => ({ ...prev, [user]: isUserLiquidatable ? 'liquidatable' : 'safe' }));
        } catch (e) {
            console.error(`Could not check liquidatable status for ${user}`, e);
            setLiquidationStatus(prev => ({ ...prev, [user]: 'error' }));
        }
      }

    } catch (err) {
      console.error('Error scanning for liquidations', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred while scanning.');
    } finally {
      setIsLoading(false);
    }
  }, [account, client]);

  const handleLiquidation = async (addressToLiquidate: string) => {
    if (!account) return;
    try {
      const contract = getContract({ client, address: CONTRACT_ADDRESS, chain: base, abi: CONTRACT_ABI });
      const transaction = prepareContractCall({
        contract,
        method: 'autoLiquidate',
        params: [addressToLiquidate],
      });
      await sendTransaction({ transaction, account });
      onTransactionSuccess();
      await scanForLiquidations();
    } catch (err) {
      console.error('Error during liquidation', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred during liquidation.');
    }
  };

  const handleLiquidateAll = async () => {
    const liquidatableAddresses = participants.filter(p => liquidationStatus[p] === 'liquidatable');
    if (!account || liquidatableAddresses.length === 0) return;
    try {
      const contract = getContract({ client, address: CONTRACT_ADDRESS, chain: base, abi: CONTRACT_ABI });
      const transaction = prepareContractCall({
        contract,
        method: 'autoLiquidateAll',
        params: [liquidatableAddresses],
      });
      await sendTransaction({ transaction, account });
      onTransactionSuccess();
      await scanForLiquidations();
    } catch (err) {
      console.error('Error during liquidate all', err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred during liquidation.');
    }
  };

  const liquidatableCount = participants.filter(p => liquidationStatus[p] === 'liquidatable').length;

  return (
    <div className="p-4 border border-gray-700 rounded-lg mt-4">
      <h3 className="text-xl font-semibold mb-4 text-aave-light-blue">Liquidation Management</h3>
      
      <button
        onClick={scanForLiquidations}
        disabled={isLoading || !account}
        className="bg-aave-light-blue text-white px-4 py-2 rounded-lg hover:opacity-80 transition-opacity disabled:bg-gray-500 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Scanning...' : 'Scan for Participants'}
      </button>

      {error && <p className="mt-4 text-sm text-aave-red">{error}</p>}

      {participants.length > 0 && (
        <div className="mt-4">
          <h4 className="text-lg font-semibold mb-2">Participants ({participants.length}):</h4>
          <ul className="space-y-2">
            {participants.map(address => (
              <li key={address} className="flex justify-between items-center bg-gray-800 p-2 rounded-lg">
                <span className="font-mono text-sm">{address}</span>
                <div className="flex items-center space-x-4">
                    <span className={`text-sm font-bold ${liquidationStatus[address] === 'liquidatable' ? 'text-aave-red' : liquidationStatus[address] === 'safe' ? 'text-aave-green' : 'text-aave-text-dark'}`}>
                        {liquidationStatus[address].toUpperCase()}
                    </span>
                    <button
                      onClick={() => handleLiquidation(address)}
                      disabled={!account || liquidationStatus[address] !== 'liquidatable'}
                      className="bg-aave-red text-white px-3 py-1 rounded-lg text-sm hover:opacity-80 transition-opacity disabled:bg-gray-600 disabled:cursor-not-allowed"
                    >
                      Liquidate
                    </button>
                </div>
              </li>
            ))}
          </ul>
          {liquidatableCount > 0 && (
            <button
                onClick={handleLiquidateAll}
                disabled={!account}
                className="mt-4 bg-aave-red text-white px-4 py-2 rounded-lg w-full hover:opacity-80 transition-opacity disabled:bg-gray-500 disabled:cursor-not-allowed"
            >
                Liquidate All ({liquidatableCount})
            </button>
          )}
        </div>
      )}

      {participants.length === 0 && !isLoading && (
        <p className="mt-4 text-aave-text-dark">No participants found. Click scan to search.</p>
      )}
    </div>
  );
}
