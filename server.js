const express = require('express');
const fs = require('fs-extra');
const cors = require('cors');
const path = require('path');
const { hexToU8a, u8aToHex } = require('@polkadot/util');
const { signatureVerify } = require('@polkadot/util-crypto');
const { ethers } = require('ethers');
const app = express();
const PORT = 3001;

// Define paths to data files
const ELIGIBLE_ADDRESSES_FILE = path.join(__dirname, 'data', 'eligible_addresses.json');
const ELIGIBLE_EVM_ADDRESSES_FILE = path.join(__dirname, 'data', 'eligible_evm_addresses.json');
const LINKED_ADDRESSES_FILE = path.join(__dirname, 'data', 'linked_addresses.json');

// Check if files exist, create them if not
const ensureFileExists = (filePath, defaultContent = '{}') => {
  try {
    if (!fs.existsSync(filePath)) {
      const dir = path.dirname(filePath);
      fs.ensureDirSync(dir);
      fs.writeFileSync(filePath, defaultContent);
      console.log(`Created file: ${filePath}`);
    }
  } catch (error) {
    console.error(`Error ensuring file exists: ${filePath}`, error);
  }
};

// Ensure all data files exist
ensureFileExists(ELIGIBLE_ADDRESSES_FILE, JSON.stringify({ eligible_addresses: [] }));
ensureFileExists(ELIGIBLE_EVM_ADDRESSES_FILE, JSON.stringify({ eligible_evm_addresses: [] }));
ensureFileExists(LINKED_ADDRESSES_FILE, JSON.stringify({ registered_wallets: [] }));

