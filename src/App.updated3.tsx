import React, { useEffect, useState } from 'react';
import { web3Accounts, web3Enable, web3FromAddress } from '@polkadot/extension-dapp';
import { ethers } from 'ethers';
import ReactConfetti from 'react-confetti';
import './App.css';

interface ProviderRpcError extends Error {
  code: number;
  data?: unknown;
  message: string;
}

interface MetaMaskError extends Error {
  code?: number;
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, handler: (params: any) => void) => void;
      removeListener: (event: string, handler: (params: any) => void) => void;
      // Required by ethers.js
      isMetaMask?: boolean;
      isStatus?: boolean;
      host?: string;
      path?: string;
      sendAsync?: (request: any, callback: (error: any, response: any) => void) => void;
      send?: (request: any, callback: (error: any, response: any) => void) => void;
      enable?: () => Promise<string[]>;
    };
  }
}

const API_URL = 'http://127.0.0.1:3001';

// Validate SS58 address format for Avail network (prefix 42)
const isValidAvailAddress = (address: string): boolean => {
  return /^5[1-9A-HJ-NP-Za-km-z]{47,48}$/.test(address);
};

interface LinkedPair {
  avail_address: string;
  evm_address: string;
  final_evm_address: string;
  timestamp: string;
}

function App() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [evmAddress, setEvmAddress] = useState<string>('');
  const [linkingStatus, setLinkingStatus] = useState<string>('');
  const [isEligible, setIsEligible] = useState<boolean>(false);
  const [linkedPair, setLinkedPair] = useState<LinkedPair | null>(null);
  const [eligibilityChecked, setEligibilityChecked] = useState<boolean>(false);
  const [showConnectEVM, setShowConnectEVM] = useState<boolean>(false);
  const [showConfetti, setShowConfetti] = useState<boolean>(false);
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [isEvmEligible, setIsEvmEligible] = useState<boolean>(false);
  const [evmEligibilityChecked, setEvmEligibilityChecked] = useState<boolean>(false);
  const [isAlreadyRegistered, setIsAlreadyRegistered] = useState<boolean>(false);
  const [evmIsAlreadyRegistered, setEvmIsAlreadyRegistered] = useState<boolean>(false);

  useEffect(() => {
    connectWallet();

    const handleResize = () => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Check if registration is possible based on eligibility
  const canRegister = () => {
    // Both wallets must be connected
    if (!selectedAccount || !evmAddress) return false;
    
    // Both eligibility checks must have been performed
    if (!eligibilityChecked || !evmEligibilityChecked) return false;
    
    // Check if either wallet is eligible
    const availEligible = isEligible && !isAlreadyRegistered;
    const evmEligible = isEvmEligible && !evmIsAlreadyRegistered;
    
    // At least one wallet must be eligible
    return availEligible || evmEligible;
  };

  // Function to check Avail wallet eligibility
  const checkEligibility = async (address: string) => {
    try {
      setError('');
      setEligibilityChecked(false);
      setIsEligible(false);
      setIsAlreadyRegistered(false);
      
      console.log('Checking Avail eligibility for:', address);
      const response = await fetch(`${API_URL}/api/check-eligibility/${address}`);
      const data = await response.json();
      console.log('Eligibility check response:', data);

      // Check if address is in the eligible list (whether registered or not)
      const eligibleAddressesResponse = await fetch(`${API_URL}/api/check-raw-eligibility/${address}`);
      const eligibleAddressesData = await eligibleAddressesResponse.json();
      
      setEligibilityChecked(true);
      setIsEligible(eligibleAddressesData.isInEligibleList);
      setIsAlreadyRegistered(data.isRegistered);

      // Check if this address is already registered
      const registrationResponse = await fetch(`${API_URL}/api/check-registration/${address}`);
      const registrationData = await registrationResponse.json();
      
      if (registrationData.isRegistered) {
        setLinkedPair(registrationData.registeredWallet);
      } else {
        setLinkedPair(null);
      }

    } catch (err) {
      console.error('Error checking eligibility:', err);
      setError('Failed to check eligibility. Please try again.');
      setEligibilityChecked(false);
      setIsEligible(false);
    }
  };

  // Function to check EVM wallet eligibility
  const checkEvmEligibility = async (address: string) => {
    try {
      setError('');
      setEvmEligibilityChecked(false);
      setIsEvmEligible(false);
      setEvmIsAlreadyRegistered(false);

      console.log('Checking EVM eligibility for:', address);
      const response = await fetch(`${API_URL}/api/check-evm-eligibility/${address}`);
      const data = await response.json();
      console.log('EVM eligibility check response:', data);

      // Check if address is in the eligible list (whether registered or not)
      const eligibleAddressesResponse = await fetch(`${API_URL}/api/check-raw-evm-eligibility/${address}`);
      const eligibleAddressesData = await eligibleAddressesResponse.json();
      
      setEvmEligibilityChecked(true);
      setIsEvmEligible(eligibleAddressesData.isInEligibleList);
      setEvmIsAlreadyRegistered(data.isRegistered);

      // Check if this address is already registered
      const registrationResponse = await fetch(`${API_URL}/api/check-registration/${address}`);
      const registrationData = await registrationResponse.json();
      
      if (registrationData.isRegistered) {
        setLinkedPair(registrationData.registeredWallet);
      } else {
        setLinkedPair(null);
      }

    } catch (err) {
      console.error('Error checking EVM eligibility:', err);
      setError('Failed to check EVM eligibility. Please try again.');
      setEvmEligibilityChecked(false);
      setIsEvmEligible(false);
    }
  };

  const connectWallet = async () => {
    try {
      const extensions = await web3Enable('Avail Network Login');
      
      if (extensions.length === 0) {
        setError('No Polkadot.js extension found! Please install it to connect to Avail Network.');
        return;
      }

      const allAccounts = await web3Accounts();
      setAccounts(allAccounts);
      
      if (allAccounts.length > 0) {
        const address = allAccounts[0].address;
        setSelectedAccount(address);
      }
    } catch (err) {
      setError('Failed to connect to wallet. Please try again.');
      console.error(err);
    }
  };

  const disconnectAvailWallet = () => {
    setSelectedAccount('');
    setAccounts([]);
    setIsEligible(false);
    setEligibilityChecked(false);
    setLinkedPair(null);
    setShowWalletMenu(false);
    setIsAlreadyRegistered(false);
  };

  const disconnectEvmWallet = async () => {
    setEvmAddress('');
    setIsEvmEligible(false);
    setEvmEligibilityChecked(false);
    setShowWalletMenu(false);
    setEvmIsAlreadyRegistered(false);
    // Clear any cached permissions
    if (window.ethereum) {
      try {
        await window.ethereum.request({
          method: 'wallet_revokePermissions',
          params: [{ eth_accounts: {} }]
        });
      } catch (err) {
        const providerError = err as ProviderRpcError;
        console.error('Failed to revoke wallet permissions:', providerError?.message || 'Unknown error');
        // Don't show error to user since the disconnect was still successful from their perspective
      }
    }
  };

  const connectEvmWallet = async () => {
    try {
      setError('');
      if (!window.ethereum) {
        setError('Please install MetaMask to connect your EVM wallet');
        return;
      }

      const provider = new ethers.providers.Web3Provider(window.ethereum as ethers.providers.ExternalProvider);
      
      try {
        // Only request accounts, don't request permissions first
        const accounts = await provider.send("eth_requestAccounts", []);
        const address = accounts[0];
        setEvmAddress(address);
        
        // Check eligibility if an address is connected
        if (address) {
          await checkEvmEligibility(address);
        }
      } catch (err) {
        const metaMaskError = err as MetaMaskError;
        if (metaMaskError.code === -32002) {
          setError('Please check MetaMask for pending connection request');
          return;
        }
        throw err;
      }
    } catch (err) {
      console.error('MetaMask connection error:', err);
      const metaMaskError = err as MetaMaskError;
      if (metaMaskError.code === -32002) {
        setError('Please check MetaMask for pending connection request');
      } else {
        setError('Failed to connect EVM wallet. Please try again.');
      }
    }
  };

  const registerWallet = async () => {
    try {
      // Clear any previous error messages
      setError('');
      setLinkingStatus('');

      let finalEvmAddress = '';
      
      // Determine which wallet to register
      const registerAvail = isEligible && !isAlreadyRegistered;
      const registerEvm = isEvmEligible && !evmIsAlreadyRegistered;
      
      if (!registerAvail && !registerEvm) {
        setError('Neither of your wallets are eligible for registration');
        return;
      }

      // For any registration, we need an EVM wallet for signing
      if (!window.ethereum) {
        setError('Please install MetaMask to connect your EVM wallet');
        return;
      }

      // Get EVM address for registration
      try {
        // Get EVM signature
        const provider = new ethers.providers.Web3Provider(window.ethereum as ethers.providers.ExternalProvider);
        
        try {
          // Only request accounts, don't request permissions first
          const accounts = await provider.send("eth_requestAccounts", []);
          const signer = provider.getSigner();
          finalEvmAddress = accounts[0]; // Use the connected address
          
          // Create a message to sign
          let message = `Register `;
          if (registerAvail) {
            message += `Avail address ${selectedAccount}`;
            if (registerEvm) {
              message += ` and EVM address ${evmAddress}`;
            }
          } else if (registerEvm) {
            message += `EVM address ${evmAddress}`;
          }
          message += ` with final EVM address ${finalEvmAddress}`;
          
          // Get EVM signature using the same signer
          const evmSignature = await signer.signMessage(message);

          // Prepare registration data
          const registrationData = {
            availAddress: registerAvail ? selectedAccount : '',
            evmAddress: registerEvm ? evmAddress : '',
            finalEvmAddress,
            evmSignature,
            timestamp: new Date().toISOString()
          };

          console.log('Sending registration data:', registrationData);

          // Send the registration request
          const response = await fetch(`${API_URL}/api/link-addresses`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(registrationData),
          });

          const data = await response.json();
          
          if (!response.ok) {
            console.error('Registration failed:', data);
            throw new Error(data.error || 'Failed to register wallet');
          }

          // Set success state
          setLinkingStatus('✨ Wallet Registration Successful! ✨');
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 5000);
          
          // Refresh registration status
          if (selectedAccount) {
            await checkEligibility(selectedAccount);
          }
          if (evmAddress) {
            await checkEvmEligibility(evmAddress);
          }
        } catch (err) {
          const metaMaskError = err as MetaMaskError;
          if (metaMaskError.code === -32002) {
            setError('Please check MetaMask for pending connection request');
            return;
          }
          throw err;
        }

      } catch (err) {
        console.error('Registration error:', err);
        const metaMaskError = err as MetaMaskError;
        // Check if the error is from MetaMask
        if (metaMaskError.code === -32002) {
          throw new Error('Please check MetaMask for pending connection request');
        }
        // Check if the error is from the server
        if (err instanceof Error && err.message.includes('already registered')) {
          throw new Error('This address has already been registered. Please use a different address.');
        }
        throw new Error('Failed to complete registration. Please try again.');
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to register wallet. Please try again.';
      setError(errorMessage);
      setLinkingStatus('');
      console.error('Registration error:', err);
    }
  };

  const handleAccountChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    setIsEvmEligible(false);
    setEvmEligibilityChecked(false);
    const address = event.target.value;
    setSelectedAccount(address);
    setIsEligible(false);
    setLinkedPair(null);
    setError('');
    setEvmAddress('');
    setEligibilityChecked(false);
    setShowConnectEVM(false);
    setIsAlreadyRegistered(false);
  };

  const truncateAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  return (
    <div className="app">
      {/* Wallet Management Menu */}
      <div className="wallet-management">
        <button className="manage-wallets-button" onClick={() => setShowWalletMenu(!showWalletMenu)}>
          Manage Wallets
        </button>
        {showWalletMenu && (
          <div className="wallet-menu">
            {selectedAccount && (
              <div className="wallet-menu-item">
                <p className="wallet-address">Avail: {truncateAddress(selectedAccount)}</p>
                <button onClick={disconnectAvailWallet}>
                  Disconnect
                </button>
              </div>
            )}
            {evmAddress && (
              <div className="wallet-menu-item">
                <p className="wallet-address">EVM: {truncateAddress(evmAddress)}</p>
                <button onClick={disconnectEvmWallet}>
                  Disconnect
                </button>
              </div>
            )}
            {!selectedAccount && !evmAddress && (
              <p className="no-wallets-message">No wallets connected</p>
            )}
          </div>
        )}
      </div>

      <div className="login-container">
        <h1>AIDX Airdrop Registration</h1>
        <p className="description">Check your eligibility for the AIDX airdrop by connecting your Avail and/or EVM wallets.</p>

        {/* Avail Wallet Section */}
        <div className="eligibility-check-container">
          <div className="wallet-section">
            <h3>Avail Wallet</h3>
            {!selectedAccount ? (
              <>
                <p>Connect your Avail wallet to check eligibility</p>
                <button className="connect-button" onClick={connectWallet}>
                  Connect Avail Wallet
                </button>
              </>
            ) : (
              <>
                <p>Connected: {truncateAddress(selectedAccount)}</p>
                {!eligibilityChecked ? (
                  <button className="check-button" onClick={() => checkEligibility(selectedAccount)}>
                    Check Eligibility
                  </button>
                ) : (
                  <>
                    {isEligible ? (
                      isAlreadyRegistered ? (
                        <p className="success-message">
                          ✨ You're successfully registered for the airdrop! 🥳
                        </p>
                      ) : (
                        <p className="success-message">
                          ✅ Your Avail wallet is eligible!
                        </p>
                      )
                    ) : (
                      <p className="error-message">❌ Your Avail wallet is not eligible for the airdrop</p>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* EVM Wallet Section */}
          <div className="wallet-section">
            <h3>EVM Wallet</h3>
            {!evmAddress ? (
              <>
                <p>Connect your EVM wallet to check eligibility</p>
                <button className="connect-button metamask" onClick={connectEvmWallet}>
                  Connect EVM Wallet
                </button>
              </>
            ) : (
              <>
                <p>Connected: {truncateAddress(evmAddress)}</p>
                {!evmEligibilityChecked ? (
                  <button className="check-button" onClick={() => checkEvmEligibility(evmAddress)}>
                    Check Eligibility
                  </button>
                ) : (
                  <>
                    {isEvmEligible ? (
                      evmIsAlreadyRegistered ? (
                        <p className="success-message">
                          ✨ You're successfully registered for the airdrop! 🥳
                        </p>
                      ) : (
                        <p className="success-message">
                          ✅ Your EVM wallet is eligible!
                        </p>
                      )
                    ) : (
                      <p className="error-message">❌ Your EVM wallet is not eligible for the airdrop</p>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* Centralized Registration Button */}
        {canRegister() && (
          <div className="centralized-registration">
            <button className="register-wallet-button" onClick={registerWallet}>
              Register Wallet{(isEligible && isEvmEligible) ? 's' : ''}
            </button>
          </div>
        )}

        {/* Error Message */}
        {error && <div className="error-message">{error}</div>}
        
        {/* Linking Status */}
        {linkingStatus && <div className="linking-status">{linkingStatus}</div>}
        
        {/* Confetti Effect */}
        {showConfetti && (
          <ReactConfetti
            width={windowSize.width}
            height={windowSize.height}
            recycle={false}
            numberOfPieces={500}
            gravity={0.2}
          />
        )}
      </div>
    </div>
  );
}

export default App;
