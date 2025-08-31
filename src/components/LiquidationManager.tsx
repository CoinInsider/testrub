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
      console.log("Step 1: Initializing contract and events.");

      const contract = getContract({
        client,
        address: CONTRACT_ADDRESS,
        chain: base,
        abi: CONTRACT_ABI,
      });
      console.log("Step 2: Contract obtained.");

      const depositedEvent = prepareEvent({
        signature: 'event Deposited(address indexed user, address indexed token, uint256 amount)',
      });
      const borrowedEvent = prepareEvent({
        signature: 'event Deposited(address indexed user, uint256 amount)',
      });
      console.log("Step 3: Events prepared.");

      const rpcRequest = getRpcClient({ client, chain: base });
      console.log("Step 4: Fetching latest block number.");
      const latestBlock = await eth_blockNumber(rpcRequest);
      console.log(`Step 5: Latest block is ${latestBlock}.`);
      const chunkSize = 5000n; // Use a large but reasonable chunk size
      const allEvents = [];
      console.log(`Step 6: Scanning from block 0 to ${latestBlock} in chunks of ${chunkSize}`);

      for (let fromBlock = 0n; fromBlock <= latestBlock; fromBlock += chunkSize) {
        const toBlock = fromBlock + chunkSize - 1n < latestBlock ? fromBlock + chunkSize - 1n : latestBlock;
        console.log(`Step 6.1: Fetching events from block ${fromBlock} to ${toBlock}`);
        const chunkEvents = await getContractEvents({
            contract,
            events: [depositedEvent, borrowedEvent],
            fromBlock,
            toBlock,
        });
        console.log(`Step 6.2: Found ${chunkEvents.length} events in this chunk.`);
        allEvents.push(...chunkEvents);
      }
      console.log(`Step 7: Finished fetching all events. Total events: ${allEvents.length}`);

      const userSet = new Set<string>();
      allEvents.forEach(event => {
        if (event.args.user) {
            userSet.add(event.args.user);
        }
      });

      const allUsers = Array.from(userSet);
      console.log(`Step 8: Found ${allUsers.length} unique users.`);
      setParticipants(allUsers);

      const initialStatus: Record<string, LiquidationStatus> = {};
      allUsers.forEach(user => { initialStatus[user] = 'checking'; });
      setLiquidationStatus(initialStatus);
      console.log("Step 9: Initializing liquidation status for users.");

      for (const user of allUsers) {
        console.log(`Step 10: Checking liquidatable status for user: ${user}`);
        try {
            const isUserLiquidatable = await readContract({
              contract,
              method: 'isLiquidatable',
              params: [user],
            });
            setLiquidationStatus(prev => ({ ...prev, [user]: isUserLiquidatable ? 'liquidatable' : 'safe' }));
            console.log(`Step 10.1: User ${user} is ${isUserLiquidatable ? 'liquidatable' : 'safe'}.`);
        } catch (e) {
            console.error(`Step 10.2: Could not check liquidatable status for ${user}`, e);
            setLiquidationStatus(prev => ({ ...prev, [user]: 'error' }));
        }
      }
      console.log("Step 11: Finished checking all users.");

    } catch (err) {
      console.error('Error scanning for liquidations', JSON.stringify(err, Object.getOwnPropertyNames(err)));
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