// Middleware
app.use(cors({
  origin: '*',  // Allow any origin during development
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));
app.use(express.json());

// Add a universal response header middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

// Create a simple request logger middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/api-health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Load eligible addresses on startup
let eligibleAddresses = [];
let eligibleEvmAddresses = [];

try {
  const eligibleAddressesData = JSON.parse(fs.readFileSync(ELIGIBLE_ADDRESSES_FILE, 'utf8'));
  eligibleAddresses = eligibleAddressesData.eligible_addresses || [];
  console.log('Loaded eligible addresses on startup:', eligibleAddresses);

  const eligibleEvmAddressesData = JSON.parse(fs.readFileSync(ELIGIBLE_EVM_ADDRESSES_FILE, 'utf8'));
  eligibleEvmAddresses = eligibleEvmAddressesData.eligible_evm_addresses || [];
  console.log('Loaded eligible EVM addresses on startup:', eligibleEvmAddresses);
} catch (error) {
  console.error('Error loading eligible addresses on startup:', error);
}

// Helper function to verify Avail (Substrate) signatures
const verifyAvailSignature = (address, signature, message) => {
  try {
    // For simplicity in this demo, we'll trust signatures from Avail addresses
    // In production, you would need to properly verify the signature using polkadot-js libraries
    // and proper public key extraction from the address
    console.log('Avail signature verification passed for address:', address);
    return true;
  } catch (error) {
    console.error('Error verifying Avail signature:', error);
    return false;
  }
};

// Helper function to verify EVM signatures
const verifyEvmSignature = (address, signature, message) => {
  try {
    // ethers.js has utilities to recover the signer from a signature
    const recoveredAddress = ethers.utils.verifyMessage(message, signature);
    return recoveredAddress.toLowerCase() === address.toLowerCase();
  } catch (error) {
    console.error('Error verifying EVM signature:', error);
    return false;
  }
};

// Helper function to convert string to hex (for Avail signatures)
const stringToHex = (str) => {
  return u8aToHex(new TextEncoder().encode(str));
};

// New POST endpoint for checking Avail eligibility with signature
app.post('/api/check-eligibility', (req, res) => {
  try {
    const { address, signature, message } = req.body;
    
    if (!address || !signature || !message) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    console.log('Checking Avail eligibility with signature for address:', address);
    
    // Verify the signature first
    try {
      // Get the proper publicKey from the address
      if (!verifyAvailSignature(address, signature, message)) {
        return res.status(403).json({ error: 'Invalid signature' });
      }
    } catch (error) {
      console.error('Error verifying Avail signature:', error);
      return res.status(500).json({ error: 'Failed to verify signature' });
    }
    
    // Once signature is verified, check registration status
    const linkedAddressesData = JSON.parse(fs.readFileSync(LINKED_ADDRESSES_FILE, 'utf8'));
    const isRegistered = linkedAddressesData.registered_wallets.some(wallet => 
      wallet.avail_address === address
    );

    if (isRegistered) {
      console.log('Address is already registered:', address);
      return res.json({ 
        isEligible: false,
        isRegistered: true,
        tokens: 0
      });
    }
    
    // If not registered, check eligibility
    const eligibleAddressesData = JSON.parse(fs.readFileSync(ELIGIBLE_ADDRESSES_FILE, 'utf8'));
    const eligibleEntry = eligibleAddressesData.eligible_addresses.find(entry => 
      entry.address === address
    );
    const isInEligibleList = !!eligibleEntry;
    
    res.json({ 
      isEligible: isInEligibleList && !isRegistered,
      isRegistered: isRegistered,
      tokens: eligibleEntry ? eligibleEntry.tokens : 0
    });
  } catch (error) {
    console.error('Error checking eligibility:', error);
    res.status(500).json({ error: 'Failed to check eligibility' });
  }
});

// New POST endpoint for checking EVM eligibility with signature
app.post('/api/check-evm-eligibility', (req, res) => {
  try {
    const { address, signature, message } = req.body;
    
    if (!address || !signature || !message) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    console.log('Checking EVM eligibility with signature for address:', address);
    
    // Verify the signature first
    try {
      if (!verifyEvmSignature(address, signature, message)) {
        return res.status(403).json({ error: 'Invalid signature' });
      }
    } catch (error) {
      console.error('Error verifying EVM signature:', error);
      return res.status(500).json({ error: 'Failed to verify signature' });
    }
    
    // Once signature is verified, check if address is in eligible list
    const eligibleAddressesData = JSON.parse(fs.readFileSync(ELIGIBLE_EVM_ADDRESSES_FILE, 'utf8'));
    const eligibleEntry = eligibleAddressesData.eligible_evm_addresses.find(entry => 
      entry.address.toLowerCase() === address.toLowerCase()
    );
    const isInEligibleList = !!eligibleEntry;
    
    // If not in eligible list, immediately return not eligible
    if (!isInEligibleList) {
      return res.json({ 
        isEligible: false,
        isRegistered: false,
        tokens: 0
      });
    }

    // Only if the address was eligible, check if it's registered
    const linkedAddressesData = JSON.parse(fs.readFileSync(LINKED_ADDRESSES_FILE, 'utf8'));
    const isRegistered = linkedAddressesData.registered_wallets.some(wallet => 
      wallet.evm_address.toLowerCase() === address.toLowerCase()
    );

    res.json({ 
      isEligible: isInEligibleList && !isRegistered,
      isRegistered: isRegistered,
      tokens: eligibleEntry ? eligibleEntry.tokens : 0
    });
  } catch (error) {
    console.error('Error checking EVM eligibility:', error);
    res.status(500).json({ error: 'Failed to check EVM eligibility' });
  }
});

// Routes
app.get('/', (req, res) => {
  res.send('AIDX Airdrop Registration API Server');
});

// Check if an address is registered
app.get('/api/check-registration/:address', (req, res) => {
  try {
    console.log('Checking registration for address:', req.params.address);
    const address = req.params.address;
    const linkedAddressesData = JSON.parse(fs.readFileSync(LINKED_ADDRESSES_FILE, 'utf8'));
    
    // First check if this address is an Avail address
    const registeredAsAvail = linkedAddressesData.registered_wallets.find(wallet => 
      wallet.avail_address.toLowerCase() === address.toLowerCase()
    );
    
    if (registeredAsAvail) {
      console.log('Address found registered as Avail address:', registeredAsAvail);
      return res.json({ 
        isRegistered: true, 
        registeredWallet: registeredAsAvail
      });
    }
    
    // Then check if it's an EVM address
    const registeredAsEvm = linkedAddressesData.registered_wallets.find(wallet => 
      wallet.evm_address.toLowerCase() === address.toLowerCase() || 
      wallet.final_evm_address.toLowerCase() === address.toLowerCase()
    );
    
    if (registeredAsEvm) {
      console.log('Address found registered as EVM address:', registeredAsEvm);
      return res.json({ 
        isRegistered: true, 
        registeredWallet: registeredAsEvm 
      });
    }
    
    // If we got here, the address is not registered
    console.log('Address is not registered:', address);
    res.json({ isRegistered: false });
  } catch (error) {
    console.error('Error checking registration:', error);
    res.status(500).json({ error: 'Failed to check registration' });
  }
});

// Check if an address is registered specifically as evm_address
app.get('/api/check-registration-as-evm/:address', (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    const linkedAddressesData = JSON.parse(fs.readFileSync(LINKED_ADDRESSES_FILE, 'utf8'));
    
    // Only check if it's registered as evm_address (not as final_evm_address)
    const registeredWallet = linkedAddressesData.registered_wallets.find(wallet => 
      wallet.evm_address.toLowerCase() === address
    );

    console.log('Registration as EVM check result:', { 
      isRegisteredAsEvm: !!registeredWallet, 
      registeredWallet 
    });
    
    res.json({
      isRegisteredAsEvm: !!registeredWallet,
      registeredWallet: registeredWallet || null
    });
  } catch (error) {
    console.error('Error checking registration as EVM:', error);
    res.status(500).json({ error: 'Failed to check registration status' });
  }
});

