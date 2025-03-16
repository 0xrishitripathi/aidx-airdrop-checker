const express = require('express');
const fs = require('fs-extra');
const cors = require('cors');
const path = require('path');
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
app.use(cors());
app.use(express.json());

// Create a simple request logger middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
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

// Routes
app.get('/', (req, res) => {
  res.send('AIDX Airdrop Registration API Server');
});

// Check if an address is already registered
app.get('/api/check-registration/:address', (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    const linkedAddressesData = JSON.parse(fs.readFileSync(LINKED_ADDRESSES_FILE, 'utf8'));
    console.log('Linked addresses data:', linkedAddressesData);
    
    const registeredWallet = linkedAddressesData.registered_wallets.find(wallet => 
      wallet.avail_address.toLowerCase() === address || 
      wallet.evm_address.toLowerCase() === address ||
      wallet.final_evm_address.toLowerCase() === address
    );

    console.log('Registration check result:', { isRegistered: !!registeredWallet, registeredWallet });
    res.json({
      isRegistered: !!registeredWallet,
      registeredWallet: registeredWallet || null
    });
  } catch (error) {
    console.error('Error checking registration:', error);
    res.status(500).json({ error: 'Failed to check registration status' });
  }
});

// Check if an Avail address is eligible without considering registration status
app.get('/api/check-raw-eligibility/:address', (req, res) => {
  try {
    console.log('Checking raw Avail eligibility for address:', req.params.address);
    const address = req.params.address;
    const eligibleAddressesData = JSON.parse(fs.readFileSync(ELIGIBLE_ADDRESSES_FILE, 'utf8'));
    console.log('Eligible addresses data:', eligibleAddressesData);
    
    const isInEligibleList = eligibleAddressesData.eligible_addresses.includes(address);
    console.log('Is address in eligible list?', isInEligibleList);

    res.json({ isInEligibleList });
  } catch (error) {
    console.error('Error checking raw eligibility:', error);
    res.status(500).json({ error: 'Failed to check raw eligibility' });
  }
});

// Check if an EVM address is eligible without considering registration status
app.get('/api/check-raw-evm-eligibility/:address', (req, res) => {
  try {
    console.log('Checking raw EVM eligibility for address:', req.params.address);
    const address = req.params.address.toLowerCase();
    const eligibleAddressesData = JSON.parse(fs.readFileSync(ELIGIBLE_EVM_ADDRESSES_FILE, 'utf8'));
    console.log('Eligible EVM addresses data:', eligibleAddressesData);
    
    const isInEligibleList = eligibleAddressesData.eligible_evm_addresses.some(addr => 
      addr.toLowerCase() === address
    );
    console.log('Is address in eligible EVM list?', isInEligibleList);

    res.json({ isInEligibleList });
  } catch (error) {
    console.error('Error checking raw EVM eligibility:', error);
    res.status(500).json({ error: 'Failed to check raw EVM eligibility' });
  }
});

// Check if an Avail address is eligible
app.get('/api/check-eligibility/:address', (req, res) => {
  try {
    console.log('Checking Avail eligibility for address:', req.params.address);
    const address = req.params.address;
    const eligibleAddressesData = JSON.parse(fs.readFileSync(ELIGIBLE_ADDRESSES_FILE, 'utf8'));
    console.log('Eligible addresses data:', eligibleAddressesData);
    
    const isEligible = eligibleAddressesData.eligible_addresses.includes(address);
    console.log('Is address in eligible list?', isEligible);

    // Check if the address is already registered
    const linkedAddressesData = JSON.parse(fs.readFileSync(LINKED_ADDRESSES_FILE, 'utf8'));
    const isRegistered = linkedAddressesData.registered_wallets.some(wallet => 
      wallet.avail_address.toLowerCase() === address.toLowerCase()
    );
    console.log('Is address already registered?', isRegistered);

    const result = { isEligible: isEligible && !isRegistered, isRegistered };
    console.log('Eligibility check result:', result);
    res.json(result);
  } catch (error) {
    console.error('Error checking eligibility:', error);
    res.status(500).json({ error: 'Failed to check eligibility' });
  }
});

