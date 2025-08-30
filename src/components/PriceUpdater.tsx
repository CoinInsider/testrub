'use client';

import { useEffect, useState } from 'react';
import axios from 'axios';
import { client } from '../app/client';
import { useActiveAccount } from 'thirdweb/react';
import { getContract, prepareContractCall, sendTransaction } from 'thirdweb';
import { base } from 'thirdweb/chains';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from '../../utils/contracts';
import { toUnits } from 'thirdweb/utils';
import { formatAmount } from '../../utils/format';

export default function PriceUpdater({ tokens, onTransactionSuccess }: { tokens: Record<string, string>, onTransactionSuccess: () => void }) {
  const [prices, setPrices] = useState<Record<string, { rub: number, usd: number }>>({});
  const [txHash, setTxHash] = useState<string | null>(null);
  const account = useActiveAccount();

  const fetchPrices = async () => {
    try {
      const btc_data = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=rub,usd');
      const eth_data = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=rub,usd');
      const usdc_data = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=usd-coin&vs_currencies=rub,usd');
      const hash_data = await axios.get('https://api.geckoterminal.com/api/v2/networks/base/pools/0x9ab05414f0a3872a78459693f3e3c9ea3f0d6e71?fields=base_token_price_usd');

      const usdc_rub_price = usdc_data.data['usd-coin'].rub;
      const usdc_usd_price = usdc_data.data['usd-coin'].usd;
      const hash_usd_price = parseFloat(hash_data.data.data.attributes.base_token_price_usd);

      setPrices({
        cbBTC: { rub: btc_data.data.bitcoin.rub, usd: btc_data.data.bitcoin.usd },
        ETH: { rub: eth_data.data.ethereum.rub, usd: eth_data.data.ethereum.usd },
        USDC: { rub: usdc_rub_price, usd: usdc_usd_price },
        HASH: { rub: hash_usd_price * usdc_rub_price, usd: hash_usd_price }, // HASH USD price is direct, RUB is converted
        RUB: { rub: 1, usd: 1 / usdc_rub_price }, // Assuming 1 RUB = 1/USDC_RUB_PRICE USD
      });
    } catch (error) {
      console.error('Error fetching prices', error);
    }
  };

  const sendPrice = async (token: string, price: number) => {
    if (!account) return;
    try {
      const contract = getContract({
        client,
        address: CONTRACT_ADDRESS,
        chain: base,
        abi: CONTRACT_ABI,
      });

      const transaction = prepareContractCall({
        contract,
        method: 'setPrice',
        params: [token, toUnits(price.toString(), 18)],
      });

      const { transactionHash } = await sendTransaction({ transaction, account });
      setTxHash(transactionHash);
      onTransactionSuccess(); // Trigger refresh
    } catch (error) {
      console.error('Error sending price', error);
    }
  };

  useEffect(() => {
    fetchPrices();
  }, []);

  return (
    <div>
      <h3 className="text-xl font-semibold mb-4 text-aave-light-blue">Prices</h3>
      <div className="grid grid-cols-2 gap-4"> {/* Added grid-cols-2 and gap-4 */}
        {Object.entries(prices)
          .filter(([token]) => token !== 'RUB') // Filter out the RUB entry
          .map(([token, price]) => (
            <div key={token} className="flex flex-col md:flex-row items-start md:items-center justify-between text-lg p-2 border border-gray-700 rounded-lg"> {/* Adjusted for grid item */}
              <span className="font-medium">{token}</span>
              <div className="flex flex-col md:flex-row md:space-x-2">
                <span className="text-sm font-semibold">{formatAmount(price.rub || 0)} RUB</span>
                <span className="text-xs text-aave-text-dark">({formatAmount(price.usd || 0)} $)</span>
              </div>
            </div>
          ))}
      </div>
      {txHash && <p className="mt-4 text-sm text-aave-text-dark">Tx: <a href={`https://basescan.org/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-aave-light-blue hover:underline">{txHash}</a></p>}
    </div>
  );
}