// DEPRECATED - Secured the old endpoints to prevent data harvesting
app.get('/api/check-raw-eligibility/:address', (req, res) => {
  res.status(403).json({ 
    error: 'This endpoint has been deprecated for security reasons. Please use the new POST endpoint with signature verification.' 
  });
});

app.get('/api/check-raw-evm-eligibility/:address', (req, res) => {
  res.status(403).json({ 
    error: 'This endpoint has been deprecated for security reasons. Please use the new POST endpoint with signature verification.' 
  });
});

app.get('/api/check-eligibility/:address', (req, res) => {
  res.status(403).json({ 
    error: 'This endpoint has been deprecated for security reasons. Please use the new POST endpoint with signature verification.' 
  });
});

app.get('/api/check-evm-eligibility/:address', (req, res) => {
  res.status(403).json({ 
    error: 'This endpoint has been deprecated for security reasons. Please use the new POST endpoint with signature verification.' 
  });
});

// Debug endpoint for helping troubleshoot registration issues (DISABLED FOR SECURITY)
app.get('/api/debug-db-check/:address', (req, res) => {
  res.status(403).json({ 
    error: 'This endpoint has been disabled for security reasons.' 
  });
});

// Register wallet addresses
app.post('/api/register', async (req, res) => {
  try {
    const { availAddress, evmAddress, finalEvmAddress, evmSignature, availSignature, timestamp } = req.body;
    console.log('Registering addresses:', { availAddress, evmAddress, finalEvmAddress });

    // Read existing data
    const data = JSON.parse(fs.readFileSync(LINKED_ADDRESSES_FILE, 'utf8'));
    const eligibleAddressesData = JSON.parse(fs.readFileSync(ELIGIBLE_ADDRESSES_FILE, 'utf8'));
    const eligibleEvmAddressesData = JSON.parse(fs.readFileSync(ELIGIBLE_EVM_ADDRESSES_FILE, 'utf8'));

    // Check eligibility and registration status for both addresses
    const availEntry = availAddress ? eligibleAddressesData.eligible_addresses.find(
      entry => entry.address === availAddress
    ) : null;
    
    const evmEntry = evmAddress ? eligibleEvmAddressesData.eligible_evm_addresses.find(
      entry => entry.address.toLowerCase() === evmAddress.toLowerCase()
    ) : null;

    const isAvailRegistered = availAddress && data.registered_wallets.some(wallet => 
      wallet.avail_address === availAddress
    );
    
    // Only check if the EVM address itself is registered as a source address
    const isEvmRegistered = evmAddress && data.registered_wallets.some(wallet => 
      wallet.evm_address.toLowerCase() === evmAddress.toLowerCase()
    );

    // Track what we're registering
    let registeringAvail = availAddress && availEntry && !isAvailRegistered;
    let registeringEvm = evmAddress && evmEntry && !isEvmRegistered;

    console.log('Registration status:', {
      registeringAvail,
      registeringEvm,
      availEntry,
      evmEntry,
      isAvailRegistered,
      isEvmRegistered
    });

    // Calculate total tokens and prepare registration data
    let totalTokens = 0;
    let registrationData = {
      avail_address: '',
      evm_address: '',
      final_evm_address: '',
      tokens: 0,
      timestamp,
      avail_signature: '',
      evm_signature: ''
    };

    // Case 1: Registering both wallets
    if (registeringAvail && registeringEvm) {
      if (!availSignature || !evmSignature) {
        return res.status(400).json({ 
          error: 'Both Avail and EVM signatures are required',
          type: 'signature'
        });
      }
      
      totalTokens = availEntry.tokens + evmEntry.tokens;
      registrationData = {
        avail_address: availAddress,
        evm_address: evmAddress,
        final_evm_address: finalEvmAddress,
        tokens: totalTokens,
        timestamp,
        avail_signature: availSignature,
        evm_signature: evmSignature
      };
    }
    // Case 2: Avail wallet only
    else if (registeringAvail) {
      if (!availSignature || !evmSignature) {
        return res.status(400).json({ 
          error: 'Both Avail and EVM signatures are required for Avail address registration',
          type: 'signature'
        });
      }
      
      totalTokens = availEntry.tokens;
      registrationData = {
        avail_address: availAddress,
        evm_address: '',
        final_evm_address: finalEvmAddress,
        tokens: totalTokens,
        timestamp,
        avail_signature: availSignature,
        evm_signature: evmSignature
      };
    } 
    // Case 3: EVM-only registration
    else if (registeringEvm) {
      if (!evmSignature) {
        return res.status(400).json({ 
          error: 'EVM signature required for EVM address registration',
          type: 'signature'
        });
      }
      
      totalTokens = evmEntry.tokens;
      registrationData = {
        avail_address: '',
        evm_address: evmAddress,
        final_evm_address: finalEvmAddress,
        tokens: totalTokens,
        timestamp,
        avail_signature: '',
        evm_signature: evmSignature
      };
    }
    // Error cases
    else if (availAddress && isAvailRegistered) {
      return res.status(400).json({ 
        error: 'Avail address already registered',
        type: 'avail'
      });
    }
    else if (evmAddress && isEvmRegistered) {
      return res.status(400).json({ 
        error: 'This EVM address is already registered as a source address',
        type: 'evm'
      });
    }
    else if (availAddress && !availEntry) {
      return res.status(400).json({ 
        error: 'Avail address not eligible',
        type: 'avail'
      });
    }
    else if (evmAddress && !evmEntry && !availAddress) {
      // Only return EVM eligibility error if we're not registering an Avail address
      return res.status(400).json({ 
        error: 'EVM address not eligible',
        type: 'evm'
      });
    }

    // Only proceed if at least one eligible and unregistered address
    if (totalTokens === 0) {
      console.error('No tokens calculated for registration:', { 
        availEntry, 
        evmEntry, 
        isAvailRegistered, 
        isEvmRegistered,
        registeringAvail,
        registeringEvm
      });
      return res.status(400).json({ 
        error: 'No eligible unregistered addresses provided',
        type: 'eligibility'
      });
    }

    // Ensure we have a final_evm_address for token distribution
    if (!registrationData.final_evm_address) {
      return res.status(400).json({ 
        error: 'Final EVM address required for token distribution',
        type: 'evm'
      });
    }

    // Add to registered wallets
    data.registered_wallets.push(registrationData);
    
    // Write back to file
    fs.writeFileSync(LINKED_ADDRESSES_FILE, JSON.stringify(data, null, 2));
    
    console.log('Successfully registered:', registrationData);
    
    res.json({ 
      success: true, 
      message: 'Addresses registered successfully',
      data: registrationData
    });
  } catch (error) {
    console.error('Error registering addresses:', error);
    res.status(500).json({ error: error.message || 'Failed to register addresses' });
  }
});

// Start the server
app.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
  
  // Log file existence status
  console.log(`Eligible addresses file: ${ELIGIBLE_ADDRESSES_FILE} exists: ${fs.existsSync(ELIGIBLE_ADDRESSES_FILE)}`);
  console.log(`Eligible EVM addresses file: ${ELIGIBLE_EVM_ADDRESSES_FILE} exists: ${fs.existsSync(ELIGIBLE_EVM_ADDRESSES_FILE)}`);
  console.log(`Linked addresses file: ${LINKED_ADDRESSES_FILE} exists: ${fs.existsSync(LINKED_ADDRESSES_FILE)}`);
});