// Check if an EVM address is eligible
app.get('/api/check-evm-eligibility/:address', (req, res) => {
  try {
    console.log('Checking EVM eligibility for address:', req.params.address);
    const address = req.params.address.toLowerCase();
    const eligibleAddressesData = JSON.parse(fs.readFileSync(ELIGIBLE_EVM_ADDRESSES_FILE, 'utf8'));
    console.log('Eligible EVM addresses data:', eligibleAddressesData);
    
    const isEligible = eligibleAddressesData.eligible_evm_addresses.some(addr => 
      addr.toLowerCase() === address
    );
    console.log('Is address in eligible EVM list?', isEligible);

    // Check if the address is already registered
    const linkedAddressesData = JSON.parse(fs.readFileSync(LINKED_ADDRESSES_FILE, 'utf8'));
    const isRegistered = linkedAddressesData.registered_wallets.some(wallet => 
      wallet.evm_address.toLowerCase() === address || 
      wallet.final_evm_address.toLowerCase() === address
    );
    console.log('Is address already registered?', isRegistered);

    const result = { isEligible: isEligible && !isRegistered, isRegistered };
    console.log('EVM eligibility check result:', result);
    res.json(result);
  } catch (error) {
    console.error('Error checking EVM eligibility:', error);
    res.status(500).json({ error: 'Failed to check EVM eligibility' });
  }
});

// Link addresses
app.post('/api/link-addresses', (req, res) => {
  try {
    const { availAddress, evmAddress, finalEvmAddress, evmSignature, timestamp } = req.body;

    // Validate input
    if (!finalEvmAddress || !evmSignature || !timestamp) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Check if either Avail or EVM address is provided
    if (!availAddress && !evmAddress) {
      return res.status(400).json({ error: 'Either Avail or EVM address must be provided' });
    }

    // Check if the address is eligible
    let isEligible = false;
    let sourceAddress = '';

    if (availAddress) {
      // Check if Avail address is eligible
      const eligibleAddressesData = JSON.parse(fs.readFileSync(ELIGIBLE_ADDRESSES_FILE, 'utf8'));
      isEligible = eligibleAddressesData.eligible_addresses.includes(availAddress);
      sourceAddress = availAddress;
    } else if (evmAddress) {
      // Check if EVM address is eligible
      const eligibleEvmAddressesData = JSON.parse(fs.readFileSync(ELIGIBLE_EVM_ADDRESSES_FILE, 'utf8'));
      isEligible = eligibleEvmAddressesData.eligible_evm_addresses.some(addr => 
        addr.toLowerCase() === evmAddress.toLowerCase()
      );
      sourceAddress = evmAddress;
    }

    if (!isEligible) {
      return res.status(400).json({ error: 'Address is not eligible for registration' });
    }

    // Check if any of the addresses are already registered
    const linkedAddressesData = JSON.parse(fs.readFileSync(LINKED_ADDRESSES_FILE, 'utf8'));
    
    const isRegistered = linkedAddressesData.registered_wallets.some(wallet => 
      (availAddress && wallet.avail_address.toLowerCase() === availAddress.toLowerCase()) ||
      (evmAddress && (wallet.evm_address.toLowerCase() === evmAddress.toLowerCase() || 
                       wallet.final_evm_address.toLowerCase() === evmAddress.toLowerCase())) ||
      wallet.final_evm_address.toLowerCase() === finalEvmAddress.toLowerCase()
    );

    if (isRegistered) {
      return res.status(400).json({ error: 'One of the addresses is already registered' });
    }

    // Add the linked pair
    const newLinkedPair = {
      avail_address: availAddress || '',
      evm_address: evmAddress || '',
      final_evm_address: finalEvmAddress,
      timestamp
    };

    linkedAddressesData.registered_wallets.push(newLinkedPair);
    fs.writeFileSync(LINKED_ADDRESSES_FILE, JSON.stringify(linkedAddressesData, null, 2));

    console.log('Linked addresses:', newLinkedPair);
    res.json({
      success: true,
      message: 'Addresses linked successfully',
      data: newLinkedPair
    });
  } catch (error) {
    console.error('Error linking addresses:', error);
    res.status(500).json({ error: 'Failed to link addresses' });
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
