import React, { useState, useEffect, useRef, useCallback } from 'react';
import { web3Accounts, web3Enable, web3FromAddress } from '@polkadot/extension-dapp';
import type { InjectedAccountWithMeta } from '@polkadot/extension-inject/types';
import { ethers } from 'ethers';
import ReactConfetti from 'react-confetti';
import { stringToHex } from '@polkadot/util';
import { createPortal } from 'react-dom';
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

// Ensure API URL is correctly set - this might be the source of the connection issue
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
  ? `http://${window.location.hostname}:3001` 
  : 'https://api.production-domain.com'; // For production

console.log('API_URL set to:', API_URL);

// Validate SS58 address format for Avail network (prefix 42)
const isValidAvailAddress = (address: string): boolean => {
  return /^5[1-9A-HJ-NP-Za-km-z]{47,48}$/.test(address);
};

interface LinkedPair {
  avail_address: string;
  evm_address: string;
  final_evm_address: string;
  timestamp: string;
  avail_signature?: string;
  evm_signature?: string;
}

// Confetti component that renders directly to body
const FullScreenConfetti = () => {
  return createPortal(
    <ReactConfetti
      width={window.innerWidth}
      height={window.innerHeight}
      recycle={false}
      numberOfPieces={500}
      gravity={0.2}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    />,
    document.body
  );
};

const WalletPopup = ({ 
  isOpen, 
  onClose, 
  wallets, 
  onSelect, 
  type 
}: { 
  isOpen: boolean; 
  onClose: () => void; 
  wallets: { name: string; icon?: string }[]; 
  onSelect: (wallet: string) => void;
  type: 'avail' | 'evm';
}) => {
  const popupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      style={{
        position: 'absolute',
        top: '0',  
        left: '50%',
        transform: 'translateX(-50%)',  
        backgroundColor: 'rgba(255, 255, 255, 0.75)',  
        backdropFilter: 'blur(10px)',  
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
        minWidth: '240px',
        zIndex: 1000,
        border: '1px solid rgba(0, 0, 0, 0.1)',
      }}
      ref={popupRef}
    >
      <div style={{ 
        fontSize: '14px', 
        color: '#666', 
        marginBottom: '12px',
        textAlign: 'center',
        fontWeight: 500
      }}>
        Select {type === 'avail' ? 'Avail' : 'EVM'} Wallet
      </div>
      {wallets.map((wallet, index) => (
        <div
          key={index}
          onClick={() => onSelect(wallet.name)}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 16px',
            cursor: 'pointer',
            borderRadius: '8px',
            transition: 'all 0.2s ease',
            backgroundColor: 'transparent',
            marginBottom: index === wallets.length - 1 ? 0 : '8px'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
            e.currentTarget.style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          {wallet.icon && (
            <img 
              src={wallet.icon} 
              alt={wallet.name} 
              style={{ 
                width: '28px', 
                height: '28px', 
                marginRight: '12px',
                borderRadius: '6px',
                objectFit: 'contain'
              }} 
            />
          )}
          <span style={{ 
            color: '#333',
            fontSize: '14px',
            fontWeight: 500
          }}>
            {wallet.name}
          </span>
        </div>
      ))}
    </div>
  );
};

