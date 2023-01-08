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
    await program.provider.connection.confirmTransaction(
      await program.provider.connection.requestAirdrop(developer.publicKey, 1e9)
    );
    await program.provider.connection.confirmTransaction(
      await program.provider.connection.requestAirdrop(voter.publicKey, 1e9)
    );

    bonkTestMint = await createMint(
      program.provider.connection,
      voter,
      voter.publicKey,
      voter.publicKey,
      9
    );
    console.log(`Creating Mint: ${bonkTestMint}`);

    developerBonkAta = await createAssociatedTokenAccount(
      program.provider.connection,
      developer,
      bonkTestMint,
      developer.publicKey
    );

    console.log(`Developer Ata: ${developerBonkAta}`);

    voterBonkAta = await createAssociatedTokenAccount(
      program.provider.connection,
      voter,
      bonkTestMint,
      voter.publicKey
    );

    await mintTo(
      program.provider.connection,
      voter,
      bonkTestMint,
      voterBonkAta,
      voter.publicKey,
      1e9
    );

    console.log(`Voter Ata: ${voterBonkAta}`);
  });

  it("Initialized global state", async () => {
    const [globalState, _globalStateBump] =
      web3.PublicKey.findProgramAddressSync(
        [Buffer.from(anchor.utils.bytes.utf8.encode("global"))],
        program.programId
      );

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
    const [pair, _pairBump] = web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from(anchor.utils.bytes.utf8.encode("pair")),
        Buffer.from(anchor.utils.bytes.utf8.encode(A_NAME)),
        Buffer.from(anchor.utils.bytes.utf8.encode(B_NAME)),
      ],
      program.programId
    );

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
    const [globalState, _globalStateBump] =
      web3.PublicKey.findProgramAddressSync(
        [Buffer.from(anchor.utils.bytes.utf8.encode("global"))],
        program.programId
      );

    const [pair, _pairBump] = web3.PublicKey.findProgramAddressSync(
      [
        Buffer.from(anchor.utils.bytes.utf8.encode("pair")),
        Buffer.from(anchor.utils.bytes.utf8.encode(A_NAME)),
        Buffer.from(anchor.utils.bytes.utf8.encode(B_NAME)),
      ],
      program.programId
    );

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
