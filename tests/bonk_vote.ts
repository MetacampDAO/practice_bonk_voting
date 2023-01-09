import * as anchor from "@project-serum/anchor";
import { web3 } from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import {
  createAssociatedTokenAccount,
  createMint,
  mintTo,
} from "@solana/spl-token";
import { assert } from "chai";
import { BonkVote } from "../target/types/bonk_vote";

const airdrop1Sol = async (
  program: anchor.Program<BonkVote>,
  pubkey: web3.PublicKey
) => {
  await program.provider.connection.confirmTransaction(
    await program.provider.connection.requestAirdrop(pubkey, 1e9)
  );
};

const createAta = async (
  program: anchor.Program<BonkVote>,
  pubkey: web3.Keypair,
  mint: web3.PublicKey
) => {
  return await createAssociatedTokenAccount(
    program.provider.connection,
    pubkey,
    mint,
    pubkey.publicKey
  );
};

const getGlobalCounter = (program: anchor.Program<BonkVote>) => {
  const [globalState, _globalStateBump] = web3.PublicKey.findProgramAddressSync(
    [Buffer.from(anchor.utils.bytes.utf8.encode("global"))],
    program.programId
  );
  return globalState;
};

const getPair = (
  program: anchor.Program<BonkVote>,
  A_NAME: string,
  B_NAME: string
) => {
  const [pair, _pairBump] = web3.PublicKey.findProgramAddressSync(
    [
      Buffer.from(anchor.utils.bytes.utf8.encode("pair")),
      Buffer.from(anchor.utils.bytes.utf8.encode(A_NAME)),
      Buffer.from(anchor.utils.bytes.utf8.encode(B_NAME)),
    ],
    program.programId
  );
  return pair;
};

describe("bonk_vote", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());

  const developer = web3.Keypair.generate();
  const voter = web3.Keypair.generate();

  const BONK_PER_VOTE = 10_000;
  const PERCENTAGE_BURN = 60;
  const PERCENTAGE_DEVELOPER = 40;
  const A_NAME = "Name1";
  const A_LINK = "random_picture_a";
  const B_NAME = "Name2";
  const B_LINK = "random_picture_2";

  const program = anchor.workspace.BonkVote as Program<BonkVote>;

  let bonkTestMint: web3.PublicKey | null;
  let developerBonkAta: web3.PublicKey | null;
  let voterBonkAta: web3.PublicKey | null;

  it("Setup devnet env", async () => {
    await airdrop1Sol(program, developer.publicKey);
    await airdrop1Sol(program, voter.publicKey);

    bonkTestMint = await createMint(
      program.provider.connection,
      voter,
      voter.publicKey,
      voter.publicKey,
      9
    );
    console.log(`Creating Mint: ${bonkTestMint}`);

    developerBonkAta = await createAta(program, developer, bonkTestMint);
    voterBonkAta = await createAta(program, voter, bonkTestMint);

    console.log(`Developer Ata: ${developerBonkAta}`);
    console.log(`Voter Ata: ${voterBonkAta}`);

    await mintTo(
      program.provider.connection,
      voter,
      bonkTestMint,
      voterBonkAta,
      voter.publicKey,
      1e9
    );
  });

  it("Initialized global state", async () => {
    const globalState = getGlobalCounter(program);

    // Add your test here.
    const tx = await program.methods
      .initializeGlobalState(
        BONK_PER_VOTE,
        PERCENTAGE_BURN,
        PERCENTAGE_DEVELOPER
      )
      .accounts({
        globalState,
        developerBonk: developerBonkAta,
        developer: developer.publicKey,
        mintAddress: bonkTestMint,
      })
      .signers([developer])
      .rpc();
    console.log("Your transaction signature", tx);
  });

  it("Initialized pair", async () => {
    const pair = getPair(program, A_NAME, B_NAME);

    // Add your test here.
    const tx = await program.methods
      .initializePair(A_NAME, A_LINK, B_NAME, B_LINK)
      .accounts({
        pair,
        developer: developer.publicKey,
      })
      .signers([developer])
      .rpc();
    console.log("Your transaction signature", tx);
    const pairInfo = await program.account.pair.fetch(pair);
    assert.equal(pairInfo.aName, A_NAME);
    assert.equal(pairInfo.bName, B_NAME);
    assert.equal(pairInfo.aLink, A_LINK);
    assert.equal(pairInfo.bLink, B_LINK);
    assert.equal(pairInfo.aVote, 0);
    assert.equal(pairInfo.bVote, 0);
  });

  it("Vote for a", async () => {
    const globalState = getGlobalCounter(program);
    const pair = getPair(program, A_NAME, B_NAME);

    // Add your test here.
    try {
      const tx = await program.methods
        .vote(A_NAME, B_NAME, true)
        .accounts({
          globalState,
          pair,
          voter: voter.publicKey,
          voterBonk: voterBonkAta,
          developerBonk: developerBonkAta,
          mintAddress: bonkTestMint,
        })
        .signers([voter])
        .rpc();
      console.log("Your transaction signature", tx);
      const pairInfo = await program.account.pair.fetch(pair);
      assert.equal(pairInfo.aVote, 1);
      assert.equal(pairInfo.bVote, 0);
    } catch (error) {
      console.log("error: ", error);
      assert.fail();
    }
  });
});
