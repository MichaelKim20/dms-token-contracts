import "@nomiclabs/hardhat-ethers";
import { ethers } from "hardhat";

import { HardhatAccount } from "../../src/HardhatAccount";
import { BOACoin } from "../../src/utils/Amount";
import { ContractUtils } from "../../src/utils/ContractUtils";
import { KIOS, MultiSigWallet, MultiSigWalletFactory, SKIOS } from "../../typechain-types";

import { BaseContract, BigNumber, Contract, Wallet } from "ethers";

import fs from "fs";

const network = "bosagora_mainnet";

export const SKIOS_OWNER: string = "0xdD2721205006d001Aa64036d72cA9CA22c6550d9";

interface IDeployedContract {
    name: string;
    address: string;
    contract: BaseContract;
}

interface IAccount {
    deployer: Wallet;
    feeAccount: Wallet;
}

type FnDeployer = (accounts: IAccount, deployment: Deployments) => void;

class Deployments {
    public deployments: Map<string, IDeployedContract>;
    public deployers: FnDeployer[];
    public accounts: IAccount;

    constructor() {
        this.deployments = new Map<string, IDeployedContract>();
        this.deployers = [];

        const raws = HardhatAccount.keys.map((m) => new Wallet(m, ethers.provider));
        const [deployer, feeAccount] = raws;

        this.accounts = {
            deployer,
            feeAccount,
        };
    }

    public addContract(name: string, address: string, contract: BaseContract) {
        this.deployments.set(name, {
            name,
            address,
            contract,
        });
    }

    public getContract(name: string): BaseContract | undefined {
        const info = this.deployments.get(name);
        if (info !== undefined) {
            return info.contract;
        } else {
            return undefined;
        }
    }

    public getContractAddress(name: string): string | undefined {
        const info = this.deployments.get(name);
        if (info !== undefined) {
            return info.address;
        } else {
            return undefined;
        }
    }

    public addDeployer(deployer: FnDeployer) {
        this.deployers.push(deployer);
    }

    public async doDeploy() {
        for (const elem of this.deployers) {
            try {
                await elem(this.accounts, this);
            } catch (error) {
                console.log(error);
            }
        }
    }

    static filename = "./deploy/main_chain_devnet/deployed_contracts.json";

    public async loadContractInfo() {
        if (!fs.existsSync(Deployments.filename)) return;

        const data: any = JSON.parse(fs.readFileSync(Deployments.filename, "utf-8"));

        for (const key of Object.keys(data)) {
            const name = key;
            const address = data[key];
            console.log(`Load ${name} - ${address}...`);
            this.deployments.set(key, {
                name,
                address,
                contract: (await ethers.getContractFactory(name)).attach(address),
            });
        }
    }

    public saveContractInfo() {
        const contents: any = {};
        for (const key of this.deployments.keys()) {
            const item = this.deployments.get(key);
            if (item !== undefined) {
                contents[key] = item.address;
            }
        }
        fs.writeFileSync(Deployments.filename, JSON.stringify(contents), "utf-8");
    }
}

async function deploySToken(accounts: IAccount, deployment: Deployments) {
    const contractName = "SKIOS";
    console.log(`Deploy ${contractName}...`);

    const owner = SKIOS_OWNER;
    const factory = await ethers.getContractFactory("SKIOS");
    const contract = (await factory.connect(accounts.deployer).deploy(owner)) as SKIOS;
    await contract.deployed();
    await contract.deployTransaction.wait();

    const balance = await contract.balanceOf(owner);
    console.log(`SKIOS token's owner: ${owner}`);
    console.log(`SKIOS token's balance of owner: ${new BOACoin(balance).toDisplayString(true, 2)}`);

    deployment.addContract(contractName, contract.address, contract);
    console.log(`Deployed ${contractName} to ${contract.address}`);
}

async function main() {
    const deployments = new Deployments();

    deployments.addDeployer(deploySToken);

    await deployments.loadContractInfo();

    await deployments.doDeploy();

    deployments.saveContractInfo();
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