function App() {
  // Completely separate state for each wallet type
  // Avail wallet states
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<InjectedAccountWithMeta[]>([]);
  const [availExtensionFound, setAvailExtensionFound] = useState<boolean>(false);
  const [extensionName, setExtensionName] = useState<string>('');
  const [isCheckingAvail, setIsCheckingAvail] = useState<boolean>(false);
  const [isEligible, setIsEligible] = useState<boolean>(false);
  const [eligibilityChecked, setEligibilityChecked] = useState<boolean>(false);
  const [availAlreadyRegistered, setAvailAlreadyRegistered] = useState<boolean>(false); // New state for Avail
  
  // EVM wallet states - completely separate
  const [evmAddress, setEvmAddress] = useState<string>('');
  const [isCheckingEvm, setIsCheckingEvm] = useState<boolean>(false);
  const [isEvmEligible, setIsEvmEligible] = useState<boolean>(false);
  const [evmEligibilityChecked, setEvmEligibilityChecked] = useState<boolean>(false);
  const [evmAlreadyRegistered, setEvmAlreadyRegistered] = useState<boolean>(false); // New state for EVM
  
  // Shared states
  const [linkedPair, setLinkedPair] = useState<any>(null);
  const [finalEvmAddressForAirdrop, setFinalEvmAddressForAirdrop] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [linkingStatus, setLinkingStatus] = useState<string>('');
  const [showConfetti, setShowConfetti] = useState<boolean>(false);
  const [showConnectEVM, setShowConnectEVM] = useState<boolean>(false);
  const [showWalletMenu, setShowWalletMenu] = useState(false);
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight
  });
  const [showRegistrationSuccess, setShowRegistrationSuccess] = useState(false);
  const [isRegistering, setIsRegistering] = useState<boolean>(false);
  const [registrationError, setRegistrationError] = useState<string>('');
  const [registrationTokens, setRegistrationTokens] = useState<number>(0);
  const [registeredEvmAddress, setRegisteredEvmAddress] = useState<string>('');

  // State for wallet-specific registration errors
  const [availRegistrationError, setAvailRegistrationError] = useState<string>('');
  const [evmRegistrationError, setEvmRegistrationError] = useState<string>('');

  // State for eligibility tokens
  const [availTokens, setAvailTokens] = useState<number>(0);
  const [evmTokens, setEvmTokens] = useState<number>(0);

  const [availPopupOpen, setAvailPopupOpen] = useState(false);
  const [evmPopupOpen, setEvmPopupOpen] = useState(false);
  
  // Update wallet lists with local images for all wallets
  const availWallets = [
    { name: 'Polkadot.js Extension', icon: '/img/wallets/polkadot.svg' },
    { name: 'Talisman', icon: '/img/wallets/talisman.svg' },
    { name: 'SubWallet', icon: '/img/wallets/subwallet.svg' }
  ];

  const evmWallets = [
    { name: 'MetaMask', icon: '/img/wallets/metamask.svg' },
    { name: 'WalletConnect', icon: '/img/wallets/walletconnect.svg' },
    { name: 'Coinbase Wallet', icon: '/img/wallets/coinbase.svg' }
  ];

  const handleAvailWalletSelect = async (walletName: string) => {
    setAvailPopupOpen(false);
    // Existing connect logic
    await connectWallet();
  };

  const handleEvmWalletSelect = async (walletName: string) => {
    setEvmPopupOpen(false);
    // Existing connect logic
    await connectEvmWallet();
  };

  useEffect(() => {
    console.log('API URL:', API_URL);
    
    const testApiConnection = async () => {
      try {
        const response = await fetch(`${API_URL}/api-health`);
        const data = await response.text();
        console.log('API Health Check:', data);
      } catch (error) {
        console.error('API health check failed:', error);
      }
    };
    
    testApiConnection();
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

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest('.wallet-management') && !target.closest('.manage-wallets-button')) {
        setShowWalletMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!selectedAccount) {
      setEligibilityChecked(false);
      setIsEligible(false);
    }
  }, [selectedAccount]);
  
  useEffect(() => {
    if (!evmAddress) {
      setEvmEligibilityChecked(false);
      setIsEvmEligible(false);
    }
  }, [evmAddress]);

  // Updated checkEligibility function with signature verification
  const checkEligibility = async (address: string) => {
    if (!address) return null;
    
    console.log('Checking Avail eligibility for address:', address);
    
    setIsCheckingAvail(true);
    setEligibilityChecked(false);
    setIsEligible(false);
    setAvailTokens(0);
    setAvailAlreadyRegistered(false);
    
    try {
      // First get a signature from the user's wallet
      const signatureMessage = "Connecting to AIDX Airdrop Checker";
      let signature = '';
      
      try {
        const injector = await web3FromAddress(address);
        if (!injector?.signer?.signRaw) {
          throw new Error('Signer not available');
        }
        const result = await injector.signer.signRaw({
          address: address,
          data: stringToHex(signatureMessage),
          type: 'bytes'
        });
        signature = result.signature;
        console.log('Obtained Avail signature:', signature);
      } catch (error: any) {
        console.error('Error signing with Avail wallet:', error);
        setError(`Error signing with Avail wallet: ${error.message || error}`);
        setIsCheckingAvail(false);
        return null;
      }
      
      // Check if the address is registered
      const registrationResponse = await fetch(`${API_URL}/api/check-registration/${address}`);
      const registrationData = await registrationResponse.json();
      
      if (registrationData.isRegistered) {
        setAvailAlreadyRegistered(true);
        setEligibilityChecked(true);
        setIsCheckingAvail(false);
        return registrationData;
      }

      // If not registered, check eligibility with signature
      console.log('Making API call with signature');
      const response = await fetch(`${API_URL}/api/check-eligibility`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address: address,
          signature: signature,
          message: signatureMessage
        }),
      });
      
      const data = await response.json();
      console.log('Received API response:', data);
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to check eligibility');
      }
      
      setAvailTokens(data.tokens || 0);
      setIsEligible(data.isEligible);
      setEligibilityChecked(true);
      setIsCheckingAvail(false);
      
      return data;
    } catch (error: any) {
      console.error('Error checking eligibility:', error);
      setError(`Error checking eligibility: ${error.message || error}`);
      setIsCheckingAvail(false);
      setEligibilityChecked(false);
      return null;
    }
  };
  
  // Updated checkEvmEligibility function with signature verification
  const checkEvmEligibility = async (address: string) => {
    if (!address) return null;
    
    console.log('Checking EVM eligibility for address:', address);
    
    setIsCheckingEvm(true);
    setEvmEligibilityChecked(false);
    setIsEvmEligible(false);
    setEvmTokens(0);
    setEvmAlreadyRegistered(false);
    
    try {
      // First get a signature from the user's wallet
      const signatureMessage = "Connecting to AIDX Airdrop Checker";
      let signature = '';
      
      try {
        const provider = new ethers.providers.Web3Provider(window.ethereum as ethers.providers.ExternalProvider);
        const signer = provider.getSigner();
        signature = await signer.signMessage(signatureMessage);
        console.log('Obtained EVM signature:', signature);
      } catch (error: any) {
        console.error('Error signing with EVM wallet:', error);
        setError(`Error signing with EVM wallet: ${error.message || error}`);
        setIsCheckingEvm(false);
        return null;
      }
      
      // Check eligibility with signature
      console.log('Making API call with signature');
      const response = await fetch(`${API_URL}/api/check-evm-eligibility`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address: address,
          signature: signature,
          message: signatureMessage
        }),
      });
      
      const data = await response.json();
      console.log('Received API response:', data);
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to check eligibility');
      }

      // Only set registration status if the address was originally eligible
      if (data.isEligible || data.tokens > 0) {
        setEvmTokens(data.tokens || 0);
        setIsEvmEligible(data.isEligible);
        setEvmAlreadyRegistered(data.isRegistered);
      } else {
        // For ineligible addresses, ensure they're marked as not registered
        setIsEvmEligible(false);
        setEvmAlreadyRegistered(false);
        setEvmTokens(0);
      }
      
      setEvmEligibilityChecked(true);
      setIsCheckingEvm(false);
      
      return data;
    } catch (error: any) {
      console.error('Error checking EVM eligibility:', error);
      setEvmRegistrationError(`Error checking eligibility: ${error.message || error}`);
      setIsCheckingEvm(false);
      setEvmEligibilityChecked(false);
      return null;
    }
  };

  const connectWallet = async () => {
    try {
      setError('');
      
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

  // Updated disconnect functions to also clear registration error messages
  const disconnectAvailWallet = () => {
    setSelectedAccount('');
    setAccounts([]);
    setAvailAlreadyRegistered(false);
    setAvailRegistrationError(''); // Clear Avail registration errors
    setShowConnectEVM(false); // Hide the "Connect EVM" prompt
    setError('');
    setShowRegistrationSuccess(false); // Clear registration success state
    setFinalEvmAddressForAirdrop(''); // Clear final EVM address
  };
  
  const disconnectEvmWallet = () => {
    setEvmAddress('');
    setEvmAlreadyRegistered(false);
    setEvmRegistrationError(''); // Clear EVM registration errors
    setError('');
    setShowRegistrationSuccess(false); // Clear registration success state
    setFinalEvmAddressForAirdrop(''); // Clear final EVM address
  };

  const connectEvmWallet = async () => {
    try {
      // First disconnect any existing connection
      disconnectEvmWallet(); // No need to await this anymore since it's not async
      
      setError('');
      
      if (!window.ethereum) {
        setError('Please install MetaMask to connect your EVM wallet');
        return;
      }
      
      // Force MetaMask to show account selection
      try {
        // This will always trigger the MetaMask popup to select accounts
        await window.ethereum.request({
          method: 'wallet_requestPermissions',
          params: [{ eth_accounts: {} }],
        });
        
        // After permissions are granted, request accounts
        const accounts = await window.ethereum.request({ 
          method: 'eth_requestAccounts'
        });
        
        if (accounts.length > 0) {
          const address = accounts[0];
          setEvmAddress(address);
        } else {
          throw new Error('No accounts found');
        }
      } catch (error: any) {
        if (error.code === 4001) {
          // User rejected the connection request
          setError('Please connect your MetaMask wallet to continue');
        } else {
          throw error;
        }
      }
    } catch (error: any) {
      console.error('Error connecting EVM wallet:', error);
      setError(`Error connecting EVM wallet: ${error.message || error}`);
    }
  };

  const handleRegistration = async () => {
    if (!selectedAccount && !evmAddress) {
      setRegistrationError('Please connect at least one wallet');
      return;
    }

    try {
      setIsRegistering(true);
      setRegistrationError('');
      
      let evmSignature = '';
      let availSignature = '';
      let finalEvmAddress = '';

      const signatureMessage = "Registering Wallets for AIDX Airdrop";

      // Case 1: Avail wallet is eligible and not registered
      if (selectedAccount && isEligible && !availAlreadyRegistered) {
        try {
          const injector = await web3FromAddress(selectedAccount);
          if (!injector?.signer?.signRaw) {
            throw new Error('Signer not available');
          }
          const { signature } = await injector.signer.signRaw({
            address: selectedAccount,
            data: stringToHex(signatureMessage),
            type: 'bytes'
          });
          availSignature = signature;

          // For Avail registration, we need an EVM signature for the final address
          // The EVM wallet doesn't need to be eligible, it just needs to sign
          if (!evmAddress) {
            setRegistrationError('Please connect your EVM wallet to set the final address');
            return;
          }

          try {
            const provider = new ethers.providers.Web3Provider(window.ethereum as ethers.providers.ExternalProvider);
            const signer = provider.getSigner();
            evmSignature = await signer.signMessage(signatureMessage);
            console.log('EVM Signature:', evmSignature);
            finalEvmAddress = evmAddress;
          } catch (error: any) {
            console.error('Error signing with EVM wallet:', error);
            setRegistrationError(`Error signing with EVM wallet: ${error.message || error}`);
            return;
          }
        } catch (error: any) {
          console.error('Error signing with Avail wallet:', error);
          setRegistrationError(`Error signing with Avail wallet: ${error.message || error}`);
          return;
        }
      }
      // Case 2: EVM-only registration (when Avail is not eligible or already registered)
      else if (evmAddress && isEvmEligible && !evmAlreadyRegistered) {
        try {
          const provider = new ethers.providers.Web3Provider(window.ethereum as ethers.providers.ExternalProvider);
          const signer = provider.getSigner();
          evmSignature = await signer.signMessage(signatureMessage);
          console.log('EVM Signature:', evmSignature);
          finalEvmAddress = evmAddress;
        } catch (error: any) {
          console.error('Error signing with EVM wallet:', error);
          setRegistrationError(`Error signing with EVM wallet: ${error.message || error}`);
          return;
        }
      } else {
        // Check specific conditions to provide better error messages
        if (selectedAccount && !isEligible && evmAddress && !isEvmEligible) {
          setRegistrationError('Neither wallet is eligible for registration');
        } else if (selectedAccount && availAlreadyRegistered && evmAddress && evmAlreadyRegistered) {
          setRegistrationError('Both wallets are already registered');
        } else if (selectedAccount && availAlreadyRegistered && evmAddress && !isEvmEligible) {
          setRegistrationError('Avail wallet is already registered and EVM wallet is not eligible');
        } else if (selectedAccount && !isEligible && evmAddress && evmAlreadyRegistered) {
          setRegistrationError('Avail wallet is not eligible and EVM wallet is already registered');
        } else {
          setRegistrationError('No eligible unregistered addresses to register');
        }
        return;
      }

      // Determine what we're registering based on eligibility and registration status
      const registrationData = {
        availAddress: selectedAccount && isEligible && !availAlreadyRegistered ? selectedAccount : '',
        evmAddress: evmAddress && isEvmEligible && !evmAlreadyRegistered ? evmAddress : '',
        finalEvmAddress: evmAddress,  // Always use the connected EVM address as final
        availSignature,
        evmSignature,
        timestamp: new Date().toISOString()
      };

      // Log registration attempt
      console.log('Attempting registration with:', {
        selectedAccount,
        evmAddress,
        isEligible,
        isEvmEligible,
        availAlreadyRegistered,
        evmAlreadyRegistered
      });

      const response = await fetch(`${API_URL}/api/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(registrationData),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Registration failed:', data);
        if (data.type === 'avail') {
          setAvailRegistrationError(data.error);
        } else if (data.type === 'evm') {
          setEvmRegistrationError(data.error);
        } else {
          setRegistrationError(data.error || 'Failed to register addresses');
        }
        return;
      }

      // Update UI with registration success
      setShowRegistrationSuccess(true);
      setRegistrationTokens(data.data.tokens || 0);
      setRegisteredEvmAddress(data.data.final_evm_address);
      setFinalEvmAddressForAirdrop(data.data.final_evm_address);
      
      // Show confetti effect
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 10000);
      
      // Reset only registration-related states
      setIsEligible(false);
      setIsEvmEligible(false);
      setEligibilityChecked(false);
      setEvmEligibilityChecked(false);
      setAvailRegistrationError('');
      setEvmRegistrationError('');
      
    } catch (error: any) {
      console.error('Registration error:', error);
      setRegistrationError(`Failed to register: ${error.message}`);
    } finally {
      setIsRegistering(false);
    }
  };

  const renderRegistrationSuccess = () => {
    if (!showRegistrationSuccess) return null;

    const shortenedAddress = registeredEvmAddress ? 
      registeredEvmAddress.slice(0, 6) + '...' + registeredEvmAddress.slice(-4) : '';

    return (
      <div className="registration-success">
        <p className="registration-success-main">
          You will receive <span className="highlight-text">{registrationTokens} AIDX</span> tokens on <span className="highlight-text">{shortenedAddress}</span>
        </p>
        <p className="registration-success-sub">
          ✨ You've successfully registered for the airdrop! 🥳
        </p>
      </div>
    );
  };

  const handleAccountChange = async (event: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedAccount(event.target.value);
  };

  const truncateAddress = (address: string) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  // Helper function to check registration status and show success message
  const checkAndShowRegistrationStatus = async (walletType: 'avail' | 'evm', address: string) => {
    try {
      // Fetch the linked_addresses.json data to check if this address is in there
      const response = await fetch(`${API_URL}/api/debug-db-check/${address}`);
      const data = await response.json();
      
      if (response.ok) {
        // Check if this address is registered
        const isRegistered = walletType === 'avail' 
          ? data.matchingRecords.asAvailAddress.length > 0
          : data.matchingRecords.asEvmAddress.length > 0 || data.matchingRecords.asFinalEvmAddress.length > 0;
          
        if (isRegistered) {
          // Get the registration data for this address
          const registration = walletType === 'avail'
            ? data.matchingRecords.asAvailAddress[0]
            : data.matchingRecords.asEvmAddress[0] || data.matchingRecords.asFinalEvmAddress[0];
            
          if (registration) {
            // Show registration success message
            setFinalEvmAddressForAirdrop(registration.final_evm_address);
            setShowRegistrationSuccess(true);
            setRegistrationTokens(registration.totalTokens || 0);
            setRegisteredEvmAddress(registration.final_evm_address);
          }
        }
      }
    } catch (error) {
      console.error('Error checking registration status:', error);
    }
  };

  const renderAvailEligibilityMessage = () => {
    if (!selectedAccount || !eligibilityChecked) return null;
    
    if (availAlreadyRegistered) {
      return (
        <p className="eligibility-message">✅ Your Avail address is already registered.</p>
      );
    } else if (isEligible) {
      return (
        <p className="eligibility-message">✅ Your Avail address is eligible for {availTokens} AIDX tokens!</p>
      );
    } else {
      return (
        <p className="eligibility-message">❌ Your Avail address is not eligible for the airdrop.</p>
      );
    }
  };

  const renderEvmEligibilityMessage = () => {
    if (!evmAddress || !evmEligibilityChecked) return null;
    
    // First check if the address is in eligible list
    if (!isEvmEligible && !evmAlreadyRegistered) {
      return (
        <p className="eligibility-message">❌ Your EVM address is not eligible for the airdrop.</p>
      );
    }

    // Only show registration status for addresses that were originally eligible
    if (evmAlreadyRegistered) {
      return (
        <p className="eligibility-message">✅ Your EVM address is already registered.</p>
      );
    } else {
      return (
        <p className="eligibility-message">✅ Your EVM address is eligible for {evmTokens} AIDX tokens!</p>
      );
    }
  };

  const [activeFaq, setActiveFaq] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setActiveFaq(activeFaq === index ? null : index);
  };

  return (
    <>
      {/* Confetti rendered via portal directly to body */}
      {showConfetti && <FullScreenConfetti />}
      
      <div style={{ transform: 'scale(0.85)', transformOrigin: 'top center' }}>
        <div className="app">
          <div className="header-container">
            <div className="wallet-management">
              <button 
                className="manage-wallets-button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowWalletMenu(!showWalletMenu);
                }}
              >
                Manage Wallets
              </button>
              {showWalletMenu && (
                <div className="wallet-menu">
                  {selectedAccount && (
                    <div className="wallet-menu-section">
                      <p className="wallet-menu-title">Avail: 🔗</p>
                      <div className="wallet-menu-item">
                        <p className="wallet-address">{truncateAddress(selectedAccount)}</p>
                        <button onClick={disconnectAvailWallet}>
                          Disconnect
                        </button>
                      </div>
                      {accounts.length > 1 && (
                        <div className="account-list">
                          <p className="other-accounts-label">Select Account:</p>
                          {accounts.map((account, index) => (
                            account.address !== selectedAccount && (
                              <div 
                                key={index} 
                                className="account-option"
                                onClick={() => {
                                  setSelectedAccount(account.address);
                                }}
                              >
                                <span>{account.meta.name || "Account " + (index + 1)}</span>
                                <p className="selector-address">{truncateAddress(account.address)}</p>
                              </div>
                            )
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {evmAddress && (
                    <div className="wallet-menu-section">
                      <p className="wallet-menu-title">EVM: 🔗</p>
                      <div className="wallet-menu-item">
                        <p className="wallet-address">{truncateAddress(evmAddress)}</p>
                        <button onClick={disconnectEvmWallet}>
                          Disconnect
                        </button>
                      </div>
                    </div>
                  )}
                  {!selectedAccount && !evmAddress && (
                    <p className="no-wallets-message">No wallets connected</p>
                  )}
                </div>
              )}
            </div>
          </div>
          
          <div className="logo-container">
            <a href="https://aidx.exchange/#/home" target="_blank" rel="noopener noreferrer">
              <img src="/img/aidx.png" alt="AIDX Logo" className="aidx-logo" />
            </a>
          </div>
          
          <h1 className="main-title">
            AIDX AIRDROP ALLOCATION CHECKER
          </h1>
          
          <div className="login-container">
            <div className="description-container" style={{ display: 'none' }}>
              <p>Check your eligibility for the Avail Network airdrop and register your linked wallet addresses</p>
            </div>

            {/* Wallet Sections Container */}
            <div className="eligibility-check-container">
              {/* Avail Wallet Section */}
              <div className="wallet-section">
                <img src="/img/avail.svg" alt="Avail" className="wallet-header-image" />
                {selectedAccount ? (
                  <>
                    <button className="wallet-disconnect-button" onClick={disconnectAvailWallet}>
                      <span className="close-x">×</span>
                    </button>
                    <div className="wallet-address-box">
                      <p>🔗 {selectedAccount}</p>
                    </div>
                    <button 
                      className="check-button" 
                      onClick={(e) => {
                        e.preventDefault();
                        console.log("Check Eligibility button clicked for Avail address:", selectedAccount);
                        if (selectedAccount) {
                          checkEligibility(selectedAccount);
                        }
                      }}
                    >
                      Check Eligibility
                    </button>
                    
                    {/* Eligibility check states */}
                    {!isCheckingAvail && eligibilityChecked && (
                      <div className="eligibility-result-container">
                        {renderAvailEligibilityMessage()}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p>Connect your Avail wallet to check eligibility</p>
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={() => setAvailPopupOpen(true)}
                        className="connect-button"
                        style={{
                          position: 'relative',
                          marginBottom: '8px',
                          visibility: availPopupOpen ? 'hidden' : 'visible'  
                        }}
                      >
                        Connect Avail Wallet
                      </button>
                      <WalletPopup
                        isOpen={availPopupOpen}
                        onClose={() => setAvailPopupOpen(false)}
                        wallets={availWallets}
                        onSelect={handleAvailWalletSelect}
                        type="avail"
                      />
                    </div>
                  </>
                )}
              </div>

              {/* EVM Wallet Section */}
              <div className="wallet-section">
                <img src="/img/deq.png" alt="DEQ" className="wallet-header-image" />
                {evmAddress ? (
                  <>
                    <button 
                      className="wallet-disconnect-button" 
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent event propagation
                        disconnectEvmWallet();
                      }}
                    >
                      <span className="close-x">×</span>
                    </button>
                    <div className="wallet-address-box">
                      <p>🔗 {evmAddress}</p>
                    </div>
                    <button 
                      className="check-button" 
                      onClick={(e) => {
                        e.preventDefault();
                        console.log("Check Eligibility button clicked for EVM address:", evmAddress);
                        if (evmAddress) {
                          checkEvmEligibility(evmAddress);
                        } else {
                          setError('Please connect an EVM wallet first');
                        }
                      }}
                      disabled={isCheckingEvm}
                    >
                      Check Eligibility
                    </button>
                    
                    {/* Eligibility check states */}
                    {!isCheckingEvm && evmEligibilityChecked && (
                      <div className="eligibility-result-container">
                        {renderEvmEligibilityMessage()}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p>Connect your EVM wallet to check eligibility</p>
                    <div style={{ position: 'relative' }}>
                      <button
                        onClick={() => setEvmPopupOpen(true)}
                        className="connect-button"
                        style={{
                          position: 'relative',
                          marginBottom: '8px',
                          visibility: evmPopupOpen ? 'hidden' : 'visible'  
                        }}
                      >
                        Connect EVM Wallet
                      </button>
                      <WalletPopup
                        isOpen={evmPopupOpen}
                        onClose={() => setEvmPopupOpen(false)}
                        wallets={evmWallets}
                        onSelect={handleEvmWalletSelect}
                        type="evm"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Centralized Register Wallet button - only shown when eligible */}
            {(isEligible || isEvmEligible) && (
              <div className="centralized-registration">
                <button 
                  className="register-wallet-button"
                  onClick={handleRegistration}
                  disabled={isRegistering || (!isEligible && !isEvmEligible)}
                >
                  {isRegistering ? 'Registering...' : 'Register Wallet for Airdrop'}
                </button>
                
                {registrationError && (
                  <p className="error-message">{registrationError}</p>
                )}
                
                {renderRegistrationSuccess()}
              </div>
            )}

            {/* Error Message */}
            {error && <div className="error-message">{error}</div>}
            
            {/* Registration Success UI */}
            {renderRegistrationSuccess()}
          </div>

          {/* FAQ Section */}
          <div className="faq-section">
            <h2 className="faq-title">FAQs</h2>
            <div className="faq-container">
              <div className={`faq-item ${activeFaq === 0 ? 'active' : ''}`}>
                <div className="faq-question" onClick={() => toggleFaq(0)}>
                  <div className="faq-question-text">What wallets support Avail?</div>
                  <div className="faq-toggle"></div>
                </div>
                <div className="faq-answer">
                  You can use <a href="https://www.subwallet.app/" target="_blank" rel="noopener noreferrer">Subwallet</a>, <a href="https://polkadot.js.org/extension/" target="_blank" rel="noopener noreferrer">Polkadot.js</a>, <a href="https://talisman.xyz/" target="_blank" rel="noopener noreferrer">Talisman</a>, and <a href="https://fearlesswallet.io/" target="_blank" rel="noopener noreferrer">Fearless Wallet</a>.
                </div>
              </div>

              <div className={`faq-item ${activeFaq === 1 ? 'active' : ''}`}>
                <div className="faq-question" onClick={() => toggleFaq(1)}>
                  <div className="faq-question-text">Who is eligible for the AIDX Airdrop?</div>
                  <div className="faq-toggle"></div>
                </div>
                <div className="faq-answer">
                  Avail Mainnet Stakers and Deq.fi Stakers.
                </div>
              </div>

              <div className={`faq-item ${activeFaq === 2 ? 'active' : ''}`}>
                <div className="faq-question" onClick={() => toggleFaq(2)}>
                  <div className="faq-question-text">I have an Avail proxy account or cold wallet. How can I check my Airdrop eligibility?</div>
                  <div className="faq-toggle"></div>
                </div>
                <div className="faq-answer">
                  Try connecting one of your MultiSig Member Accounts to verify eligibility.
                </div>
              </div>

              <div className={`faq-item ${activeFaq === 3 ? 'active' : ''}`}>
                <div className="faq-question" onClick={() => toggleFaq(3)}>
                  <div className="faq-question-text">When will I receive my AIDX tokens?</div>
                  <div className="faq-toggle"></div>
                </div>
                <div className="faq-answer">
                  The Airdrop Checker will display your token amount a user is eligible. The Tokens will be airdropped to eligible users on TGE. Stay Tuned <a href="https://x.com/aigisos" target="_blank" rel="noopener noreferrer">@aigisos</a>.
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default App;
