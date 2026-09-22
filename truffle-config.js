let testProvider;
const HDWalletProvider = require("@truffle/hdwallet-provider");

module.exports = {
    networks: {
        // Ephemeral, in-process test chain. Never use deployment credentials here.
        test: {
            provider: () => {
                if (!testProvider) {
                    testProvider = require("ganache").provider({
                        wallet: { deterministic: true, totalAccounts: 10 },
                        chain: { chainId: 1337, networkId: 1337, hardfork: "istanbul" },
                        logging: { quiet: true },
                    });
                }
                return testProvider;
            },
            network_id: 1337,
        },
        development: {
            host:       "127.0.0.1",
            port:       7545,
            network_id: "*",
        },
        kcctestnet:  {
            provider:        function () {
                return new HDWalletProvider(process.env.BRIDGE_MNEMONIC, "https://rpc-testnet.kcc.network");
            },
            network_id:      322,
            skipDryRun:      true,
            pollingInterval: 60000,
        },
        ethrinkeby:  {
            provider:        function () {
                return new HDWalletProvider(process.env.BRIDGE_MNEMONIC, `https://rinkeby.infura.io/v3/${process.env.INFURA_API_KEY}`);
            },
            network_id:      4,
            skipDryRun:      true,
            pollingInterval: 60000,
        },
        kccmainnet:  {
            provider:        function () {
                return new HDWalletProvider(process.env.BRIDGE_MNEMONIC, "https://rpc-mainnet.kcc.network");
            },
            network_id:      321,
            skipDryRun:      true,
            pollingInterval: 60000,
        },
    },
    mocha:     {
        useColors:       true,
        timeout:         10 * 1000,
        slow:            10 * 1000,
        reporter:        "mochawesome",
        reporterOptions: {
            overwrite:      true,
            inline:         true,
            cdn:            true,
            json:           false,
            reportDir:      "doc",
            reportTitle:    "bridge-contract",
            reportFilename: "bridge-contract",
        },
    },
    compilers: {
        solc: {
            version: require.resolve("solc/soljson.js"),
            settings: {
                optimizer: {
                    enabled: true,
                    runs:    200,
                },
            },
        },
    },
    plugins:   ["solidity-coverage"],
};
