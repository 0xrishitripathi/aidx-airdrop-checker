# AIDX Airdrop Checker

# Overview

AIDX Airdrop Checker for Avail Mainnet and Deq Stakers.

## Features

- **Wallet Connectivity:** Connect to both Polkadot/Substrate and EVM wallets
- **Eligibility Checking:** Verify eligibility for AIDX token airdrop
- **Wallet Linking:** Link Avail and EVM wallets together for consolidated rewards
- **Registration:** Register eligible wallets to receive AIDX tokens
- **Mobile Responsive Design:** Optimized UI for both desktop and mobile devices

## Prerequisites

Before you begin, ensure you have the following installed:
- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [npm](https://www.npmjs.com/) (v7 or higher)
- [Polkadot.js Extension](https://polkadot.js.org/extension/) for browser
- MetaMask or other EVM-compatible wallet extension

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/aidx-airdrop-checker.git
   cd aidx-airdrop-checker
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up data files**
   
   The application requires three JSON data files in the `data` directory. Example files are provided with the correct format:
   
   ```bash
   # Copy the example files to create your actual data files
   cp data/eligible_addresses.example.json data/eligible_addresses.json
   cp data/eligible_evm_addresses.example.json data/eligible_evm_addresses.json
   cp data/linked_addresses.example.json data/linked_addresses.json
   ```
   
   You can then modify these files with your actual data if needed.

## Configuration

The application uses a simple configuration approach:

- **API URL:** By default, the API URL is set to `http://localhost:3001` for local development. In production, it automatically detects and uses the current hostname.

## Running the Application

1. **Start the backend server**
   ```bash
   node server.js
   ```
   The server will start on port 3001 by default.

2. **Start the frontend development server**
   ```bash
   npm start
   ```
   The application will be accessible at http://localhost:3000.

## Production Deployment

For production deployment:

1. **Build the frontend**
   ```bash
   npm run build
   ```

2. **Serve the static files**
   
   You can serve the static files from the `build` directory using any web server. The included server.js also has functionality to serve the static files.

   ```bash
   NODE_ENV=production node server.js
   ```

## Project Structure

```
aidx-airdrop-checker/
├── data/                  # Data files for eligibility and wallet linking
│   ├── eligible_addresses.example.json
│   ├── eligible_evm_addresses.example.json
│   └── linked_addresses.example.json
├── public/                # Public assets
│   ├── img/               # Images including the AIDX logo used as favicon
│   └── index.html         # Main HTML file with favicon configuration
├── src/                   # Frontend source code
│   ├── App.css            # Main application styles
│   ├── App.tsx            # Main application component
│   └── index.tsx          # Entry point
├── package.json           # Node.js dependencies and scripts
├── server.js              # Backend server for API endpoints
└── README.md              # Project documentation
```

## Technologies Used

- **Frontend:**
  - React.js
  - TypeScript
  - CSS
  - @polkadot/extension-dapp (for Polkadot wallet connectivity)
  - ethers.js (for EVM wallet connectivity)
  
- **Backend:**
  - Node.js
  - Express.js
  - JSON file-based storage

## Usage Flow

1. User connects their Avail (Polkadot/Substrate) wallet
2. User connects their EVM (Ethereum) wallet
3. Application checks eligibility for both wallets
4. If eligible, user can register either or both wallets
5. User signs a message with their wallet(s) to confirm ownership
6. Upon successful registration, the application shows the amount of AIDX tokens to be received

## Common Issues & Troubleshooting

- **Wallet Not Connecting:**
  - Ensure the Polkadot.js and/or MetaMask extensions are installed and unlocked
  - Allow connections to the site when prompted by the extension

- **Server Not Starting:**
  - Check if port 3001 is already in use by another process
  - Ensure all dependencies are correctly installed

- **Data Files Missing:**
  - Create the necessary data files in the `data` directory following the sample formats
