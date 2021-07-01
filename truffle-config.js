const HDWalletProvider = require("@truffle/hdwallet-provider");

module.exports = {
    networks:  {
        development: {
            host:       "127.0.0.1",
            port:       7545,
            network_id: "*",
        },
        kcctestnet:  {
            provider:        function () {
                return new HDWalletProvider(process.env.MNEMONIC, "https://rpc-testnet.kcc.network");
            },
            network_id:      322,
            pollingInterval: 60000,
        },
        ethrinkeby:  {
            provider:        function () {
                return new HDWalletProvider(process.env.MNEMONIC, `https://rinkeby.infura.io/v3/${process.env.INFURA_API_KEY}`);
            },
            network_id:      4,
            skipDryRun:      true,
            pollingInterval: 60000,
        },
        kccmainnet:  {
            provider:        function () {
                return new HDWalletProvider(process.env.MNEMONIC, "https://rpc-mainnet.kcc.network");
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
            version:  "0.7.4",
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
